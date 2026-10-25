# SmartStock WMS (Demo)

SmartStock WMS is a front-end prototype of a single-warehouse WMS for showing how inventory, receiving, picking, stock movements, role-based access and explainable AI-style insights could work together. All operational records are mock data held in a browser-side store and localStorage; there is no backend or database. The AI content is produced by explainable rules over this simulated data, not by a trained model, and no accuracy claim is made.

## Production demo

[smartstock-wms.vercel.app](https://smartstock-wms.vercel.app)

The demo accepts any username/password and lets you choose a role. Before presenting, click **Reset demo data** in the Manager/Admin profile menu and confirm. Do this especially if the browser has been used for earlier experiments: the app persists demo changes in that browser's localStorage. Reset restores the seeded products, locations, orders and movements while preserving the current session, theme and default reorder point.

## Run locally

Requirements: Node.js and npm compatible with the versions used by the project.

```sh
npm install
npm run dev
```

Other project commands:

```sh
npm run lint       # ESLint
npm run build      # TypeScript project check, then Vite production build
npm test           # Vitest unit/store tests
npm run preview    # Serve the last production build locally
```

## Demo roles

There are no provisioned login accounts or real credentials. Enter any values (or leave them blank) and select one of these roles on the Login screen:

| Role | Demo entry point | Main access |
|---|---|---|
| Manager | Dashboard | Warehouse views, receiving, picking, adjustments, insights, reports and settings |
| Picker | Orders & Picking | Picking and read-only Inventory |
| Receiver | Receiving | Receiving and read-only Inventory |
| Admin | Dashboard | All prototype menus, including Users & Roles |

User names shown in Movement records come from the role-linked sample users, not necessarily the username typed at Login. Users & Roles is read-only; it does not create accounts, set Active status or connect to organizational SSO.

## Assumptions

- One simulated warehouse with about 40 seeded SKUs, four zones and sample orders/movements.
- Real operation is assumed to involve more SKUs and warehouse staff than the prototype contains.
- Product barcodes are not scanned; SKU and location checks are simulated with typed input or the **Simulate scan** control.
- Picking changes on-hand when the pick is confirmed; there is no stock reservation.
- Reorder point default is a setting intended for future products. The prototype currently has no add-product feature, so it does not apply to a newly created product yet.
- Locations, capacity, activity and walking distances are simulated; validate them against a real warehouse before operational use.

## Prototype limitations

- All users, products, orders, locations and movements are sample data persisted in the browser. There is no backend, shared database, real authentication, organization SSO, or cross-device synchronization.
- Insights are explainable rules calculated from simulated data. They are not trained AI/ML models and have no measured accuracy. Managers must review the source data and recommendations themselves.
- Location recommendations are informational only. They do not move products or create TRANSFER movements, and the recommendation is not embedded in Receiving.
- Dashboard's 14-day Movement chart links to a Stock Movements view filtered to 30 days.
- Inventory currently displays all 40 seeded products without pagination. This is not a production-scale inventory view.
- The warehouse route distance is calculated from simulated coordinates; it is not a real walking distance.
- Reset restores products, locations, orders and movements while preserving the session, theme and Settings.

## Roadmap

- Add Inventory pagination or virtual scrolling before using production-sized catalogues.
- Link Movement actors to the authenticated session identity instead of the sample user assigned to each role.
- Reassess the proposed Level 1 location for Copy paper (SKU-021) together with the existing aisle-03 route-geometry invariant and tests before changing seed data.
- Add real backend/database, authentication/SSO, multi-warehouse support, barcode scanning, ERP integration, supplier/purchase-order workflows, stock reservation, lot/serial and FIFO/FEFO tracking only as separately scoped future work.
- Provide a real add-product workflow before the Settings default reorder point can affect newly created products.

## Five-minute demo script

Use the Production link or a local `npm run dev` session. Start with a clean seed. Approximate timings add up to about five minutes; the app's due dates and Bangkok-local movement timestamps depend on the current date/time.

1. **Reset demo data — 20 sec (Manager).** Sign in with any credentials as Manager. Open the profile menu → **Reset demo data** → confirm. Expected seed baseline: 40 SKUs; 9 items needing attention (3 Out, 3 Critical, 3 Low); 4 Pending and 4 In Progress orders; 12 picked units today in the Bangkok calendar day.
2. **Dashboard — 15 sec (Manager).** Point out the derived KPI cards, stock/order status and recent activity. These are values from the current demo store, not measured operational results.
3. **Inventory and Product Detail — 25 sec (Manager).** Open Inventory → **SKU-007 Wireless mouse**. Seed values: 8 on hand, reorder point 10, Low status, location `B-01-02-1`, capacity 100. This location has room for a +20 receipt (8 + 20 is below capacity).
4. **Receive +20 — 30 sec (Manager).** Open **Receive stock** from the product detail, enter 20 and submit. Expected: receipt saved; SKU-007 becomes 28 on hand and Normal; a RECEIVE `+20` movement appears. On the dashboard the attention count falls from 9 to 8 (Low count from 3 to 2).
5. **Switch to Picker and open an order — 25 sec.** Log out, sign in with any credentials as Picker, then open **ORD-2026-0001 · Northstar Retail**. Select **Start Picking**. Its first sorted line is **SKU-033 Pallet wrap**, location `A-02-04-3`, required quantity 2; the order has four lines and eight units total.
6. **Wrong SKU, then pick correctly — 55 sec (Picker).** On the first line choose **Confirm pick**. Enter location `A-02-04-3` and wrong SKU `SKU-999`: the page shows “SKU does not match this line.” and disables confirmation. Use **Simulate scan** to fill the correct line values, then confirm. Expected: SKU-033 is picked by 2, on-hand changes 55 → 53, and the order remains In Progress with 2 of 8 units picked.
7. **Switch back to Manager and inspect Movements — 25 sec.** Log out and sign in as Manager. Open Stock Movements and search `SKU-033`: the filtered view contains the new PICK `-2` for `ORD-2026-0001` and the seed RECEIVE `+55`. Search `SKU-007` to see the RECEIVE `+20`.
8. **Dashboard and AI Insights — 65 sec (Manager).** Dashboard now shows 8 attention items, 3 Pending / 5 In Progress, and 14 picked units today (the KPI for orders completed today remains 0). Open AI Insights and point out all four sections: (a) Stockout Prediction still lists stocked-out examples such as SKU-002/SKU-003 and SKU-007 is no longer Low; (b) Manager Summary reports current issues and links; (c) Picking Route on ORD-2026-0001 displays the saved route at 166 m and suggested route at 126 m, both based on simulated coordinates; (d) Storage Location Recommendation shows candidate locations and reasons. Each AI section is labeled **Simulated data — concept only**.
9. **Restore the clean seed — 20 sec (Manager).** Open the profile menu, reset and confirm. Verify the baseline returns (attention 9; orders 4 Pending / 4 In Progress; 12 picked units today). This leaves the browser ready for the next demonstration.

The browser walkthrough was performed against the Production URL on 25 Oct 2026. The values above were observed during that run; do not present simulated route distances or stock indicators as actual warehouse outcomes.

## Related documents

- [Requirements and implementation-status audit](REQUIREMENTS.md)
- [Suggested slide screenshots](SCREENSHOT_LIST.md)
- [Round status and test notes](PROGRESS.md)
- [Manual QA checklist](QA_CHECKLIST.md)
