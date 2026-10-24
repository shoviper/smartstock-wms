# PROGRESS.md

> Update at the end of every round. A new chat reads this file to know where the project stands.

## Status

| Round | Scope | Status |
|---|---|---|
| 0 | Plan (no code) | Complete — plan approved |
| 1 | Foundation: seed data, central store, Login + Role, Layout, Light/Dark, deploy | In progress — Steps 1–2 complete, awaiting review |
| 2 | Inventory + Product Detail | Not started |
| 3 | Receiving, Orders & Picking, Stock Movements, Stock Adjustment | Not started |
| 4 | Dashboard + AI Insights | Not started |
| 5 | Reports, Users & Roles, Settings, mobile picking, polish | Not started |

## Decisions
- Tech stack: Vite + React + TypeScript; React Router for SPA navigation; React Context + `useReducer` for the central store; localStorage persistence; Vitest as a dev dependency for domain unit tests.
- Deploy target: Vercel static deployment with `vercel.json` SPA rewrite. User will create/connect the GitHub repository and configure Vercel.
- Git workflow: work directly on `main`; do not create a branch, commit, or push unless the user asks.
- Role home pages: Picker → Orders & Picking; Receiver → Receiving; Manager/Admin → Dashboard. Hide Dashboard from Picker/Receiver. Unauthorized route access redirects to that role's home page.
- Product reorder points remain per-product; Manager/Admin can edit them in Product Detail. Settings default reorder point applies only to future products; decide final Settings behavior in Round 5.
- Replenishment suggestion: `max(0, reorderPoint + averageDailyUse × leadTimeDays − onHand)`, rounded up to an integer; show the formula and values in the explanation.
- Location mock data includes capacity and distance/coordinates from the dispatch point for Location Recommendation and Picking Route.
- Reset demo data resets only products, orders, and movements; preserve session and theme. A zero-difference stock count creates no Movement and shows a “stock matches” message; count-event logging is Roadmap.
- Round 1 sequence: Step 1 app scaffold and Vercel rewrite; Step 2 domain/store/seed/persistence and Vitest tests; Step 3 Login/Role/layout/theme; Step 4 deployment verification. Stop after each requested review point; currently authorized through Step 2 only.
- Vitest pinned to 4.1.12 for Node compatibility and to use the patched release; latest `npm audit` reported zero vulnerabilities.

## Store structure
- `src/domain/models.ts`: Product, Location (capacity, coordinates, dispatch distance), Order/OrderLine, Movement, User and StoreState types.
- `src/data/seed.ts`: 40 products across 6 categories, 12 locations across 4 zones, 12 orders in four statuses, users and dated Movement history. Each SKU's history is continuous and its latest qtyAfter matches Product.onHand; initial statuses include at least 3 Out, 3 Critical and 3 Low products.
- `src/domain/stock.ts`: `receiveStock`, `pickItem`, `adjustStock` share `applyStockChange`; validation prevents invalid quantities, unknown SKU/location/user, SKU mismatch, unauthorized adjustments and negative stock. Equal-count adjustments create no Movement and return a matching-stock message.
- `src/domain/inventory.ts`: `getStockStatus` and `selectProductsByStatus` implement Out/Critical/Low/Normal thresholds.
- `src/store/StoreProvider.tsx`: Context + reducer exposes stock actions and Reset demo data. Reset replaces only products, orders and movements, preserving locations, users, session and theme.
- `src/store/persistence.ts`: versioned localStorage envelope, key `smartstock-wms-store`, version `1`; invalid or unsupported data falls back to seed. Feedback is transient and not persisted.

## How to run / test
- Install: `npm install`
- Development server: `npm run dev`
- Lint: `npm run lint`
- Type check + production build: `npm run build`
- Unit tests: `npm test` (Vitest; domain stock flows 1–5, invalid quantity/SKU, negative-stock guard, Picker/Receiver adjustment permissions, seed continuity/statuses, reset behavior and persistence versioning).
- Dependency audit: `npm audit` (last run: 0 vulnerabilities).
- Round 1 Step 2 checks: lint, build and all 13 tests pass.

## Deployed URL
- smartstock-wms.vercel.app

## Known issues
- None yet

## Next step
- Await user review of Round 1 Step 2; do not start Step 3 until explicitly instructed.
