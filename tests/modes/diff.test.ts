import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@actions/core', () => ({
  info: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  debug: vi.fn(),
  setOutput: vi.fn(),
  setFailed: vi.fn(),
}));

vi.mock('../../src/utils/comment', () => ({
  formatDiffComment: vi.fn(() => 'diff comment body'),
  upsertPrComment: vi.fn(),
}));

import * as core from '@actions/core';
import { runDiff } from '../../src/modes/diff';
import { formatDiffComment, upsertPrComment } from '../../src/utils/comment';
import { LynxPromptClient } from '../../src/api';
import { DiffResult } from '../../src/types';
import { FakeLynxPrompt, TOKEN } from '../fakeServer';
import { inputs, makeWorkspace, rootOf } from '../workspace';

const AGENTS = '# Agents\n\nUse tabs.\n';

function lastResults(): DiffResult[] {
  return vi.mocked(formatDiffComment).mock.calls.at(-1)![0];
}

describe('runDiff', () => {
  let server: FakeLynxPrompt;
  let client: LynxPromptClient;

  beforeEach(() => {
    vi.clearAllMocks();
    server = new FakeLynxPrompt();
    server.install();
    client = new LynxPromptClient('https://lp.example', TOKEN);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function synced(ws: string, files: Record<string, string>) {
    const h = server.addHierarchy('owner/repo', rootOf(ws));
    for (const [p, content] of Object.entries(files)) {
      server.addBlueprint({ name: p, content, hierarchyId: h.id, repositoryPath: p });
    }
    return h;
  }

  it('reports a match when the file equals its blueprint up to CRLF and trailing newline', async () => {
    const ws = makeWorkspace({ 'AGENTS.md': '# Agents\r\n\r\nUse tabs.\r\n' });
    synced(ws, { 'AGENTS.md': '# Agents\n\nUse tabs.' });

    await runDiff(client, inputs({ mode: 'diff', failOnDrift: true }), ws);

    expect(lastResults().map((r) => r.status)).toEqual(['match']);
    expect(core.setOutput).toHaveBeenCalledWith('drift-detected', false);
    expect(core.setFailed).not.toHaveBeenCalled();
  });

  it('reports drift with line counts and fails when fail-on-drift is set', async () => {
    const ws = makeWorkspace({ 'AGENTS.md': '# Agents\n\nUse tabs.\nAnd more.\n' });
    synced(ws, { 'AGENTS.md': AGENTS });

    await runDiff(client, inputs({ mode: 'diff', failOnDrift: true }), ws);

    expect(lastResults()).toEqual([
      expect.objectContaining({ file: 'AGENTS.md', status: 'drift', details: 'Local: 5 lines, Cloud: 4 lines (+1)' }),
    ]);
    expect(core.setOutput).toHaveBeenCalledWith('drift-detected', true);
    expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('1 file(s)'));
  });

  it('reports a file with no blueprint as local-only drift', async () => {
    const ws = makeWorkspace({ 'AGENTS.md': AGENTS });

    await runDiff(client, inputs({ mode: 'diff', failOnDrift: true }), ws);

    expect(lastResults().map((r) => r.status)).toEqual(['local-only']);
    expect(core.setFailed).toHaveBeenCalled();
  });

  it('lists a blueprint of this repo with no local file, without counting it as drift', async () => {
    const ws = makeWorkspace({ 'AGENTS.md': AGENTS });
    synced(ws, { 'AGENTS.md': AGENTS, 'docs/AGENTS.md': '# Old docs agents' });

    await runDiff(client, inputs({ mode: 'diff', failOnDrift: true }), ws);

    expect(lastResults().map((r) => [r.file, r.status])).toEqual([
      ['AGENTS.md', 'match'],
      ['docs/AGENTS.md', 'cloud-only'],
    ]);
    expect(core.setOutput).toHaveBeenCalledWith('drift-detected', false);
    expect(core.setFailed).not.toHaveBeenCalled();
  });

  it('ignores blueprints of other repositories and of no repository', async () => {
    const ws = makeWorkspace({ 'AGENTS.md': AGENTS });
    synced(ws, { 'AGENTS.md': AGENTS });
    const other = server.addHierarchy('owner/other', 'ffffffffffffffff');
    server.addBlueprint({ name: 'CLAUDE.md', type: 'CLAUDE_MD', content: '# Other repo', hierarchyId: other.id, repositoryPath: 'CLAUDE.md' });
    server.addBlueprint({ name: 'My web prompt', content: '# Only in the web app' });

    await runDiff(client, inputs({ mode: 'diff', failOnDrift: true }), ws);

    expect(lastResults().map((r) => r.status)).toEqual(['match']);
    expect(core.setFailed).not.toHaveBeenCalled();
  });

  it('never creates a hierarchy for a repository that was never synced', async () => {
    const ws = makeWorkspace({ 'AGENTS.md': AGENTS });

    await runDiff(client, inputs({ mode: 'diff' }), ws);

    expect(server.writes()).toEqual([]);
  });

  it('posts the PR comment with the github-token input', async () => {
    const ws = makeWorkspace({ 'AGENTS.md': AGENTS });

    await runDiff(client, inputs({ mode: 'diff', githubToken: 'ghs_x' }), ws);

    expect(upsertPrComment).toHaveBeenCalledWith('diff', 'diff comment body', 'ghs_x');
  });
});
