# PROGRESS.md

> Update at the end of every round. A new chat reads this file to know where the project stands.

## Status

| Round | Scope | Status |
|---|---|---|
| 0 | Plan (no code) | Complete — plan approved |
| 1 | Foundation: seed data, central store, Login + Role, Layout, Light/Dark, deploy | In progress — Steps 1–3 complete, awaiting review |
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
- Location seed uses 40 unique, explicit SKU-to-location assignments across four zones, with capacity and dispatch coordinates/distance. High-activity SKUs are close to dispatch on Levels 1–2; products in a category stay within one zone or two adjacent zones.
- Reset demo data resets only products, orders, and movements; preserve session and theme. A zero-difference stock count creates no Movement and shows a “stock matches” message; count-event logging is Roadmap.
- Round 1 sequence: Step 1 app scaffold and Vercel rewrite; Step 2 domain/store/seed/persistence and Vitest tests; Step 3 Login/Role/layout/theme; Step 4 deployment verification. Stop after each requested review point; currently authorized through Step 3 only.
- Demo login accepts any or blank credentials; a blank username becomes `Demo <Role>`. Session (user + role) and theme persist through the versioned store. Role menus, home routes and access checks live in pure functions in `src/domain/access.ts`.
- Each seed product now declares explicit category and unit values. Loading existing persisted products refreshes only category/unit from the seed while preserving quantities, reorder points and movements. Stock alerts are ordered Out → Critical → Low, then by SKU.
- Vitest pinned to 4.1.12 for Node compatibility and to use the patched release; latest `npm audit` reported zero vulnerabilities.

## Store structure
- `src/domain/models.ts`: Product, Location (capacity, coordinates, dispatch distance), Order/OrderLine, Movement, User and StoreState types.
- `src/data/seed.ts`: 40 products across 6 categories with explicit per-product category, unit and unique location assignment; 40 unique locations across 4 zones with varied aisles/racks/levels, capacity and dispatch coordinates/distance; 12 orders in four statuses; users and dated Movement history. Each SKU's history is continuous, every Movement uses that SKU's location, and its latest qtyAfter matches Product.onHand; initial statuses include 3 Out, 3 Critical, 3 Low and 31 Normal products.
- `src/domain/stock.ts`: `receiveStock`, `pickItem`, `adjustStock` share `applyStockChange`; validation prevents invalid quantities, unknown SKU/location/user, SKU mismatch, unauthorized adjustments and negative stock. Equal-count adjustments create no Movement and return a matching-stock message.
- `src/domain/inventory.ts`: `getStockStatus` and `selectProductsByStatus` implement Out/Critical/Low/Normal thresholds.
- `src/store/StoreProvider.tsx`: Context + reducer exposes stock actions, Login/Log Out, theme actions and Reset demo data. Reset replaces only products, orders and movements, preserving locations, users, session and theme.
- `src/store/persistence.ts`: versioned localStorage envelope, key `smartstock-wms-store`, version `1`; persists current session and theme, accepts previous v1 data without a session, refreshes seeded products' categories/units/location IDs, Location records and Movement location IDs from seed while preserving onHand, reorder points, Movement quantity/type/timestamp fields, session and theme; falls back to seed for invalid/unsupported data. Feedback is transient and not persisted.
- `src/domain/access.ts`: pure role-to-menu, role-to-home, route access/redirect and Demo Access session functions, covered by `src/domain/access.test.ts`.
- `src/components/`: Login card, Sidebar/drawer, Topbar and shared brand. Other route content remains the existing placeholder.

## How to run / test
- Install: `npm install`
- Development server: `npm run dev`
- Lint: `npm run lint`
- Type check + production build: `npm run build`
- Unit tests: `npm test` (Vitest; stock flows, seed categories/location assignment/capacity/Movement locations/zone grouping/fast-pick placement/history, persistence migration/reset and Role menu/home/route access).
- Dependency audit: `npm audit` (last run: 0 vulnerabilities).
- Round 1 Step 3 checks: lint and build pass; all 31 tests pass. Browser checks: blank Picker/Receiver login and correct landing pages; forbidden route redirects; session/theme survive refresh; alert badge/list derive from stock selectors; Log Out returns to `/login`.

## Deployed URL
- smartstock-wms.vercel.app

## Known issues
- Demo dispatch coordinates model a simple straight-through warehouse path; validate distances and walking paths against a real warehouse layout before operational use.

## Next step
- Await user review of Round 1 Step 3; do not start Step 4 until explicitly instructed.
