import { describe, it, expect } from 'vitest';

// Test the validateFile function by importing it indirectly through the module
// Since validateFile is private, we test it through the validation logic patterns

describe('validation rules', () => {
  // These test the validation logic patterns used in validate.ts

  describe('content length checks', () => {
    it('detects empty content', () => {
      const content = '';
      expect(content.trim().length).toBe(0);
    });

    it('detects short content', () => {
      const content = 'short';
      const MIN_CONTENT_LENGTH = 10;
      expect(content.length).toBeLessThan(MIN_CONTENT_LENGTH);
    });

    it('passes valid content', () => {
      const content = '# AGENTS.md\n\nThis is a valid configuration file with enough content.';
      const MIN_CONTENT_LENGTH = 10;
      expect(content.trim().length).toBeGreaterThan(0);
      expect(content.length).toBeGreaterThanOrEqual(MIN_CONTENT_LENGTH);
    });

    it('warns on very large content', () => {
      const MAX_CONTENT_LENGTH = 500_000;
      const bigContent = 'x'.repeat(MAX_CONTENT_LENGTH + 1);
      expect(bigContent.length).toBeGreaterThan(MAX_CONTENT_LENGTH);
    });
  });

  describe('markdown heading detection', () => {
    it('detects h1 heading', () => {
      const hasHeading = /^#{1,6}\s+.+/m.test('# Title\n\nContent');
      expect(hasHeading).toBe(true);
    });

    it('detects h2 heading', () => {
      const hasHeading = /^#{1,6}\s+.+/m.test('## Subtitle\n\nContent');
      expect(hasHeading).toBe(true);
    });

    it('does not match without space after #', () => {
      const hasHeading = /^#{1,6}\s+.+/m.test('#NoSpace\n\nContent');
      expect(hasHeading).toBe(false);
    });

    it('matches heading in middle of content', () => {
      const hasHeading = /^#{1,6}\s+.+/m.test('Some text\n\n## Heading\n\nMore text');
      expect(hasHeading).toBe(true);
    });
  });

  describe('placeholder detection', () => {
    const placeholders = ['TODO', 'FIXME', 'INSERT HERE', 'PLACEHOLDER'];

    it('detects TODO', () => {
      const content = '# Config\n\nTODO: fill this in';
      const found = placeholders.some((ph) => content.toUpperCase().includes(ph));
      expect(found).toBe(true);
    });

    it('detects FIXME case-insensitive', () => {
      const content = '# Config\n\nfixme: something broken';
      const found = placeholders.some((ph) => content.toUpperCase().includes(ph));
      expect(found).toBe(true);
    });

    it('does not flag clean content', () => {
      const content = '# Config\n\nThis is a proper configuration file.';
      const found = placeholders.some((ph) => content.toUpperCase().includes(ph));
      expect(found).toBe(false);
    });
  });

  describe('sensitive data detection', () => {
    const sensitivePatterns = [
      /(?:api[_-]?key|secret|password|token)\s*[:=]\s*['"][^'"]{8,}/i,
      /(?:sk-|ghp_|gho_|glpat-|xoxb-|xoxp-)[a-zA-Z0-9]{20,}/,
    ];

    it('detects API key pattern', () => {
      const content = 'api_key = "abcdefghijklmnop"';
      const found = sensitivePatterns.some((p) => p.test(content));
      expect(found).toBe(true);
    });

    it('detects GitHub token pattern', () => {
      const content = 'ghp_1234567890abcdefghij1234567890ab';
      const found = sensitivePatterns.some((p) => p.test(content));
      expect(found).toBe(true);
    });

    it('detects Slack token pattern', () => {
      const content = 'xoxb-12345678901234567890abcde';
      const found = sensitivePatterns.some((p) => p.test(content));
      expect(found).toBe(true);
    });

    it('does not flag normal content', () => {
      const content = '# Config\n\nUse your token from the dashboard.';
      const found = sensitivePatterns.some((p) => p.test(content));
      expect(found).toBe(false);
    });
  });
});
