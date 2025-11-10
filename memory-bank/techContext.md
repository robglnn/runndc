## Tech Context

- **Framework:** SvelteKit with TypeScript for full-stack SPA/SSR flexibility.
- **Styling:** Tailwind CSS (Function Health palette) + Inter font from Google Fonts.
- **APIs / Services:**
  - RxNorm REST API for RxCUI normalization (primary).
  - FDA NDC Directory (openFDA) for NDC package metadata.
  - OpenAI API (fallback for drug name disambiguation and complex SIG parsing).
  - AAPC NDC lookup for manual validation (non-automated).
- **Utilities:** `normalizeNdc` and `formatNdc11` enforce 11-digit NDC standards and presentation.
- **Testing:** Vitest, @vitest/ui, MSW for API mocking; targeted unit tests for SIG parsing, quantity math, NDC utils, and integration flow.
- **Deployment:** Vercel adapter for SvelteKit; production build target is Windows-friendly yet deployable cross-platform. Environment variables managed via `.env`, `.env.template`, `.env.example`, and Vercel dashboard.
- **Tooling:** ESLint, Prettier, pnpm package manager, Tailwind CLI; `.cursorignore` to protect secrets in Cursor sessions.

### Constraints
- Performance: <2s per calculation (includes network calls).
- Reliability: Graceful degradation when OpenAI unavailable (fallback to regex SIG parsing and manual entry warnings).
- Security: No PHI stored; secure handling of API keys; HIPAA-aware though MVP avoids PHI entirely.
- Platform: Windows dev environment; final app targeted for web (Vercel) with no OS-specific packaging.

