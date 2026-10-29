import { vi } from 'vitest';
import { contentChecksum } from '../src/utils/checksum';

/**
 * An in-memory LynxPrompt v1 API, installed as the global fetch. Response
 * shapes and rules follow the real routes in LynxPrompt
 * (src/app/api/v1/blueprints/route.ts, blueprints/[id]/route.ts,
 * hierarchies/route.ts, src/lib/pagination.ts): lists are wrapped and
 * paginated (default limit 50, max 100), single objects are wrapped in
 * `blueprint` / `hierarchy`, and content_checksum is contentChecksum().
 */

export const TOKEN = 'lp_test';

interface StoredBlueprint {
  id: string;
  name: string;
  description: string | null;
  type: string;
  content: string;
  visibility: 'PRIVATE' | 'TEAM' | 'PUBLIC';
  teamId: string | null;
  tags: string[];
  hierarchyId: string | null;
  repositoryPath: string | null;
}

interface StoredHierarchy {
  id: string;
  name: string;
  repositoryRoot: string;
}

export interface Call {
  method: string;
  path: string;
  body?: Record<string, unknown>;
}

export class FakeLynxPrompt {
  blueprints: StoredBlueprint[] = [];
  hierarchies: StoredHierarchy[] = [];
  calls: Call[] = [];
  /** How many teams the token's user belongs to. */
  teamCount = 1;
  private nextId = 1;

  install(): void {
    vi.stubGlobal('fetch', (url: string, init: RequestInit) =>
      this.handle(url, init),
    );
  }

  addHierarchy(name: string, repositoryRoot: string): StoredHierarchy {
    const h = { id: `ha_${this.nextId++}`, name, repositoryRoot };
    this.hierarchies.push(h);
    return h;
  }

  addBlueprint(fields: Partial<StoredBlueprint> & { name: string; content: string }): StoredBlueprint {
    const bp: StoredBlueprint = {
      id: `bp_${this.nextId++}`,
      description: null,
      type: 'AGENTS_MD',
      visibility: 'PRIVATE',
      teamId: null,
      tags: [],
      hierarchyId: null,
      repositoryPath: null,
      ...fields,
    };
    this.blueprints.push(bp);
    return bp;
  }

  writes(): Call[] {
    return this.calls.filter((c) => c.method !== 'GET');
  }

