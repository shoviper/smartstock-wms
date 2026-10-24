# AGENTS.md

## Project
SmartStock WMS (Demo): a front-end prototype of a Warehouse Management System with AI-insight concepts, built for a Business Analyst assignment. Mock data only, no real backend. The goal is clear business logic and consistent data across screens, not visual perfection.

## Read first, every session
1. `REQUIREMENTS.md` — source of truth for scope, screens, business rules, test flows.
2. `PROGRESS.md` — what is done, current store structure, known issues, what to do next.

If code and REQUIREMENTS.md disagree, stop and ask instead of guessing.

## How to work
- Work only on the round/scope the user names. Do not touch other screens or add features outside the scope.
- Before coding in a new round, propose a short plan and wait for approval.
- Make small, reviewable changes. Keep the build green at all times.
- Ask before adding any new production dependency, and explain why.
- Do NOT run `git commit` or `git push` unless the user asks. The user commits after reviewing the diff.
- Run lint, type check and build (and tests if present) before saying a task is done. Report the real result, including failures.
- At the end of each round, update `PROGRESS.md` (done, store structure changes, how to test, known issues, next step).
- Reply to the user in Thai. Code, identifiers, file names and commit-style messages stay in English.

## Architecture rules (non-negotiable)
- **One central store** is the single source of truth. Every page reads from it. No page keeps its own copy of products, orders or movements.
- **Stock quantity changes only through store actions** (`receiveStock`, `pickItem`, `adjustStock`). No component edits `onHand` directly.
- **Every stock change creates a Movement** (type, sku, qty +/-, before, after, location, user, reference, reason). Movement history must be continuous per SKU.
- On-hand never goes negative. Block the action and show a clear message.
- Dashboard numbers, alerts and AI Insights are **derived from the store**. Never hardcode them.
- Seed/mock data lives in one place (e.g. `data/seed.*`). Persist the store to localStorage; provide a "Reset demo data" action.
- Keep business logic (status rules, prediction rules, route ordering) in plain, testable functions separate from UI components.
- Stock status rules and thresholds follow REQUIREMENTS.md section 8.

## UI rules
- Follow the layout spec in REQUIREMENTS.md section 6.12 (Login card, Sidebar + Topbar, notification bell, profile, Light/Dark, Log Out).
- Menu items depend on the logged-in Role (REQUIREMENTS.md section 4).
- Blue/white base. Use red/yellow/green only for status, and always pair color with a text label.
- Orders & Picking must work well on a phone (large tap targets).
- Provide empty, loading and error states. Make every table searchable/filterable where specified.
- Do not copy the sample logo or any real company name. Use the placeholder name "SmartStock WMS".

## AI Insights rules
- AI is a concept using simple, explainable rules on mock data. Do not claim accuracy or call it a trained model.
- Every recommendation shows its reason, the data it used, and the suggested next action.
- Label AI content "Simulated data — concept only". Never invent result percentages.

## Definition of done (per round)
- Meets the acceptance criteria in REQUIREMENTS.md for the round's screens.
- Relevant Critical Test Flows (REQUIREMENTS.md section 11) pass.
- Build passes; the app runs locally; PROGRESS.md updated.
