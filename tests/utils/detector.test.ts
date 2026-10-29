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

describe('parseFilePatterns with braces', () => {
  it('does not split on a comma inside braces, and expands the braces', () => {
    expect(parseFilePatterns('**/{AGENTS,CLAUDE,AIDER}.md,**/.windsurfrules')).toEqual([
      '**/AGENTS.md',
      '**/CLAUDE.md',
      '**/AIDER.md',
      '**/.windsurfrules',
    ]);
  });

  it('expands several brace groups', () => {
    expect(parseFilePatterns('{a,b}/{x,y}.md')).toEqual(['a/x.md', 'a/y.md', 'b/x.md', 'b/y.md']);
  });

  it('keeps a brace with no comma as is', () => {
    expect(parseFilePatterns('**/{AGENTS}.md')).toEqual(['**/{AGENTS}.md']);
  });
});
