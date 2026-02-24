#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { loadEnvConfig } from "@next/env";

import { searchKrogerProducts, type KrogerProduct } from "@/lib/krogerClient";

loadEnvConfig(process.cwd());

const locationId = process.env.KROGER_LOCATION_ID?.trim();

if (!locationId) {
  console.error("Missing KROGER_LOCATION_ID. Add it to .env.local before running this script.");
  process.exit(1);
}

const DAIRY_DEPARTMENT = "15";
const LIMIT = 50;
const MAX_PAGES = 100;

const DEFAULT_KEYWORDS: KeywordConfig[] = [
  {
    term: "milk",
    refinements: ["milk lactose free", "milk single serve", "milk chocolate", "milk plant"],
  },
  {
    term: "cheese",
    refinements: ["cheese shredded", "cheese sliced", "cheese spread", "cheese block"],
  },
  {
    term: "yogurt",
    refinements: ["yogurt greek", "yogurt drink", "yogurt kids", "yogurt probiotic"],
  },
  {
    term: "butter",
    refinements: ["butter spread", "butter sticks", "butter plant", "margarine"],
  },
  { term: "cream", refinements: ["coffee creamer", "heavy cream", "whipped cream"] },
  { term: "eggs", refinements: ["egg whites", "pasteurized eggs", "cage free eggs"] },
  { term: "non dairy", refinements: ["oat milk", "almond milk", "coconut milk"] },
  { term: "lactose free" },
  { term: "organic" },
  { term: "protein", refinements: ["protein shake", "nutrition shake"] },
  { term: "snack", refinements: ["string cheese", "snack pack"] },
  { term: "spread" },
  { term: "dessert" },
  { term: "drink" },
];

const KEYWORDS: KeywordConfig[] = loadKeywordConfig();

function loadKeywordConfig(): KeywordConfig[] {
  const overrides = getKeywordOverrides();
  if (overrides.length > 0) {
    return overrides.map((term) => ({ term }));
  }
  return DEFAULT_KEYWORDS;
}

function getKeywordOverrides(): string[] {
  const fromArgs = parseKeywordsFromArgs();
  if (fromArgs && fromArgs.length > 0) {
    return fromArgs;
  }

  const envValue = process.env.DAIRY_KEYWORDS;
  if (envValue && envValue.trim().length > 0) {
    return splitKeywordList(envValue);
  }

  return [];
}

function parseKeywordsFromArgs(): string[] | null {
  const args = process.argv.slice(2);

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    if (arg === "--keywords" || arg === "-k") {
      const next = args[i + 1];
      if (next && !next.startsWith("-")) {
        return splitKeywordList(next);
      }
    } else if (arg.startsWith("--keywords=")) {
      return splitKeywordList(arg.slice("--keywords=".length));
    } else if (arg.startsWith("-k=")) {
      return splitKeywordList(arg.slice("-k=".length));
    }
  }

  return null;
}

function splitKeywordList(value: string): string[] {
  return value
    .split(",")
    .map((term) => term.trim())
    .filter((term) => term.length > 0);
}

async function main() {
  console.log("\n=== Dairy Department Grid Crawl ===\n");
  console.log("Location:", locationId);
  console.log("Department:", DAIRY_DEPARTMENT);
  console.log("Keywords:", KEYWORDS.map((k) => k.term).join(", "));

  const uniqueProducts = new Map<string, SaleItem>();
  const metrics: KeywordMetric[] = [];
  let totalApiCalls = 0;

  async function processTerm(config: KeywordConfig, term: string, isRefinement: boolean) {
    const label = isRefinement ? `${term} (refinement of ${config.term})` : term;
    process.stdout.write(`\nSearching term "${label}"...`);
    const result = await fetchKeyword(term, locationId);
    totalApiCalls += result.apiCalls;
    result.items.forEach((item) => {
      if (!uniqueProducts.has(item.productId)) {
        uniqueProducts.set(item.productId, item);
      }
    });
    metrics.push({
      keyword: config.term,
      query: term,
      isRefinement,
      apiCalls: result.apiCalls,
      saleItems: result.items.length,
      totalReported: result.totalReported,
      capped: result.needsRefinement,
    });
    process.stdout.write(` done (${result.items.length} sale items, ${result.apiCalls} calls).`);

    if (!isRefinement && result.needsRefinement && config.refinements && config.refinements.length > 0) {
      console.log(`\n  "${config.term}" looks broad; running ${config.refinements.length} refinements...`);
      for (const refinement of config.refinements) {
        await processTerm(config, refinement, true);
      }
    }
  }

  for (const keyword of KEYWORDS) {
    await processTerm(keyword, keyword.term, false);
  }

  console.log("\n\n--- Summary ---");
  console.log("Keywords processed:", KEYWORDS.length);
  console.log("Total API calls:", totalApiCalls);
  console.log("Unique sale products:", uniqueProducts.size);

  console.table(
    metrics.map((entry) => ({
      keyword: entry.keyword,
      query: entry.query,
      refinement: entry.isRefinement ? "yes" : "no",
      calls: entry.apiCalls,
      saleItems: entry.saleItems,
      totalReported: entry.totalReported ?? "?",
      capped: entry.capped,
    })),
  );

  const reportDir = path.resolve(process.cwd(), "reports");
  await mkdir(reportDir, { recursive: true });
  const filename = path.join(reportDir, `dairy-grid-${Date.now()}.json`);

  const payload = {
    generatedAt: new Date().toISOString(),
    locationId,
    department: DAIRY_DEPARTMENT,
    keywords: KEYWORDS,
    limit: LIMIT,
    totalApiCalls,
    uniqueProducts: uniqueProducts.size,
    metrics,
    items: Array.from(uniqueProducts.values()),
  };

  await writeFile(filename, JSON.stringify(payload, null, 2), "utf8");
  console.log("\nReport saved to", filename);
}

