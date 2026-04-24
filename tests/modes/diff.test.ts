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

vi.mock('../../src/utils/comment', () => ({
  formatDiffComment: vi.fn(() => 'diff comment body'),
  upsertPrComment: vi.fn(),
}));

import * as core from '@actions/core';
import { runDiff } from '../../src/modes/diff';
import { detectConfigFiles } from '../../src/utils/detector';
import { upsertPrComment } from '../../src/utils/comment';
import { LynxPromptClient } from '../../src/api';
import { ActionInputs, DetectedFile } from '../../src/types';
import * as crypto from 'crypto';

function sha256(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf-8').digest('hex');
}

describe('runDiff', () => {
  let mockClient: {
    listBlueprints: ReturnType<typeof vi.fn>;
    getBlueprint: ReturnType<typeof vi.fn>;
  };

  const baseInputs: ActionInputs = {
    mode: 'diff',
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

  it('detects match when local and cloud checksums are identical', async () => {
    const content = '# Agents\n\nSome content.';
    const checksum = sha256(content);

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

    await runDiff(mockClient as unknown as LynxPromptClient, baseInputs, '/workspace');

    expect(core.setOutput).toHaveBeenCalledWith('drift-detected', false);
    expect(core.setFailed).not.toHaveBeenCalled();
  });

  it('detects drift when checksums differ and fetches line details', async () => {
    const localContent = '# Agents\n\nLocal version.\nExtra line.';
    const cloudContent = '# Agents\n\nCloud version.';

    const mockFiles: DetectedFile[] = [
      {
        path: '/workspace/AGENTS.md',
        relativePath: 'AGENTS.md',
        type: 'AGENTS_MD',
        content: localContent,
        blueprintName: 'AGENTS.md',
      },
    ];
    vi.mocked(detectConfigFiles).mockResolvedValue(mockFiles);
    mockClient.listBlueprints.mockResolvedValue([
      { id: 'bp-1', name: 'AGENTS.md', type: 'AGENTS_MD', content_checksum: 'different-checksum' },
    ]);
    mockClient.getBlueprint.mockResolvedValue({
      id: 'bp-1',
      content: cloudContent,
    });

    await runDiff(mockClient as unknown as LynxPromptClient, baseInputs, '/workspace');

    expect(mockClient.getBlueprint).toHaveBeenCalledWith('bp-1');
    expect(core.setOutput).toHaveBeenCalledWith('drift-detected', true);
  });

  it('uses basic detail message when getBlueprint fails', async () => {
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
    mockClient.listBlueprints.mockResolvedValue([
      { id: 'bp-1', name: 'AGENTS.md', type: 'AGENTS_MD', content_checksum: 'different' },
    ]);
    mockClient.getBlueprint.mockRejectedValue(new Error('API down'));

    await runDiff(mockClient as unknown as LynxPromptClient, baseInputs, '/workspace');

    // Should still complete without throwing
    expect(core.setOutput).toHaveBeenCalledWith('drift-detected', true);
  });

  it('marks local files as local-only when no cloud blueprint matches', async () => {
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

    await runDiff(mockClient as unknown as LynxPromptClient, baseInputs, '/workspace');

    expect(core.setOutput).toHaveBeenCalledWith('drift-detected', true);
  });

  it('marks cloud blueprints as cloud-only when no local file matches', async () => {
    vi.mocked(detectConfigFiles).mockResolvedValue([]);
    mockClient.listBlueprints.mockResolvedValue([
      { id: 'bp-1', name: 'CLAUDE.md', type: 'CLAUDE_MD', content_checksum: 'abc' },
    ]);

    await runDiff(mockClient as unknown as LynxPromptClient, baseInputs, '/workspace');

    expect(core.setOutput).toHaveBeenCalledWith('drift-detected', true);
  });

  it('posts a PR comment with diff results', async () => {
    vi.mocked(detectConfigFiles).mockResolvedValue([]);
    mockClient.listBlueprints.mockResolvedValue([]);

    await runDiff(mockClient as unknown as LynxPromptClient, baseInputs, '/workspace');

    expect(upsertPrComment).toHaveBeenCalledWith('diff comment body');
  });

  it('fails when failOnDrift is true and drift exists', async () => {
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

    const inputs: ActionInputs = { ...baseInputs, failOnDrift: true };
    await runDiff(mockClient as unknown as LynxPromptClient, inputs, '/workspace');

    expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('Config drift detected'));
  });

  it('does not fail when failOnDrift is true but no drift', async () => {
    const content = '# Agents';
    const checksum = sha256(content);

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

    const inputs: ActionInputs = { ...baseInputs, failOnDrift: true };
    await runDiff(mockClient as unknown as LynxPromptClient, inputs, '/workspace');

    expect(core.setFailed).not.toHaveBeenCalled();
  });

  it('handles mix of match, drift, local-only, and cloud-only', async () => {
    const matchContent = '# Match';
    const matchChecksum = sha256(matchContent);

    const mockFiles: DetectedFile[] = [
      {
        path: '/workspace/AGENTS.md',
        relativePath: 'AGENTS.md',
        type: 'AGENTS_MD',
        content: matchContent,
        blueprintName: 'AGENTS.md',
      },
      {
        path: '/workspace/CLAUDE.md',
        relativePath: 'CLAUDE.md',
        type: 'CLAUDE_MD',
        content: '# Claude local',
        blueprintName: 'CLAUDE.md',
      },
      {
        path: '/workspace/AIDER.md',
        relativePath: 'AIDER.md',
        type: 'AIDER_MD',
        content: '# Aider local only',
        blueprintName: 'AIDER.md',
      },
    ];
    vi.mocked(detectConfigFiles).mockResolvedValue(mockFiles);
    mockClient.listBlueprints.mockResolvedValue([
      { id: 'bp-1', name: 'AGENTS.md', type: 'AGENTS_MD', content_checksum: matchChecksum },
      { id: 'bp-2', name: 'CLAUDE.md', type: 'CLAUDE_MD', content_checksum: 'different' },
      { id: 'bp-3', name: '.windsurfrules', type: 'WINDSURF_RULES', content_checksum: 'xyz' },
    ]);
    mockClient.getBlueprint.mockResolvedValue({ id: 'bp-2', content: '# Claude cloud' });

    await runDiff(mockClient as unknown as LynxPromptClient, baseInputs, '/workspace');

    expect(core.setOutput).toHaveBeenCalledWith('drift-detected', true);
  });

  it('logs diff summary for each result', async () => {
    const content = '# Agents';
    const checksum = sha256(content);

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

    await runDiff(mockClient as unknown as LynxPromptClient, baseInputs, '/workspace');

    expect(core.info).toHaveBeenCalledWith('--- Diff Summary ---');
    expect(core.info).toHaveBeenCalledWith(expect.stringContaining('[OK]'));
  });
});
