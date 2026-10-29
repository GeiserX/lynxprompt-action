import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ActionInputs } from '../src/types';
import { DEFAULT_PATTERNS } from '../src/utils/detector';
import { repositoryRoot } from '../src/utils/repo';
import { TOKEN } from './fakeServer';

export const REPO_URL = 'https://github.com/owner/repo';

/** A temp workspace with these files and a .git/config naming REPO_URL. */
export function makeWorkspace(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-action-'));
  fs.mkdirSync(path.join(dir, '.git'));
  fs.writeFileSync(
    path.join(dir, '.git', 'config'),
    `[remote "origin"]\n\turl = ${REPO_URL}\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n`,
  );
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), content);
  }
  return dir;
}

export function rootOf(workspace: string): string {
  return repositoryRoot(workspace);
}

export function inputs(overrides: Partial<ActionInputs> = {}): ActionInputs {
  return {
    mode: 'sync',
    token: TOKEN,
    apiUrl: 'https://lp.example',
    files: DEFAULT_PATTERNS.join(','),
    platforms: [],
    failOnDrift: false,
    commitChanges: false,
    ...overrides,
  };
}
