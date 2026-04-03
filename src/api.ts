import * as core from '@actions/core';
import {
  Blueprint,
  BlueprintListItem,
  CreateBlueprintRequest,
  UpdateBlueprintRequest,
} from './types';

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

    return {} as T;
  }

  /**
   * List all blueprints for the authenticated user.
   */
  async listBlueprints(): Promise<BlueprintListItem[]> {
    core.info('Fetching blueprints from LynxPrompt...');
    const result = await this.request<BlueprintListItem[]>(
      'GET',
      '/api/v1/blueprints',
    );
    core.info(`Found ${result.length} blueprint(s)`);
    return result;
  }

  /**
   * Get a single blueprint with its content.
   */
  async getBlueprint(id: string): Promise<Blueprint> {
    core.debug(`Fetching blueprint ${id}`);
    return this.request<Blueprint>('GET', `/api/v1/blueprints/${id}`);
  }

  /**
   * Create a new blueprint.
   */
  async createBlueprint(data: CreateBlueprintRequest): Promise<Blueprint> {
    core.info(`Creating blueprint: ${data.name} (${data.type})`);
    return this.request<Blueprint>('POST', '/api/v1/blueprints', data);
  }

  /**
   * Update an existing blueprint.
   */
  async updateBlueprint(
    id: string,
    data: UpdateBlueprintRequest,
  ): Promise<Blueprint> {
    core.info(`Updating blueprint ${id}: ${data.name ?? '(no name change)'}`);
    return this.request<Blueprint>('PUT', `/api/v1/blueprints/${id}`, data);
  }

  /**
   * Find a blueprint by name and type. Returns the first match or undefined.
   */
  async findBlueprint(
    name: string,
    type: string,
  ): Promise<BlueprintListItem | undefined> {
    const blueprints = await this.listBlueprints();
    return blueprints.find((b) => b.name === name && b.type === type);
  }

  /**
   * Validate that the token is valid by making a list request.
   */
  async validateToken(): Promise<boolean> {
    try {
      await this.listBlueprints();
      return true;
    } catch {
      return false;
    }
  }
}