  private json(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  private format(bp: StoredBlueprint, withContent: boolean) {
    return {
      id: bp.id,
      name: bp.name,
      description: bp.description,
      ...(withContent ? { content: bp.content } : {}),
      type: bp.type,
      tier: 'SHORT',
      category: 'other',
      tags: bp.tags,
      visibility: bp.visibility,
      downloads: 0,
      favorites: 0,
      created_at: '2026-10-29T00:00:00.000Z',
      updated_at: '2026-10-29T00:00:00.000Z',
      hierarchy_id: bp.hierarchyId,
      parent_id: null,
      repository_path: bp.repositoryPath,
      content_checksum: contentChecksum(bp.content),
    };
  }

  private page<T>(items: T[], params: URLSearchParams) {
    const raw = Number(params.get('limit') ?? '');
    const limit = Number.isSafeInteger(raw) && params.get('limit') ? Math.min(Math.max(raw, 1), 100) : 50;
    const rawOffset = Number(params.get('offset') ?? '0');
    const offset = Number.isSafeInteger(rawOffset) ? Math.max(rawOffset, 0) : 0;
    const slice = items.slice(offset, offset + limit);
    return { slice, total: items.length, limit, offset, has_more: offset + slice.length < items.length };
  }

  private async handle(url: string, init: RequestInit): Promise<Response> {
    const u = new URL(url);
    const method = init.method ?? 'GET';
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    this.calls.push({ method, path: u.pathname + u.search, body });

    const auth = (init.headers as Record<string, string>)?.Authorization;
    if (auth !== `Bearer ${TOKEN}`) {
      return this.json(401, { error: 'Invalid or missing API token' });
    }

    if (u.pathname === '/api/v1/blueprints' && method === 'GET') {
      const p = this.page(this.blueprints, u.searchParams);
      return this.json(200, {
        blueprints: p.slice.map((b) => this.format(b, false)),
        total: p.total,
        limit: p.limit,
        offset: p.offset,
        has_more: p.has_more,
      });
    }

    if (u.pathname === '/api/v1/blueprints' && method === 'POST') {
      if (!body.name || body.name.trim().length < 3) {
        return this.json(400, { error: 'Name must be at least 3 characters' });
      }
      if (!body.content || body.content.trim().length < 10) {
        return this.json(400, { error: 'Content must be at least 10 characters' });
      }
      const visibility = ['PRIVATE', 'TEAM', 'PUBLIC'].includes(String(body.visibility ?? 'PRIVATE').toUpperCase())
        ? String(body.visibility ?? 'PRIVATE').toUpperCase()
        : 'PRIVATE';
      let teamId: string | null = null;
      if (visibility === 'TEAM') {
        if (!body.team_id && this.teamCount > 1) {
          return this.json(400, { error: 'You belong to more than one team; send team_id' });
        }
        teamId = body.team_id ?? 'team_only';
      }
      const hierarchyId = this.hierarchies.some((h) => h.id === body.hierarchy_id) ? body.hierarchy_id : null;
      const bp = this.addBlueprint({
        name: body.name.trim(),
        description: body.description ?? null,
        type: body.type ?? 'AGENTS_MD',
        content: body.content,
        visibility: visibility as StoredBlueprint['visibility'],
        teamId,
        hierarchyId,
        repositoryPath: body.repository_path ?? null,
      });
      return this.json(201, { success: true, blueprint: this.format(bp, false) });
    }

    const one = /^\/api\/v1\/blueprints\/([^/]+)$/.exec(u.pathname);
    if (one) {
      const bp = this.blueprints.find((b) => b.id === decodeURIComponent(one[1]));
      if (!bp) return this.json(404, { error: 'Blueprint not found' });
      if (method === 'GET') {
        return this.json(200, { blueprint: this.format(bp, true) });
      }
      if (method === 'PUT') {
        const current = contentChecksum(bp.content);
        if (body.expected_checksum && body.expected_checksum !== current) {
          return this.json(409, {
            error: 'Conflict - blueprint has been modified',
            current_checksum: current,
            expected_checksum: body.expected_checksum,
          });
        }
        if (body.content !== undefined) bp.content = body.content;
        if (body.visibility !== undefined) {
          bp.visibility = String(body.visibility).toUpperCase() as StoredBlueprint['visibility'];
          if (bp.visibility === 'PRIVATE' || bp.visibility === 'PUBLIC') bp.teamId = null;
          if (bp.visibility === 'TEAM') bp.teamId = body.team_id ?? bp.teamId ?? 'team_only';
        }
        return this.json(200, { success: true, blueprint: this.format(bp, true) });
      }
    }

    if (u.pathname === '/api/v1/hierarchies' && method === 'GET') {
      const p = this.page(this.hierarchies, u.searchParams);
      return this.json(200, {
        hierarchies: p.slice.map((h) => ({
          id: h.id,
          name: h.name,
          description: null,
          repository_root: h.repositoryRoot,
          blueprint_count: this.blueprints.filter((b) => b.hierarchyId === h.id).length,
          created_at: '2026-10-29T00:00:00.000Z',
          updated_at: '2026-10-29T00:00:00.000Z',
        })),
        total: p.total,
        limit: p.limit,
        offset: p.offset,
        has_more: p.has_more,
      });
    }

    if (u.pathname === '/api/v1/hierarchies' && method === 'POST') {
      const existing = this.hierarchies.find((h) => h.repositoryRoot === body.repository_root);
      const h = existing ?? this.addHierarchy(body.name, body.repository_root);
      return this.json(existing ? 200 : 201, {
        ...(existing ? {} : { success: true }),
        hierarchy: { id: h.id, name: h.name, description: null, repository_root: h.repositoryRoot },
      });
    }

    return this.json(404, { error: 'Not found' });
  }
}
