#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { loadEnvConfig } from "@next/env";
import type { Page } from "playwright";

import { BROWSER_USER_AGENT } from "@/lib/browserHeaders";
import {
  HEADLESS_ARGS,
  HEADLESS_EXTRA_HEADERS,
  HEADLESS_TIMEOUT_MS,
  HEADLESS_VIEWPORT,
  HEADLESS_VISIBLE,
  getStorageStatePathOrUndefined,
  primeHomepageIfConfigured,
  storageStateExists,
} from "@/lib/headlessShared";
import { searchKrogerProducts, type KrogerProduct } from "@/lib/krogerClient";
import { selectPrimaryItem, summarizePricing } from "@/lib/krogerProductFormatting";

loadEnvConfig(process.cwd());

const DEFAULT_OUTPUT_PATH = path.resolve(process.cwd(), "reports", "latest-search-harvest.json");
const DEFAULT_CONCURRENCY = 4;
const MAX_CONCURRENCY = 8;
const MAX_PRODUCTS = 250;
const PRODUCT_DESCRIPTION_SELECTOR = '[data-testid="cart-page-item-description"]';
const PRODUCT_FALLBACK_SELECTOR = 'a[href^="/p/"]';
const PRODUCT_WAIT_TIMEOUT_MS = Number(process.env.SEARCH_HARVEST_WAIT_MS ?? 45000);
const DEBUG_OUTPUT_DIR = path.resolve(process.cwd(), "reports", "harvest-debug");

type CliOptions = {
  searchUrl: string;
  locationId: string;
  maxProducts: number | null;
  concurrency: number;
  shouldSave: boolean;
  outputPath: string;
  allowUnauthenticated: boolean;
};

type HtmlLink = {
  href: string;
  label: string | null;
};

type HarvestedProduct = HtmlLink & {
  productId: string;
};

type LookupMatchType = "exact" | "fuzzy" | "missing" | "error";

type LookupOutcome = {
  product: KrogerProduct | null;
  matchType: LookupMatchType;
  message?: string;
};

type LookupRow = HarvestedProduct & {
  apiProduct: KrogerProduct | null;
  matchType: LookupMatchType;
  message: string | null;
};

type HarvestReport = {
  generatedAt: string;
  searchUrl: string;
  finalUrl: string;
  locationId: string;
  html: {
    totalLinks: number;
    uniqueProductIds: number;
    linksWithoutIds: number;
    duplicateLinks: number;
  };
  lookup: {
    attempted: number;
    apiCalls: number;
    concurrency: number;
    maxProducts: number | null;
    exactMatches: number;
    fuzzyMatches: number;
    missing: number;
    errors: number;
  };
  lookups: LookupRow[];
};

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (!options.searchUrl) {
    exitWithUsage("Set DEALS_SEARCH_URL in .env.local or pass --url.");
  }

  if (!options.locationId) {
    exitWithUsage("Set KROGER_LOCATION_ID in .env.local or pass --location.");
  }

  if (!options.allowUnauthenticated && !storageStateExists()) {
    exitWithUsage(
      "No saved Kroger browser session was found. Run 'npm run capture:state', sign in / select your store, " +
        "and rerun this script (or use --allow-unauth to try without cookies).",
    );
  }

  console.log("\n=== Search Page Harvest ===\n");
  console.log("Search URL:", options.searchUrl);
  console.log("Location:", options.locationId);
  console.log("Max products:", options.maxProducts ?? "all");
  console.log("API concurrency:", options.concurrency);

  const htmlResult = await harvestProductLinks(options.searchUrl);
  console.log(`\nLoaded page: ${htmlResult.finalUrl}`);
  console.log(`Found ${htmlResult.links.length} anchor(s) matching the product selectors.`);

  const { harvested, missingId, duplicateCount } = reduceLinksToProducts(htmlResult.links);
  console.log(
    `Extracted ${harvested.length} unique product IDs (${missingId.length} links missing IDs, ${duplicateCount} duplicates).`,
  );

  if (harvested.length === 0) {
    console.log("No product IDs detected; nothing to fetch.");
    return;
  }

  const limited = options.maxProducts ? harvested.slice(0, options.maxProducts) : harvested;
  if (limited.length < harvested.length) {
    console.log(
      `Limiting to first ${limited.length} IDs (${harvested.length - limited.length} skipped to honor --max).`,
    );
  }

  console.log("\nLooking up products via API...");
  const ids = limited.map((entry) => entry.productId);
  const lookupResult = await lookupProducts(ids, options.locationId, options.concurrency);
  const lookupRows = limited.map((entry) => {
    const outcome = lookupResult.results.get(entry.productId);
    return {
      ...entry,
      apiProduct: outcome?.product ?? null,
      matchType: outcome?.matchType ?? "missing",
      message: outcome?.message ?? null,
    } satisfies LookupRow;
  });

  const summary = summarizeLookupRows(lookupRows);
  console.log(
    `API calls: ${lookupResult.apiCalls}; matches => exact: ${summary.exactMatches}, fuzzy: ${summary.fuzzyMatches}, missing: ${summary.missing}, errors: ${summary.errors}.`,
  );

  printLookupRows(lookupRows);

  if (options.shouldSave) {
    const report: HarvestReport = {
      generatedAt: new Date().toISOString(),
      searchUrl: options.searchUrl,
      finalUrl: htmlResult.finalUrl,
      locationId: options.locationId,
      html: {
        totalLinks: htmlResult.links.length,
        uniqueProductIds: harvested.length,
        linksWithoutIds: missingId.length,
        duplicateLinks: duplicateCount,
      },
      lookup: {
        attempted: limited.length,
        apiCalls: lookupResult.apiCalls,
        concurrency: options.concurrency,
        maxProducts: options.maxProducts,
        exactMatches: summary.exactMatches,
        fuzzyMatches: summary.fuzzyMatches,
        missing: summary.missing,
        errors: summary.errors,
      },
      lookups: lookupRows,
    };

    await persistReport(options.outputPath, report);
    console.log("\nSaved harvest report to", options.outputPath);
  }
}

