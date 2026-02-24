const KROGER_API_BASE_URL = "https://api.kroger.com/v1";
const OAUTH_TOKEN_PATH = "/connect/oauth2/token";
const DEFAULT_SCOPE = "product.compact";
const TOKEN_SKEW_MS = 30_000; // refresh token 30s before expiry
const DEFAULT_PRODUCT_LIMIT = 5;
const MAX_PRODUCT_LIMIT = 50;
const DEFAULT_LOCATION_LIMIT = 10;
const MAX_LOCATION_LIMIT = 50;
const DEFAULT_LOCATION_RADIUS_MILES = 15;

export type KrogerTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
};

export type KrogerProductImage = {
  perspective: string;
  size: string;
  url: string;
};

export type KrogerProductFulfillment = {
  fulfillmentType: string;
  price?: number;
  regularPrice?: number;
  inventory?: {
    available?: number;
  };
};

export type KrogerProductItem = {
  itemId: string;
  size?: string;
  soldBy?: string;
  price?: number;
  regularPrice?: number;
  promoDescription?: string;
  fulfillment?: KrogerProductFulfillment[];
};

export type KrogerProduct = {
  productId: string;
  description?: string;
  upc?: string;
  upcType?: string;
  brand?: string;
  size?: string;
  categories?: string[];
  items?: KrogerProductItem[];
  images?: KrogerProductImage[];
  [key: string]: unknown;
};

export type KrogerProductSearchResponse = {
  data: KrogerProduct[];
  meta?: {
    pagination?: {
      limit: number;
      offset: number;
      total: number;
    };
    [key: string]: unknown;
  };
};

export type KrogerProductSearchParams = {
  term: string;
  locationId?: string;
  limit?: number;
  start?: number;
  category?: string;
  department?: string;
  brand?: string;
  fulfillment?: string;
};

export type KrogerLocationAddress = {
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  zipCode?: string;
};

export type KrogerLocation = {
  locationId: string;
  name?: string;
  chain?: string;
  address?: KrogerLocationAddress;
  phone?: string;
  departments?: { departmentId: string; name: string }[];
  fulfillmentTypes?: string[];
  geolocation?: {
    latitude?: number;
    longitude?: number;
  };
  hours?: Record<string, unknown>;
  [key: string]: unknown;
};

export type KrogerLocationSearchResponse = {
  data: KrogerLocation[];
  meta?: {
    pagination?: {
      limit: number;
      offset: number;
      total: number;
    };
    [key: string]: unknown;
  };
};

export type KrogerLocationSearchParams = {
  zipCode: string;
  radiusInMiles?: number;
  limit?: number;
};

type CachedToken = {
  value: string;
  expiresAt: number;
};

let tokenCache: CachedToken | null = null;

export async function getKrogerAccessToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh && tokenCache && tokenCache.expiresAt > Date.now()) {
    return tokenCache.value;
  }

  const response = await requestToken();
  const expiresInMs = Math.max(0, Number(response.expires_in) * 1000 - TOKEN_SKEW_MS);

  tokenCache = {
    value: response.access_token,
    expiresAt: Date.now() + expiresInMs,
  };

  return tokenCache.value;
}

export async function searchKrogerProducts(
  params: KrogerProductSearchParams,
): Promise<KrogerProductSearchResponse> {
  if (!params.term || params.term.trim().length === 0) {
    throw new Error("A search term is required to query the Kroger API");
  }

  const url = new URL(`${KROGER_API_BASE_URL}/products`);
  url.searchParams.set("filter.term", params.term.trim());

  const limit = clampProductLimit(params.limit ?? DEFAULT_PRODUCT_LIMIT);
  url.searchParams.set("filter.limit", String(limit));

  if (typeof params.start === "number" && Number.isFinite(params.start)) {
    const clamped = clampStart(params.start);
    url.searchParams.set("filter.start", String(clamped));
  }

  if (params.locationId) {
    url.searchParams.set("filter.locationId", params.locationId.trim());
  }

  if (params.category) {
    url.searchParams.set("filter.category", params.category.trim());
  }

  if (params.department) {
    url.searchParams.set("filter.department", params.department.trim());
  }

  if (params.brand) {
    url.searchParams.set("filter.brand", params.brand.trim());
  }

  if (params.fulfillment) {
    url.searchParams.set("filter.fulfillment", params.fulfillment.trim());
  }

  return krogerFetch<KrogerProductSearchResponse>(url);
}

