import { describe, it, expect } from 'vitest';
import { resolveApiUrl, DEFAULT_API_URL } from '../../src/utils/apiUrl';

describe('resolveApiUrl', () => {
  it('defaults to the official instance', () => {
    expect(DEFAULT_API_URL).toBe('https://lynxprompt.geiser.cloud');
    expect(resolveApiUrl('')).toBe(DEFAULT_API_URL);
    expect(resolveApiUrl('   ')).toBe(DEFAULT_API_URL);
  });

  it('moves the old official host to the new one', () => {
    expect(resolveApiUrl('https://lynxprompt.com')).toBe(DEFAULT_API_URL);
    expect(resolveApiUrl('https://lynxprompt.com/')).toBe(DEFAULT_API_URL);
  });

  it('keeps any other URL as given', () => {
    expect(resolveApiUrl('https://lynx.example.com')).toBe('https://lynx.example.com');
    expect(resolveApiUrl('https://lynxprompt.com/api')).toBe('https://lynxprompt.com/api');
    expect(resolveApiUrl('http://lynxprompt.com')).toBe('http://lynxprompt.com');
  });
});
