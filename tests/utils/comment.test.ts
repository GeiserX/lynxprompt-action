import { describe, it, expect } from 'vitest';
import { formatValidationComment, formatDiffComment } from '../../src/utils/comment';
import type { ValidationResult, DiffResult } from '../../src/types';

describe('formatValidationComment', () => {
  it('shows all-pass message when all passed', () => {
    const results: ValidationResult[] = [
      { file: 'AGENTS.md', passed: true, errors: [], warnings: [] },
    ];
    const body = formatValidationComment(results, true);
    expect(body).toContain('All AI config validations passed');
    expect(body).toContain(':white_check_mark:');
    expect(body).toContain('1/1');
  });

  it('shows failure message when some failed', () => {
    const results: ValidationResult[] = [
      { file: 'AGENTS.md', passed: true, errors: [], warnings: [] },
      { file: 'CLAUDE.md', passed: false, errors: ['File is empty.'], warnings: [] },
    ];
    const body = formatValidationComment(results, false);
    expect(body).toContain('validation issues found');
    expect(body).toContain(':x:');
    expect(body).toContain('1/2');
  });

  it('handles empty results', () => {
    const body = formatValidationComment([], true);
    expect(body).toContain('No AI configuration files were detected');
  });

  it('includes warnings in output', () => {
    const results: ValidationResult[] = [
      { file: 'AGENTS.md', passed: true, errors: [], warnings: ['Contains "TODO"'] },
    ];
    const body = formatValidationComment(results, true);
    expect(body).toContain(':warning:');
    expect(body).toContain('TODO');
  });
});

describe('formatDiffComment', () => {
  it('shows in-sync message when all match', () => {
    const results: DiffResult[] = [
      {
        file: 'AGENTS.md',
        blueprintName: 'AGENTS.md',
        type: 'AGENTS_MD',
        status: 'match',
        localChecksum: 'abc123',
        cloudChecksum: 'abc123',
      },
    ];
    const body = formatDiffComment(results);
    expect(body).toContain('Configs are in sync');
    expect(body).toContain(':white_check_mark:');
  });

  it('shows drift message when drift detected', () => {
    const results: DiffResult[] = [
      {
        file: 'AGENTS.md',
        blueprintName: 'AGENTS.md',
        type: 'AGENTS_MD',
        status: 'drift',
        localChecksum: 'abc123',
        cloudChecksum: 'def456',
        details: 'Local: 50 lines, Cloud: 45 lines (+5)',
      },
    ];
    const body = formatDiffComment(results);
    expect(body).toContain('Config drift detected');
    expect(body).toContain(':warning:');
    expect(body).toContain('Drift');
  });

  it('shows local-only and cloud-only entries', () => {
    const results: DiffResult[] = [
      {
        file: 'AGENTS.md',
        blueprintName: 'AGENTS.md',
        type: 'AGENTS_MD',
        status: 'local-only',
        localChecksum: 'abc',
      },
      {
        file: '(not found locally)',
        blueprintName: 'CLAUDE.md',
        type: 'CLAUDE_MD',
        status: 'cloud-only',
        cloudChecksum: 'def',
      },
    ];
    const body = formatDiffComment(results);
    expect(body).toContain('Local only');
    expect(body).toContain('Cloud only');
    expect(body).toContain('Config drift detected');
  });

  it('handles empty results', () => {
    const body = formatDiffComment([]);
    expect(body).toContain('No configuration files to compare');
  });

  it('includes summary counts', () => {
    const results: DiffResult[] = [
      { file: 'a', blueprintName: 'a', type: 'AGENTS_MD', status: 'match' },
      { file: 'b', blueprintName: 'b', type: 'CLAUDE_MD', status: 'drift', details: 'test' },
    ];
    const body = formatDiffComment(results);
    expect(body).toContain('**1** in sync');
    expect(body).toContain('**1** with drift');
  });
});
