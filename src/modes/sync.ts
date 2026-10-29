import * as core from '@actions/core';
import { LynxPromptClient } from '../api';
import {
  ActionInputs,
  BlueprintListItem,
  DetectedFile,
  Hierarchy,
  SyncResult,
} from '../types';
import { detectConfigFiles, parseFilePatterns } from '../utils/detector';
import { contentChecksum } from '../utils/checksum';
import { findRepoHierarchy, listRepoBlueprints } from '../utils/repo';

/**
 * Sync mode: upload local AI config files as blueprints to LynxPrompt.
 *
 * - Detects config files in the repository
 * - Puts them in this repository's hierarchy, matched by file path
 * - Creates new blueprints or updates existing ones
 * - Skips files whose content matches the cloud version (by checksum)
 * - Fails the job if any file could not be synced
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

  const hierarchy = (await findRepoHierarchy(client, workspace, true))!;
  core.info(`Repository hierarchy: ${hierarchy.name} (${hierarchy.id})`);

  // Fetch this repository's blueprints once for efficiency
  const existingBlueprints = await listRepoBlueprints(client, hierarchy);
  const results: SyncResult[] = [];
  const failed: string[] = [];

  for (const file of files) {
    try {
      const result = await syncFile(
        client,
        file,
        inputs,
        hierarchy,
        existingBlueprints,
      );
      results.push(result);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      core.error(`Failed to sync ${file.relativePath}: ${msg}`);
      failed.push(file.relativePath);
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
  core.info(`  Failed: ${failed.length}`);

  core.setOutput('synced-count', created + updated);

  if (failed.length > 0) {
    core.setFailed(
      `Failed to sync ${failed.length} of ${files.length} file(s): ${failed.join(', ')}`,
    );
  }
}

async function syncFile(
  client: LynxPromptClient,
  file: DetectedFile,
  inputs: ActionInputs,
  hierarchy: Hierarchy,
  existingBlueprints: BlueprintListItem[],
): Promise<SyncResult> {
  // The blueprint of this file is the one at the same path in this repository
  const existing = existingBlueprints.find(
    (b) => b.repository_path === file.blueprintName,
  );

  if (existing) {
    // A visibility the workflow sets is applied even when the content is
    // unchanged. The list does not say which team a blueprint is shared
    // with, so TEAM with a team-id is always sent.
    const metaChanged =
      !!inputs.visibility &&
      (inputs.visibility !== existing.visibility ||
        (inputs.visibility === 'TEAM' && !!inputs.teamId));
    const contentChanged =
      contentChecksum(file.content) !== existing.content_checksum;

    if (!contentChanged && !metaChanged) {
      core.info(`Unchanged: ${file.relativePath} (checksum match)`);
      return {
        file: file.relativePath,
        blueprintName: file.blueprintName,
        action: 'unchanged',
        blueprintId: existing.id,
      };
    }

    // Visibility changes only when the workflow sets it, so a blueprint
    // published or shared from the web stays that way
    const updated = await client.updateBlueprint(existing.id, {
      ...(contentChanged ? { content: file.content } : {}),
      expected_checksum: existing.content_checksum,
      ...(inputs.visibility ? { visibility: inputs.visibility } : {}),
      ...(inputs.teamId ? { team_id: inputs.teamId } : {}),
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
    visibility: inputs.visibility ?? 'PRIVATE',
    description: `Auto-synced from ${file.relativePath}`,
    hierarchy_id: hierarchy.id,
    repository_path: file.blueprintName,
    ...(inputs.teamId ? { team_id: inputs.teamId } : {}),
  });

  core.info(`Created: ${file.relativePath} -> blueprint ${created.id}`);
  return {
    file: file.relativePath,
    blueprintName: file.blueprintName,
    action: 'created',
    blueprintId: created.id,
  };
}
