import * as core from '@actions/core';
import {
  Blueprint,
  BlueprintListItem,
  CreateBlueprintRequest,
  Hierarchy,
  UpdateBlueprintRequest,
} from './types';

/** The v1 API caps `limit` at 100. */
const PAGE_SIZE = 100;

interface Page {
  total: number;
  has_more: boolean;
}

export class LynxPromptClient {
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(baseUrl: string, token: string) {
    // Strip trailing slash
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.token = token;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    core.debug(`${method} ${url}`);

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': 'lynxprompt-action/1.0',
    };

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `LynxPrompt API error: ${response.status} ${response.statusText} - ${text}`,
      );
    }

    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return (await response.json()) as T;
    }

    throw new Error(
      `LynxPrompt API error: ${method} ${path} did not return JSON (content-type: ${contentType ?? 'none'})`,
    );
  }

  /**
   * Fetch every page of a v1 list endpoint. The API answers
   * `{ <key>: [...], total, limit, offset, has_more }`.
   */
  private async listAll<T>(path: string, key: string): Promise<T[]> {
    const items: T[] = [];
    for (;;) {
      const page = await this.request<Page & Record<string, unknown>>(
        'GET',
        `${path}?limit=${PAGE_SIZE}&offset=${items.length}`,
      );
      const batch = page[key];
      if (!Array.isArray(batch)) {
        throw new Error(
          `LynxPrompt API error: GET ${path} returned no "${key}" array`,
        );
      }
      items.push(...(batch as T[]));
      if (!page.has_more || batch.length === 0) return items;
    }
  }

  /**
   * List all blueprints of the authenticated user, every page.
   */
  async listBlueprints(): Promise<BlueprintListItem[]> {
    core.info('Fetching blueprints from LynxPrompt...');
    const result = await this.listAll<BlueprintListItem>(
      '/api/v1/blueprints',
      'blueprints',
    );
    core.info(`Found ${result.length} blueprint(s)`);
    return result;
  }

  /**
   * Get a single blueprint with its content.
   */
  async getBlueprint(id: string): Promise<Blueprint> {
    core.debug(`Fetching blueprint ${id}`);
    const result = await this.request<{ blueprint: Blueprint }>(
      'GET',
      `/api/v1/blueprints/${encodeURIComponent(id)}`,
    );
    return result.blueprint;
  }

  /**
   * Create a new blueprint.
   */
  async createBlueprint(data: CreateBlueprintRequest): Promise<Blueprint> {
    core.info(`Creating blueprint: ${data.name} (${data.type})`);
    const result = await this.request<{ blueprint: Blueprint }>(
      'POST',
      '/api/v1/blueprints',
      data,
    );
    return result.blueprint;
  }

  /**
   * Update an existing blueprint.
   */
  async updateBlueprint(
    id: string,
    data: UpdateBlueprintRequest,
  ): Promise<Blueprint> {
    core.info(`Updating blueprint ${id}: ${data.name ?? '(no name change)'}`);
    const result = await this.request<{ blueprint: Blueprint }>(
      'PUT',
      `/api/v1/blueprints/${encodeURIComponent(id)}`,
      data,
    );
    return result.blueprint;
  }

  /**
   * List all hierarchies (one per repository) of the authenticated user.
   */
  async listHierarchies(): Promise<Hierarchy[]> {
    return this.listAll<Hierarchy>('/api/v1/hierarchies', 'hierarchies');
  }

  /**
   * Create the hierarchy for a repository. The server returns the existing
   * one when this user already has a hierarchy with that repository_root.
   */
  async ensureHierarchy(name: string, repositoryRoot: string): Promise<Hierarchy> {
    const result = await this.request<{ hierarchy: Hierarchy }>(
      'POST',
      '/api/v1/hierarchies',
      { name, repository_root: repositoryRoot },
    );
    return result.hierarchy;
  }

  /**
   * Validate that the token is valid by making a list request.
   */
  async validateToken(): Promise<boolean> {
    try {
      await this.request('GET', '/api/v1/blueprints?limit=1');
      return true;
    } catch {
      return false;
    }
  }
}
