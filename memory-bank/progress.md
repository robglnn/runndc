## Progress Log

### 2025-11-10 (CST)
- Created Memory Bank core documents outlining project scope, context, system patterns, technology stack, and active sprint focus.
- Documented FDA 2011 packaging overage allowances to inform overfill warnings (>12% threshold).
- Initialized SvelteKit + Tailwind foundation with Inter branding, `.env` scaffolding, and Vercel adapter.
- Implemented full `/api/calc` pipeline (RxNorm + FDA fetch, NDC normalization, SIG parsing, quantity calculator, warnings) with Function Health–style UI, demo scenarios, and structured JSON output.
- Added global error modal/store, synthetic demo presets, and Vitest + MSW test suite covering ndc utils, quantity logic, sig parser, and API route.
- Documented deployment instructions (GitHub → Vercel import, env var setup, production deploy) and updated README/Memory Bank.
- Pending: user to complete Vercel import + provide live URL, then run hosted smoke tests and capture demo assets.

