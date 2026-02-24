#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";

const nextEnv = await import("@next/env");
const loadEnvConfig = nextEnv.loadEnvConfig ?? nextEnv.default?.loadEnvConfig;
if (typeof loadEnvConfig === "function") {
  loadEnvConfig(process.cwd());
}

async function main() {
  const { chromium } = await import("playwright");
  const targetUrl =
    process.env.DEALS_SEARCH_URL || "https://www.kingsoopers.com/search?query=weekly%20ad";
  const statePath = path.resolve(
    process.env.HEADLESS_STORAGE_STATE || path.join(process.cwd(), "kroger-storage-state.json"),
  );
  const browserChannel = process.env.PLAYWRIGHT_BROWSER_CHANNEL?.trim() || undefined;

  console.log("\n[storage] Launching Chromium so you can log into the store site.");
  console.log("[storage] When you finish logging in and the deals page loads, switch back here and press Enter.\n");

  const userDataDir = path.resolve(process.env.PLAYWRIGHT_USER_DATA_DIR || ".playwright-chrome-profile");
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    channel: browserChannel,
    viewport: { width: 1280, height: 720 },
    ignoreDefaultArgs: ["--enable-automation"],
    args: ["--disable-blink-features=AutomationControlled"],
  });
  const page = await context.newPage();
  await page.goto(targetUrl, { waitUntil: "load" });

  await waitForEnter("Press Enter here once you see products on the page...");
  await context.storageState({ path: statePath });
  await context.close();

  await fs.chmod(statePath, 0o600).catch(() => {});
  console.log(`\n[storage] Saved browser session to ${statePath}`);
  console.log("[storage] Deploy this file alongside the app and set HEADLESS_STORAGE_STATE to the same path.\n");
}

async function waitForEnter(prompt) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise((resolve) => rl.question(`${prompt}\n`, resolve));
  rl.close();
}

main().catch((error) => {
  console.error("[storage] Failed to capture state", error);
  process.exitCode = 1;
});
