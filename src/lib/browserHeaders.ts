export const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";

export const HTML_HEADER_BASE = {
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
  Referer: "https://www.kingsoopers.com/",
  "Sec-Ch-Ua": '"Not/A)Brand";v="8", "Chromium";v="124", "Google Chrome";v="124"',
  "Sec-Ch-Ua-Mobile": "?0",
  "Sec-Ch-Ua-Platform": '"Windows"',
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Upgrade-Insecure-Requests": "1",
  "User-Agent": BROWSER_USER_AGENT,
} as const;

export const JSON_HEADER_BASE = {
  Accept: "application/json",
  "User-Agent": BROWSER_USER_AGENT,
} as const;

export function buildHtmlHeadersForRequests(overrides?: Record<string, string>) {
  const rest = { ...HTML_HEADER_BASE } as Record<string, string>;
  delete rest["User-Agent"];
  return { ...rest, ...(overrides ?? {}) };
}
