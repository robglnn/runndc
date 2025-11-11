## Active Context

- Live MVP is deployed at `https://runndc.vercel.app/` with Function Health–style UI, `/api/calc` pipeline (RxNorm + FDA integration, SIG parsing, quantity/overfill logic), demo presets, and JSON output.
- Recent enhancements: direct NDC fallback to product-level FDA queries (including 4-4 variants), package list display, drug name surfacing, warnings for non-standard units/inactive packages, variant RxNorm lookups (e.g., inhalers), and unparsed package surfaced for manual review.

### Immediate Next Steps
1. Run full smoke tests on production (5 synthetic scenarios + spot checks with active/inactive NDCs).
2. Capture screenshots + demo collateral for tonight’s presentation.
3. Decide on handling when FDA returns product metadata but no parseable package units (manual entry support vs. curated overrides).
4. Optional: curate/cache high-priority NDC package data if FDA gaps block recommendation flow; consider secondary data source for unit-of-use SKUs (blister packs, homeopathics).

### Open Questions / Dependencies
- Should the app allow manual package entry when FDA data is incomplete?
- Do we need a curated dataset or secondary source for certain dosage forms (blister packs, devices)?

