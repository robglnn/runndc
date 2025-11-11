## Active Context

### Current Focus
- Live MVP is deployed at `https://runndc.vercel.app/` with Function Health–style UI, `/api/calc` pipeline (RxNorm + FDA integration, SIG parsing, quantity/overfill logic), demo presets, and JSON output.
- Recent enhancements: direct NDC fallback to product-level FDA queries, package list display, drug name surfacing, warnings for non-standard units/inactive packages, and variant RxNorm lookups (e.g., inhalers).

### Immediate Next Steps
1. Run full smoke tests on production (5 synthetic scenarios + spot checks with active/inactive NDCs).
2. Capture screenshots + demo collateral for tonight’s presentation.
3. Document any manual overrides needed for packages with missing FDA units (e.g., `[hp_C]`) and decide on long-term fallback (additional data source vs. manual entry).
4. Optional: curate/cache high-priority NDC package data if FDA gaps block recommendation flow.

### Open Questions / Dependencies
- Confirm whether we should support manual package entry when FDA data is missing or stick to recommendations only.
- Determine which non-standard units (homeopathic, kits) need special handling beyond current warnings.

