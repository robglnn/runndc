## Progress Log

### 2025-11-10 (CST)
- Created Memory Bank core documents outlining project scope, context, system patterns, technology stack, and active sprint focus.
- Documented FDA 2011 packaging overage allowances to inform overfill warnings (>12% threshold).
- Initialized SvelteKit + Tailwind foundation with Inter branding, `.env` scaffolding, and Vercel adapter.
- Implemented full `/api/calc` pipeline (RxNorm + FDA fetch, NDC normalization, SIG parsing, quantity calculator, warnings) with Function Health–style UI, demo scenarios, and structured JSON output.
- Added global error modal/store, synthetic demo presets, and Vitest + MSW test suite covering ndc utils, quantity logic, sig parser, and API route.
- Documented deployment instructions (GitHub → Vercel import, env var setup, production deploy) and updated README/Memory Bank.
- Completed Vercel deployment with live URL + badge; README/tasks updated.
- Added FDA fallback to product NDC (including 4-4 variants), variant RxNorm search (e.g., inhalers), package table UI, warnings for non-standard units/inactive packages, and surfaced raw FDA packages when units are unsupported.
- Integrated local openFDA NDC index (135k records, compressed) with build script + AI-assisted fallback: when FDA lookups fail, we parse prescription text via OpenAI, score against the local dataset, let the model pick the best match, and surface rationale/confidence in the UI/warnings.
- Hardened external integrations: wrap RxNorm/FDA JSON parsing with diagnostics, add logging when local index missing, and catch OpenAI failures so `/api/calc` never returns 500 on bad upstream responses.
- Enabled deterministic fallback when OpenAI is unavailable: use local index token scoring to recommend NDCs and display rationale so production always returns guidance.
- Flag inactive NDCs by merging marketing-end dates from the local FDA snapshot; when live FDA lookups 404 or return only expired packages we now surface an explicit inactive warning (and mark packages as inactive in the UI).
- Pending: production smoke tests (5 scenarios + manual verification), screenshot collateral, and decision on manual package entry / supplemental FDA data.