type ParseState = {
  args: string[];
  index: number;
  next(): string | undefined;
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    searchUrl: sanitizeEnvUrl(process.env.DEALS_SEARCH_URL),
    locationId: sanitizeEnvUrl(process.env.KROGER_LOCATION_ID),
    maxProducts: null,
    concurrency: DEFAULT_CONCURRENCY,
    shouldSave: false,
    outputPath: DEFAULT_OUTPUT_PATH,
    allowUnauthenticated: false,
  };

  const state: ParseState = {
    args: argv,
    index: 0,
    next() {
      const value = this.args[this.index + 1];
      if (value && !value.startsWith("-")) {
        this.index += 1;
        return value;
      }
      return undefined;
    },
  };

  for (state.index = 0; state.index < state.args.length; state.index += 1) {
    const arg = state.args[state.index];

    if (!arg.startsWith("-") && !options.searchUrl) {
      options.searchUrl = arg;
      continue;
    }

    switch (arg) {
      case "--url":
      case "-u": {
        const next = state.next();
        if (next) {
          options.searchUrl = next.trim();
        }
        break;
      }
      case "--location":
      case "-l": {
        const next = state.next();
        if (next) {
          options.locationId = next.trim();
        }
        break;
      }
      case "--max":
      case "-m": {
        const next = state.next();
        if (next) {
          options.maxProducts = clampNumber(next, 1, MAX_PRODUCTS, MAX_PRODUCTS);
        }
        break;
      }
      case "--concurrency":
      case "-c": {
        const next = state.next();
        if (next) {
          options.concurrency = clampNumber(next, 1, MAX_CONCURRENCY, DEFAULT_CONCURRENCY);
        }
        break;
      }
      case "--save":
        options.shouldSave = true;
        break;
      case "--output":
      case "-o": {
        const next = state.next();
        if (next) {
          options.outputPath = path.resolve(next);
          options.shouldSave = true;
        }
        break;
      }
      case "--allow-unauth":
        options.allowUnauthenticated = true;
        break;
      case "--help":
      case "-h":
        exitWithUsage();
        break;
      default:
        break;
    }
  }

  options.searchUrl = options.searchUrl?.trim() ?? "";
  options.locationId = options.locationId?.trim() ?? "";
  options.concurrency = clampNumber(String(options.concurrency), 1, MAX_CONCURRENCY, DEFAULT_CONCURRENCY);

  return options;
}

