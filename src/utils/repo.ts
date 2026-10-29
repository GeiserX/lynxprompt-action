import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import { LynxPromptClient } from '../api';
import { BlueprintListItem, Hierarchy } from '../types';

/**
 * Identifier of this repository on LynxPrompt, computed the way the CLI does
 * (createRepositoryRoot in cli/src/commands/push.ts): the first 16 hex chars
 * of the SHA-256 of the first remote URL in .git/config. actions/checkout
 * writes `https://github.com/<owner>/<repo>` there, so without a checkout the
 * same URL is built from the runner's environment.
 */
export function repositoryRoot(workspace: string): string {
  let url: string | undefined;
  try {
    const config = fs.readFileSync(path.join(workspace, '.git', 'config'), 'utf-8');
    url = config.match(/url = (.+)/)?.[1].trim();
  } catch {
    // No git checkout
  }
  if (!url && process.env.GITHUB_REPOSITORY) {
    const server = process.env.GITHUB_SERVER_URL || 'https://github.com';
    url = `${server}/${process.env.GITHUB_REPOSITORY}`;
  }
  return createHash('sha256')
    .update(url ?? path.resolve(workspace))
    .digest('hex')
    .slice(0, 16);
}

function hierarchyName(workspace: string): string {
  return process.env.GITHUB_REPOSITORY || path.basename(path.resolve(workspace));
}

/**
 * The hierarchy of this repository. With `create`, it is created when
 * missing (sync); without, undefined means this repository has never been
 * synced (diff, generate), so no blueprint belongs to it.
 */
export async function findRepoHierarchy(
  client: LynxPromptClient,
  workspace: string,
  create: boolean,
): Promise<Hierarchy | undefined> {
  const root = repositoryRoot(workspace);
  if (create) {
    return client.ensureHierarchy(hierarchyName(workspace), root);
  }
  const hierarchies = await client.listHierarchies();
  return hierarchies.find((h) => h.repository_root === root);
}

/**
 * The blueprints that belong to this repository: those in its hierarchy
 * that record the path of their file. Other blueprints of the account
 * (other repositories, web-only ones) are never touched.
 */
export async function listRepoBlueprints(
  client: LynxPromptClient,
  hierarchy: Hierarchy | undefined,
): Promise<BlueprintListItem[]> {
  if (!hierarchy) return [];
  const all = await client.listBlueprints();
  return all.filter(
    (b) => b.hierarchy_id === hierarchy.id && !!b.repository_path,
  );
}
