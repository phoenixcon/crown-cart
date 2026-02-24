import { performance } from "node:perf_hooks";

import { searchKrogerProducts, type KrogerProduct } from "@/lib/krogerClient";

export type PrefixCrawlOptions = {
  initialPrefixes: string[];
  locationId: string;
  limit?: number;
  threshold?: number;
  maxDepth?: number;
  expansionChars?: string[];
};

export type PrefixMetrics = {
  prefix: string;
  depth: number;
  apiCalls: number;
  pagesFetched: number;
  durationMs: number;
  totalReportedProducts: number | null;
  uniqueProductsDiscovered: number;
  itemsDiscovered: number;
  expanded: boolean;
};

export type PrefixCrawlResult = {
  totalApiCalls: number;
  totalPrefixesProcessed: number;
  totalUniqueProducts: number;
  totalItems: number;
  metrics: PrefixMetrics[];
  depthReached: number;
};

const DEFAULT_LIMIT = 50;
const DEFAULT_THRESHOLD = 40;
const DEFAULT_MAX_DEPTH = 4;
const DEFAULT_EXPANSION_CHARS = "0123456789abcdefghijklmnopqrstuvwxyz".split("");
const MAX_PAGES = 250;
const MIN_TERM_LENGTH = 3;

type CrawlProgressCallback = (info: { prefix: string; depth: number; page: number }) => void;

export async function crawlPrefixes(
  options: PrefixCrawlOptions,
  onProgress?: CrawlProgressCallback,
): Promise<PrefixCrawlResult> {
  if (!options.locationId || options.locationId.trim().length === 0) {
    throw new Error("Location ID is required for prefix crawling");
  }

  if (!options.initialPrefixes.length) {
    throw new Error("Provide at least one prefix to crawl");
  }

  const limit = clampLimit(options.limit ?? DEFAULT_LIMIT);
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const expansionChars = options.expansionChars ?? DEFAULT_EXPANSION_CHARS;

  const queue: { prefix: string; depth: number }[] = options.initialPrefixes.map((prefix) => ({
    prefix,
    depth: 1,
  }));

  const metrics: PrefixMetrics[] = [];
  const seenProducts = new Set<string>();
  let totalApiCalls = 0;
  let totalItems = 0;
  let maxDepthReached = 1;

  while (queue.length > 0) {
    const current = queue.shift()!;
    maxDepthReached = Math.max(maxDepthReached, current.depth);
    const startTime = performance.now();

    if (current.prefix.length < MIN_TERM_LENGTH) {
      if (current.depth >= maxDepth) {
        continue;
      }
      expansionChars.forEach((char) => {
        queue.push({ prefix: `${current.prefix}${char}`, depth: current.depth + 1 });
      });
      continue;
    }
    let page = 1;
    let prefixCalls = 0;
    let pagesFetched = 0;
    let totalReported: number | null = null;
    let itemsDiscovered = 0;
    const prefixProducts = new Set<string>();
    let shouldExpand = false;

    while (page <= MAX_PAGES) {
      onProgress?.({ prefix: current.prefix, depth: current.depth, page });
      const response = await searchKrogerProducts({
        term: current.prefix,
        locationId: options.locationId,
        limit,
        start: page,
      });

      prefixCalls += 1;
      pagesFetched += 1;
      totalApiCalls += 1;

      if (response.meta?.pagination?.total) {
        totalReported = response.meta.pagination.total;
      }

      if (response.data.length === 0) {
        break;
      }

      response.data.forEach((product) => {
        const productKey = getProductKey(product);
        prefixProducts.add(productKey);
        if (!seenProducts.has(productKey)) {
          seenProducts.add(productKey);
        }
        const itemCount = Array.isArray(product.items) ? product.items.length : 0;
        itemsDiscovered += itemCount;
        totalItems += itemCount;
      });

      if (page === 1) {
        if (response.data.length >= threshold || (totalReported && totalReported > limit)) {
          shouldExpand = true;
        }
      }

      if (response.data.length < limit) {
        break;
      }

      page += 1;
    }

    const durationMs = performance.now() - startTime;

    metrics.push({
      prefix: current.prefix,
      depth: current.depth,
      apiCalls: prefixCalls,
      pagesFetched,
      durationMs,
      totalReportedProducts: totalReported,
      uniqueProductsDiscovered: prefixProducts.size,
      itemsDiscovered,
      expanded: shouldExpand && current.depth < maxDepth,
    });

    if (shouldExpand && current.depth < maxDepth) {
      expansionChars.forEach((char) => {
        queue.push({ prefix: `${current.prefix}${char}`, depth: current.depth + 1 });
      });
    }
  }

  return {
    totalApiCalls,
    totalPrefixesProcessed: metrics.length,
    totalUniqueProducts: seenProducts.size,
    totalItems,
    metrics,
    depthReached: maxDepthReached,
  };
}

function getProductKey(product: KrogerProduct): string {
  return (
    product.productId?.trim() ||
    product.upc?.trim() ||
    product.description?.trim() ||
    `unknown-${Math.random().toString(36).slice(2)}`
  );
}

function clampLimit(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_LIMIT;
  }
  return Math.min(Math.max(1, Math.floor(value)), DEFAULT_LIMIT);
}
