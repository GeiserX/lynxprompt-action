import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';

vi.mock('@actions/core', () => ({
  info: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  debug: vi.fn(),
  setOutput: vi.fn(),
  setFailed: vi.fn(),
}));

import * as core from '@actions/core';
import { runGenerate, resolveInWorkspace } from '../../src/modes/generate';
import { LynxPromptClient } from '../../src/api';
import { FakeLynxPrompt, TOKEN } from '../fakeServer';
import { inputs, makeWorkspace, rootOf } from '../workspace';

const AGENTS = '# Agents\n\nUse tabs.\n';

function read(ws: string, rel: string): string | undefined {
  try {
    return fs.readFileSync(path.join(ws, rel), 'utf-8');
  } catch {
    return undefined;
  }
}

describe('runGenerate', () => {
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

  it('warns and outputs 0 when this repository has no blueprints', async () => {
    const ws = makeWorkspace({});
    server.addBlueprint({ name: 'AGENTS.md', content: '# Some other project' });

    await runGenerate(client, inputs({ mode: 'generate' }), ws);

    expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('No blueprints found'));
    expect(core.setOutput).toHaveBeenCalledWith('generated-count', 0);
    expect(read(ws, 'AGENTS.md')).toBeUndefined();
    expect(server.writes()).toEqual([]);
  });

  it('writes each blueprint of this repository to the path it was synced from', async () => {
    const ws = makeWorkspace({ 'packages/web/AGENTS.md': '# Web agents, stale\n' });
    const h = server.addHierarchy('owner/repo', rootOf(ws));
    server.addBlueprint({ name: 'AGENTS.md', content: AGENTS, hierarchyId: h.id, repositoryPath: 'AGENTS.md' });
    server.addBlueprint({ name: 'packages/api/AGENTS.md', content: '# Api agents\n', hierarchyId: h.id, repositoryPath: 'packages/api/AGENTS.md' });
    server.addBlueprint({ name: 'packages/web/AGENTS.md', content: '# Web agents\n', hierarchyId: h.id, repositoryPath: 'packages/web/AGENTS.md' });
    server.addBlueprint({ name: 'Gemini rules for Foo', type: 'GEMINI_MD', content: '# Gemini\n', hierarchyId: h.id, repositoryPath: 'GEMINI.md' });

    await runGenerate(client, inputs({ mode: 'generate' }), ws);

    expect(read(ws, 'AGENTS.md')).toBe(AGENTS);
    expect(read(ws, 'packages/api/AGENTS.md')).toBe('# Api agents\n');
    expect(read(ws, 'packages/web/AGENTS.md')).toBe('# Web agents\n');
    expect(read(ws, 'GEMINI.md')).toBe('# Gemini\n');
    expect(read(ws, 'Gemini rules for Foo')).toBeUndefined();
    expect(core.setOutput).toHaveBeenCalledWith('generated-count', 4);
  });

  it('leaves blueprints of other repositories and of no repository alone', async () => {
    const ws = makeWorkspace({});
    const h = server.addHierarchy('owner/repo', rootOf(ws));
    server.addBlueprint({ name: 'AGENTS.md', content: AGENTS, hierarchyId: h.id, repositoryPath: 'AGENTS.md' });
    const other = server.addHierarchy('owner/other', 'ffffffffffffffff');
    server.addBlueprint({ name: 'AGENTS.md', content: '# Other repo agents', hierarchyId: other.id, repositoryPath: 'AGENTS.md' });
    server.addBlueprint({ name: 'CLAUDE.md', type: 'CLAUDE_MD', content: '# Web-only claude' });

    await runGenerate(client, inputs({ mode: 'generate' }), ws);

    expect(read(ws, 'AGENTS.md')).toBe(AGENTS);
    expect(read(ws, 'CLAUDE.md')).toBeUndefined();
  });

  it('skips a file whose content is already identical', async () => {
    const ws = makeWorkspace({ 'AGENTS.md': AGENTS });
    const h = server.addHierarchy('owner/repo', rootOf(ws));
    server.addBlueprint({ name: 'AGENTS.md', content: AGENTS, hierarchyId: h.id, repositoryPath: 'AGENTS.md' });

    await runGenerate(client, inputs({ mode: 'generate' }), ws);

    expect(core.setOutput).toHaveBeenCalledWith('generated-count', 0);
  });

  it('refuses a path that leaves the workspace or enters .git', async () => {
    const ws = makeWorkspace({});
    const h = server.addHierarchy('owner/repo', rootOf(ws));
    server.addBlueprint({ name: 'escape', content: '# Escaped file\n', hierarchyId: h.id, repositoryPath: '../../escaped.md' });
    server.addBlueprint({ name: 'hook', content: '#!/bin/sh\necho pwned\n', hierarchyId: h.id, repositoryPath: '.git/hooks/pre-commit' });

    await runGenerate(client, inputs({ mode: 'generate' }), ws);

    expect(fs.existsSync(path.resolve(ws, '../../escaped.md'))).toBe(false);
    expect(read(ws, '.git/hooks/pre-commit')).toBeUndefined();
    expect(core.setOutput).toHaveBeenCalledWith('generated-count', 0);
  });

  it('resolveInWorkspace keeps paths inside the workspace only', () => {
    expect(resolveInWorkspace('/w', 'a/b.md')).toBe('/w/a/b.md');
    expect(resolveInWorkspace('/w', '../x.md')).toBeUndefined();
    expect(resolveInWorkspace('/w', '/etc/passwd')).toBeUndefined();
    expect(resolveInWorkspace('/w', '.git/config')).toBeUndefined();
    expect(resolveInWorkspace('/w', '.')).toBeUndefined();
    expect(resolveInWorkspace('/w', '.GIT/hooks/pre-commit')).toBeUndefined();
  });

  it('refuses a path through a symlink in the checkout', async () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-outside-'));
    const ws = makeWorkspace({});
    fs.symlinkSync(outside, path.join(ws, 'docs'));
    const h = server.addHierarchy('owner/repo', rootOf(ws));
    server.addBlueprint({ name: 'docs/AGENTS.md', content: '# Through a link\n', hierarchyId: h.id, repositoryPath: 'docs/AGENTS.md' });

    await runGenerate(client, inputs({ mode: 'generate' }), ws);

    expect(fs.existsSync(path.join(outside, 'AGENTS.md'))).toBe(false);
    expect(core.setOutput).toHaveBeenCalledWith('generated-count', 0);
  });

  describe('auto-commit (real git)', () => {
    function gitRepo(): { ws: string; remote: string } {
      const remote = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-remote-'));
      execFileSync('git', ['init', '-q', '--bare', remote]);
      const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-ws-'));
      const g = (...args: string[]) =>
        execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: ws });
      g('init', '-q');
      g('remote', 'add', 'origin', remote);
      fs.writeFileSync(path.join(ws, 'README.md'), 'hi\n');
      g('add', 'README.md');
      g('commit', '-q', '-m', 'init');
      g('push', '-q', '-u', 'origin', 'HEAD');
      return { ws, remote };
    }

    it('commits and pushes the generated files', async () => {
      const { ws, remote } = gitRepo();
      const h = server.addHierarchy('owner/repo', rootOf(ws));
      server.addBlueprint({ name: 'AGENTS.md', content: AGENTS, hierarchyId: h.id, repositoryPath: 'AGENTS.md' });

      await runGenerate(client, inputs({ mode: 'generate', commitChanges: true }), ws);

      const log = execFileSync('git', ['log', '--format=%s', '-1', 'HEAD'], { cwd: remote }).toString();
      expect(log.trim()).toBe('chore: update AI config files from LynxPrompt');
      const files = execFileSync('git', ['show', '--name-only', '--format=', 'HEAD'], { cwd: remote }).toString();
      expect(files.trim()).toBe('AGENTS.md');
    });

    it('stages a file whose name holds shell syntax without running it', async () => {
      const { ws, remote } = gitRepo();
      const h = server.addHierarchy('owner/repo', rootOf(ws));
      const marker = path.join(ws, 'pwned');
      const evil = `.cursor/rules/x$(touch ${marker})".mdc`;
      server.addBlueprint({ name: 'evil', type: 'CURSOR_RULES', content: '# Evil rule here\n', hierarchyId: h.id, repositoryPath: evil });

      await runGenerate(client, inputs({ mode: 'generate', commitChanges: true }), ws);

      expect(fs.existsSync(marker)).toBe(false);
      const files = execFileSync('git', ['show', '--name-only', '--format=', '-z', 'HEAD'], { cwd: remote }).toString();
      expect(files.split('\0').filter(Boolean)).toEqual([evil]);
    });

    it('does not commit when commit-changes is off', async () => {
      const { ws, remote } = gitRepo();
      const h = server.addHierarchy('owner/repo', rootOf(ws));
      server.addBlueprint({ name: 'AGENTS.md', content: AGENTS, hierarchyId: h.id, repositoryPath: 'AGENTS.md' });

      await runGenerate(client, inputs({ mode: 'generate' }), ws);

      const log = execFileSync('git', ['log', '--format=%s', '-1', 'HEAD'], { cwd: remote }).toString();
      expect(log.trim()).toBe('init');
    });

    it('fails on a failed push and reports no generated files', async () => {
      const { ws } = gitRepo();
      execFileSync('git', ['remote', 'set-url', 'origin', path.join(ws, 'missing')], { cwd: ws });
      const h = server.addHierarchy('owner/repo', rootOf(ws));
      server.addBlueprint({ name: 'AGENTS.md', content: AGENTS, hierarchyId: h.id, repositoryPath: 'AGENTS.md' });

      await expect(
        runGenerate(client, inputs({ mode: 'generate', commitChanges: true }), ws),
      ).rejects.toThrow(/Auto-commit failed/);
      expect(core.setOutput).not.toHaveBeenCalledWith('generated-count', expect.anything());
    });
  });
});
