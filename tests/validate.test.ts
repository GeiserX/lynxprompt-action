import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock external dependencies before importing the module under test
vi.mock('@actions/core', () => ({
  info: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  debug: vi.fn(),
  setOutput: vi.fn(),
  setFailed: vi.fn(),
}));

vi.mock('../src/utils/detector', () => ({
  parseFilePatterns: vi.fn((input: string) =>
    input
      .split(/[,\n]/)
      .map((p: string) => p.trim())
      .filter((p: string) => p.length > 0),
  ),
  detectConfigFiles: vi.fn(),
}));

vi.mock('../src/utils/comment', () => ({
  formatValidationComment: vi.fn(
    (_results: unknown[], allPassed: boolean) =>
      allPassed ? 'all passed' : 'issues found',
  ),
  upsertPrComment: vi.fn(),
}));

import * as core from '@actions/core';
import { validateFile, runValidate } from '../src/modes/validate';
import { detectConfigFiles } from '../src/utils/detector';
import { upsertPrComment } from '../src/utils/comment';
import { ActionInputs, DetectedFile } from '../src/types';
import { LynxPromptClient } from '../src/api';

describe('validateFile', () => {
  describe('content length checks', () => {
    it('fails on empty content', () => {
      const result = validateFile('CLAUDE.md', '');
      expect(result.passed).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.stringContaining('empty')]),
      );
    });

    it('fails on whitespace-only content', () => {
      const result = validateFile('CLAUDE.md', '   \n  ');
      expect(result.passed).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.stringContaining('empty')]),
      );
    });

    it('fails on content shorter than minimum length', () => {
      const result = validateFile('CLAUDE.md', 'short');
      expect(result.passed).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.stringContaining('too short')]),
      );
    });

    it('passes valid content above minimum length', () => {
      const result = validateFile(
        'CLAUDE.md',
        '# AGENTS.md\n\nThis is a valid configuration file with enough content.',
      );
      expect(result.passed).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('warns on very large content', () => {
      const bigContent = 'x'.repeat(500_001);
      const result = validateFile('CLAUDE.md', bigContent);
      expect(result.passed).toBe(true);
      expect(result.warnings).toEqual(
        expect.arrayContaining([expect.stringContaining('very large')]),
      );
    });
  });

  describe('markdown heading detection', () => {
    it('does not warn when heading is present in .md file', () => {
      const result = validateFile(
        'AGENTS.md',
        '# Title\n\nSome content here.',
      );
      expect(result.warnings).not.toEqual(
        expect.arrayContaining([expect.stringContaining('heading')]),
      );
    });

    it('warns when no heading found in .md file', () => {
      const result = validateFile(
        'AGENTS.md',
        'No headings in this file at all.',
      );
      expect(result.warnings).toEqual(
        expect.arrayContaining([expect.stringContaining('heading')]),
      );
    });

    it('detects h2 headings', () => {
      const result = validateFile(
        'CLAUDE.md',
        '## Subtitle\n\nSome content here.',
      );
      expect(result.warnings).not.toEqual(
        expect.arrayContaining([expect.stringContaining('heading')]),
      );
    });

    it('does not check headings in non-markdown files', () => {
      const result = validateFile(
        '.windsurfrules',
        'No headings but this is not markdown.',
      );
      expect(result.warnings).not.toEqual(
        expect.arrayContaining([expect.stringContaining('heading')]),
      );
    });

    it('checks headings in .mdc files', () => {
      const result = validateFile(
        '.cursor/rules/test.mdc',
        'No headings in this cursor rule file.',
      );
      expect(result.warnings).toEqual(
        expect.arrayContaining([expect.stringContaining('heading')]),
      );
    });
  });

  describe('placeholder detection', () => {
    it('warns on TODO placeholder in markdown', () => {
      const result = validateFile('AGENTS.md', '# Config\n\nTODO: fill this in');
      expect(result.warnings).toEqual(
        expect.arrayContaining([expect.stringContaining('TODO')]),
      );
    });

    it('warns on FIXME case-insensitively', () => {
      const result = validateFile(
        'AGENTS.md',
        '# Config\n\nfixme: something broken',
      );
      expect(result.warnings).toEqual(
        expect.arrayContaining([expect.stringContaining('FIXME')]),
      );
    });

    it('warns on INSERT HERE', () => {
      const result = validateFile(
        'CLAUDE.md',
        '# Config\n\nInsert here your instructions',
      );
      expect(result.warnings).toEqual(
        expect.arrayContaining([expect.stringContaining('INSERT HERE')]),
      );
    });

    it('warns on PLACEHOLDER', () => {
      const result = validateFile(
        'CLAUDE.md',
        '# Config\n\nThis is a placeholder text.',
      );
      expect(result.warnings).toEqual(
        expect.arrayContaining([expect.stringContaining('PLACEHOLDER')]),
      );
    });

    it('does not flag clean content', () => {
      const result = validateFile(
        'AGENTS.md',
        '# Config\n\nThis is a proper configuration file.',
      );
      const placeholderWarnings = result.warnings.filter(
        (w) =>
          w.includes('TODO') ||
          w.includes('FIXME') ||
          w.includes('INSERT HERE') ||
          w.includes('PLACEHOLDER'),
      );
      expect(placeholderWarnings).toHaveLength(0);
    });

    it('does not check placeholders in non-markdown files', () => {
      const result = validateFile(
        '.windsurfrules',
        'TODO: this should not warn because not markdown.',
      );
      const placeholderWarnings = result.warnings.filter((w) =>
        w.includes('TODO'),
      );
      expect(placeholderWarnings).toHaveLength(0);
    });
  });

  describe('sensitive data detection', () => {
    it('warns on API key pattern', () => {
      const result = validateFile(
        'AGENTS.md',
        '# Config\n\napi_key = "abcdefghijklmnop"',
      );
      expect(result.warnings).toEqual(
        expect.arrayContaining([expect.stringContaining('sensitive')]),
      );
    });

    it('warns on GitHub token pattern', () => {
      const result = validateFile(
        'AGENTS.md',
        '# Config\n\nghp_1234567890abcdefghij1234567890ab',
      );
      expect(result.warnings).toEqual(
        expect.arrayContaining([expect.stringContaining('sensitive')]),
      );
    });

    it('warns on Slack token pattern', () => {
      const result = validateFile(
        'AGENTS.md',
        '# Config\n\nxoxb-12345678901234567890abcde',
      );
      expect(result.warnings).toEqual(
        expect.arrayContaining([expect.stringContaining('sensitive')]),
      );
    });

    it('does not flag normal content', () => {
      const result = validateFile(
        'AGENTS.md',
        '# Config\n\nUse your token from the dashboard.',
      );
      const sensitiveWarnings = result.warnings.filter((w) =>
        w.includes('sensitive'),
      );
      expect(sensitiveWarnings).toHaveLength(0);
    });
  });

  describe('result structure', () => {
    it('returns correct file path', () => {
      const result = validateFile(
        'some/path/CLAUDE.md',
        '# Valid\n\nContent here.',
      );
      expect(result.file).toBe('some/path/CLAUDE.md');
    });

    it('passed is true when no errors', () => {
      const result = validateFile('AGENTS.md', '# Valid\n\nContent here.');
      expect(result.passed).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('passed is false when errors exist', () => {
      const result = validateFile('AGENTS.md', '');
      expect(result.passed).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});

describe('runValidate', () => {
  const mockClient = {} as LynxPromptClient;

  const baseInputs: ActionInputs = {
    mode: 'validate',
    token: 'lp_test',
    apiUrl: 'https://lynxprompt.com',
    files: '**/{AGENTS,CLAUDE}.md',
    visibility: 'PRIVATE',
    platforms: [],
    failOnDrift: false,
    commitChanges: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('validates detected files and posts comment', async () => {
    const mockFiles: DetectedFile[] = [
      {
        path: '/workspace/AGENTS.md',
        relativePath: 'AGENTS.md',
        type: 'AGENTS_MD',
        content: '# Agents\n\nValid content here for testing.',
        blueprintName: 'AGENTS.md',
      },
    ];
    vi.mocked(detectConfigFiles).mockResolvedValue(mockFiles);

    await runValidate(mockClient, baseInputs, '/workspace');

    expect(core.setOutput).toHaveBeenCalledWith('validation-passed', true);
    expect(core.setFailed).not.toHaveBeenCalled();
    expect(upsertPrComment).toHaveBeenCalled();
  });

  it('fails when a file has validation errors', async () => {
    const mockFiles: DetectedFile[] = [
      {
        path: '/workspace/CLAUDE.md',
        relativePath: 'CLAUDE.md',
        type: 'CLAUDE_MD',
        content: '',
        blueprintName: 'CLAUDE.md',
      },
    ];
    vi.mocked(detectConfigFiles).mockResolvedValue(mockFiles);

    await runValidate(mockClient, baseInputs, '/workspace');

    expect(core.setOutput).toHaveBeenCalledWith('validation-passed', false);
    expect(core.setFailed).toHaveBeenCalled();
  });

  it('fails when required platform is missing', async () => {
    vi.mocked(detectConfigFiles).mockResolvedValue([]);

    const inputs: ActionInputs = {
      ...baseInputs,
      platforms: ['cursor'],
    };

    await runValidate(mockClient, inputs, '/workspace');

    expect(core.setOutput).toHaveBeenCalledWith('validation-passed', false);
    expect(core.setFailed).toHaveBeenCalled();
  });

  it('passes when required platform is present', async () => {
    const mockFiles: DetectedFile[] = [
      {
        path: '/workspace/.cursor/rules/main.mdc',
        relativePath: '.cursor/rules/main.mdc',
        type: 'CURSOR_RULES',
        content: '# Cursor Rules\n\nValid content here for testing.',
        blueprintName: '.cursor/rules/main.mdc',
      },
    ];
    vi.mocked(detectConfigFiles).mockResolvedValue(mockFiles);

    const inputs: ActionInputs = {
      ...baseInputs,
      platforms: ['cursor'],
    };

    await runValidate(mockClient, inputs, '/workspace');

    expect(core.setOutput).toHaveBeenCalledWith('validation-passed', true);
    expect(core.setFailed).not.toHaveBeenCalled();
  });

  it('warns on unknown platform and continues', async () => {
    vi.mocked(detectConfigFiles).mockResolvedValue([]);

    const inputs: ActionInputs = {
      ...baseInputs,
      platforms: ['unknown-platform'],
    };

    await runValidate(mockClient, inputs, '/workspace');

    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining('Unknown platform'),
    );
  });

  it('handles multiple files with mixed results', async () => {
    const mockFiles: DetectedFile[] = [
      {
        path: '/workspace/AGENTS.md',
        relativePath: 'AGENTS.md',
        type: 'AGENTS_MD',
        content: '# Agents\n\nValid content here.',
        blueprintName: 'AGENTS.md',
      },
      {
        path: '/workspace/CLAUDE.md',
        relativePath: 'CLAUDE.md',
        type: 'CLAUDE_MD',
        content: '',
        blueprintName: 'CLAUDE.md',
      },
    ];
    vi.mocked(detectConfigFiles).mockResolvedValue(mockFiles);

    await runValidate(mockClient, baseInputs, '/workspace');

    expect(core.setOutput).toHaveBeenCalledWith('validation-passed', false);
    expect(core.setFailed).toHaveBeenCalled();
  });

  it('passes with no files and no required platforms', async () => {
    vi.mocked(detectConfigFiles).mockResolvedValue([]);

    await runValidate(mockClient, baseInputs, '/workspace');

    expect(core.setOutput).toHaveBeenCalledWith('validation-passed', true);
    expect(core.setFailed).not.toHaveBeenCalled();
  });
});
