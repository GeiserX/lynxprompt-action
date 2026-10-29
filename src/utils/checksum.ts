import { createHash } from 'crypto';

/**
 * Checksum of a blueprint's content, the same as the server's
 * contentChecksum (LynxPrompt src/lib/content-checksum.ts): CRLF and CR
 * become LF, the text is trimmed, and the first 16 hex chars of its SHA-256
 * are kept. The server returns this as `content_checksum`.
 */
export function contentChecksum(content: string): string {
  const normalized = content.replace(/\r\n?/g, '\n').trim();
  return createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}
