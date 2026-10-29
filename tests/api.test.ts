import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock @actions/core before importing the module
vi.mock('@actions/core', () => ({
  debug: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
}));

import { LynxPromptClient } from '../src/api';
import { FakeLynxPrompt, TOKEN } from './fakeServer';

const BASE = 'https://lp.example';

describe('LynxPromptClient', () => {
  let server: FakeLynxPrompt;
  let client: LynxPromptClient;

  beforeEach(() => {
    server = new FakeLynxPrompt();
    server.install();
    client = new LynxPromptClient(BASE, TOKEN);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('strips trailing slashes from base URL', () => {
    expect((new LynxPromptClient('https://example.com///', 'lp_x') as any).baseUrl).toBe(
      'https://example.com',
    );
  });

  describe('listBlueprints', () => {
    it('unwraps the { blueprints, total, has_more } list response', async () => {
      server.addBlueprint({ name: 'AGENTS.md', content: '# Agents rules here' });

      const result = await client.listBlueprints();

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ name: 'AGENTS.md', type: 'AGENTS_MD' });
      expect(result[0].content_checksum).toMatch(/^[0-9a-f]{16}$/);
    });

    it('fetches every page when there are more than 100 blueprints', async () => {
      for (let i = 0; i < 230; i++) {
        server.addBlueprint({ name: `bp-${i}`, content: `# Blueprint number ${i}` });
      }

      const result = await client.listBlueprints();

      expect(result.map((b) => b.name)).toEqual(
        Array.from({ length: 230 }, (_, i) => `bp-${i}`),
      );
      expect(server.calls.map((c) => c.path)).toEqual([
        '/api/v1/blueprints?limit=100&offset=0',
        '/api/v1/blueprints?limit=100&offset=100',
        '/api/v1/blueprints?limit=100&offset=200',
      ]);
    });

    it('throws when the body is not a wrapped list', async () => {
      vi.stubGlobal('fetch', async () =>
        new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }),
      );
      await expect(client.listBlueprints()).rejects.toThrow('no "blueprints" array');
    });

    it('throws on API error', async () => {
      const bad = new LynxPromptClient(BASE, 'lp_wrong');
      await expect(bad.listBlueprints()).rejects.toThrow('LynxPrompt API error: 401');
    });
  });

  it('getBlueprint unwraps { blueprint }', async () => {
    const bp = server.addBlueprint({ name: 'CLAUDE.md', type: 'CLAUDE_MD', content: '# Claude rules\n' });

    const result = await client.getBlueprint(bp.id);

    expect(result).toMatchObject({ id: bp.id, content: '# Claude rules\n' });
  });

  it('createBlueprint unwraps { success, blueprint }', async () => {
    const result = await client.createBlueprint({
      name: 'AGENTS.md',
      type: 'AGENTS_MD',
      content: '# Agents rules here',
      visibility: 'PRIVATE',
    });

    expect(result.id).toMatch(/^bp_/);
    expect(server.blueprints).toHaveLength(1);
  });

  it('updateBlueprint unwraps { success, blueprint }', async () => {
    const bp = server.addBlueprint({ name: 'AGENTS.md', content: '# Agents rules here' });

    const result = await client.updateBlueprint(bp.id, { content: '# New agents rules' });

    expect(result).toMatchObject({ id: bp.id, content: '# New agents rules' });
  });

  it('ensureHierarchy returns the same hierarchy for the same repository root', async () => {
    const a = await client.ensureHierarchy('owner/repo', 'abc123');
    const b = await client.ensureHierarchy('owner/repo', 'abc123');

    expect(a.id).toBe(b.id);
    expect(await client.listHierarchies()).toHaveLength(1);
  });

  describe('validateToken', () => {
    it('returns true for a valid token', async () => {
      expect(await client.validateToken()).toBe(true);
    });

    it('returns false for an invalid token', async () => {
      expect(await new LynxPromptClient(BASE, 'lp_wrong').validateToken()).toBe(false);
    });

    it('returns false when the URL answers 200 with HTML', async () => {
      vi.stubGlobal('fetch', async () =>
        new Response('<html></html>', { status: 200, headers: { 'Content-Type': 'text/html' } }),
      );
      expect(await client.validateToken()).toBe(false);
    });
  });
});
