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
  '**/AGENTS.md',
  '**/CLAUDE.md',
  '**/AIDER.md',
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
 * Supports comma-separated and newline-separated patterns. A comma inside
 * braces does not split, and braces are expanded here
 * (`**\/{AGENTS,CLAUDE}.md` gives `**\/AGENTS.md` and `**\/CLAUDE.md`),
 * because @actions/glob does not expand them.
 */
export function parseFilePatterns(input: string): string[] {
  const patterns: string[] = [];
  let current = '';
  let depth = 0;
  for (const ch of input) {
    if (ch === '{') depth++;
    if (ch === '}' && depth > 0) depth--;
    if ((ch === ',' && depth === 0) || ch === '\n') {
      patterns.push(current);
      current = '';
      depth = 0;
    } else {
      current += ch;
    }
  }
  patterns.push(current);
  return patterns
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .flatMap(expandBraces);
}

/** Expand `{a,b}` groups, innermost first: `x{a,b}y` gives `xay`, `xby`. */
export function expandBraces(pattern: string): string[] {
  const match = /\{([^{}]*,[^{}]*)\}/.exec(pattern);
  if (!match) return [pattern];
  const before = pattern.slice(0, match.index);
  const after = pattern.slice(match.index + match[0].length);
  return match[1]
    .split(',')
    .flatMap((alt) => expandBraces(`${before}${alt}${after}`));
}

/** Prefix a relative glob pattern (or `!pattern`) with the workspace. */
function rootPattern(workspace: string, pattern: string): string {
  const negate = pattern.startsWith('!');
  const body = negate ? pattern.slice(1) : pattern;
  const rooted = path.isAbsolute(body) ? body : path.join(workspace, body);
  return negate ? `!${rooted}` : rooted;
}

/**
 * Detect AI configuration files in the workspace.
 */
export async function detectConfigFiles(
  workspace: string,
  patterns: string[],
): Promise<DetectedFile[]> {
  const detected: DetectedFile[] = [];

  // Build the glob pattern with exclusions. @actions/glob resolves relative
  // patterns against the process cwd, so root them at the workspace.
  const excludePatterns = EXCLUDED_DIRS.map((d) => `!**/${d}/**`);
  const allPatterns = [...patterns, ...excludePatterns].map((p) =>
    rootPattern(workspace, p),
  );

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
