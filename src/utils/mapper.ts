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
