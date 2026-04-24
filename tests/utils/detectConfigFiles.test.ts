import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@actions/core', () => ({
  info: vi.fn(),
  warning: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('@actions/glob', () => ({
  create: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
}));

import * as core from '@actions/core';
import * as glob from '@actions/glob';
import * as fs from 'fs/promises';
import { detectConfigFiles } from '../../src/utils/detector';

describe('detectConfigFiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns detected files with correct type and content', async () => {
    const mockGlobber = {
      glob: vi.fn().mockResolvedValue(['/workspace/AGENTS.md']),
    };
    vi.mocked(glob.create).mockResolvedValue(mockGlobber as any);
    vi.mocked(fs.readFile).mockResolvedValue('# Agents content');

    const result = await detectConfigFiles('/workspace', ['**/{AGENTS}.md']);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      path: '/workspace/AGENTS.md',
      relativePath: 'AGENTS.md',
      type: 'AGENTS_MD',
      content: '# Agents content',
      blueprintName: 'AGENTS.md',
    });
  });

  it('skips unrecognized files and logs warning', async () => {
    const mockGlobber = {
      glob: vi.fn().mockResolvedValue(['/workspace/README.md']),
    };
    vi.mocked(glob.create).mockResolvedValue(mockGlobber as any);

    const result = await detectConfigFiles('/workspace', ['**/*.md']);

    expect(result).toHaveLength(0);
    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining('Skipping unrecognized file'),
    );
  });

  it('handles multiple files of different types', async () => {
    const mockGlobber = {
      glob: vi.fn().mockResolvedValue([
        '/workspace/AGENTS.md',
        '/workspace/CLAUDE.md',
        '/workspace/.windsurfrules',
      ]),
    };
    vi.mocked(glob.create).mockResolvedValue(mockGlobber as any);
    vi.mocked(fs.readFile)
      .mockResolvedValueOnce('# Agents')
      .mockResolvedValueOnce('# Claude')
      .mockResolvedValueOnce('windsurf content');

    const result = await detectConfigFiles('/workspace', ['**/*']);

    expect(result).toHaveLength(3);
    expect(result[0].type).toBe('AGENTS_MD');
    expect(result[1].type).toBe('CLAUDE_MD');
    expect(result[2].type).toBe('WINDSURF_RULES');
  });

  it('creates glob with exclusion patterns', async () => {
    const mockGlobber = {
      glob: vi.fn().mockResolvedValue([]),
    };
    vi.mocked(glob.create).mockResolvedValue(mockGlobber as any);

    await detectConfigFiles('/workspace', ['**/*.md']);

    const createCallArg = vi.mocked(glob.create).mock.calls[0][0];
    expect(createCallArg).toContain('!**/node_modules/**');
    expect(createCallArg).toContain('!**/.git/**');
    expect(createCallArg).toContain('!**/dist/**');
    expect(createCallArg).toContain('!**/vendor/**');
  });

  it('passes followSymbolicLinks false to glob', async () => {
    const mockGlobber = {
      glob: vi.fn().mockResolvedValue([]),
    };
    vi.mocked(glob.create).mockResolvedValue(mockGlobber as any);

    await detectConfigFiles('/workspace', ['**/*.md']);

    expect(glob.create).toHaveBeenCalledWith(
      expect.any(String),
      { followSymbolicLinks: false },
    );
  });

  it('returns empty array when no files found', async () => {
    const mockGlobber = {
      glob: vi.fn().mockResolvedValue([]),
    };
    vi.mocked(glob.create).mockResolvedValue(mockGlobber as any);

    const result = await detectConfigFiles('/workspace', ['**/*.md']);

    expect(result).toHaveLength(0);
    expect(core.info).toHaveBeenCalledWith('Found 0 config file(s)');
  });

  it('handles nested file paths correctly', async () => {
    const mockGlobber = {
      glob: vi.fn().mockResolvedValue(['/workspace/packages/api/AGENTS.md']),
    };
    vi.mocked(glob.create).mockResolvedValue(mockGlobber as any);
    vi.mocked(fs.readFile).mockResolvedValue('# Nested agents');

    const result = await detectConfigFiles('/workspace', ['**/{AGENTS}.md']);

    expect(result).toHaveLength(1);
    expect(result[0].relativePath).toBe('packages/api/AGENTS.md');
    expect(result[0].blueprintName).toBe('packages/api/AGENTS.md');
  });

  it('handles cursor rule files', async () => {
    const mockGlobber = {
      glob: vi.fn().mockResolvedValue(['/workspace/.cursor/rules/my-rule.mdc']),
    };
    vi.mocked(glob.create).mockResolvedValue(mockGlobber as any);
    vi.mocked(fs.readFile).mockResolvedValue('cursor rule content');

    const result = await detectConfigFiles('/workspace', ['**/.cursor/rules/**/*.mdc']);

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('CURSOR_RULES');
  });

  it('handles copilot instructions', async () => {
    const mockGlobber = {
      glob: vi.fn().mockResolvedValue(['/workspace/.github/copilot-instructions.md']),
    };
    vi.mocked(glob.create).mockResolvedValue(mockGlobber as any);
    vi.mocked(fs.readFile).mockResolvedValue('copilot instructions');

    const result = await detectConfigFiles('/workspace', ['**/.github/copilot-instructions.md']);

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('COPILOT_INSTRUCTIONS');
  });

  it('logs count of found files', async () => {
    const mockGlobber = {
      glob: vi.fn().mockResolvedValue([
        '/workspace/AGENTS.md',
        '/workspace/CLAUDE.md',
      ]),
    };
    vi.mocked(glob.create).mockResolvedValue(mockGlobber as any);
    vi.mocked(fs.readFile).mockResolvedValue('content');

    await detectConfigFiles('/workspace', ['**/*.md']);

    expect(core.info).toHaveBeenCalledWith('Found 2 config file(s)');
  });
});
