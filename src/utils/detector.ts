import * as core from '@actions/core';
import * as glob from '@actions/glob';
import * as fs from 'fs/promises';
import * as path from 'path';
import { DetectedFile } from '../types';
import { mapFileToType, buildBlueprintName } from './mapper';

/**
 * Default glob patterns for AI IDE configuration files.
 */
export const DEFAULT_PATTERNS = [
  '**/{AGENTS,CLAUDE,AIDER}.md',
  '**/.github/copilot-instructions.md',
  '**/.windsurfrules',
  '**/.cursor/rules/**/*.mdc',
];

/**
 * Directories to always exclude from scanning.
 */
const EXCLUDED_DIRS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  'vendor',
  '.next',
  '__pycache__',
  '.terraform',
];

/**
 * Parse the files input string into an array of glob patterns.
 * Supports comma-separated and newline-separated patterns.
 */
export function parseFilePatterns(input: string): string[] {
  return input
    .split(/[,\n]/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/**
 * Detect AI configuration files in the workspace.
 */
export async function detectConfigFiles(
  workspace: string,
  patterns: string[],
): Promise<DetectedFile[]> {
  const detected: DetectedFile[] = [];

  // Build the glob pattern with exclusions
  const excludePatterns = EXCLUDED_DIRS.map((d) => `!**/${d}/**`);
  const allPatterns = [...patterns, ...excludePatterns];

  core.debug(`Glob patterns: ${allPatterns.join(', ')}`);

  const globber = await glob.create(allPatterns.join('\n'), {
    followSymbolicLinks: false,
  });

  const files = await globber.glob();
  core.info(`Found ${files.length} config file(s)`);

  for (const filePath of files) {
    const relativePath = path.relative(workspace, filePath);
    const type = mapFileToType(relativePath);

    if (!type) {
      core.warning(`Skipping unrecognized file: ${relativePath}`);
      continue;
    }

    const content = await fs.readFile(filePath, 'utf-8');
    const blueprintName = buildBlueprintName(relativePath, workspace);

    detected.push({
      path: filePath,
      relativePath,
      type,
      content,
      blueprintName,
    });

    core.debug(`Detected: ${relativePath} -> ${type} (${blueprintName})`);
  }

  return detected;
}
