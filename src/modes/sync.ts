import * as core from '@actions/core';
import { LynxPromptClient } from '../api';
import { ActionInputs, SyncResult, DetectedFile } from '../types';
import { detectConfigFiles, parseFilePatterns } from '../utils/detector';

/**
 * Sync mode: upload local AI config files as blueprints to LynxPrompt.
 *
 * - Detects config files in the repository
 * - For each file, checks if a blueprint with the same name + type exists
 * - Creates new blueprints or updates existing ones
 * - Skips files whose content matches the cloud version (by checksum)
 */
export async function runSync(
  client: LynxPromptClient,
  inputs: ActionInputs,
  workspace: string,
): Promise<void> {
  const patterns = parseFilePatterns(inputs.files);
  const files = await detectConfigFiles(workspace, patterns);

  if (files.length === 0) {
    core.warning('No AI configuration files found to sync.');
    core.setOutput('synced-count', 0);
    return;
  }

  core.info(`Processing ${files.length} file(s) for sync...`);

  // Fetch all existing blueprints once for efficiency
  const existingBlueprints = await client.listBlueprints();
  const results: SyncResult[] = [];

  for (const file of files) {
    try {
      const result = await syncFile(client, file, inputs, existingBlueprints);
      results.push(result);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      core.error(`Failed to sync ${file.relativePath}: ${msg}`);
      results.push({
        file: file.relativePath,
        blueprintName: file.blueprintName,
        action: 'unchanged',
      });
    }
  }

  // Summary
  const created = results.filter((r) => r.action === 'created').length;
  const updated = results.filter((r) => r.action === 'updated').length;
  const unchanged = results.filter((r) => r.action === 'unchanged').length;

  core.info('--- Sync Summary ---');
  core.info(`  Created: ${created}`);
  core.info(`  Updated: ${updated}`);
  core.info(`  Unchanged: ${unchanged}`);

  core.setOutput('synced-count', created + updated);
}

async function syncFile(
  client: LynxPromptClient,
  file: DetectedFile,
  inputs: ActionInputs,
  existingBlueprints: { id: string; name: string; type: string; content_checksum: string }[],
): Promise<SyncResult> {
  // Look for an existing blueprint with the same name and type
  const existing = existingBlueprints.find(
    (b) => b.name === file.blueprintName && b.type === file.type,
  );

  if (existing) {
    // Check if content has changed by comparing checksums
    const localChecksum = computeSimpleChecksum(file.content);

    if (localChecksum === existing.content_checksum) {
      core.info(`Unchanged: ${file.relativePath} (checksum match)`);
      return {
        file: file.relativePath,
        blueprintName: file.blueprintName,
        action: 'unchanged',
        blueprintId: existing.id,
      };
    }

    // Update the existing blueprint
    const updated = await client.updateBlueprint(existing.id, {
      content: file.content,
      visibility: inputs.visibility,
    });

    core.info(`Updated: ${file.relativePath} -> blueprint ${updated.id}`);
    return {
      file: file.relativePath,
      blueprintName: file.blueprintName,
      action: 'updated',
      blueprintId: updated.id,
    };
  }

  // Create a new blueprint
  const created = await client.createBlueprint({
    name: file.blueprintName,
    type: file.type,
    content: file.content,
    visibility: inputs.visibility,
    description: `Auto-synced from ${file.relativePath}`,
  });

  core.info(`Created: ${file.relativePath} -> blueprint ${created.id}`);
  return {
    file: file.relativePath,
    blueprintName: file.blueprintName,
    action: 'created',
    blueprintId: created.id,
  };
}

/**
 * Compute a simple SHA-256-like checksum for content comparison.
 * This is a basic implementation; the server may use a different algorithm.
 * If checksums never match, the action will always update (safe fallback).
 */
function computeSimpleChecksum(content: string): string {
  const { createHash } = require('crypto');
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}
