import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { LynxPromptClient } from '../../src/api';
import { findRepoHierarchy, normalizeRemote, repositoryRoot } from '../../src/utils/repo';
import { FakeLynxPrompt, TOKEN } from '../fakeServer';

/** The same vectors and hash the CLI and the VS Code extension pin. */
const SAME_REPO = [
  'git@github.com:GeiserX/LynxPrompt.git',
  'https://github.com/GeiserX/LynxPrompt',
  'https://github.com/GeiserX/LynxPrompt.git/',
  'ssh://git@github.com:22/GeiserX/LynxPrompt.git',
  'https://x-access-token:abc@GitHub.com/GeiserX/LynxPrompt',
  '  git@GITHUB.COM:GeiserX/LynxPrompt.GIT  ',
  'git://github.com/GeiserX/LynxPrompt.git',
  'http://github.com:8080/GeiserX/LynxPrompt',
  'github.com:GeiserX/LynxPrompt',
];
const CANONICAL = 'https://github.com/GeiserX/LynxPrompt';
const CANONICAL_ROOT = 'eb2e56c7498b9899';

function workspaceWithRemote(url: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-repo-'));
  fs.mkdirSync(path.join(dir, '.git'));
  fs.writeFileSync(
    path.join(dir, '.git', 'config'),
    `[remote "origin"]\n\turl = ${url}\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n`,
  );
  return dir;
}

describe('normalizeRemote', () => {
  it.each(SAME_REPO)('%s names the canonical repository', (remote) => {
    expect(normalizeRemote(remote)).toBe(CANONICAL);
  });

  it("keeps the path's case", () => {
    expect(normalizeRemote('git@github.com:geiserx/lynxprompt.git')).toBe('https://github.com/geiserx/lynxprompt');
  });

  it('leaves a local path alone apart from the suffix', () => {
    expect(normalizeRemote('/srv/git/Repo.git/')).toBe('/srv/git/Repo');
  });

  it('drops the port of a bracketed IPv6 host', () => {
    expect(normalizeRemote('ssh://git@[::1]:2222/o/r.git')).toBe('https://[::1]/o/r');
  });
});

describe('the extra vectors the CLI pins', () => {
  it.each([
    ['git://Example.ORG/Team/Repo.GIT', 'https://example.org/Team/Repo', 'a5f13a418d39a991'],
    ['git@host.example:/owner/repo.git', 'https://host.example/owner/repo', 'c0afd4f70e32de36'],
    ['git+ssh://git@host.example/owner/repo', 'https://host.example/owner/repo', 'c0afd4f70e32de36'],
    ['https://host.example//owner/repo', 'https://host.example/owner/repo', 'c0afd4f70e32de36'],
    ['https://host.example/', 'https://host.example', '566273f00e30ee90'],
    [' /srv/git/repo.git/ ', '/srv/git/repo', '5e32d59440204430'],
    ['github.com:GeiserX/LynxPrompt', CANONICAL, CANONICAL_ROOT],
  ])('%s -> %s (%s)', (remote, normalized, root) => {
    expect(normalizeRemote(remote)).toBe(normalized);
    expect(repositoryRoot(workspaceWithRemote(remote))).toBe(root);
  });
});

describe('repositoryRoot', () => {
  it.each(SAME_REPO)('%s hashes to the pinned root', (remote) => {
    expect(repositoryRoot(workspaceWithRemote(remote))).toBe(CANONICAL_ROOT);
  });
});

describe('findRepoHierarchy', () => {
  let server: FakeLynxPrompt;
  let client: LynxPromptClient;

  beforeEach(() => {
    server = new FakeLynxPrompt();
    server.install();
    client = new LynxPromptClient('https://lp.example', TOKEN);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('finds the hierarchy an SSH clone created for an https checkout', async () => {
    const h = server.addHierarchy('GeiserX/LynxPrompt', repositoryRoot(workspaceWithRemote(SAME_REPO[0])));
    const checkout = workspaceWithRemote(CANONICAL);

    expect((await findRepoHierarchy(client, checkout, false))?.id).toBe(h.id);
  });

  it('keeps using a hierarchy created under the raw remote hash', async () => {
    // f3c0a2588d1b8cbf = the old, unnormalised hash of the SSH remote
    const h = server.addHierarchy('GeiserX/LynxPrompt', 'f3c0a2588d1b8cbf');
    const ws = workspaceWithRemote(SAME_REPO[0]);

    expect((await findRepoHierarchy(client, ws, false))?.id).toBe(h.id);
    expect((await findRepoHierarchy(client, ws, true))?.id).toBe(h.id);
    expect(server.hierarchies).toHaveLength(1);
  });

  it('creates a missing hierarchy under the normalised root', async () => {
    const created = await findRepoHierarchy(client, workspaceWithRemote(SAME_REPO[0]), true);

    expect(created?.repository_root).toBe(CANONICAL_ROOT);
  });
});
