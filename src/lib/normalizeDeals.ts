import type {
  NormalizedDeal,
  RawDealsResponse,
  RawItem,
  RawPriceDetails,
  RawProduct,
  RawSourceLocation,
} from "@/types/deals";

type MoneyValue = {
  amount: number;
  currency: string | null;
};

type ExtendedPriceDetails = RawPriceDetails & {
  nFor?: {
    price?: string | null;
  };
};

export function normalizeDeals(raw: RawDealsResponse | null | undefined): NormalizedDeal[] {
  const products = raw?.data?.products;
  if (!Array.isArray(products)) {
    return [];
  }

  const normalized: NormalizedDeal[] = [];

  for (const product of products) {
    const id = deriveProductId(product);
    const name = selectName(product);

    if (!id || !name) {
      continue;
    }

    const item = product.item;
    const brand = sanitizeString(item?.brand?.name);
    const category = selectCategory(item);
    const salePrice = findSalePrice(product);
    const regularPrice = findRegularPrice(product);

    normalized.push({
      id,
      name,
      brand,
      category,
      salePrice: salePrice?.amount ?? null,
      regularPrice: regularPrice?.amount ?? null,
      currency: salePrice?.currency ?? regularPrice?.currency ?? null,
    });
  }

  return normalized;
}

function findSalePrice(product: RawProduct): MoneyValue | null {
  const direct = readPriceDetails(product.price?.storePrices?.promo);
  if (direct) {
    return direct;
  }
  return findPriceFromSourceLocations(product.sourceLocations, "sale");
}

function findRegularPrice(product: RawProduct): MoneyValue | null {
  const direct = readPriceDetails(product.price?.storePrices?.regular);
  if (direct) {
    return direct;
  }
  return findPriceFromSourceLocations(product.sourceLocations, "regular");
}

function findPriceFromSourceLocations(
  locations: RawSourceLocation[] | undefined,
  key: "sale" | "regular",
): MoneyValue | null {
  if (!Array.isArray(locations)) {
    return null;
  }

  for (const location of locations) {
    const prices = location.prices;
    if (!Array.isArray(prices)) {
      continue;
    }

    for (const price of prices) {
      const details = price[key] as ExtendedPriceDetails | undefined;
      const parsed = readPriceDetails(details);
      if (parsed) {
        return parsed;
      }
    }
  }

  return null;
}

function readPriceDetails(details?: ExtendedPriceDetails | null): MoneyValue | null {
  if (!details) {
    return null;
  }

  return (
    parseMoney(details.price) ??
    parseMoney(details.nforPrice) ??
    parseMoney(details.unitPrice) ??
    parseMoney(details.nFor?.price)
  );
}

function parseMoney(value?: string | null): MoneyValue | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const numberMatch = trimmed.match(/-?\d+(?:\.\d+)?/);
  if (!numberMatch) {
    return null;
  }

  const amount = Number.parseFloat(numberMatch[0]);
  if (Number.isNaN(amount)) {
    return null;
  }

  const currencyMatch = trimmed.match(/^[A-Z]{3}/);
  const inferredCurrency = currencyMatch?.[0] ?? (trimmed.includes("$") ? "USD" : null);

  return { amount, currency: inferredCurrency };
}

function deriveProductId(product: RawProduct): string | null {
  const candidates = [product.id, product.item?.itemId, product.item?.upc];
  return firstNonEmpty(candidates);
}

function selectName(product: RawProduct): string | null {
  const item = product.item;
  const candidates = [item?.description, item?.productName, product.id];
  return firstNonEmpty(candidates);
}

function selectCategory(item?: RawItem): string | null {
  if (!item) {
    return null;
  }

  const candidates = [
    item.categories?.[0]?.name,
    item.familyTree?.department?.name,
    item.familyTree?.commodity?.name,
  ];

  return firstNonEmpty(candidates);
}

function firstNonEmpty(values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const sanitized = sanitizeString(value);
    if (sanitized) {
      return sanitized;
    }
  }
  return null;
}

function sanitizeString(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
