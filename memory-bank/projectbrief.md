## Project Brief

**Project:** RUN NDC – NDC Packaging & Quantity Calculator  
**Organization:** Foundation Health  
**Status:** MVP sprint locked (PRD v1.1 approved Nov 10, 2025)  
**Goal:** Deliver a demo-ready SvelteKit application that accurately matches prescriptions to valid NDCs, computes dispense quantities, and surfaces warnings, with a Function Health-inspired UI and deployment on Vercel by end of day.

### Scope
- Implement full prescription-to-NDC workflow (input normalization, RxNorm lookup, FDA NDC retrieval, SIG parsing, quantity calculation, warnings).
- Provide a polished, responsive UI with summary cards, warnings, and JSON output.
- Bundle synthetic demo scenarios and automated tests to validate the core logic.
- Deploy to Vercel with environment variables set for OpenAI usage; maintain Windows-focused developer experience.

### Success Criteria
- Accuracy: ≥95% medication normalization accuracy across synthetic scenarios.
- Overfill alerts: warn on >12% overfill threshold with FDA-aligned overage guidance documented.
- Performance: ≤2s end-to-end calculation per request.
- Demo readiness: stable, visually polished build accessible via Vercel production URL.

