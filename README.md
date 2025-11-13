<div align="center">

# RUN NDC · NDC Packaging & Quantity Calculator

[![Vercel](https://vercelbadge.vercel.app/api/robglnn/runndc)](https://runndc.vercel.app/)

Match prescriptions to valid NDCs, compute dispense quantities, and surface FDA-aligned overfill warnings in a Function Health–inspired interface.

🔗 **Live Demo:** https://runndc.vercel.app/

</div>

---

## Stack & Requirements

- SvelteKit (TypeScript) + Tailwind CSS (Function Health palette)
- OpenAI API (fallback parsing + drug name suggestions)
- RxNorm REST API + FDA NDC Directory (openFDA)
- pnpm ≥ 8, Node.js ≥ 18

## Getting Started

```bash
pnpm install

# Copy and populate environment variables
cp .env.template .env
# add your OpenAI API key to .env

pnpm dev
```

The dev server runs at `http://localhost:5173`.

## Key Features

- Hero form with Function Health styling and demo auto-fill scenarios (including direct 11-digit NDC input).
- Server route `/api/calc` that:
  - normalizes 10/11-digit NDC inputs (Maryland rules, 5-4-2 display),
  - looks up RxCUI via RxNorm (with OpenAI fallback suggestion),
  - fetches FDA NDC packages and flags inactive entries,
  - cross-references a bundled openFDA NDC snapshot (base64+gzip) to guarantee lookups in serverless environments and to re-check inactivity when live data is incomplete,
  - parses SIG strings (regex-first, OpenAI fallback) and computes quantities,
  - applies FDA 2011 overage guidance, warning above 12% overfill,
  - returns structured JSON alongside UI cards and warnings.
- Deterministic AI fallback that still provides NDC guidance if OpenAI is unavailable by ranking the local index.
- Explicit inactive warning banner plus warning prioritization so expired codes are impossible to miss.
- Expanded package parser to handle aerosol/metered inhalers, device counts, and other complex descriptions surfaced from FDA data.
- Global error modal backed by Svelte store for graceful failure handling.
- Copy-ready JSON output for downstream claim/prescription systems.

## Scripts

```bash
pnpm dev        # run Vite dev server
pnpm build      # production build
pnpm preview    # preview production build
pnpm check      # SvelteKit sync + svelte-check
pnpm test       # Vitest suite (unit + mocked integration)
```

Vitest uses jsdom with MSW to mock RxNorm/FDA APIs and exercise the full `/api/calc` pipeline.

## Project Structure Highlights

```
src/
  lib/
    ndcUtils.ts      # normalization helpers + FDA overage guidance
    rxnorm.ts        # RxCUI lookup with OpenAI suggestion fallback
    fda.ts           # FDA NDC Directory fetch + packaging parsing
    sigParser.ts     # regex SIG parsing with OpenAI fallback
    quantity.ts      # pack selection, overfill calculation, warning assembly
    synthetics.ts    # demo scenarios surfaced in the hero
    stores.ts        # global error store
    components/ErrorModal.svelte
  routes/
    +page.svelte     # hero form, results UI, demo triggers
    api/calc/+server.ts
```

## Deployment Notes

- Adapter: `@sveltejs/adapter-vercel`
- Required env vars: `OPENAI_API_KEY` (set locally in `.env` and in Vercel project settings for Preview/Production)
- No persistent data storage; entirely API-driven.

## Testing Scenarios

Five primary demo scripts are baked into the UI (`Try demo` buttons):

1. Lasix 40 mg qd ×30  
2. Ibuprofen 200 mg BID ×30  
3. Metformin 500 mg TID ×90  
4. Albuterol inhaler PRN (PRN warning)  
5. Direct 11-digit NDC input (`50242-0040-62`)

Each scenario validates parsing, normalization, and overfill logic across common edge cases.

---

© 2025 Health Helper · RUN NDC v1.0
