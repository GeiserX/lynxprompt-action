import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@actions/core', () => ({
  info: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  debug: vi.fn(),
  setOutput: vi.fn(),
  setFailed: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
}));

vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

vi.mock('util', () => ({
  promisify: vi.fn((fn: unknown) => fn),
}));

import * as core from '@actions/core';
import * as fs from 'fs/promises';
import { exec } from 'child_process';
import { runGenerate } from '../../src/modes/generate';
import { LynxPromptClient } from '../../src/api';
import { ActionInputs } from '../../src/types';

describe('runGenerate', () => {
  let mockClient: {
    listBlueprints: ReturnType<typeof vi.fn>;
    getBlueprint: ReturnType<typeof vi.fn>;
  };

  const baseInputs: ActionInputs = {
    mode: 'generate',
    token: 'lp_test',
    apiUrl: 'https://lynxprompt.com',
    files: '**/{AGENTS,CLAUDE}.md',
    visibility: 'PRIVATE',
    platforms: [],
    failOnDrift: false,
    commitChanges: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = {
      listBlueprints: vi.fn().mockResolvedValue([]),
      getBlueprint: vi.fn(),
    };
  });

  it('outputs generated-count 0 and warns when no blueprints found', async () => {
    mockClient.listBlueprints.mockResolvedValue([]);

    await runGenerate(mockClient as unknown as LynxPromptClient, baseInputs, '/workspace');

    expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('No blueprints found'));
    expect(core.setOutput).toHaveBeenCalledWith('generated-count', 0);
  });

  it('generates a new file from a blueprint', async () => {
    mockClient.listBlueprints.mockResolvedValue([
      { id: 'bp-1', name: 'AGENTS.md', type: 'AGENTS_MD' },
    ]);
    mockClient.getBlueprint.mockResolvedValue({
      id: 'bp-1',
      name: 'AGENTS.md',
      type: 'AGENTS_MD',
      content: '# Agents\n\nGenerated content.',
    });
    vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    await runGenerate(mockClient as unknown as LynxPromptClient, baseInputs, '/workspace');

    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('AGENTS.md'),
      '# Agents\n\nGenerated content.',
      'utf-8',
    );
    expect(core.setOutput).toHaveBeenCalledWith('generated-count', 1);
  });

  it('skips file when content is identical to existing', async () => {
    const content = '# Agents\n\nSame content.';
    mockClient.listBlueprints.mockResolvedValue([
      { id: 'bp-1', name: 'AGENTS.md', type: 'AGENTS_MD' },
    ]);
    mockClient.getBlueprint.mockResolvedValue({
      id: 'bp-1',
      name: 'AGENTS.md',
      type: 'AGENTS_MD',
      content,
    });
    vi.mocked(fs.readFile).mockResolvedValue(content);
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);

    await runGenerate(mockClient as unknown as LynxPromptClient, baseInputs, '/workspace');

    expect(fs.writeFile).not.toHaveBeenCalled();
    expect(core.info).toHaveBeenCalledWith(expect.stringContaining('Unchanged'));
    expect(core.setOutput).toHaveBeenCalledWith('generated-count', 0);
  });

  it('overwrites file when content differs', async () => {
    mockClient.listBlueprints.mockResolvedValue([
      { id: 'bp-1', name: 'CLAUDE.md', type: 'CLAUDE_MD' },
    ]);
    mockClient.getBlueprint.mockResolvedValue({
      id: 'bp-1',
      name: 'CLAUDE.md',
      type: 'CLAUDE_MD',
      content: '# Claude Updated',
    });
    vi.mocked(fs.readFile).mockResolvedValue('# Claude Old');
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    await runGenerate(mockClient as unknown as LynxPromptClient, baseInputs, '/workspace');

    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('CLAUDE.md'),
      '# Claude Updated',
      'utf-8',
    );
    expect(core.setOutput).toHaveBeenCalledWith('generated-count', 1);
  });

  it('handles multiple blueprints', async () => {
    mockClient.listBlueprints.mockResolvedValue([
      { id: 'bp-1', name: 'AGENTS.md', type: 'AGENTS_MD' },
      { id: 'bp-2', name: 'CLAUDE.md', type: 'CLAUDE_MD' },
    ]);
    mockClient.getBlueprint
      .mockResolvedValueOnce({ id: 'bp-1', name: 'AGENTS.md', type: 'AGENTS_MD', content: '# Agents' })
      .mockResolvedValueOnce({ id: 'bp-2', name: 'CLAUDE.md', type: 'CLAUDE_MD', content: '# Claude' });
    vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    await runGenerate(mockClient as unknown as LynxPromptClient, baseInputs, '/workspace');

    expect(fs.writeFile).toHaveBeenCalledTimes(2);
    expect(core.setOutput).toHaveBeenCalledWith('generated-count', 2);
  });

  it('logs error and continues when a blueprint fails to generate', async () => {
    mockClient.listBlueprints.mockResolvedValue([
      { id: 'bp-1', name: 'AGENTS.md', type: 'AGENTS_MD' },
      { id: 'bp-2', name: 'CLAUDE.md', type: 'CLAUDE_MD' },
    ]);
    mockClient.getBlueprint
      .mockRejectedValueOnce(new Error('API error'))
      .mockResolvedValueOnce({ id: 'bp-2', name: 'CLAUDE.md', type: 'CLAUDE_MD', content: '# Claude' });
    vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    await runGenerate(mockClient as unknown as LynxPromptClient, baseInputs, '/workspace');

    expect(core.error).toHaveBeenCalledWith(expect.stringContaining('Failed to generate blueprint AGENTS.md'));
    expect(core.setOutput).toHaveBeenCalledWith('generated-count', 1);
  });

  it('handles non-Error thrown exceptions in blueprint loop', async () => {
    mockClient.listBlueprints.mockResolvedValue([
      { id: 'bp-1', name: 'AGENTS.md', type: 'AGENTS_MD' },
    ]);
    mockClient.getBlueprint.mockRejectedValueOnce('string error');

    await runGenerate(mockClient as unknown as LynxPromptClient, baseInputs, '/workspace');

    expect(core.error).toHaveBeenCalledWith(expect.stringContaining('string error'));
  });

  it('creates directories recursively for nested paths', async () => {
    mockClient.listBlueprints.mockResolvedValue([
      { id: 'bp-1', name: '.github/copilot-instructions.md', type: 'COPILOT_INSTRUCTIONS' },
    ]);
    mockClient.getBlueprint.mockResolvedValue({
      id: 'bp-1',
      name: '.github/copilot-instructions.md',
      type: 'COPILOT_INSTRUCTIONS',
      content: '# Copilot',
    });
    vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    await runGenerate(mockClient as unknown as LynxPromptClient, baseInputs, '/workspace');

    expect(fs.mkdir).toHaveBeenCalledWith(
      expect.stringContaining('.github'),
      { recursive: true },
    );
  });

  describe('auto-commit', () => {
    it('auto-commits when commitChanges is true and files were generated', async () => {
      mockClient.listBlueprints.mockResolvedValue([
        { id: 'bp-1', name: 'AGENTS.md', type: 'AGENTS_MD' },
      ]);
      mockClient.getBlueprint.mockResolvedValue({
        id: 'bp-1',
        name: 'AGENTS.md',
        type: 'AGENTS_MD',
        content: '# Agents new',
      });
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      // Mock exec calls for auto-commit: git config, git add, git diff --cached --quiet (should fail to indicate changes), git commit, git push
      const mockExec = vi.mocked(exec);
      mockExec
        .mockResolvedValueOnce(undefined as any)  // git config user.name
        .mockResolvedValueOnce(undefined as any)  // git config user.email
        .mockResolvedValueOnce(undefined as any)  // git add
        .mockRejectedValueOnce(new Error('changes exist') as any)  // git diff --cached --quiet (non-zero = changes)
        .mockResolvedValueOnce(undefined as any)  // git commit
        .mockResolvedValueOnce(undefined as any); // git push

      const inputs: ActionInputs = { ...baseInputs, commitChanges: true };
      await runGenerate(mockClient as unknown as LynxPromptClient, inputs, '/workspace');

      expect(exec).toHaveBeenCalledWith(
        'git config user.name "LynxPrompt Action"',
        expect.any(Object),
      );
      expect(exec).toHaveBeenCalledWith(
        expect.stringContaining('git commit'),
        expect.any(Object),
      );
    });

    it('does not auto-commit when commitChanges is false', async () => {
      mockClient.listBlueprints.mockResolvedValue([
        { id: 'bp-1', name: 'AGENTS.md', type: 'AGENTS_MD' },
      ]);
      mockClient.getBlueprint.mockResolvedValue({
        id: 'bp-1',
        name: 'AGENTS.md',
        type: 'AGENTS_MD',
        content: '# Agents new',
      });
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await runGenerate(mockClient as unknown as LynxPromptClient, baseInputs, '/workspace');

      expect(exec).not.toHaveBeenCalled();
    });

    it('does not auto-commit when no files were generated', async () => {
      const content = '# Same content';
      mockClient.listBlueprints.mockResolvedValue([
        { id: 'bp-1', name: 'AGENTS.md', type: 'AGENTS_MD' },
      ]);
      mockClient.getBlueprint.mockResolvedValue({
        id: 'bp-1',
        name: 'AGENTS.md',
        type: 'AGENTS_MD',
        content,
      });
      vi.mocked(fs.readFile).mockResolvedValue(content);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);

      const inputs: ActionInputs = { ...baseInputs, commitChanges: true };
      await runGenerate(mockClient as unknown as LynxPromptClient, inputs, '/workspace');

      expect(exec).not.toHaveBeenCalled();
    });

    it('skips commit when git diff --cached --quiet succeeds (no staged changes)', async () => {
      mockClient.listBlueprints.mockResolvedValue([
        { id: 'bp-1', name: 'AGENTS.md', type: 'AGENTS_MD' },
      ]);
      mockClient.getBlueprint.mockResolvedValue({
        id: 'bp-1',
        name: 'AGENTS.md',
        type: 'AGENTS_MD',
        content: '# Changed',
      });
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const mockExec = vi.mocked(exec);
      mockExec
        .mockResolvedValueOnce(undefined as any)  // git config user.name
        .mockResolvedValueOnce(undefined as any)  // git config user.email
        .mockResolvedValueOnce(undefined as any)  // git add
        .mockResolvedValueOnce(undefined as any); // git diff --cached --quiet succeeds (no changes)

      const inputs: ActionInputs = { ...baseInputs, commitChanges: true };
      await runGenerate(mockClient as unknown as LynxPromptClient, inputs, '/workspace');

      expect(core.info).toHaveBeenCalledWith(expect.stringContaining('No changes to commit'));
    });

    it('handles auto-commit failure gracefully', async () => {
      mockClient.listBlueprints.mockResolvedValue([
        { id: 'bp-1', name: 'AGENTS.md', type: 'AGENTS_MD' },
      ]);
      mockClient.getBlueprint.mockResolvedValue({
        id: 'bp-1',
        name: 'AGENTS.md',
        type: 'AGENTS_MD',
        content: '# Changed',
      });
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const mockExec = vi.mocked(exec);
      mockExec.mockRejectedValue(new Error('git not configured'));

      const inputs: ActionInputs = { ...baseInputs, commitChanges: true };
      await runGenerate(mockClient as unknown as LynxPromptClient, inputs, '/workspace');

      expect(core.error).toHaveBeenCalledWith(expect.stringContaining('Auto-commit failed'));
      expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('Could not auto-commit'));
    });

    it('handles auto-commit failure with non-Error exception', async () => {
      mockClient.listBlueprints.mockResolvedValue([
        { id: 'bp-1', name: 'AGENTS.md', type: 'AGENTS_MD' },
      ]);
      mockClient.getBlueprint.mockResolvedValue({
        id: 'bp-1',
        name: 'AGENTS.md',
        type: 'AGENTS_MD',
        content: '# Changed',
      });
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const mockExec = vi.mocked(exec);
      mockExec.mockRejectedValue('string error');

      const inputs: ActionInputs = { ...baseInputs, commitChanges: true };
      await runGenerate(mockClient as unknown as LynxPromptClient, inputs, '/workspace');

      expect(core.error).toHaveBeenCalledWith(expect.stringContaining('string error'));
    });
  });

  it('logs generate summary', async () => {
    mockClient.listBlueprints.mockResolvedValue([
      { id: 'bp-1', name: 'AGENTS.md', type: 'AGENTS_MD' },
    ]);
    mockClient.getBlueprint.mockResolvedValue({
      id: 'bp-1',
      name: 'AGENTS.md',
      type: 'AGENTS_MD',
      content: '# New',
    });
    vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    await runGenerate(mockClient as unknown as LynxPromptClient, baseInputs, '/workspace');

    expect(core.info).toHaveBeenCalledWith('--- Generate Summary ---');
    expect(core.info).toHaveBeenCalledWith('  Generated/updated: 1 file(s)');
  });
});
