## Product Context

### Problem
Pharmacy teams struggle to match prescriptions to valid National Drug Codes and compute dispense quantities correctly. Issues include inconsistent NDC formatting (10/11 digit variants), inactive or mismatched NDCs, dosage form discrepancies, and manual SIG interpretation. These errors create claim rejections, delays, and patient dissatisfaction.

### Solution
RUN NDC provides an AI-assisted workflow that:
- Normalizes drug input to RxCUI (with OpenAI fallback for ambiguous drug names).
- Retrieves active NDC packages and metadata from the FDA NDC Directory.
- Parses SIG instructions (regex-first, OpenAI fallback) to compute total quantity and optimal pack counts.
- Highlights overfills, underfills, and inactive NDCs while presenting results in a modern Function Health-style UI.

### Users & Outcomes
- **Pharmacists / Technicians:** Faster, accurate dispense quantities aligned with valid NDCs; reduced claim rejections.
- **Healthcare Administrators:** Insight into normalization accuracy; confidence in operational efficiency.

Success metrics: 95% normalization accuracy, 50% reduction in NDC-related claim rejections, ≥4.5/5 pilot satisfaction, and documented adherence to FDA packaging overage guidance.

