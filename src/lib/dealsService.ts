import { JSON_HEADER_BASE } from "@/lib/browserHeaders";
import { fetchDealsViaHeadless } from "@/lib/headlessDealsFetcher";
import { normalizeDeals } from "@/lib/normalizeDeals";
import { logError, logInfo } from "@/lib/logger";
import type { NormalizedDeal, RawDealsResponse } from "@/types/deals";

type CacheEntry = {
  expiresAt: number;
  data: NormalizedDeal[];
};

const DEFAULT_TTL_SECONDS = 600;
const REQUEST_TIMEOUT_MS = 10000;
const HEADLESS_RETRY_LIMIT = Number(process.env.HEADLESS_RETRY_LIMIT ?? 2);

let cache: CacheEntry | null = null;

export async function getDeals(): Promise<NormalizedDeal[]> {
  if (cache && cache.expiresAt > Date.now()) {
    logInfo("Serving deals from in-memory cache", { count: cache.data.length });
    return cache.data;
  }

  const raw = await fetchDealsFromSource();
  const normalized = normalizeDeals(raw);

  logInfo("Fetched and normalized deals", { count: normalized.length });

  cache = {
    data: normalized,
    expiresAt: Date.now() + getTtlMs(),
  };

  return normalized;
}

export function clearDealsCache() {
  cache = null;
}

async function fetchDealsFromSource(): Promise<RawDealsResponse> {
  const directUrl = sanitizeEnvUrl(process.env.DEALS_JSON_URL);
  if (directUrl) {
    logInfo("Fetching deals from direct JSON feed", { url: directUrl });
    return fetchJsonFromUrl(directUrl);
  }

  const searchUrl = sanitizeEnvUrl(process.env.DEALS_SEARCH_URL);
  if (searchUrl) {
    return fetchDealsViaHeadlessWithRetries(searchUrl);
  }

  throw new Error(
    "Missing deal source configuration. Set DEALS_JSON_URL or DEALS_SEARCH_URL in your environment.",
  );
}

function getTtlMs(): number {
  const parsed = Number(process.env.CACHE_TTL_SECONDS ?? DEFAULT_TTL_SECONDS);
  const ttlSeconds = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TTL_SECONDS;
  return ttlSeconds * 1000;
}

async function fetchJsonFromUrl(url: string): Promise<RawDealsResponse> {
  const response = await requestWithTimeout(url, { headers: { ...JSON_HEADER_BASE } });
  return (await response.json()) as RawDealsResponse;
}

async function fetchDealsViaHeadlessWithRetries(searchUrl: string): Promise<RawDealsResponse> {
  const attempts = Math.max(1, HEADLESS_RETRY_LIMIT);
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      logInfo("Launching headless browser", { searchUrl, attempt });
      return await fetchDealsViaHeadless(searchUrl);
    } catch (error) {
      lastError = error;
      logError("Headless browser attempt failed", {
        attempt,
        error: error instanceof Error ? error.message : error,
      });
    }
  }

  throw new Error(
    `Headless browser could not fetch deals after ${attempts} attempt(s): ${
      lastError instanceof Error ? lastError.message : lastError
    }`,
  );
}

async function requestWithTimeout(
  url: string,
  options?: RequestInit,
  allowErrorResponse = false,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      next: { revalidate: 0 },
      ...(options ?? {}),
      signal: controller.signal,
    });

    if (!allowErrorResponse && !response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    throw new Error(`Failed to fetch ${url}: ${message}`);
  } finally {
    clearTimeout(timeout);
  }
}
function sanitizeEnvUrl(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}
