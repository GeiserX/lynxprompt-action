import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock @actions/core before importing the module
vi.mock('@actions/core', () => ({
  debug: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
}));

import { LynxPromptClient } from '../src/api';

describe('LynxPromptClient', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('strips trailing slash from base URL', () => {
    const client = new LynxPromptClient('https://example.com/', 'lp_test');
    // Access private field via any
    expect((client as any).baseUrl).toBe('https://example.com');
  });

  it('strips multiple trailing slashes', () => {
    const client = new LynxPromptClient('https://example.com///', 'lp_test');
    expect((client as any).baseUrl).toBe('https://example.com');
  });

  describe('listBlueprints', () => {
    it('fetches blueprints successfully', async () => {
      const mockBlueprints = [
        { id: '1', name: 'test', type: 'AGENTS_MD', content_checksum: 'abc' },
      ];
      fetchSpy.mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve(mockBlueprints),
      });

      const client = new LynxPromptClient('https://example.com', 'lp_test');
      const result = await client.listBlueprints();

      expect(result).toEqual(mockBlueprints);
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://example.com/api/v1/blueprints',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer lp_test',
          }),
        }),
      );
    });

    it('throws on API error', async () => {
      fetchSpy.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: () => Promise.resolve('Invalid token'),
      });

      const client = new LynxPromptClient('https://example.com', 'lp_test');
      await expect(client.listBlueprints()).rejects.toThrow('LynxPrompt API error: 401');
    });
  });

  describe('getBlueprint', () => {
    it('fetches a single blueprint', async () => {
      const mockBlueprint = { id: '1', name: 'test', content: '# Test' };
      fetchSpy.mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve(mockBlueprint),
      });

      const client = new LynxPromptClient('https://example.com', 'lp_test');
      const result = await client.getBlueprint('1');

      expect(result).toEqual(mockBlueprint);
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://example.com/api/v1/blueprints/1',
        expect.any(Object),
      );
    });
  });

  describe('createBlueprint', () => {
    it('sends POST with blueprint data', async () => {
      const data = { name: 'test', type: 'AGENTS_MD' as const, content: '# Test', visibility: 'PRIVATE' as const };
      fetchSpy.mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({ id: '1', ...data }),
      });

      const client = new LynxPromptClient('https://example.com', 'lp_test');
      const result = await client.createBlueprint(data);

      expect(result.id).toBe('1');
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://example.com/api/v1/blueprints',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(data),
        }),
      );
    });
  });

  describe('updateBlueprint', () => {
    it('sends PUT with update data', async () => {
      const data = { content: '# Updated' };
      fetchSpy.mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({ id: '1', ...data }),
      });

      const client = new LynxPromptClient('https://example.com', 'lp_test');
      await client.updateBlueprint('1', data);

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://example.com/api/v1/blueprints/1',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify(data),
        }),
      );
    });
  });

  describe('findBlueprint', () => {
    it('finds a blueprint by name and type', async () => {
      const mockBlueprints = [
        { id: '1', name: 'AGENTS.md', type: 'AGENTS_MD', content_checksum: 'abc' },
        { id: '2', name: 'CLAUDE.md', type: 'CLAUDE_MD', content_checksum: 'def' },
      ];
      fetchSpy.mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve(mockBlueprints),
      });

      const client = new LynxPromptClient('https://example.com', 'lp_test');
      const result = await client.findBlueprint('CLAUDE.md', 'CLAUDE_MD');

      expect(result?.id).toBe('2');
    });

    it('returns undefined when not found', async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve([]),
      });

      const client = new LynxPromptClient('https://example.com', 'lp_test');
      const result = await client.findBlueprint('nonexistent', 'AGENTS_MD');

      expect(result).toBeUndefined();
    });
  });

  describe('validateToken', () => {
    it('returns true for valid token', async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve([]),
      });

      const client = new LynxPromptClient('https://example.com', 'lp_test');
      const valid = await client.validateToken();
      expect(valid).toBe(true);
    });

    it('returns false for invalid token', async () => {
      fetchSpy.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: () => Promise.resolve('Invalid'),
      });

      const client = new LynxPromptClient('https://example.com', 'lp_test');
      const valid = await client.validateToken();
      expect(valid).toBe(false);
    });
  });

  describe('request handling', () => {
    it('returns empty object for non-JSON response', async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'text/plain' }),
      });

      const client = new LynxPromptClient('https://example.com', 'lp_test');
      // Use updateBlueprint which returns the response
      const result = await client.updateBlueprint('1', { content: 'x' });
      expect(result).toEqual({});
    });
  });
});
