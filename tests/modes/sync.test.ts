import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@actions/core', () => ({
  info: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  debug: vi.fn(),
  setOutput: vi.fn(),
  setFailed: vi.fn(),
}));

import * as core from '@actions/core';
import { runSync } from '../../src/modes/sync';
import { LynxPromptClient } from '../../src/api';
import { contentChecksum } from '../../src/utils/checksum';
import { FakeLynxPrompt, TOKEN } from '../fakeServer';
import { inputs, makeWorkspace, rootOf } from '../workspace';

const AGENTS = '# Agents\n\nUse tabs.\n';
const CLAUDE = '# Claude\n\nRun the tests.\n';

describe('runSync', () => {
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

  it('outputs synced-count 0 and warns when no files detected', async () => {
    const ws = makeWorkspace({});

    await runSync(client, inputs(), ws);

    expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('No AI configuration files'));
    expect(core.setOutput).toHaveBeenCalledWith('synced-count', 0);
    expect(server.writes()).toEqual([]);
  });

  it('uploads every file of the default pattern into the repo hierarchy', async () => {
    const ws = makeWorkspace({
      'AGENTS.md': AGENTS,
      'CLAUDE.md': CLAUDE,
      'packages/api/AGENTS.md': AGENTS,
      '.cursor/rules/style.mdc': '# Style\n\nNo semicolons.\n',
    });

    await runSync(client, inputs(), ws);

    expect(server.hierarchies).toEqual([
      expect.objectContaining({ name: expect.any(String), repositoryRoot: rootOf(ws) }),
    ]);
    const h = server.hierarchies[0];
    expect(server.blueprints.map((b) => [b.repositoryPath, b.type, b.hierarchyId, b.visibility]).sort()).toEqual([
      ['.cursor/rules/style.mdc', 'CURSOR_RULES', h.id, 'PRIVATE'],
      ['AGENTS.md', 'AGENTS_MD', h.id, 'PRIVATE'],
      ['CLAUDE.md', 'CLAUDE_MD', h.id, 'PRIVATE'],
      ['packages/api/AGENTS.md', 'AGENTS_MD', h.id, 'PRIVATE'],
    ]);
    expect(core.setOutput).toHaveBeenCalledWith('synced-count', 4);
    expect(core.setFailed).not.toHaveBeenCalled();
  });

  it('a second sync of unchanged files sends no write but the hierarchy lookup', async () => {
    const ws = makeWorkspace({ 'AGENTS.md': AGENTS, 'CLAUDE.md': CLAUDE });
    await runSync(client, inputs(), ws);
    server.calls = [];

    await runSync(client, inputs(), ws);

    expect(server.writes().map((c) => c.path)).toEqual(['/api/v1/hierarchies']);
    expect(server.blueprints).toHaveLength(2);
    expect(core.setOutput).toHaveBeenLastCalledWith('synced-count', 0);
  });

  it('treats CRLF and a trailing newline as unchanged, like the server checksum', async () => {
    const ws = makeWorkspace({ 'AGENTS.md': '# Agents\r\n\r\nUse tabs.\r\n' });
    const h = server.addHierarchy('owner/repo', rootOf(ws));
    server.addBlueprint({ name: 'AGENTS.md', content: '# Agents\n\nUse tabs.', hierarchyId: h.id, repositoryPath: 'AGENTS.md' });

    await runSync(client, inputs(), ws);

    expect(server.calls.filter((c) => c.method === 'PUT')).toEqual([]);
  });

  it('updates a changed file and leaves its visibility alone when the input is unset', async () => {
    const ws = makeWorkspace({ 'AGENTS.md': '# Agents\n\nUse spaces now.\n' });
    const h = server.addHierarchy('owner/repo', rootOf(ws));
    const bp = server.addBlueprint({
      name: 'AGENTS.md',
      content: AGENTS,
      visibility: 'PUBLIC',
      hierarchyId: h.id,
      repositoryPath: 'AGENTS.md',
    });

    await runSync(client, inputs(), ws);

    const put = server.calls.find((c) => c.method === 'PUT')!;
    expect(put.body).toEqual({
      content: '# Agents\n\nUse spaces now.\n',
      expected_checksum: contentChecksum(AGENTS),
    });
    expect(bp.visibility).toBe('PUBLIC');
    expect(bp.content).toBe('# Agents\n\nUse spaces now.\n');
    expect(core.setOutput).toHaveBeenCalledWith('synced-count', 1);
  });

  it('applies visibility and team-id on update when the workflow sets them', async () => {
    const ws = makeWorkspace({ 'AGENTS.md': '# Agents\n\nUse spaces now.\n' });
    const h = server.addHierarchy('owner/repo', rootOf(ws));
    server.addBlueprint({ name: 'AGENTS.md', content: AGENTS, hierarchyId: h.id, repositoryPath: 'AGENTS.md' });

    await runSync(client, inputs({ visibility: 'TEAM', teamId: 'team_2' }), ws);

    expect(server.calls.find((c) => c.method === 'PUT')!.body).toMatchObject({
      visibility: 'TEAM',
      team_id: 'team_2',
    });
  });

  it('sends team-id on create so a user in several teams can sync TEAM blueprints', async () => {
    server.teamCount = 2;
    const ws = makeWorkspace({ 'AGENTS.md': AGENTS });

    await runSync(client, inputs({ visibility: 'TEAM', teamId: 'team_2' }), ws);

    expect(server.blueprints[0]).toMatchObject({ visibility: 'TEAM', teamId: 'team_2' });
    expect(core.setFailed).not.toHaveBeenCalled();
  });

  it('never matches a blueprint of another repository or outside any hierarchy', async () => {
    const ws = makeWorkspace({ 'AGENTS.md': AGENTS });
    const other = server.addHierarchy('owner/other', 'ffffffffffffffff');
    const foreign = server.addBlueprint({ name: 'AGENTS.md', content: '# Other repo agents', hierarchyId: other.id, repositoryPath: 'AGENTS.md' });
    const loose = server.addBlueprint({ name: 'AGENTS.md', content: '# Web only agents' });

    await runSync(client, inputs(), ws);

    expect(foreign.content).toBe('# Other repo agents');
    expect(loose.content).toBe('# Web only agents');
    expect(server.blueprints).toHaveLength(3);
  });

  it('finds its blueprint beyond the first page instead of creating a duplicate', async () => {
    const ws = makeWorkspace({ 'AGENTS.md': AGENTS });
    const h = server.addHierarchy('owner/repo', rootOf(ws));
    for (let i = 0; i < 120; i++) {
      server.addBlueprint({ name: `other-${i}`, content: `# Other blueprint ${i}` });
    }
    server.addBlueprint({ name: 'AGENTS.md', content: AGENTS, hierarchyId: h.id, repositoryPath: 'AGENTS.md' });

    await runSync(client, inputs(), ws);

    expect(server.blueprints).toHaveLength(121);
    expect(server.calls.filter((c) => c.method === 'POST' && c.path === '/api/v1/blueprints')).toEqual([]);
  });

  it('fails the job when a file cannot be synced, and still syncs the others', async () => {
    const ws = makeWorkspace({ 'AGENTS.md': 'short', 'CLAUDE.md': CLAUDE });

    await runSync(client, inputs(), ws);

    expect(core.error).toHaveBeenCalledWith(expect.stringContaining('Failed to sync AGENTS.md'));
    expect(server.blueprints.map((b) => b.repositoryPath)).toEqual(['CLAUDE.md']);
    expect(core.setOutput).toHaveBeenCalledWith('synced-count', 1);
    expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('Failed to sync 1 of 2 file(s): AGENTS.md'));
  });
});