type KeywordConfig = {
  term: string;
  refinements?: string[];
};

type KeywordMetric = {
  keyword: string;
  query: string;
  isRefinement: boolean;
  apiCalls: number;
  saleItems: number;
  totalReported: number | null;
  capped: boolean;
};

type SaleItem = {
  productId: string;
  description: string;
  brand?: string;
  size?: string;
  regularPrice: number | null;
  promoPrice: number | null;
  promoExpiresAt: string | null;
};

async function fetchKeyword(keyword: string, location: string) {
  let page = 1;
  let start = 1;
  let apiCalls = 0;
  const items: SaleItem[] = [];
  let totalReported: number | null = null;
  let needsRefinement = false;
  let firstPage = true;

  while (page <= MAX_PAGES) {
    process.stdout.write(`\r  ↳ "${keyword}" page ${page} (start ${start})`);
    const response = await searchKrogerProducts({
      term: keyword,
      department: DAIRY_DEPARTMENT,
      locationId: location,
      limit: LIMIT,
      start,
    });

    apiCalls += 1;

    if (response.meta?.pagination?.total) {
      totalReported = response.meta.pagination.total;
    }

    if (response.data.length === 0) {
      break;
    }

    if (firstPage) {
      needsRefinement = response.data.length >= LIMIT || (totalReported != null && totalReported > LIMIT);
      firstPage = false;
    }

    response.data.forEach((product) => {
      extractSaleItems(product).forEach((sale) => items.push(sale));
    });

    if (response.data.length < LIMIT) {
      break;
    }

    page += 1;
    start += LIMIT;
  }

  process.stdout.write(`\r${" ".repeat(80)}\r`);

  return { apiCalls, items, totalReported, needsRefinement };
}

function extractSaleItems(product: KrogerProduct): SaleItem[] {
  const results: SaleItem[] = [];
  const description = product.description ?? product.productId ?? "Unknown";
  const brand = product.brand;
  const defaultSize = product.size;

  const productItems = Array.isArray(product.items) ? product.items : [];

  for (const item of productItems) {
    if (!isAvailableInStore(item)) {
      continue;
    }

    const { regularPrice, promoPrice, promoExpiresAt } = extractPrices(item);
    if (promoPrice == null) {
      continue;
    }

    results.push({
      productId: product.productId ?? item.itemId ?? product.upc ?? `${description}-${Math.random()}`,
      description,
      brand,
      size: typeof item.size === "string" && item.size.trim().length > 0 ? item.size : defaultSize,
      regularPrice,
      promoPrice,
      promoExpiresAt,
    });
  }

  return results;
}

function isAvailableInStore(item: unknown): boolean {
  const fulfillment = (item as { fulfillment?: unknown })?.fulfillment;
  if (!fulfillment) {
    return false;
  }

  if (Array.isArray(fulfillment)) {
    return fulfillment.some((entry) => {
      const type = (entry as { fulfillmentType?: string }).fulfillmentType;
      return typeof type === "string" && type.toLowerCase() === "in_store";
    });
  }

  if (typeof fulfillment === "object") {
    const record = fulfillment as Record<string, unknown>;
    if (typeof record.inStore === "boolean") {
      return record.inStore;
    }
    if (typeof record.instore === "boolean") {
      return record.instore;
    }
  }

  return false;
}

function extractPrices(item: unknown) {
  const record = item as Record<string, unknown>;
  const price = record.price as Record<string, unknown> | undefined;

  const regular = toNumber(price?.regular ?? price?.regularPrice ?? record.regularPrice ?? record.price);
  const promo = toNumber(price?.promo ?? price?.promoPrice ?? record.promoPrice ?? price?.withCard ?? record.withCard);

  const promoExpiresAt =
    typeof (price as { promoExpirationDate?: string })?.promoExpirationDate === "string"
      ? (price as { promoExpirationDate: string }).promoExpirationDate
      : typeof record.promoExpirationDate === "string"
        ? (record.promoExpirationDate as string)
        : typeof price?.expirationDate === "object" && price?.expirationDate !== null
          ? ((price!.expirationDate as { value?: string }).value ?? null)
          : null;

  return { regularPrice: regular, promoPrice: promo, promoExpiresAt };
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

main().catch((error) => {
  console.error("\nDairy grid crawl failed:\n", error);
  process.exit(1);
});
