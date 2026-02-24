#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { loadEnvConfig } from "@next/env";

import { searchKrogerProducts, type KrogerProduct } from "@/lib/krogerClient";
import { selectPrimaryItem, summarizePricing } from "@/lib/krogerProductFormatting";

loadEnvConfig(process.cwd());

const DEFAULT_LOCATION = process.env.KROGER_LOCATION_ID?.trim();
const DEFAULT_LIMIT = 20;
const DEFAULT_OUTPUT = path.resolve(process.cwd(), "reports", "latest-keyword-search.json");

type CliOptions = {
  term: string;
  locationId: string;
  limit: number;
  start: number;
  department?: string;
  brand?: string;
  showJson: boolean;
  writeToFile: boolean;
};

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.term) {
    exitWithUsage("A search term is required (pass --term or provide it as the first argument).");
  }

  if (!options.locationId) {
    exitWithUsage("Set KROGER_LOCATION_ID in .env.local or pass --location.");
  }

  const response = await searchKrogerProducts({
    term: options.term,
    locationId: options.locationId,
    limit: options.limit,
    start: options.start,
    department: options.department,
    brand: options.brand,
  });

  const pagination = response.meta?.pagination;
  console.log("\n=== Kroger Keyword Search ===");
  console.log("Term:", options.term);
  console.log("Location:", options.locationId);
  if (options.department) {
    console.log("Department filter:", options.department);
  }
  if (options.brand) {
    console.log("Brand filter:", options.brand);
  }
  console.log(
    `Returned ${response.data.length} product(s); limit=${pagination?.limit ?? "?"}, ` +
      `offset=${pagination?.start ?? pagination?.offset ?? "?"}, total=${pagination?.total ?? "?"}.`,
  );

  if (response.data.length === 0) {
    console.log("No items matched the search criteria.");
  } else {
    printProducts(response.data);
  }

  if (options.showJson) {
    console.log("\n--- Raw JSON Response ---");
    console.dir(response, { depth: null, maxArrayLength: 5 });
  }

  if (options.writeToFile) {
    await persistResponse(response);
  }
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    term: "",
    locationId: DEFAULT_LOCATION ?? "",
    limit: DEFAULT_LIMIT,
    start: 1,
    showJson: false,
    writeToFile: false,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const next = args[i + 1];

    if (!arg.startsWith("-") && !options.term) {
      options.term = arg;
      continue;
    }

    switch (arg) {
      case "--term":
      case "-t":
        if (next) {
          options.term = next;
          i += 1;
        }
        break;
      case "--location":
      case "-l":
        if (next) {
          options.locationId = next;
          i += 1;
        }
        break;
      case "--limit":
        if (next) {
          options.limit = clampNumber(next, 1, 50, DEFAULT_LIMIT);
          i += 1;
        }
        break;
      case "--start":
        if (next) {
          options.start = clampNumber(next, 1, 250, 1);
          i += 1;
        }
        break;
      case "--department":
        if (next) {
          options.department = next;
          i += 1;
        }
        break;
      case "--brand":
        if (next) {
          options.brand = next;
          i += 1;
        }
        break;
      case "--json":
        options.showJson = true;
        break;
      case "--save":
        options.writeToFile = true;
        break;
      case "--help":
      case "-h":
        exitWithUsage();
        break;
      default:
        break;
    }
  }

  return options;
}

async function persistResponse(response: unknown) {
  const targetDir = path.dirname(DEFAULT_OUTPUT);
  await mkdir(targetDir, { recursive: true });
  await writeFile(DEFAULT_OUTPUT, JSON.stringify(response, null, 2), "utf8");
  console.log("\nSaved JSON to", DEFAULT_OUTPUT);
}

function printProducts(products: KrogerProduct[]) {
  console.log("\n--- Products ---");
  products.forEach((product, index) => {
    const mainItem = selectPrimaryItem(product.items);
    const pricing = summarizePricing(mainItem);
    console.log(
      `${index + 1}. ${product.description ?? product.productId ?? "Unknown"}` +
        ` [${product.productId ?? "??"}]`,
    );
    console.log(
      `   brand: ${product.brand ?? "n/a"} | UPC: ${product.upc ?? "n/a"} | categories: ${
        product.categories?.join(", ") ?? "n/a"
      }`,
    );
    console.log(`   ${pricing}`);
  });
}

function clampNumber(value: string, min: number, max: number, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(Math.max(Math.floor(parsed), min), max);
}

function exitWithUsage(message?: string): never {
  if (message) {
    console.error(message);
  }
  console.log(`
Usage: npm run kroger:search -- [options] <term>
  -t, --term <value>        Keyword to search (can also be provided positionally)
  -l, --location <id>       Kroger location ID (defaults to KROGER_LOCATION_ID)
      --limit <1-50>        Result limit (default ${DEFAULT_LIMIT})
      --start <1-250>       Starting offset for pagination (default 1)
      --department <id>     Optional department filter (if Kroger honors it)
      --brand <value>       Optional brand filter
      --json                Print the raw JSON response for inspection
      --save                Write the entire JSON response to ${DEFAULT_OUTPUT}
  -h, --help                Show this help message
`);
  process.exit(message ? 1 : 0);
}

main().catch((error) => {
  console.error("\nKeyword search failed:\n", error);
  process.exit(1);
});
