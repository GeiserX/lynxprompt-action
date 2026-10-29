export const DEFAULT_API_URL = 'https://lynxprompt.geiser.cloud';

const LEGACY_API_URLS = ['https://lynxprompt.com', 'https://lynxprompt.com/'];

/**
 * Resolve the api-url input. Empty means the official instance. A workflow
 * that pinned the old official host (https://lynxprompt.com) is moved to the
 * new one, because that host only proxies the API until it lapses. Any other
 * URL is a self-hosted instance and is kept as given.
 */
export function resolveApiUrl(input: string): string {
  const value = input.trim();
  if (!value || LEGACY_API_URLS.includes(value)) {
    return DEFAULT_API_URL;
  }
  return value;
}
