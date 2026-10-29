import { describe, it, expect, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

vi.mock('@actions/core', () => ({
  info: vi.fn(),
  warning: vi.fn(),
  debug: vi.fn(),
  isDebug: vi.fn(() => false),
}));

import { detectConfigFiles, parseFilePatterns } from '../../src/utils/detector';
import { makeWorkspace } from '../workspace';

// Real @actions/glob on a real directory: the default `files` input of
// action.yml must find every kind of file it names.
describe('default files input, unmocked', () => {
  const action = fs.readFileSync(path.join(__dirname, '..', '..', 'action.yml'), 'utf-8');
  const defaultFiles = /files:[\s\S]*?default: '([^']+)'/.exec(action)![1];

  const tree = {
    'AGENTS.md': '# a',
    'CLAUDE.md': '# c',
    'AIDER.md': '# d',
    'packages/api/AGENTS.md': '# a2',
    '.github/copilot-instructions.md': '# g',
    '.windsurfrules': '# w',
    '.cursor/rules/x.mdc': '# x',
    'node_modules/pkg/AGENTS.md': '# skipped',
  };

  it.each([
    ['action.yml default', defaultFiles],
    ['the old brace spelling', '**/{AGENTS,CLAUDE,AIDER}.md,**/.github/copilot-instructions.md,**/.windsurfrules,**/.cursor/rules/**/*.mdc'],
  ])('%s finds every config file', async (_label, input) => {
    const ws = makeWorkspace(tree);
    {
      const found = await detectConfigFiles(ws, parseFilePatterns(input));
      expect(found.map((f) => [f.relativePath, f.type]).sort()).toEqual([
        ['.cursor/rules/x.mdc', 'CURSOR_RULES'],
        ['.github/copilot-instructions.md', 'COPILOT_INSTRUCTIONS'],
        ['.windsurfrules', 'WINDSURF_RULES'],
        ['AGENTS.md', 'AGENTS_MD'],
        ['AIDER.md', 'AIDER_MD'],
        ['CLAUDE.md', 'CLAUDE_MD'],
        ['packages/api/AGENTS.md', 'AGENTS_MD'],
      ]);
    }
  });
});
