import fs from "node:fs";
import path from "node:path";

import type { Page } from "playwright";

import { buildHtmlHeadersForRequests } from "@/lib/browserHeaders";
import { logError, logInfo } from "@/lib/logger";

export const HEADLESS_TIMEOUT_MS = Number(process.env.HEADLESS_TIMEOUT_MS ?? 30000);
export const HEADLESS_VISIBLE = process.env.HEADLESS_VISIBLE === "true";
export const HEADLESS_ARGS = buildHeadlessArgs();
export const HEADLESS_EXTRA_HEADERS = buildHtmlHeadersForRequests();
export const HEADLESS_VIEWPORT = { width: 1280, height: 720 } as const;

const DEFAULT_STORAGE_STATE_PATH = path.join(process.cwd(), "kroger-storage-state.json");
export const STORAGE_STATE_PATH = process.env.HEADLESS_STORAGE_STATE
  ? path.resolve(process.env.HEADLESS_STORAGE_STATE)
  : DEFAULT_STORAGE_STATE_PATH;
export const HOME_WARMUP_URL = process.env.HEADLESS_HOME_URL ?? "https://www.kingsoopers.com/";

function buildHeadlessArgs() {
  const defaultArgs = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--disable-http2",
    "--disable-blink-features=AutomationControlled",
  ];
  const extra = process.env.HEADLESS_BROWSER_ARGS?.split(/\s+/).filter(Boolean) ?? [];
  return [...defaultArgs, ...extra];
}

export function storageStateExists(): boolean {
  return fs.existsSync(STORAGE_STATE_PATH);
}

export function getStorageStatePathOrUndefined(): string | undefined {
  if (!storageStateExists()) {
    logInfo("No headless storage state found; running without saved session", {
      STORAGE_STATE_PATH,
    });
    return undefined;
  }
  return STORAGE_STATE_PATH;
}

export async function primeHomepageIfConfigured(page: Page) {
  if (!HOME_WARMUP_URL) {
    return;
  }
  try {
    logInfo("Headless browser warmup", { url: HOME_WARMUP_URL });
    await page.goto(HOME_WARMUP_URL, { waitUntil: "load", timeout: HEADLESS_TIMEOUT_MS });
    await page.waitForTimeout(1500);
  } catch (error) {
    logError("Warmup navigation failed", { error });
  }
}