export async function searchKrogerLocations(
  params: KrogerLocationSearchParams,
): Promise<KrogerLocationSearchResponse> {
  if (!params.zipCode || params.zipCode.trim().length === 0) {
    throw new Error("A postal/ZIP code is required to search Kroger locations");
  }

  const url = new URL(`${KROGER_API_BASE_URL}/locations`);
  url.searchParams.set("filter.zipCode.near", params.zipCode.trim());

  const limit = clampLocationLimit(params.limit ?? DEFAULT_LOCATION_LIMIT);
  url.searchParams.set("filter.limit", String(limit));

  const radius = clampLocationRadius(params.radiusInMiles ?? DEFAULT_LOCATION_RADIUS_MILES);
  url.searchParams.set("filter.radiusInMiles", String(radius));

  return krogerFetch<KrogerLocationSearchResponse>(url);
}

async function requestToken(): Promise<KrogerTokenResponse> {
  const clientId = process.env.KROGER_CLIENT_ID?.trim();
  const clientSecret = process.env.KROGER_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    throw new Error(
      "Missing Kroger API credentials. Set KROGER_CLIENT_ID and KROGER_CLIENT_SECRET in your environment.",
    );
  }

  const tokenUrl = `${KROGER_API_BASE_URL}${OAUTH_TOKEN_PATH}`;
  const scopes = getScopes();

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    scope: scopes,
  });

  const headers = new Headers();
  headers.set("Content-Type", "application/x-www-form-urlencoded");
  headers.set("Authorization", `Basic ${toBasicAuth(clientId, clientSecret)}`);

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers,
    body,
    cache: "no-store",
  });

  if (!response.ok) {
    const errorBody = await safeReadText(response);
    throw new Error(
      `Kroger OAuth request failed (${response.status} ${response.statusText}): ${errorBody}`,
    );
  }

  return (await response.json()) as KrogerTokenResponse;
}

async function krogerFetch<T>(url: URL): Promise<T> {
  const token = await getKrogerAccessToken();
  const headers = new Headers();
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Accept", "application/json");

  const response = await fetch(url, {
    headers,
    cache: "no-store",
  });

  if (!response.ok) {
    const errorBody = await safeReadText(response);
    throw new Error(
      `Kroger API request failed (${response.status} ${response.statusText}): ${errorBody}`,
    );
  }

  return (await response.json()) as T;
}

function getScopes(): string {
  const configured = process.env.KROGER_SCOPES?.trim();
  if (configured && configured.length > 0) {
    return configured;
  }

  return DEFAULT_SCOPE;
}

function clampProductLimit(limit: number): number {
  if (!Number.isFinite(limit)) {
    return DEFAULT_PRODUCT_LIMIT;
  }

  return Math.min(Math.max(1, Math.floor(limit)), MAX_PRODUCT_LIMIT);
}

function clampStart(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }

  const normalized = Math.floor(value);
  return Math.min(Math.max(1, normalized), 250);
}

function clampLocationLimit(limit: number): number {
  if (!Number.isFinite(limit)) {
    return DEFAULT_LOCATION_LIMIT;
  }

  return Math.min(Math.max(1, Math.floor(limit)), MAX_LOCATION_LIMIT);
}

function clampLocationRadius(radius: number): number {
  if (!Number.isFinite(radius)) {
    return DEFAULT_LOCATION_RADIUS_MILES;
  }

  return Math.min(Math.max(1, Math.floor(radius)), 100);
}

function toBasicAuth(clientId: string, clientSecret: string): string {
  return Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
}

async function safeReadText(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text.slice(0, 500);
  } catch (error) {
    return `Failed to read response body: ${error instanceof Error ? error.message : error}`;
  }
}
