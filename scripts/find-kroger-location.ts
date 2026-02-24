#!/usr/bin/env node
import process from "node:process";

import { loadEnvConfig } from "@next/env";

import {
  getKrogerAccessToken,
  searchKrogerLocations,
  type KrogerLocation,
  type KrogerLocationSearchResponse,
} from "../src/lib/krogerClient";

type CliOptions = {
  zipCode: string;
  radius?: number;
  limit?: number;
};

loadEnvConfig(process.cwd());

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.zipCode) {
    console.error("Please provide a zip code via --zip 80202");
    process.exitCode = 1;
    return;
  }

  logSection("🔐 Requesting OAuth token");
  await getKrogerAccessToken();
  console.log("Token ready (cached globally).");

  logSection(
    `📍 Searching for stores near ${options.zipCode} (radius ${options.radius ?? "auto"} mi)`,
  );
  const results = await searchKrogerLocations(options);
  printLocations(results);
}

function parseArgs(args: string[]): CliOptions {
  const options: Partial<CliOptions> = {};

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const next = args[i + 1];

    if ((arg === "--zip" || arg === "-z") && next) {
      options.zipCode = next;
      i += 1;
      continue;
    }

    if ((arg === "--radius" || arg === "-r") && next) {
      options.radius = Number(next);
      i += 1;
      continue;
    }

    if (arg === "--limit" && next) {
      options.limit = Number(next);
      i += 1;
      continue;
    }

    if (!arg.startsWith("-")) {
      options.zipCode = arg;
    }
  }

  return {
    zipCode: options.zipCode ?? "",
    radius: options.radius,
    limit: options.limit,
  };
}

function printLocations(results: KrogerLocationSearchResponse) {
  const { data, meta } = results;
  console.log(
    `Found ${data.length} location(s). Limit=${meta?.pagination?.limit ?? "?"}, ` +
      `Total=${meta?.pagination?.total ?? "?"}.`,
  );

  if (data.length === 0) {
    console.log("No stores were returned. Try widening the radius.");
    return;
  }

  data.forEach((location, index) => {
    console.log(formatLocationLine(index + 1, location));
  });
}

function formatLocationLine(index: number, location: KrogerLocation): string {
  const address = formatAddress(location);
  const parts = [
    `${index}. ${location.name ?? "Unknown name"} (${location.locationId})`,
    address,
    location.phone ? `☎ ${location.phone}` : null,
    location.fulfillmentTypes?.length
      ? `Fulfillment: ${location.fulfillmentTypes.join(", ")}`
      : null,
  ].filter(Boolean);

  return parts.join("\n   ");
}

function formatAddress(location: KrogerLocation): string {
  const { address } = location;
  if (!address) {
    return "address unavailable";
  }

  const line1 = [address.addressLine1, address.addressLine2].filter(Boolean).join(", ");
  const line2 = [address.city, address.state, address.zipCode].filter(Boolean).join(", ");
  return [line1, line2].filter(Boolean).join(" | ") || "address unavailable";
}

function logSection(title: string) {
  console.log("\n====", title, "====");
}

main().catch((error) => {
  console.error("\nKroger location search failed:\n", error);
  process.exitCode = 1;
});
