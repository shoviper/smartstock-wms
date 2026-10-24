# PROGRESS.md

> Update at the end of every round. A new chat reads this file to know where the project stands.

## Status

| Round | Scope | Status |
|---|---|---|
| 0 | Plan (no code) | Complete — plan approved |
| 1 | Foundation: seed data, central store, Login + Role, Layout, Light/Dark, deploy | In progress — Step 1 complete, awaiting review |
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
- Round 1 sequence: Step 1 app scaffold and Vercel rewrite; Step 2 domain/store/seed/persistence and Vitest tests; Step 3 Login/Role/layout/theme; Step 4 deployment verification. Stop after each requested review point; currently authorized only through Step 1.

## Store structure
- (fill in after Round 1: entities, actions, persistence key)

## How to run / test
- Install: `npm install`
- Development server: `npm run dev`
- Lint: `npm run lint`
- Type check + production build: `npm run build`
- Round 1 Step 1 checks: lint and build pass; local Vite server returned the SPA HTML. Domain tests are planned for Step 2.

## Deployed URL
- (fill in after first deploy)

## Known issues
- None yet

## Next step
- Await user review of Round 1 Step 1; do not start Step 2 until explicitly instructed.
