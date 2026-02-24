import type { ConsoleMessage, Page, Request, Response } from "playwright";

import { BROWSER_USER_AGENT } from "@/lib/browserHeaders";
import {
  HEADLESS_ARGS,
  HEADLESS_EXTRA_HEADERS,
  HEADLESS_TIMEOUT_MS,
  HEADLESS_VIEWPORT,
  HEADLESS_VISIBLE,
  getStorageStatePathOrUndefined,
  primeHomepageIfConfigured,
} from "@/lib/headlessShared";
import { logError, logInfo } from "@/lib/logger";
import type { RawDealsResponse } from "@/types/deals";

const ATLAS_PATH_FRAGMENT = "/atlas/v1/product/v2/products";

type HeadlessDiagnostics = {
  responses: Array<{ url: string; status: number }>;
  requestFailures: Array<{ url: string; errorText: string | null }>;
  consoleLogs: Array<{ type: string; text: string }>;
  finalUrl?: string;
};

export async function fetchDealsViaHeadless(searchUrl: string): Promise<RawDealsResponse> {
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
  const diagnostics = createDiagnostics();
  const teardownDiagnostics = attachDiagnosticsListeners(page, diagnostics);

  try {
    const dealsPromise = waitForAtlasResponse(page, diagnostics);
    await primeHomepageIfConfigured(page);
    logInfo("Headless browser navigating to search page", { searchUrl });
    await page.goto(searchUrl, { waitUntil: "networkidle", timeout: HEADLESS_TIMEOUT_MS });
    const deals = await dealsPromise;
    logInfo("Captured deals JSON via headless browser", { productCount: deals?.data?.products?.length ?? 0 });
    return deals;
  } catch (error) {
    diagnostics.finalUrl = page.url();
    logError("Headless diagnostics", diagnostics);
    throw error;
  } finally {
    teardownDiagnostics();
    await browser.close();
  }
}

async function waitForAtlasResponse(
  page: Page,
  diagnostics: HeadlessDiagnostics,
): Promise<RawDealsResponse> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for deals feed in headless browser"));
    }, HEADLESS_TIMEOUT_MS);

    const handleResponse = async (response: Response) => {
      const url = response.url();
      diagnostics.responses.push({ url, status: response.status() });
      trimArray(diagnostics.responses);
      if (!url.includes(ATLAS_PATH_FRAGMENT)) {
        return;
      }

      if (!response.ok()) {
        cleanup();
        reject(new Error(`Atlas feed responded with status ${response.status()}`));
        return;
      }

      try {
        const payload = (await response.json()) as RawDealsResponse;
        cleanup();
        resolve(payload);
      } catch (error) {
        cleanup();
        reject(error instanceof Error ? error : new Error("Failed to parse atlas JSON"));
      }
    };

    const handleFailure = (error: Error) => {
      cleanup();
      reject(error);
    };

    function cleanup() {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      page.off("response", handleResponse);
      page.off("pageerror", handleFailure);
      page.off("requestfailed", handleRequestFailed);
    }

    const handleRequestFailed = (request: Request) => {
      logError("Headless request failed", { url: request.url(), failure: request.failure() });
      diagnostics.requestFailures.push({ url: request.url(), errorText: request.failure()?.errorText ?? null });
      trimArray(diagnostics.requestFailures);
    };

    page.on("response", handleResponse);
    page.on("pageerror", handleFailure);
    page.on("requestfailed", handleRequestFailed);
  });
}

function createDiagnostics(): HeadlessDiagnostics {
  return {
    responses: [],
    requestFailures: [],
    consoleLogs: [],
  };
}

function attachDiagnosticsListeners(page: Page, diagnostics: HeadlessDiagnostics) {
  const consoleListener = (msg: ConsoleMessage) => {
    diagnostics.consoleLogs.push({ type: msg.type(), text: msg.text() });
    trimArray(diagnostics.consoleLogs);
  };
  page.on("console", consoleListener);

  return () => {
    page.off("console", consoleListener);
  };
}

function trimArray<T>(arr: T[], max = 15) {
  if (arr.length > max) {
    arr.splice(0, arr.length - max);
  }
}
