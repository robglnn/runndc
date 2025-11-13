# RUN NDC MVP Tasks – EOD Sprint (Nov 10, 2025) – v1.3  
**Single Source of Truth – Export Ready**  
**Repo:** https://github.com/robglnn/runndc  
**Live URL:** https://runndc.vercel.app/  
**Goal:** Fully functional, beautiful, accurate NDC calculator live on Vercel by 11:59 PM CST  
**Stack:** SvelteKit + TypeScript + Tailwind CSS + OpenAI + Vercel  
**UI Target:** 95% visual match to https://www.functionhealth.com/ (beige/orange, cards, Inter font, generous whitespace)  
**Validation:** 5 synthetic RX scenarios + manual cross-check with https://www.aapc.com/codes/ndc-lookup/  
**Overfill Tolerance:** Industry standard 10-15% → we warn at >12%  
**NDC Handling:** Support 11-digit display (5-4-2 formatted) + input normalization (pad/insert zero per MD Health PDF rules)  

---

## Epic 1: Repo & Infra Setup (Est: 45-60 min | BLOCKER)  
**Owner:** @robglnn  

### Story 1.1: Initialize SvelteKit + TypeScript + Tailwind  
- [x] `npx sv create sveltekit-temp --template demo --types ts --no-add-ons --install pnpm` *(final project moved to repo root)*  
- [x] `pnpm i`  
- [x] `pnpm i -D tailwindcss postcss autoprefixer @tailwindcss/typography`  
- [x] `npx tailwindcss init -p`  
- [x] Replace `tailwind.config.js` with Function Health palette:  
  ```js
  /** @type {import('tailwindcss').Config} */
  module.exports = {
    content: ['./src/**/*.{html,js,svelte,ts}'],
    theme: {
      extend: {
        colors: {
          amber: { 50: '#fffbeb', 100: '#fef3c7', 500: '#f59e0b', 600: '#d97706' },
          neutral: { 800: '#1f2937', 900: '#111827' }
        },
        fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] }
      }
    },
    plugins: [require('@tailwindcss/typography')]
  }

- [x] Add Inter font to `src/app.html`  
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
- [x] Create `src/app.css` with Tailwind directives  
@tailwind components;
@tailwind utilities;
- [x] Update `src/routes/+layout.svelte` to import global styles and wrap layout  
  import '../app.css';
</script>
<main class="min-h-screen bg-amber-50 text-neutral-900">
  <slot />
</main>
- [x] `pnpm i openai vitest @vitest/ui msw @sveltejs/adapter-vercel`
- [x] Replace adapter in `svelte.config.js` with `@sveltejs/adapter-vercel`
export default { kit: { adapter: adapter() } };
- [x] Create `.env`, `.env.template`, `.env.example`
- [x] Create `.gitignore` with env/build ignores
.vercel
node_modules
build

### Story 1.2: Local Dev & Vercel Deploy

- [x] `pnpm dev` → confirm `http://localhost:5173` loads
- [x] `git init && git add . && git commit -m "chore: init skeleton"` *(superseded by final repo history)*
- [x] Push to GitHub main (protect branch)
- [ ] `vercel login && vercel link` *(skipped; used GitHub import flow instead)*
- [x] Add `OPENAI_API_KEY` in Vercel dashboard → Production + Preview
- [x] First production deploy via Vercel (GitHub import) → README updated with live URL


## Epic 2: Core Functionality (Est: 3.5 hrs | P0 Must-Have)
- [x] Story 2.1: Hero + Input Form (Function Health style)
Branch: feat/hero-form

 Replace src/routes/+page.svelte with full hero
H1: "NDC Packaging & Quantity Calculator"
Sub: "Match any prescription to valid NDCs and calculate exact dispense quantity"
Orange CTA button "Calculate" (bg-amber-600 hover:bg-amber-700)

 Form card (bg-white shadow-xl rounded-2xl p-8)
Drug name or NDC (text, placeholder "Ibuprofen 200 mg or 12345-6789-01")
SIG (textarea, rows=3, placeholder "1 tablet by mouth twice daily")
Days supply (number, min=1, default=30)
Submit button with loading spinner

 Form POST → /api/calc
 On success → scroll to #results

- [x] Story 2.2: API Route & Types
Branch: feat/api-calc

 Create src/routes/api/calc/+server.ts
 Define types:tsinterface CalcRequest { drug: string; sig: string; days: number; }
interface NdcPackage { ndc: string; formattedNdc: string; size: number; inactive: boolean; description: string; }
interface CalcResult {
  ndcs: NdcPackage[];
  totalQty: number;
  dispensedQty: number;
  overfillPct: number;
  warnings: string[];
  json: string;
}
New: NDC Normalization – If input drug is numeric (10/11 digits), normalize to 11-digit via normalizeNdc(drug)
 Return { success: true, data: CalcResult } or { success: false, error: string }

- [x] Story 2.3: RxNorm Normalization
Branch: feat/rxnorm

 Create src/lib/rxnorm.tstsasync function getRxCUI(drug: string): Promise<string | null>
Endpoint: https://rxnav.nlm.nih.gov/REST/rxcui.json?name=${encodeURIComponent(drug)}
Prefer tty === "IN"

 No match → OpenAI suggestion prompt → retry once
 In-memory cache const cache = new Map<string,string>()
 If normalized 11-digit NDC provided → skip RxNorm, use directly for FDA fetch

