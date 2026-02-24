# Contributing / Codex Guardrails

This repo is intentionally constrained to prevent configuration drift and surprise behavior changes.

## Environment

- Node: **20.x**
- Package manager: **npm**
- Framework: **Next.js 16.x (latest 16 release)** — do NOT downgrade to 15

### Local Setup

```bash
nvm use
npm install
npm run dev
```

Dev server runs on: http://localhost:3001

## Do Not Modify (without explicit approval)

These files/settings are considered stable and should not be changed by default:

- `package.json` dependencies (do not add/remove/bump versions casually)
- `package-lock.json` (never hand-edit)
- `next.config.*`
- `tsconfig.json`
- ESLint configuration (`.eslintrc*`)
- Tailwind config / global styles setup (`tailwind.config.*`, `src/app/globals.css`)
- Node version constraints (`.nvmrc`, `engines` in package.json, `.npmrc`)
- Scripts in `package.json` (dev/build/start/lint/typecheck)

If a change is needed, explain:

1. Why it’s needed
2. What alternatives were considered
3. The minimal diff required

## Allowed / Preferred Changes

- UI and components:
  - `src/app/**`
  - `src/components/**`
- Shared logic:
  - `src/lib/**`
  - `src/types/**`
- API routes:
  - `src/app/api/**`

## Dependency Policy

- Avoid new dependencies unless they provide clear value.
- Prefer built-in platform/Next capabilities first.
- If adding a dependency, it must be:
  - widely used and actively maintained
  - small and purpose-specific
  - justified in the PR/commit message

## Code Style

- TypeScript only
- Functional React components
- App Router conventions
- Server Components by default; mark `"use client"` only when needed
- Keep parsing/normalization/search logic testable:
  - parsing/normalization in `src/lib/normalizeDeals.ts`
  - search/filter helpers in `src/lib/searchDeals.ts`
  - types in `src/types/deals.ts`

## Data Safety / Reliability Notes

- The deals feed is external and may change shape; parsing must be defensive.
- Fetch the JSON server-side only.
- Cache results to avoid excessive requests to the store.
- Do not log the full raw JSON in production logs.

## What Codex Should Do

When asked to implement features:

- Make focused changes limited to the allowed directories.
- Do not change tooling/config unless explicitly directed.
- Prefer small commits with clear purpose.
- Provide exact file paths and minimal diffs.

## What Codex Should NOT Do

- Do not downgrade Next.
- Do not swap npm for pnpm/yarn.
- Do not introduce heavy state management libraries unless requested.
- Do not reorganize the project structure without permission.
