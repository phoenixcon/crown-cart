#!/usr/bin/env node
import process from "node:process";

import { loadEnvConfig } from "@next/env";

import {
  getKrogerAccessToken,
  searchKrogerProducts,
  type KrogerProduct,
  type KrogerProductSearchResponse,
} from "../src/lib/krogerClient";

loadEnvConfig(process.cwd());

const DEFAULT_LOCATION_ID = process.env.KROGER_LOCATION_ID?.trim();

type CliOptions = {
  term: string;
  locationId?: string;
  limit?: number;
};

async function main() {
  const options = parseArgs(process.argv.slice(2));
  logSection("🔐 Requesting OAuth token");
  const token = await getKrogerAccessToken();
  console.log(`Received token (${token.length} chars).`);

  logSection(
    `📦 Fetching products for term "${options.term}"${
      options.locationId ? ` at location ${options.locationId}` : ""
    }`,
  );

  const results = await searchKrogerProducts(options);
  printSummary(results);
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    term: "milk",
    locationId: DEFAULT_LOCATION_ID,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if ((arg === "--term" || arg === "-t") && args[i + 1]) {
      options.term = args[i + 1];
      i += 1;
      continue;
    }

    if ((arg === "--location" || arg === "-l") && args[i + 1]) {
      options.locationId = args[i + 1];
      i += 1;
      continue;
    }

    if (arg === "--limit" && args[i + 1]) {
      options.limit = Number(args[i + 1]);
      i += 1;
      continue;
    }
  }

  return options;
}

function printSummary(results: KrogerProductSearchResponse) {
  const { data, meta } = results;
  const pagination = meta?.pagination;
  console.log(
    `Returned ${data.length} product(s). Limit=${pagination?.limit ?? "?"}, ` +
      `Offset=${pagination?.offset ?? "?"}, Total=${pagination?.total ?? "?"}.`,
  );

  if (data.length === 0) {
    console.log("No products matched the supplied filters.");
    return;
  }

  const sample = data.slice(0, 3);
  logSection(`🧪 Showing ${sample.length} sample product(s)`);
  sample.forEach((product, index) => {
    const priceInfo = summarizePrice(product);
    console.log(
      `${index + 1}. ${product.description ?? product.productId} ` +
        `(brand: ${product.brand ?? "n/a"}, UPC: ${product.upc ?? "n/a"})\n` +
        `   size: ${product.size ?? "n/a"}, categories: ${
          product.categories?.join(", ") ?? "n/a"
        }\n` +
        `   ${priceInfo}`,
    );
  });

  logSection("📄 Full JSON response");
  console.dir(results, { depth: null, colors: true });
}

function summarizePrice(product: KrogerProduct): string {
  const item = product.items?.[0];
  if (!item) {
    return "no item-level pricing data";
  }

  const fulfillment = item.fulfillment?.[0];
  const fulfillmentText = fulfillment
    ? `${fulfillment.fulfillmentType}: ${formatPrice(fulfillment.price ?? item.price)}`
    : null;

  const regular = formatPrice(item.regularPrice);
  const promo = formatPrice(item.price);

  const parts = [
    `itemId=${item.itemId}`,
    regular ? `regular=${regular}` : null,
    promo && promo !== regular ? `promo=${promo}` : null,
    fulfillmentText,
  ].filter(Boolean);

  return parts.join(", ") || "item present but no price data";
}

function formatPrice(value?: number) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }

  return `$${value.toFixed(2)}`;
}

function logSection(title: string) {
  console.log("\n====", title, "====");
}

main().catch((error) => {
  console.error("\nKroger API test failed:\n", error);
  process.exitCode = 1;
});
