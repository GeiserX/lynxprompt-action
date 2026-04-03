import * as path from 'path';
import { BlueprintType } from '../types';

/**
 * Map of filename patterns to BlueprintType.
 * Patterns are matched against the relative path (lowercased for comparison).
 */
interface PatternRule {
  /** Test function for the relative path */
  test: (relativePath: string) => boolean;
  type: BlueprintType;
}

const PATTERN_RULES: PatternRule[] = [
  {
    test: (p) => path.basename(p).toUpperCase() === 'AGENTS.MD',
    type: 'AGENTS_MD',
  },
  {
    test: (p) => path.basename(p).toUpperCase() === 'CLAUDE.MD',
    type: 'CLAUDE_MD',
  },
  {
    test: (p) => path.basename(p).toUpperCase() === 'AIDER.MD',
    type: 'AIDER_MD',
  },
  {
    test: (p) =>
      p.toLowerCase().includes('.github/copilot-instructions.md'),
    type: 'COPILOT_INSTRUCTIONS',
  },
  {
    test: (p) => path.basename(p).toLowerCase() === '.windsurfrules',
    type: 'WINDSURF_RULES',
  },
  {
    test: (p) =>
      p.toLowerCase().includes('.cursor/rules/') && p.endsWith('.mdc'),
    type: 'CURSOR_RULES',
  },
];

/**
 * Map a file path to a BlueprintType.
 * Returns undefined if the file does not match any known pattern.
 */
export function mapFileToType(relativePath: string): BlueprintType | undefined {
  for (const rule of PATTERN_RULES) {
    if (rule.test(relativePath)) {
      return rule.type;
    }
  }
  return undefined;
}

/**
 * Build a human-readable blueprint name from a file path.
 *
 * For root-level files: "AGENTS.md"
 * For nested files (monorepo): "packages/api/AGENTS.md"
 * For cursor rules: ".cursor/rules/my-rule.mdc"
 */
export function buildBlueprintName(
  relativePath: string,
  _workspace: string,
): string {
  // Normalize separators
  const normalized = relativePath.replace(/\\/g, '/');

  // Remove leading ./
  return normalized.replace(/^\.\//, '');
}

/**
 * Map a BlueprintType to the default file path where it should be written.
 */
export function typeToDefaultPath(type: BlueprintType, name?: string): string {
  switch (type) {
    case 'AGENTS_MD':
      return 'AGENTS.md';
    case 'CLAUDE_MD':
      return 'CLAUDE.md';
    case 'AIDER_MD':
      return 'AIDER.md';
    case 'COPILOT_INSTRUCTIONS':
      return '.github/copilot-instructions.md';
    case 'WINDSURF_RULES':
      return '.windsurfrules';
    case 'CURSOR_RULES':
      // Use the blueprint name if it looks like a path, otherwise generate one
      if (name && name.includes('.cursor/rules/')) {
        return name;
      }
      return `.cursor/rules/${name ?? 'default'}.mdc`;
    default:
      return name ?? 'unknown-config.md';
  }
}