async function harvestProductLinks(searchUrl: string) {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: !HEADLESS_VISIBLE, args: HEADLESS_ARGS });
  const context = await browser.newContext({
    userAgent: BROWSER_USER_AGENT,
    viewport: HEADLESS_VIEWPORT,
    extraHTTPHeaders: HEADLESS_EXTRA_HEADERS,
    ignoreHTTPSErrors: true,
    storageState: getStorageStatePathOrUndefined(),
  });
  const page = await context.newPage();

  try {
    await primeHomepageIfConfigured(page);
    await page.goto(searchUrl, { waitUntil: "networkidle", timeout: HEADLESS_TIMEOUT_MS });
    const links = await collectProductLinks(page);
    if (!links.length) {
      const debugPaths = await captureDebugArtifacts(page);
      throw new Error(
        `Timed out waiting for product anchors. Saved a debug screenshot to ${debugPaths.screenshot} ` +
          `and HTML snapshot to ${debugPaths.html}. Ensure you're logged in and have a preferred store ` +
          "saved (run 'npm run capture:state' to capture a session) or rerun with --allow-unauth if the " +
          "page works without cookies.",
      );
    }

    return { links, finalUrl: page.url() };
  } finally {
    await context.close();
    await browser.close();
  }
}

async function collectProductLinks(page: Page): Promise<HtmlLink[]> {
  const deadline = Date.now() + PRODUCT_WAIT_TIMEOUT_MS;
  const selectors = [PRODUCT_DESCRIPTION_SELECTOR, PRODUCT_FALLBACK_SELECTOR];

  while (Date.now() < deadline) {
    for (const selector of selectors) {
      const links = await extractLinksFromSelector(page, selector);
      if (links.length > 0) {
        return links;
      }
    }
    await page.waitForTimeout(1000);
  }

  return [];
}

async function extractLinksFromSelector(page: Page, selector: string): Promise<HtmlLink[]> {
  try {
    return await page.$$eval(selector, (nodes) =>
      nodes
        .map((node) => {
          const anchor = node.closest("a");
          const href = anchor?.getAttribute("href") ?? "";
          if (!href) {
            return null;
          }
          const label = node.textContent?.trim() ?? anchor?.textContent?.trim() ?? null;
          return { href, label };
        })
        .filter((entry): entry is HtmlLink => Boolean(entry && entry.href)),
    );
  } catch {
    return [];
  }
}

async function captureDebugArtifacts(page: Page) {
  await mkdir(DEBUG_OUTPUT_DIR, { recursive: true });
  const timestamp = Date.now();
  const screenshot = path.join(DEBUG_OUTPUT_DIR, `harvest-${timestamp}.png`);
  const html = path.join(DEBUG_OUTPUT_DIR, `harvest-${timestamp}.html`);
  await page.screenshot({ path: screenshot, fullPage: true }).catch(() => {});
  await writeFile(html, await page.content(), "utf8").catch(() => {});
  return { screenshot, html };
}

function reduceLinksToProducts(links: HtmlLink[]) {
  const harvested: HarvestedProduct[] = [];
  const missingId: HtmlLink[] = [];
  const seen = new Set<string>();
  let duplicateCount = 0;

  for (const link of links) {
    const productId = extractProductIdFromHref(link.href);
    if (!productId) {
      missingId.push(link);
      continue;
    }
    if (seen.has(productId)) {
      duplicateCount += 1;
      continue;
    }
    seen.add(productId);
    harvested.push({ ...link, productId });
  }

  return { harvested, missingId, duplicateCount };
}

function extractProductIdFromHref(rawHref: string): string | null {
  if (!rawHref) {
    return null;
  }

  try {
    const href = rawHref.trim();
    const url = new URL(href, "https://www.kingsoopers.com");
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length === 0) {
      return null;
    }
    const candidate = segments[segments.length - 1];
    const idMatch = candidate.match(/\d{5,}/);
    return idMatch ? idMatch[0] : null;
  } catch (error) {
    console.warn("Failed to parse product ID from href", { rawHref, error });
    return null;
  }
}

