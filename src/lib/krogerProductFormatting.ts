import type { KrogerProductItem } from "@/lib/krogerClient";

export function selectPrimaryItem(items: KrogerProductItem[] | undefined): KrogerProductItem | undefined {
  if (!Array.isArray(items) || items.length === 0) {
    return undefined;
  }

  const inStore = items.find((item) => {
    const fulfillment = item.fulfillment;
    if (!Array.isArray(fulfillment)) {
      return false;
    }
    return fulfillment.some((entry) => entry?.fulfillmentType?.toLowerCase() === "in_store");
  });

  return inStore ?? items[0];
}

export function summarizePricing(item: KrogerProductItem | undefined): string {
  if (!item) {
    return "no item-level pricing data";
  }

  const priceRecord = item.price as Record<string, unknown> | undefined;
  const regular = toNumber(priceRecord?.regular ?? priceRecord?.regularPrice ?? item.regularPrice);
  const promo = toNumber(priceRecord?.promo ?? priceRecord?.promoPrice ?? priceRecord?.sale ?? item.price);
  const promoDescription = firstString(
    (priceRecord as { promoDescription?: string })?.promoDescription,
    item.promoDescription,
  );

  const parts: string[] = [];
  if (regular != null) {
    parts.push(`regular $${regular.toFixed(2)}`);
  }
  if (promo != null) {
    parts.push(`promo $${promo.toFixed(2)}`);
  }
  if (promoDescription) {
    parts.push(`promo text: ${promoDescription}`);
  }

  return parts.length > 0 ? parts.join(" | ") : "pricing fields not present";
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

function firstString(...values: Array<unknown>): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}
