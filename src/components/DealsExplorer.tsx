"use client";

import { useState } from "react";

import type { DealsApiResponse, NormalizedDeal } from "@/types/deals";

export function DealsExplorer() {
  const [products, setProducts] = useState<NormalizedDeal[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  async function handleFetchDeals() {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/deals");
      if (!response.ok) {
        throw new Error("Request failed");
      }

      const payload = (await response.json()) as DealsApiResponse;
      setProducts(payload.products);
      setLastUpdated(payload.fetchedAt);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(`Unable to load deals: ${message}`);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section className="w-full max-w-4xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">
          Local Grocery Deals
        </h1>
        <p className="text-base text-zinc-600">
          Click the button below to pull the latest Buy 5 Save 1 products from the
          store feed. Results will list the basics so you can scan them quickly.
        </p>
      </header>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-6 py-3 text-base font-medium text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-70"
          onClick={handleFetchDeals}
          disabled={isLoading}
        >
          {isLoading ? "Loading..." : "Load latest deals"}
        </button>
        {lastUpdated && (
          <span className="text-sm text-zinc-500">Last updated {formatTimestamp(lastUpdated)}</span>
        )}
      </div>

      {error && <p className="rounded-md bg-red-100 px-4 py-2 text-sm text-red-700">{error}</p>}

      <div className="rounded-lg border border-zinc-200 bg-white">
        {products.length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="divide-y divide-zinc-100">
            {products.map((product) => (
              <li key={product.id} className="p-4">
                <p className="font-medium text-zinc-900">{product.name}</p>
                <p className="text-sm text-zinc-500">
                  {product.category ?? "Unknown category"}
                  {product.brand ? ` · ${product.brand}` : ""}
                </p>
                <p className="mt-2 text-sm text-zinc-600">
                  <span className="font-semibold text-emerald-600">
                    Sale: {formatPrice(product.salePrice, product.currency)}
                  </span>{" "}
                  <span className="ml-2 text-zinc-400">
                    Regular: {formatPrice(product.regularPrice, product.currency)}
                  </span>
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function EmptyState() {
  return (
    <div className="p-6 text-center text-sm text-zinc-500">
      No products loaded yet. Fetch the deals to see what is currently on sale.
    </div>
  );
}

function formatPrice(amount: number | null, currency: string | null): string {
  if (typeof amount !== "number") {
    return "N/A";
  }

  const currencyCode = currency ?? "USD";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}