async function lookupProducts(ids: string[], locationId: string, concurrency: number) {
  const queue = [...ids];
  const results = new Map<string, LookupOutcome>();
  let apiCalls = 0;

  async function worker() {
    while (true) {
      const nextId = queue.shift();
      if (!nextId) {
        return;
      }
      try {
        apiCalls += 1;
        const response = await searchKrogerProducts({ term: nextId, locationId, limit: 5 });
        const products = Array.isArray(response.data) ? response.data : [];
        const exact = products.find((product) => product.productId === nextId || product.upc === nextId);
        if (exact) {
          results.set(nextId, { product: exact, matchType: "exact" });
          continue;
        }
        const fallback = products[0];
        if (fallback) {
          results.set(nextId, { product: fallback, matchType: "fuzzy" });
        } else {
          results.set(nextId, { product: null, matchType: "missing", message: "API returned 0 products" });
        }
      } catch (error) {
        results.set(nextId, {
          product: null,
          matchType: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  const workerCount = Math.min(Math.max(1, concurrency), Math.max(1, ids.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return { results, apiCalls };
}

function summarizeLookupRows(rows: LookupRow[]) {
  return rows.reduce(
    (acc, row) => {
      switch (row.matchType) {
        case "exact":
          acc.exactMatches += 1;
          break;
        case "fuzzy":
          acc.fuzzyMatches += 1;
          break;
        case "missing":
          acc.missing += 1;
          break;
        case "error":
          acc.errors += 1;
          break;
        default:
          break;
      }
      return acc;
    },
    { exactMatches: 0, fuzzyMatches: 0, missing: 0, errors: 0 },
  );
}

function printLookupRows(rows: LookupRow[]) {
  if (!rows.length) {
    return;
  }

  console.log("\n--- Product Details ---");
  rows.forEach((row, index) => {
    const prefix = `${index + 1}.`;
    if (!row.apiProduct) {
      console.log(`${prefix} ${row.label ?? "Unknown"} [${row.productId}] (${row.matchType})`);
      console.log(`   reason: ${row.message ?? "no API match"}`);
      return;
    }

    const product = row.apiProduct;
    const mainItem = selectPrimaryItem(product.items);
    const pricing = summarizePricing(mainItem);
    const categories = product.categories?.join(", ") ?? "n/a";
    console.log(
      `${prefix} ${product.description ?? row.label ?? "Unknown"} [${row.productId}] (${row.matchType})`,
    );
    console.log(`   brand: ${product.brand ?? "n/a"} | UPC: ${product.upc ?? "n/a"} | categories: ${categories}`);
    console.log(`   ${pricing}`);
  });
}

async function persistReport(targetPath: string, payload: HarvestReport) {
  const dir = path.dirname(targetPath);
  await mkdir(dir, { recursive: true });
  await writeFile(targetPath, JSON.stringify(payload, null, 2), "utf8");
}

function sanitizeEnvUrl(value: string | undefined): string {
  return value?.trim() ?? "";
}

function clampNumber(value: string, min: number, max: number, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  const normalized = Math.floor(parsed);
  return Math.min(Math.max(normalized, min), max);
}

function exitWithUsage(message?: string): never {
  if (message) {
    console.error(message);
  }
  console.log(`
Usage: npm run kroger:harvest-search -- [options] [searchUrl]
  -u, --url <value>        Override the search URL (defaults to DEALS_SEARCH_URL)
  -l, --location <id>      Kroger location ID (defaults to KROGER_LOCATION_ID)
  -m, --max <1-${MAX_PRODUCTS}>  Limit the number of products to look up
  -c, --concurrency <1-${MAX_CONCURRENCY}>  Max concurrent API calls (default ${DEFAULT_CONCURRENCY})
      --save               Write the harvest report to ${DEFAULT_OUTPUT_PATH}
  -o, --output <path>      Save the report to a custom path
      --allow-unauth       Skip the saved-session check (page must work without cookies)
  -h, --help               Show this message
`);
  process.exit(message ? 1 : 0);
}

main().catch((error) => {
  console.error("\nSearch page harvest failed:\n", error);
  process.exit(1);
});
