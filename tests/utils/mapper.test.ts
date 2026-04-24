import { describe, it, expect } from 'vitest';
import { mapFileToType, buildBlueprintName, typeToDefaultPath } from '../../src/utils/mapper';

describe('mapFileToType', () => {
  it('maps AGENTS.md at root', () => {
    expect(mapFileToType('AGENTS.md')).toBe('AGENTS_MD');
  });

  it('maps AGENTS.md in subdirectory', () => {
    expect(mapFileToType('packages/api/AGENTS.md')).toBe('AGENTS_MD');
  });

  it('maps CLAUDE.md', () => {
    expect(mapFileToType('CLAUDE.md')).toBe('CLAUDE_MD');
  });

  it('maps AIDER.md', () => {
    expect(mapFileToType('AIDER.md')).toBe('AIDER_MD');
  });

  it('maps copilot-instructions.md', () => {
    expect(mapFileToType('.github/copilot-instructions.md')).toBe('COPILOT_INSTRUCTIONS');
  });

  it('maps .windsurfrules', () => {
    expect(mapFileToType('.windsurfrules')).toBe('WINDSURF_RULES');
  });

  it('maps cursor rules .mdc file', () => {
    expect(mapFileToType('.cursor/rules/my-rule.mdc')).toBe('CURSOR_RULES');
  });

  it('returns undefined for unknown file', () => {
    expect(mapFileToType('README.md')).toBeUndefined();
  });

  it('returns undefined for random .mdc not in .cursor/rules', () => {
    expect(mapFileToType('some/path/file.mdc')).toBeUndefined();
  });

  it('is case-insensitive for known files', () => {
    expect(mapFileToType('agents.md')).toBe('AGENTS_MD');
    expect(mapFileToType('claude.md')).toBe('CLAUDE_MD');
  });
});

describe('buildBlueprintName', () => {
  it('returns file name for root-level file', () => {
    expect(buildBlueprintName('AGENTS.md', '/workspace')).toBe('AGENTS.md');
  });

  it('returns relative path for nested file', () => {
    expect(buildBlueprintName('packages/api/AGENTS.md', '/workspace')).toBe('packages/api/AGENTS.md');
  });

  it('normalizes backslashes to forward slashes', () => {
    expect(buildBlueprintName('packages\\api\\AGENTS.md', '/workspace')).toBe('packages/api/AGENTS.md');
  });

  it('removes leading ./', () => {
    expect(buildBlueprintName('./AGENTS.md', '/workspace')).toBe('AGENTS.md');
  });
});

describe('typeToDefaultPath', () => {
  it('returns AGENTS.md for AGENTS_MD', () => {
    expect(typeToDefaultPath('AGENTS_MD')).toBe('AGENTS.md');
  });

  it('returns CLAUDE.md for CLAUDE_MD', () => {
    expect(typeToDefaultPath('CLAUDE_MD')).toBe('CLAUDE.md');
  });

  it('returns AIDER.md for AIDER_MD', () => {
    expect(typeToDefaultPath('AIDER_MD')).toBe('AIDER.md');
  });

  it('returns .github/copilot-instructions.md for COPILOT_INSTRUCTIONS', () => {
    expect(typeToDefaultPath('COPILOT_INSTRUCTIONS')).toBe('.github/copilot-instructions.md');
  });

  it('returns .windsurfrules for WINDSURF_RULES', () => {
    expect(typeToDefaultPath('WINDSURF_RULES')).toBe('.windsurfrules');
  });

  it('uses name if it contains .cursor/rules/ for CURSOR_RULES', () => {
    expect(typeToDefaultPath('CURSOR_RULES', '.cursor/rules/my-rule.mdc')).toBe('.cursor/rules/my-rule.mdc');
  });

  it('generates cursor path from name if not a path', () => {
    expect(typeToDefaultPath('CURSOR_RULES', 'my-rule')).toBe('.cursor/rules/my-rule.mdc');
  });

  it('falls back to default for CURSOR_RULES without name', () => {
    expect(typeToDefaultPath('CURSOR_RULES')).toBe('.cursor/rules/default.mdc');
  });

  it('falls back to name for CUSTOM type', () => {
    expect(typeToDefaultPath('CUSTOM' as any, 'my-file.txt')).toBe('my-file.txt');
  });

  it('falls back to unknown-config.md for CUSTOM type without name', () => {
    expect(typeToDefaultPath('CUSTOM' as any)).toBe('unknown-config.md');
  });
});
