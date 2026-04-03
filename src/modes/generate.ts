import * as core from '@actions/core';
import * as fs from 'fs/promises';
import * as path from 'path';
import { LynxPromptClient } from '../api';
import { ActionInputs } from '../types';
import { typeToDefaultPath } from '../utils/mapper';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Generate mode: pull blueprints from LynxPrompt and write them to the repo.
 *
 * - Fetches all blueprints from LynxPrompt
 * - Writes each blueprint to its default file path
 * - Optionally auto-commits the changes
 */
export async function runGenerate(
  client: LynxPromptClient,
  inputs: ActionInputs,
  workspace: string,
): Promise<void> {
  const blueprints = await client.listBlueprints();

  if (blueprints.length === 0) {
    core.warning('No blueprints found in LynxPrompt.');
    core.setOutput('generated-count', 0);
    return;
  }

  core.info(`Found ${blueprints.length} blueprint(s) to generate...`);

  let generatedCount = 0;
  const generatedFiles: string[] = [];

  for (const blueprintMeta of blueprints) {
    try {
      // Fetch full blueprint with content
      const blueprint = await client.getBlueprint(blueprintMeta.id);

      // Determine the file path
      const filePath = typeToDefaultPath(blueprint.type, blueprint.name);
      const fullPath = path.join(workspace, filePath);

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
    await execAsync('git config user.name "LynxPrompt Action"', {
      cwd: workspace,
    });
    await execAsync(
      'git config user.email "action@lynxprompt.com"',
      { cwd: workspace },
    );

    // Stage the files
    for (const file of files) {
      await execAsync(`git add "${file}"`, { cwd: workspace });
    }

    // Check if there are staged changes
    try {
      await execAsync('git diff --cached --quiet', { cwd: workspace });
      core.info('No changes to commit (files unchanged after staging).');
      return;
    } catch {
      // Non-zero exit means there are changes - this is expected
    }

    // Commit
    await execAsync(
      'git commit -m "chore: update AI config files from LynxPrompt"',
      { cwd: workspace },
    );

    // Push
    await execAsync('git push', { cwd: workspace });
    core.info('Changes committed and pushed successfully.');
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    core.error(`Auto-commit failed: ${msg}`);
    core.warning(
      'Could not auto-commit. Ensure the workflow has write permissions (contents: write).',
    );
  }
}
