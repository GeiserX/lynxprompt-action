import { describe, it, expect } from 'vitest';
import { contentChecksum } from '../../src/utils/checksum';

describe('contentChecksum', () => {
  // Value from LynxPrompt's own contentChecksum (src/lib/content-checksum.ts)
  // for "# Agents\n\nUse tabs.": sha256 of the trimmed text, first 16 hex.
  it('matches the server checksum', () => {
    expect(contentChecksum('# Agents\n\nUse tabs.')).toBe('0e9b262772f7617d');
  });

  it('ignores CRLF and surrounding whitespace, like the server', () => {
    expect(contentChecksum('# Agents\r\n\r\nUse tabs.\r\n')).toBe(
      contentChecksum('# Agents\n\nUse tabs.'),
    );
  });
});
