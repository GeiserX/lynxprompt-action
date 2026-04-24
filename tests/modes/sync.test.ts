import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@actions/core', () => ({
  info: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  debug: vi.fn(),
  setOutput: vi.fn(),
  setFailed: vi.fn(),
}));

vi.mock('../../src/utils/detector', () => ({
  parseFilePatterns: vi.fn((input: string) =>
    input
      .split(/[,\n]/)
      .map((p: string) => p.trim())
      .filter((p: string) => p.length > 0),
  ),
  detectConfigFiles: vi.fn(),
}));

import * as core from '@actions/core';
import { runSync } from '../../src/modes/sync';
import { detectConfigFiles } from '../../src/utils/detector';
import { LynxPromptClient } from '../../src/api';
import { ActionInputs, DetectedFile } from '../../src/types';

describe('runSync', () => {
  let mockClient: {
    listBlueprints: ReturnType<typeof vi.fn>;
    createBlueprint: ReturnType<typeof vi.fn>;
    updateBlueprint: ReturnType<typeof vi.fn>;
    getBlueprint: ReturnType<typeof vi.fn>;
  };

  const baseInputs: ActionInputs = {
    mode: 'sync',
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
      createBlueprint: vi.fn(),
      updateBlueprint: vi.fn(),
      getBlueprint: vi.fn(),
    };
  });

  it('outputs synced-count 0 and warns when no files detected', async () => {
    vi.mocked(detectConfigFiles).mockResolvedValue([]);

    await runSync(mockClient as unknown as LynxPromptClient, baseInputs, '/workspace');

    expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('No AI configuration files'));
    expect(core.setOutput).toHaveBeenCalledWith('synced-count', 0);
  });

  it('creates a new blueprint when no matching cloud blueprint exists', async () => {
    const mockFiles: DetectedFile[] = [
      {
        path: '/workspace/AGENTS.md',
        relativePath: 'AGENTS.md',
        type: 'AGENTS_MD',
        content: '# Agents\n\nSome content here.',
        blueprintName: 'AGENTS.md',
      },
    ];
    vi.mocked(detectConfigFiles).mockResolvedValue(mockFiles);
    mockClient.listBlueprints.mockResolvedValue([]);
    mockClient.createBlueprint.mockResolvedValue({ id: 'bp-1' });

    await runSync(mockClient as unknown as LynxPromptClient, baseInputs, '/workspace');

    expect(mockClient.createBlueprint).toHaveBeenCalledWith({
      name: 'AGENTS.md',
      type: 'AGENTS_MD',
      content: '# Agents\n\nSome content here.',
      visibility: 'PRIVATE',
      description: 'Auto-synced from AGENTS.md',
    });
    expect(core.setOutput).toHaveBeenCalledWith('synced-count', 1);
  });

  it('updates an existing blueprint when checksums differ', async () => {
    const mockFiles: DetectedFile[] = [
      {
        path: '/workspace/AGENTS.md',
        relativePath: 'AGENTS.md',
        type: 'AGENTS_MD',
        content: '# Agents\n\nUpdated content.',
        blueprintName: 'AGENTS.md',
      },
    ];
    vi.mocked(detectConfigFiles).mockResolvedValue(mockFiles);
    mockClient.listBlueprints.mockResolvedValue([
      { id: 'bp-1', name: 'AGENTS.md', type: 'AGENTS_MD', content_checksum: 'old-checksum' },
    ]);
    mockClient.updateBlueprint.mockResolvedValue({ id: 'bp-1' });

    await runSync(mockClient as unknown as LynxPromptClient, baseInputs, '/workspace');

    expect(mockClient.updateBlueprint).toHaveBeenCalledWith('bp-1', {
      content: '# Agents\n\nUpdated content.',
      visibility: 'PRIVATE',
    });
    expect(core.setOutput).toHaveBeenCalledWith('synced-count', 1);
  });

  it('skips update when checksums match', async () => {
    const content = '# Agents\n\nSame content.';
    // Compute the actual SHA-256 checksum that the code will compute
    const crypto = require('crypto');
    const checksum = crypto.createHash('sha256').update(content, 'utf-8').digest('hex');

    const mockFiles: DetectedFile[] = [
      {
        path: '/workspace/AGENTS.md',
        relativePath: 'AGENTS.md',
        type: 'AGENTS_MD',
        content,
        blueprintName: 'AGENTS.md',
      },
    ];
    vi.mocked(detectConfigFiles).mockResolvedValue(mockFiles);
    mockClient.listBlueprints.mockResolvedValue([
      { id: 'bp-1', name: 'AGENTS.md', type: 'AGENTS_MD', content_checksum: checksum },
    ]);

    await runSync(mockClient as unknown as LynxPromptClient, baseInputs, '/workspace');

    expect(mockClient.updateBlueprint).not.toHaveBeenCalled();
    expect(mockClient.createBlueprint).not.toHaveBeenCalled();
    expect(core.setOutput).toHaveBeenCalledWith('synced-count', 0);
  });

  it('handles multiple files with mixed actions', async () => {
    const contentA = '# Agents file';
    const crypto = require('crypto');
    const checksumA = crypto.createHash('sha256').update(contentA, 'utf-8').digest('hex');

    const mockFiles: DetectedFile[] = [
      {
        path: '/workspace/AGENTS.md',
        relativePath: 'AGENTS.md',
        type: 'AGENTS_MD',
        content: contentA,
        blueprintName: 'AGENTS.md',
      },
      {
        path: '/workspace/CLAUDE.md',
        relativePath: 'CLAUDE.md',
        type: 'CLAUDE_MD',
        content: '# Claude file',
        blueprintName: 'CLAUDE.md',
      },
    ];
    vi.mocked(detectConfigFiles).mockResolvedValue(mockFiles);
    mockClient.listBlueprints.mockResolvedValue([
      { id: 'bp-1', name: 'AGENTS.md', type: 'AGENTS_MD', content_checksum: checksumA },
    ]);
    mockClient.createBlueprint.mockResolvedValue({ id: 'bp-2' });

    await runSync(mockClient as unknown as LynxPromptClient, baseInputs, '/workspace');

    // AGENTS.md unchanged (checksum match), CLAUDE.md created
    expect(mockClient.updateBlueprint).not.toHaveBeenCalled();
    expect(mockClient.createBlueprint).toHaveBeenCalledTimes(1);
    expect(core.setOutput).toHaveBeenCalledWith('synced-count', 1);
  });

  it('logs error and continues when syncing a file fails', async () => {
    const mockFiles: DetectedFile[] = [
      {
        path: '/workspace/AGENTS.md',
        relativePath: 'AGENTS.md',
        type: 'AGENTS_MD',
        content: '# Agents',
        blueprintName: 'AGENTS.md',
      },
      {
        path: '/workspace/CLAUDE.md',
        relativePath: 'CLAUDE.md',
        type: 'CLAUDE_MD',
        content: '# Claude',
        blueprintName: 'CLAUDE.md',
      },
    ];
    vi.mocked(detectConfigFiles).mockResolvedValue(mockFiles);
    mockClient.listBlueprints.mockResolvedValue([]);
    mockClient.createBlueprint
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({ id: 'bp-2' });

    await runSync(mockClient as unknown as LynxPromptClient, baseInputs, '/workspace');

    expect(core.error).toHaveBeenCalledWith(expect.stringContaining('Failed to sync AGENTS.md'));
    // Second file still succeeds
    expect(core.setOutput).toHaveBeenCalledWith('synced-count', 1);
  });

  it('handles non-Error thrown exceptions', async () => {
    const mockFiles: DetectedFile[] = [
      {
        path: '/workspace/AGENTS.md',
        relativePath: 'AGENTS.md',
        type: 'AGENTS_MD',
        content: '# Agents',
        blueprintName: 'AGENTS.md',
      },
    ];
    vi.mocked(detectConfigFiles).mockResolvedValue(mockFiles);
    mockClient.listBlueprints.mockResolvedValue([]);
    mockClient.createBlueprint.mockRejectedValueOnce('string error');

    await runSync(mockClient as unknown as LynxPromptClient, baseInputs, '/workspace');

    expect(core.error).toHaveBeenCalledWith(expect.stringContaining('string error'));
    expect(core.setOutput).toHaveBeenCalledWith('synced-count', 0);
  });

  it('logs sync summary with correct counts', async () => {
    const mockFiles: DetectedFile[] = [
      {
        path: '/workspace/CLAUDE.md',
        relativePath: 'CLAUDE.md',
        type: 'CLAUDE_MD',
        content: '# Claude new',
        blueprintName: 'CLAUDE.md',
      },
    ];
    vi.mocked(detectConfigFiles).mockResolvedValue(mockFiles);
    mockClient.listBlueprints.mockResolvedValue([
      { id: 'bp-1', name: 'CLAUDE.md', type: 'CLAUDE_MD', content_checksum: 'mismatched' },
    ]);
    mockClient.updateBlueprint.mockResolvedValue({ id: 'bp-1' });

    await runSync(mockClient as unknown as LynxPromptClient, baseInputs, '/workspace');

    expect(core.info).toHaveBeenCalledWith('--- Sync Summary ---');
    expect(core.info).toHaveBeenCalledWith('  Created: 0');
    expect(core.info).toHaveBeenCalledWith('  Updated: 1');
    expect(core.info).toHaveBeenCalledWith('  Unchanged: 0');
  });
});
