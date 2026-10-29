import { describe, it, expect } from 'vitest';
import { mapFileToType, buildBlueprintName } from '../../src/utils/mapper';

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
