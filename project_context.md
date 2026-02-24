# Project Context — Grocery Deals Search (Local Store)

## Purpose
Build a Next.js app that pulls a JSON feed listing all sale/deal products for my local grocery store and provides a fast, friendly search/browse experience. The store’s official site/app search is poor; this tool is for personal use.

Core goals:
- Fetch the deals JSON reliably
- Normalize and index deal data
- Provide a high-quality search + filter UI
- Make it easy to spot the best deals quickly

## Hard Requirements (Do Not Change)
- Use **Next.js 16.x (latest 16 release)**. Do NOT downgrade to 15.
- Use **npm** only (no pnpm/yarn).
- Use **Node 20.x**.
- Use App Router (`src/app`).
- Keep the project simple, fast, and deterministic.
- Do not introduce large frameworks or major architectural shifts without explicit instruction.

## Data Source
The store has a page listing sale products. That page references a JSON file containing deal/product data.

The app should:
1) Fetch that JSON server-side
2) Cache it sensibly to avoid hammering the store
3) Parse it into a stable internal schema

Notes:
- The JSON structure may include nested objects like `item`, `inventory`, `locations`, `pricing`, `promotions`, etc.
- The JSON may change shape over time; parsing should be defensive and fail gracefully.
- We should not scrape HTML; we only consume the JSON feed.

## Functional Requirements
### Fetch + Cache
- Fetch the JSON from a configured URL (env var).
- Cache results on the server for a short period (e.g., 10–30 minutes) to keep UI fast and reduce requests.
- Return friendly errors if fetch fails.

### Search UX
User should be able to:
- Search by keyword (name/brand/description)
- Filter by common attributes (as available in JSON), e.g.:
  - price range
  - category/department
  - deal type (BOGO, % off, markdown)
  - in-stock availability for selected store location (if present)
- Sort results by:
  - best price
  - biggest discount (if discount info exists)
  - name
  - relevance to query

### Product/Deal Display
For each result show:
- product name + brand (if available)
- current deal price
- unit price (if available)
- discount label (e.g. “Save $X”, “Buy 1 Get 1”)
- availability (if available)
- store location (if location-specific)

### Performance
- Search should feel instant for typical deal list sizes.
- Prefer client-side filtering once the dataset is loaded, but do not ship massive payloads blindly:
  - If JSON is huge, consider server-side search endpoint with query params.
- Keep payloads minimal: send only fields needed by the UI.

## Architecture Plan (High Level)
### API Layer
- `GET /api/deals`:
  - fetch + cache raw JSON from source URL
  - normalize into internal schema
  - optionally accept `locationId` query param to pick inventory for a store

Optional:
- `GET /api/deals/search?q=...&filters=...` if dataset is too large to send to client.

### UI Pages
- `/`:
  - search input
  - filter controls
  - results list/grid with pagination or infinite scroll if needed
- Optional detail view:
  - `/item/[id]` to show a single product’s deal info and inventory details (only if beneficial)

### Normalization
Convert the raw JSON into an internal type that is stable and easy to search:
- `id` (store item id / SKU / stable key)
- `name`
- `brand`
- `description` (optional)
- `price` (deal price)
- `regularPrice` (if present)
- `unitPrice` (if present)
- `discountText` (human-friendly)
- `category` / `department` (if present)
- `inventory` (availability by location, if present)
- `imageUrl` (if present)
- `source` metadata (timestamp, location, etc.)

Normalization must be defensive:
- If fields are missing, set them to `null`/`undefined` and continue.
- Never crash the whole request due to a single malformed item.

## Configuration
Use environment variables for:
- `DEALS_JSON_URL` (required)
- `DEFAULT_LOCATION_ID` (optional)
- `CACHE_TTL_SECONDS` (optional)

Do not hardcode store URLs in code unless explicitly instructed.

## Non-Goals
- No user accounts/auth.
- No database initially.
- No scraping beyond the JSON feed.
- No paid APIs.
- No complex analytics.

## Quality Bar
- Works reliably even if the feed is temporarily unavailable
- Fast search UX
- Clear, useful deal presentation
- Minimal dependencies
