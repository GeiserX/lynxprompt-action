import { describe, it, expect } from 'vitest';
import { parseFilePatterns } from '../../src/utils/detector';

describe('parseFilePatterns', () => {
  it('splits comma-separated patterns', () => {
    const result = parseFilePatterns('**/*.md,**/*.mdc');
    expect(result).toEqual(['**/*.md', '**/*.mdc']);
  });

  it('splits newline-separated patterns', () => {
    const result = parseFilePatterns('**/*.md\n**/*.mdc');
    expect(result).toEqual(['**/*.md', '**/*.mdc']);
  });

  it('trims whitespace from patterns', () => {
    const result = parseFilePatterns(' **/*.md , **/*.mdc ');
    expect(result).toEqual(['**/*.md', '**/*.mdc']);
  });

  it('filters out empty strings', () => {
    const result = parseFilePatterns('**/*.md,,**/*.mdc,');
    expect(result).toEqual(['**/*.md', '**/*.mdc']);
  });

  it('handles single pattern', () => {
    const result = parseFilePatterns('**/*.md');
    expect(result).toEqual(['**/*.md']);
  });

  it('returns empty array for empty input', () => {
    const result = parseFilePatterns('');
    expect(result).toEqual([]);
  });

  it('handles mixed separators', () => {
    const result = parseFilePatterns('a.md,b.md\nc.md');
    expect(result).toEqual(['a.md', 'b.md', 'c.md']);
  });
});
