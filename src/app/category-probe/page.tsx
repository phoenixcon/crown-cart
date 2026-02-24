"use client";

import { useMemo, useState } from "react";

type SnapshotItem = {
  productId: string;
  description: string;
  brand?: string;
  size?: string;
  regularPrice: number | null;
  promoPrice: number | null;
  promoExpiresAt: string | null;
};

type CategoryPageResponse = {
  category: string;
  locationId: string;
  limit: number;
  page: number;
  totalProducts: number | null;
  totalPages: number | null;
  saleItemsOnPage: number;
  hasMore: boolean;
  durationMs: number;
  items: SnapshotItem[];
};

type ProbeResult = {
  category: string;
  locationId: string;
  totalProducts: number | null;
  totalSaleItems: number;
  totalApiCalls: number;
  pagesFetched: number;
  durationMs: number;
  limit: number;
  totalPages: number | null;
};

type ProbeProgress = {
  currentPage: number;
  totalPages: number | null;
  totalProducts: number | null;
  totalApiCalls: number;
  durationMs: number;
  lastPageDurationMs: number;
  lastPageItems: number;
};

export default function CategoryProbePage() {
  const categoryOptions = [
    { code: "73", name: "Natural & Organic" },
    { code: "15", name: "Dairy" },
    { code: "10", name: "Breakfast" },
    { code: "37", name: "Snacks" },
    { code: "33", name: "Pasta, Sauces, Grain" },
    { code: "20", name: "Frozen" },
    { code: "14", name: "Condiment & Sauces" },
    { code: "12", name: "Canned & Packaged" },
    { code: "28", name: "Meat & Seafood" },
    { code: "9", name: "Beverages" },
    { code: "7", name: "Baking Goods" },
    { code: "13", name: "Cleaning Products" },
    { code: "25", name: "International" },
    { code: "6", name: "Bakery" },
    { code: "16", name: "Deli" },
  ];

  const [category, setCategory] = useState(categoryOptions[1]?.name ?? "Dairy");
  const maxLimit = 50;
  const [limit, setLimit] = useState("50");
  const [maxPages, setMaxPages] = useState("5");
  const [saleOnly, setSaleOnly] = useState(true);
  const [items, setItems] = useState<SnapshotItem[]>([]);
  const [result, setResult] = useState<ProbeResult | null>(null);
  const [progress, setProgress] = useState<ProbeProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    setProgress(null);
    setItems([]);

    const controller = new AbortController();
    setAbortController(controller);

    try {
      const parsedLimit = clamp(Number(limit) || 50, 1, maxLimit);
      const parsedMaxPages = Math.max(1, Number(maxPages) || 5);
      const collected: SnapshotItem[] = [];
      const startedAt = performance.now();
      let totalProducts: number | null = null;
      let totalPages: number | null = null;
      let totalApiCalls = 0;
      let currentPage = 1;
      let lastPayload: CategoryPageResponse | null = null;

      while (true) {
        const params = new URLSearchParams({
          category: category.trim(),
          limit: String(parsedLimit),
          page: String(currentPage),
        });
        if (!saleOnly) {
          params.set("saleOnly", "false");
        }

        const response = await fetch(`/api/kroger/category?${params.toString()}`, {
          method: "GET",
          cache: "no-store",
          signal: controller.signal,
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error ?? `Request failed with status ${response.status}`);
        }

        const payload = (await response.json()) as CategoryPageResponse;
        lastPayload = payload;
        totalApiCalls += 1;
        totalProducts = payload.totalProducts ?? totalProducts;
        totalPages = payload.totalPages ?? totalPages;
        collected.push(...payload.items);
        setItems((prev) => [...prev, ...payload.items]);

        setProgress({
          currentPage: payload.page,
          totalPages,
          totalProducts,
          totalApiCalls,
          durationMs: performance.now() - startedAt,
          lastPageDurationMs: payload.durationMs,
          lastPageItems: payload.items.length,
        });

        const reachedMax = currentPage >= parsedMaxPages;
        if (!payload.hasMore || reachedMax) {
          break;
        }

        currentPage += 1;
      }

      if (lastPayload) {
        setResult({
          category: lastPayload.category,
          locationId: lastPayload.locationId,
          totalProducts: totalProducts ?? lastPayload.totalProducts,
          totalSaleItems: collected.length,
          totalApiCalls,
          pagesFetched: totalApiCalls,
          durationMs: performance.now() - startedAt,
          limit: parsedLimit,
          totalPages,
        });
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setError("Probe canceled.");
      } else {
        setError(err instanceof Error ? err.message : "Unknown error");
      }
    } finally {
      setLoading(false);
      setAbortController(null);
    }
  }

  const summary = useMemo(() => {
    if (!result) {
      return null;
    }
    const durationSeconds = (result.durationMs / 1000).toFixed(2);
    const avgPerCall = result.totalApiCalls > 0 ? (result.durationMs / result.totalApiCalls).toFixed(0) : "0";
    return { durationSeconds, avgPerCall };
  }, [result]);

  function handleCancel() {
    abortController?.abort();
  }

  return (
    <main className="min-h-screen bg-zinc-50 py-10 text-zinc-900">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-6">
        <header>
          <h1 className="text-3xl font-semibold">Category Probe</h1>
          <p className="text-sm text-zinc-600">
            Crawl the Kroger API for a single category to gauge API call volume, latency, and sale item coverage.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="flex flex-wrap gap-4 rounded-lg bg-white p-4 shadow">
          <label className="flex flex-1 flex-col text-sm font-medium text-zinc-700">
            Category name
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="mt-1 rounded border border-zinc-300 px-3 py-2 text-base text-zinc-900"
            >
              {categoryOptions.map((option) => (
                <option key={option.code} value={option.name}>
                  {option.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex w-32 flex-col text-sm font-medium text-zinc-700">
            Page size (max {maxLimit})
            <input
              type="number"
              min={1}
              max={maxLimit}
              value={limit}
              onChange={(event) => setLimit(event.target.value)}
              className="mt-1 rounded border border-zinc-300 px-3 py-2 text-base text-zinc-900"
            />
          </label>

          <label className="flex w-32 flex-col text-sm font-medium text-zinc-700">
            Max pages
            <input
              type="number"
              min={1}
              max={250}
              value={maxPages}
              onChange={(event) => setMaxPages(event.target.value)}
              className="mt-1 rounded border border-zinc-300 px-3 py-2 text-base text-zinc-900"
            />
          </label>

          <label className="flex items-center gap-2 text-sm font-medium text-zinc-700">
            <input
              type="checkbox"
              checked={saleOnly}
              onChange={(event) => setSaleOnly(event.target.checked)}
            />
            Sale items only
          </label>

          <button
            type="submit"
            className="self-end rounded bg-indigo-600 px-4 py-2 font-semibold text-white disabled:opacity-60"
            disabled={loading}
          >
            {loading ? "Scanning…" : "Run Probe"}
          </button>

          {loading ? (
            <button
              type="button"
              onClick={handleCancel}
              className="self-end rounded border border-indigo-200 px-4 py-2 font-medium text-indigo-700"
            >
              Cancel
            </button>
          ) : null}
        </form>

        {error ? (
          <div className="rounded border border-red-300 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        ) : null}

        {progress ? (
          <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold">In-progress stats</h2>
            <dl className="mt-3 grid grid-cols-2 gap-4 text-sm text-zinc-700 sm:grid-cols-3">
              <div>
                <dt className="text-zinc-500">Current page</dt>
                <dd className="text-base text-zinc-900">
                  {progress.currentPage}
                  {progress.totalPages ? ` / ${progress.totalPages}` : ""}
                </dd>
              </div>
              <div>
                <dt className="text-zinc-500">API calls</dt>
                <dd className="text-base text-zinc-900">{progress.totalApiCalls}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Items captured</dt>
                <dd className="text-base text-zinc-900">{items.length}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Elapsed</dt>
                <dd className="text-base text-zinc-900">{(progress.durationMs / 1000).toFixed(1)} s</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Last page duration</dt>
                <dd className="text-base text-zinc-900">{progress.lastPageDurationMs.toFixed(0)} ms</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Last page sale items</dt>
                <dd className="text-base text-zinc-900">{progress.lastPageItems}</dd>
              </div>
            </dl>
          </section>
        ) : null}

        {result && summary ? (
          <section className="rounded-lg bg-white p-4 shadow">
            <h2 className="text-xl font-semibold">Summary</h2>
            <dl className="mt-4 grid grid-cols-2 gap-4 text-sm text-zinc-700 sm:grid-cols-3">
              <div>
                <dt className="font-medium text-zinc-500">Category</dt>
                <dd className="text-base text-zinc-900">{result.category}</dd>
              </div>
              <div>
                <dt className="font-medium text-zinc-500">Location ID</dt>
                <dd className="text-base text-zinc-900">{result.locationId}</dd>
              </div>
              <div>
                <dt className="font-medium text-zinc-500">API calls</dt>
                <dd className="text-base text-zinc-900">{result.totalApiCalls}</dd>
              </div>
              <div>
                <dt className="font-medium text-zinc-500">Pages fetched</dt>
                <dd className="text-base text-zinc-900">{result.pagesFetched}</dd>
              </div>
              <div>
                <dt className="font-medium text-zinc-500">Duration</dt>
                <dd className="text-base text-zinc-900">{summary.durationSeconds} s</dd>
              </div>
              <div>
                <dt className="font-medium text-zinc-500">Avg ms/call</dt>
                <dd className="text-base text-zinc-900">{summary.avgPerCall} ms</dd>
              </div>
              <div>
                <dt className="font-medium text-zinc-500">Total products (reported)</dt>
                <dd className="text-base text-zinc-900">{result.totalProducts ?? "?"}</dd>
              </div>
              <div>
                <dt className="font-medium text-zinc-500">Sale items found</dt>
                <dd className="text-base text-zinc-900">{result.totalSaleItems}</dd>
              </div>
            </dl>

            <div className="mt-6 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-3 py-2">Product</th>
                    <th className="px-3 py-2">Regular</th>
                    <th className="px-3 py-2">Promo</th>
                    <th className="px-3 py-2">Promo ends</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => (
                    <tr
                      key={`${item.productId ?? "unknown"}-${index}`}
                      className="border-b border-zinc-100"
                    >
                      <td className="px-3 py-2">
                        <div className="font-medium text-zinc-900">{item.description}</div>
                        <div className="text-xs text-zinc-500">
                          {item.brand ? `${item.brand} • ` : ""}
                          {item.size ?? "size n/a"}
                        </div>
                      </td>
                      <td className="px-3 py-2">{formatPrice(item.regularPrice)}</td>
                      <td className="px-3 py-2 font-semibold text-emerald-600">{formatPrice(item.promoPrice)}</td>
                      <td className="px-3 py-2 text-xs text-zinc-500">
                        {item.promoExpiresAt ? new Date(item.promoExpiresAt).toLocaleDateString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}

function formatPrice(value: number | null): string {
  if (value == null) {
    return "—";
  }
  return `$${value.toFixed(2)}`;
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(Math.max(Math.floor(value), min), max);
}
