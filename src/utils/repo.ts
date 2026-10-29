import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import { LynxPromptClient } from '../api';
import { BlueprintListItem, Hierarchy } from '../types';

/**
 * The canonical form of a git remote, so an SSH clone, an https clone and a
 * `.git` suffix name the same repository: `https://host/owner/repo`, with no
 * credentials, no port and a lowercase host. The CLI, this action and the
 * VS Code extension all compute it the same way. Anything that is not a
 * recognised remote (a local path) is returned trimmed of the trailing `/`
 * and `.git` only.
 */
export function normalizeRemote(remote: string): string {
  let url = remote.trim().replace(/\/+$/, '').replace(/\.git$/i, '');
  // scp style: user@host:owner/repo
  const scp = url.match(/^[^@/\s]+@([^:/\s]+):(?!\/)(.+)$/);
  if (scp) url = `https://${scp[1]}/${scp[2]}`;
  const parsed = url.match(/^(?:https?|ssh|git):\/\/(?:[^/]*@)?([^/:]+)(?::\d*)?(\/.*)?$/i);
  if (!parsed) return url;
  return `https://${parsed[1].toLowerCase()}${parsed[2] ?? ''}`;
}

function hashRoot(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

/**
 * Identifiers of this repository on LynxPrompt, computed the way the CLI does
 * (cli/src/commands/push.ts): the first 16 hex chars of the SHA-256 of the
 * normalised first remote URL in .git/config. `legacy` hashes the raw URL, as
 * every client did before normalisation, so hierarchies created then are
 * still found. actions/checkout writes `https://github.com/<owner>/<repo>`
 * there, so without a checkout the same URL is built from the runner's
 * environment.
 */
export function repositoryRoots(workspace: string): { root: string; legacy: string } {
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
  if (!url) {
    const root = hashRoot(path.resolve(workspace));
    return { root, legacy: root };
  }
  return { root: hashRoot(normalizeRemote(url)), legacy: hashRoot(url) };
}

/** The identifier new hierarchies of this repository are created with. */
export function repositoryRoot(workspace: string): string {
  return repositoryRoots(workspace).root;
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
  const { root, legacy } = repositoryRoots(workspace);
  const hierarchies = await client.listHierarchies();
  const existing =
    hierarchies.find((h) => h.repository_root === root) ??
    hierarchies.find((h) => h.repository_root === legacy);
  if (existing || !create) return existing;
  return client.ensureHierarchy(hierarchyName(workspace), root);
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
