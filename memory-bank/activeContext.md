## Active Context

- Live MVP is deployed at `https://runndc.vercel.app/` with Function Health–style UI, `/api/calc` pipeline (RxNorm + FDA integration, SIG parsing, quantity/overfill logic), demo presets, and JSON output.
- Recent enhancements: local openFDA dataset (135k NDCs) + AI fallback to suggest NDCs when live FDA queries fail (now works even without OpenAI by using deterministic scoring), 4-4 product fallback, package list display, drug name surfacing, warnings for non-standard units/inactive packages, variant RxNorm lookups (e.g., inhalers), unparsed package surfaced for manual review, guardrails around FDA/RxNorm/AI parsing so production never 500s, explicit inactive NDC warnings by cross-referencing the local FDA snapshot when live lookups 404, a high-priority inactive banner in the UI so pharmacists immediately see expired codes, and embedding the FDA snapshot as a base64 asset so serverless builds always have access.

### Immediate Next Steps
1. Run full smoke tests on production (5 synthetic scenarios + spot checks with active/inactive NDCs).
2. Capture screenshots + demo collateral for tonight’s presentation.
3. Monitor AI fallback suggestions in production (validate top demo flows) and decide on manual override UX if AI packages remain unparseable.
4. Capture rationale logging for AI picks in analytics (optional) and consider secondary data sources for dosage forms the local index still misses (devices, kits).

### Open Questions / Dependencies
- Should the app allow manual package entry when FDA data and AI fallback both miss parseable packages?
- Do we need a curated dataset or secondary source for certain dosage forms (blister packs, devices)?

