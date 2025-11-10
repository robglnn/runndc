## System Patterns

### Architecture
- **Frontend:** SvelteKit (TypeScript) with Tailwind CSS, routed UI (`+page.svelte`, `+layout.svelte`), and Function Health-inspired styling.
- **Backend/API:** SvelteKit server routes (`src/routes/api/calc/+server.ts`) orchestrating RxNorm and FDA API calls plus SIG parsing and quantity logic.
- **Libraries:** `openai` for fallback prompts, Vitest + MSW for tests, `@sveltejs/adapter-vercel` for deployment.
- **Utilities:** Dedicated `src/lib` modules for RxNorm (`rxnorm.ts`), FDA (`fda.ts`), SIG parsing (`sigParser.ts`), quantity calculation (`quantity.ts`), and NDC formatting (`ndcUtils.ts`).

### Data Flow
1. User submits drug/NDC, SIG, days’ supply from hero form.
2. API normalizes NDC input to 11-digit format (Maryland rules); optionally resolves RxCUI.
3. FDA NDC Directory fetch returns package data; system flags inactive entries.
4. SIG parser extracts dose/frequency; quantity calculator matches packages against FDA overage guidance (warn at >12% overfill).
5. Response surfaces recommended NDC(s), totals, warnings, and copyable JSON payload.

### UI Patterns
- Hero section with CTA, card-based form, responsive layout (Inter font, beige/orange palette).
- Results section with cards for totals, recommended NDCs, warnings, and JSON block.
- Global error modal fed by a Svelte store; inline warnings for validation issues.
- Demo buttons to auto-fill five synthetic scenarios (including numeric NDC input).

### Operational Practices
- Environment configs via `.env` / `.env.template`; `.cursorignore` and `.gitignore` guard secrets and build artifacts.
- Deploy via Vercel with production and preview environment variables (OpenAI key).
- Overfill handling uses FDA 2011 guidance per unit ranges; warnings trigger beyond 12% threshold.