- [x] Story 2.4: FDA NDC Directory Fetch
Branch: feat/fda-ndc

 Create src/lib/fda.tstsasync function getNDCs(rxcui: string): Promise<NdcPackage[]>
Endpoint: https://api.fda.gov/drug/ndc.json?search=rxcui.exact:${rxcui}&limit=100
Parse packaging → extract count (regex \b(\d+) TABLET\b)
Flag marketing_end_date → inactive
For each NDC: Add formattedNdc = formatNdc11(ndc) (5-4-2 with hyphens)

 Sort by smallest overfill first

- [x] Story 2.5: SIG Parser (Regex + OpenAI fallback)
Branch: feat/sig-parser

 Create src/lib/sigParser.ts (full implementation from previous message)
 Detect PRN → warning "PRN scripts may use partial fill"
 Regex fail → OpenAI JSON prompt → parse response

- [x] Story 2.6: Quantity Calculation & Pack Selection
Branch: feat/quantity-calc

calculateTotal(parsed, days)
 Greedy selector:
packs = Math.ceil(total / size)
overfillPct = (packs * size - total) / total
Warn if overfillPct > 0.12

 Prefer 0% overfill; allow multi-pack
 Generate copyable JSON (plain 11-digit NDCs)

- [x] Story 2.7: Results UI Cards (Function Health style)
Branch: feat/results-ui

#results section with 4 cards
Card 1: Total quantity needed (big bold number)
Card 2: Recommended NDC (clickable → AAPC lookup, display formattedNdc e.g., "12345-6789-01")
Card 3: Warnings (red bullets)
Card 4: JSON pre/code block with copy button (plain 11-digits)



## Epic 3: Polish, Errors, Validation & Ship (Est: 2 hrs)
- [x] Story 3.1: Error Handling & Modal

 Global error store (src/lib/stores.ts)
 Modal component (beige bg, orange close button)
No RxCUI → OpenAI suggestions list
API errors → friendly message
Invalid NDC input → "Enter valid 10/11-digit NDC or drug name"


- [x] Story 3.2: Testing Suite (Vitest + MSW)
Branch: test/core

sigParser.test.ts → 8 cases (PDF examples)
quantity.test.ts → overfill 0%, 12%, 25%
New: ndcUtils.test.ts → test normalizeNdc/formatNdc11 (e.g., "5024204062" → "5024204062", "50242-040-62" → "5024204062")
e2e.mock.test.ts → full pipeline with MSW
 Add scripts: "test": "vitest", "test:watch": "vitest --ui"
 Aim 100% coverage on calc logic

- [x] Story 3.3: 5 Synthetic RX Scenarios (Demo Buttons)

 Create src/lib/synthetics.ts with 5 demo objects
 Add "Try Demo" buttons on hero (auto-fill form)
New: Include NDC input demo – e.g., { drug: "5024204062", ... } → tests 11-digit handling

- [ ] Story 3.4: Final Polish & Deploy

- [x] Mobile: form stacks vertically
- [x] Footer: © 2025 Health Helper · RUN NDC v1.0 · GitHub link
- [x] README.md with Vercel badge, local run instructions *(screenshots pending)*
- [x] Commit PRD_v1.1.md with all decisions (add NDC 11-digit rules)
- [x] Merge all feat/* branches → main
- [x] vercel --prod → final public URL
- [ ] Tweet from @robglnn with live link + screenshot *(awaiting social post)*
- [ ] Capture UI screenshots for README/demo deck
- [ ] Manual AAPC cross-check of recommended NDCs (document results)

- [x] Story 3.5: NDC Utils Library (New – 15min)
Branch: feat/ndc-utils

 Create src/lib/ndcUtils.tsts// Normalize input to 11-digit plain string
export function normalizeNdc(input: string): string {
  let ndc = input.replace(/[^0-9]/g, ''); // Remove non-digits
  while (ndc.length < 10) ndc = '0' + ndc; // Pad leading zeros
  if (ndc.length > 11) throw new Error('Invalid NDC length');
  if (ndc.length === 10) ndc = ndc.slice(0,5) + '0' + ndc.slice(5); // Insert zero after 5th
  return ndc.length === 11 ? ndc : 'Invalid';
}

// Format 11-digit for display (5-4-2 with hyphens)
export function formatNdc11(ndc11: string): string {
  if (ndc11.length !== 11 || !/^\d{11}$/.test(ndc11)) return 'Invalid';
  return `${ndc11.slice(0,5)}-${ndc11.slice(5,9)}-${ndc11.slice(9)}`;
}
 Import in 2.2/2.4 for input/FDA handling
 Vitest: 3 cases (4-4-2 pad, 5-3-2 insert, invalid)

Risks & Mitigations
RiskMitigationOwnerOpenAI latency >2s1.5s timeout → fallback to regex only@robglnnFDA API rate-limitIn-memory cache + exponential backoff@robglnnTailwind classes purgedAdd safelist patterns in config@robglnnOverfill logic wrong8 Vitest cases + manual AAPC verification@robglnnNDC input malformednormalizeNdc validation + error modal@robglnn

Timeline (CST – Nov 10, 2025)

12:40 PM → Start Epic 1 (done by 1:30 PM)
1:30 PM – 5:00 PM → Epic 2 (core pipeline)
5:00 PM – 7:00 PM → Epic 3 (polish + tests + NDC utils)
7:00 PM – 8:00 PM → Final deploy + tweet