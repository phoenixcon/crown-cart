This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

## Kroger prefix crawl sample

Capture a small alphabetic sample to gauge API volume:

1. Ensure `.env.local` has `KROGER_CLIENT_ID`, `KROGER_CLIENT_SECRET`, and `KROGER_LOCATION_ID`.
2. Run `npm run kroger:crawl-sample`.
3. Watch the console for per-prefix stats; a JSON report is saved to `reports/` for later analysis.

## Dairy department grid crawl

Run `npm run kroger:crawl-dairy` to sweep the Dairy department across a keyword grid. The script deduplicates sale products, prints per-keyword API call counts, and saves the merged dataset to `reports/dairy-grid-*.json` for further analysis.

To narrow the crawl to specific keywords (for example, a single "oat milk" search), pass them via CLI or environment:

```bash
npm run kroger:crawl-dairy -- --keywords "oat milk"
# or set once for multiple runs
DAIRY_KEYWORDS="oat milk, lactose free" npm run kroger:crawl-dairy
```

## Ad hoc keyword search

Use `npm run kroger:search -- --term "keyword"` for a quick look at what Kroger returns for a single keyword at your configured store (defaults to `KROGER_LOCATION_ID`). Optional flags let you override the location, limit, pagination start, department, or brand, print the raw JSON inline (`--json`), or write the response to `reports/latest-keyword-search.json` for inspection in your editor (`--save`).

## Search page harvest

If the public API filters out products, fall back to the storefront HTML and let the script bridge to the API for you. Run `npm run kroger:harvest-search` to:

1. Launch Playwright, log into your configured search page (`DEALS_SEARCH_URL`), and collect every `/p/…/<productId>` link rendered on the page.
2. Deduplicate the embedded product IDs (typically UPCs) and look each one up via the official Kroger API at your configured store (`KROGER_LOCATION_ID`).
3. Print a match summary and (optionally) persist the combined HTML/API dataset to `reports/latest-search-harvest.json` (enable with `--save` or pass a custom `--output` path).

Useful flags:

- `--max 40` limits how many IDs to resolve (defaults to all that were harvested)
- `--concurrency 6` tunes how many API lookups run in parallel (defaults to 4, max 8)
- `--url <searchUrl>` and `--location <id>` override the environment defaults per run
- `--allow-unauth` skips the saved-session check (only use if the page renders without cookies)

Example: `npm run kroger:harvest-search -- --max 50 --save`

> :information_source: Tip — the search pages often refuse to render products unless you are logged in and have a preferred store selected. Run `npm run capture:state`, complete the sign-in + store-selection flow in the launched browser, and rerun the harvest script; it will reuse the saved storage state at `kroger-storage-state.json`. Set `HEADLESS_STORAGE_STATE` if you need to store it elsewhere.

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
