import { performance } from "node:perf_hooks";

import { searchKrogerProducts, type KrogerProduct } from "@/lib/krogerClient";

export type CategorySnapshotItem = {
  productId: string;
  description: string;
  brand?: string;
  size?: string;
  regularPrice: number | null;
  promoPrice: number | null;
  promoExpiresAt: string | null;
};

export type CategoryPageOptions = {
  category: string;
  locationId: string;
  limit?: number;
  page?: number;
  saleOnly?: boolean;
};

export type CategoryPageResult = {
  category: string;
  locationId: string;
  limit: number;
  page: number;
  totalProducts: number | null;
  totalPages: number | null;
  saleItemsOnPage: number;
  hasMore: boolean;
  durationMs: number;
  items: CategorySnapshotItem[];
};

const MAX_LIMIT = 50;

export async function fetchCategoryPage(options: CategoryPageOptions): Promise<CategoryPageResult> {
  if (!options.category.trim()) {
    throw new Error("Category is required");
  }

  if (!options.locationId.trim()) {
    throw new Error("Location ID is required to scan a category");
  }

  const limit = clampLimit(options.limit ?? MAX_LIMIT);
  const page = clampPage(options.page ?? 1);

  const startTime = performance.now();
  const response = await searchKrogerProducts({
    term: options.category,
    category: options.category,
    locationId: options.locationId,
    limit,
    start: page,
  });
  const durationMs = performance.now() - startTime;

  const saleItems = response.data.flatMap((product) =>
    extractSaleItems(product, { saleOnly: options.saleOnly !== false }),
  );

  const totalProducts = response.meta?.pagination?.total ?? null;
  const totalPages = totalProducts ? Math.ceil(totalProducts / limit) : null;
  const hasMore = totalPages ? page < totalPages : response.data.length === limit;

  return {
    category: options.category,
    locationId: options.locationId,
    limit,
    page,
    totalProducts,
    totalPages,
    saleItemsOnPage: saleItems.length,
    hasMore,
    durationMs,
    items: saleItems,
  };
}

function extractSaleItems(
  product: KrogerProduct,
  options: { saleOnly: boolean },
): CategorySnapshotItem[] {
  const results: CategorySnapshotItem[] = [];
  const description = product.description ?? product.productId ?? "Unknown item";
  const brand = product.brand;
  const defaultSize = product.size;

  const productItems = Array.isArray(product.items) ? product.items : [];

  for (const item of productItems) {
    if (!isInStore(item)) {
      continue;
    }

    const { regularPrice, promoPrice, promoExpiresAt } = extractPrices(item);

    if (options.saleOnly && promoPrice == null) {
      continue;
    }

    results.push({
      productId: product.productId ?? item.itemId ?? product.upc ?? "unknown",
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

function isInStore(item: unknown): boolean {
  const fulfillment = (item as { fulfillment?: unknown })?.fulfillment;
  if (!fulfillment) {
    return false;
  }

  if (Array.isArray(fulfillment)) {
    return fulfillment.some((entry) => {
      if (typeof entry !== "object" || !entry) {
        return false;
      }
      const fulfillmentType = (entry as { fulfillmentType?: string }).fulfillmentType;
      return fulfillmentType?.toLowerCase() === "in_store";
    });
  }

  if (typeof fulfillment === "object") {
    const record = fulfillment as Record<string, unknown>;
    const direct = record.inStore ?? record.instore;
    if (typeof direct === "boolean") {
      return direct;
    }
  }

  return false;
}

function extractPrices(item: unknown) {
  const record = item as Record<string, unknown>;
  const price = record.price as Record<string, unknown> | undefined;

  const regularFromPrice = toNumber(price?.regular ?? price?.regularPrice);
  const promoFromPrice = toNumber(price?.promo ?? price?.promoPrice ?? price?.sale ?? price?.withCard);

  const fallbackRegular = toNumber(record.regularPrice ?? record.price ?? record.withoutCard);
  const fallbackPromo = toNumber(record.promoPrice ?? record.salePrice ?? record.withCard);

  const regularPrice = regularFromPrice ?? fallbackRegular ?? null;
  const promoPrice = promoFromPrice ?? fallbackPromo ?? null;

  const expirationFromPrice =
    typeof price?.expirationDate === "object" && price?.expirationDate !== null
      ? (price!.expirationDate as { value?: string }).value ?? null
      : null;

  const promoExpiresAt =
    (typeof (price as { promoExpirationDate?: string })?.promoExpirationDate === "string"
      ? (price as { promoExpirationDate: string }).promoExpirationDate
      : null) ||
    (typeof record.promoExpirationDate === "string" ? (record.promoExpirationDate as string) : null) ||
    expirationFromPrice;

  return { regularPrice, promoPrice, promoExpiresAt };
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

function clampLimit(value: number): number {
  if (!Number.isFinite(value)) {
    return MAX_LIMIT;
  }

  return Math.min(Math.max(1, Math.floor(value)), MAX_LIMIT);
}

function clampPage(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }

  return Math.min(Math.max(1, Math.floor(value)), 250);
}
