import * as core from '@actions/core';
import * as fs from 'fs/promises';
import { lstatSync } from 'fs';
import * as path from 'path';
import { LynxPromptClient } from '../api';
import { ActionInputs } from '../types';
import { findRepoHierarchy, listRepoBlueprints } from '../utils/repo';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/** Run git with an argv, never through a shell. */
function git(args: string[], cwd: string) {
  return execFileAsync('git', args, { cwd });
}

/**
 * The absolute path for a blueprint's repository_path, or undefined when it
 * would land outside the workspace, inside .git (in any case, for
 * case-insensitive file systems), or go through a symlink in the checkout.
 */
export function resolveInWorkspace(
  workspace: string,
  repositoryPath: string,
): string | undefined {
  const root = path.resolve(workspace);
  const full = path.resolve(root, repositoryPath);
  const rel = path.relative(root, full);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return undefined;
  const parts = rel.split(path.sep);
  if (parts[0].toLowerCase() === '.git') return undefined;
  let current = root;
  for (const part of parts) {
    current = path.join(current, part);
    try {
      if (lstatSync(current).isSymbolicLink()) return undefined;
    } catch {
      break; // Does not exist yet, so neither does anything below it
    }
  }
  return full;
}

/**
 * Generate mode: pull blueprints from LynxPrompt and write them to the repo.
 *
 * - Fetches this repository's blueprints from LynxPrompt
 * - Writes each blueprint to the file path it was synced from
 * - Optionally auto-commits the changes
 */
export async function runGenerate(
  client: LynxPromptClient,
  inputs: ActionInputs,
  workspace: string,
): Promise<void> {
  const hierarchy = await findRepoHierarchy(client, workspace, false);
  const blueprints = await listRepoBlueprints(client, hierarchy);

  if (blueprints.length === 0) {
    core.warning('No blueprints found in LynxPrompt for this repository.');
    core.setOutput('generated-count', 0);
    return;
  }

  core.info(`Found ${blueprints.length} blueprint(s) to generate...`);

  let generatedCount = 0;
  const generatedFiles: string[] = [];

  for (const blueprintMeta of blueprints) {
    try {
      // The file path is the one the blueprint was synced from
      const filePath = blueprintMeta.repository_path!;
      const fullPath = resolveInWorkspace(workspace, filePath);
      if (!fullPath) {
        core.warning(
          `Skipping blueprint ${blueprintMeta.name}: path "${filePath}" is outside the repository.`,
        );
        continue;
      }

      // Fetch full blueprint with content
      const blueprint = await client.getBlueprint(blueprintMeta.id);

      // Ensure directory exists
      const dir = path.dirname(fullPath);
      await fs.mkdir(dir, { recursive: true });

      // Check if file already exists with same content
      let existingContent: string | null = null;
      try {
        existingContent = await fs.readFile(fullPath, 'utf-8');
      } catch {
        // File doesn't exist yet
      }

      if (existingContent === blueprint.content) {
        core.info(`Unchanged: ${filePath} (content identical)`);
        continue;
      }

      // Write the file
      await fs.writeFile(fullPath, blueprint.content, 'utf-8');
      core.info(`Generated: ${filePath}`);
      generatedCount++;
      generatedFiles.push(filePath);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      core.error(
        `Failed to generate blueprint ${blueprintMeta.name}: ${msg}`,
      );
    }
  }

  core.info(`--- Generate Summary ---`);
  core.info(`  Generated/updated: ${generatedCount} file(s)`);

  core.setOutput('generated-count', generatedCount);

  // Auto-commit if requested and there are changes
  if (inputs.commitChanges && generatedCount > 0) {
    await autoCommit(workspace, generatedFiles);
  }
}

/**
 * Auto-commit generated files to the repository.
 */
async function autoCommit(
  workspace: string,
  files: string[],
): Promise<void> {
  core.info('Auto-committing generated files...');

  try {
    // Configure git
    await git(['config', 'user.name', 'LynxPrompt Action'], workspace);
    await git(['config', 'user.email', 'lynxprompt@geiser.cloud'], workspace);

    // Stage the files
    for (const file of files) {
      await git(['add', '--', file], workspace);
    }

    // Check if there are staged changes
    try {
      await git(['diff', '--cached', '--quiet'], workspace);
      core.info('No changes to commit (files unchanged after staging).');
      return;
    } catch {
      // Non-zero exit means there are changes - this is expected
    }

    // Commit
    await git(
      ['commit', '-m', 'chore: update AI config files from LynxPrompt'],
      workspace,
    );

    // Push
    await git(['push'], workspace);
    core.info('Changes committed and pushed successfully.');
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    core.error(`Auto-commit failed: ${msg}`);
    core.warning(
      'Could not auto-commit. Ensure the workflow has write permissions (contents: write).',
    );
  }
}
