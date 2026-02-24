#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { loadEnvConfig } from "@next/env";

import { crawlPrefixes } from "@/lib/prefixCrawler";

loadEnvConfig(process.cwd());

const locationId = process.env.KROGER_LOCATION_ID?.trim();

if (!locationId) {
  console.error("Missing KROGER_LOCATION_ID in your environment. Set it in .env.local and retry.");
  process.exit(1);
}

const INITIAL_PREFIXES = [
  "0",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "a",
  "b",
  "c",
  "d",
  "e",
];

const LIMIT = 50;
const THRESHOLD = 40;
const MAX_DEPTH = 4;

async function main() {
  console.log("\n=== Kroger Prefix Crawl Sample ===\n");
  console.log("Location:", locationId);
  console.log("Initial prefixes:", INITIAL_PREFIXES.join(", "));
  console.log("Limit per page:", LIMIT, "Threshold for expansion:", THRESHOLD, "Max depth:", MAX_DEPTH);

  const result = await crawlPrefixes({
    initialPrefixes: INITIAL_PREFIXES,
    locationId,
    limit: LIMIT,
    threshold: THRESHOLD,
    maxDepth: MAX_DEPTH,
  }, ({ prefix, depth, page }) => {
    process.stdout.write(`\rProcessing prefix ${prefix} (depth ${depth}) page ${page}`);
  });
  process.stdout.write("\n");

  console.log("\n--- Summary ---");
  console.log("API calls:", result.totalApiCalls);
  console.log("Prefixes processed:", result.totalPrefixesProcessed);
  console.log("Unique products discovered:", result.totalUniqueProducts);
  console.log("Items discovered:", result.totalItems);
  console.log("Max depth reached:", result.depthReached);

  const topMetrics = [...result.metrics]
    .sort((a, b) => b.apiCalls - a.apiCalls)
    .slice(0, 10)
    .map((entry) => ({
      prefix: entry.prefix,
      depth: entry.depth,
      apiCalls: entry.apiCalls,
      uniqueProducts: entry.uniqueProductsDiscovered,
      expanded: entry.expanded,
    }));

  console.log("\nHeavy prefixes:");
  console.table(topMetrics);

  const reportDir = path.resolve(process.cwd(), "reports");
  await mkdir(reportDir, { recursive: true });
  const filename = path.join(reportDir, `kroger-prefix-sample-${Date.now()}.json`);

  const payload = {
    generatedAt: new Date().toISOString(),
    locationId,
    limit: LIMIT,
    threshold: THRESHOLD,
    maxDepth: MAX_DEPTH,
    initialPrefixes: INITIAL_PREFIXES,
    result,
  };

  await writeFile(filename, JSON.stringify(payload, null, 2), "utf8");
  console.log("\nReport saved to:", filename);
}

main().catch((error) => {
  console.error("\nPrefix crawl failed:\n", error);
  process.exit(1);
});
