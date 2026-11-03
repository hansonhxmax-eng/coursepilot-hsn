# Real-data and collector validation

Date: 2026-11-03 (Asia/Shanghai). Inputs: ACCT, FINA, MGMT, ISOM, AMCC, ECON, COMP, CENG, SOSC, AISC and ELEC PDFs uploaded by the team.

## Dataset provenance

- 11 files, 117 pages. PDFs contain screenshot images: plain `pdftotext` returned no course text.
- Tesseract OCR at 2× rendering scale; three workers, one OCR thread each. Parsing uses table-column coordinates, course headers and class-number anchors.
- 462 detected courses, 1,168 section records. 980 records have parseable times and section labels suitable for provisional time planning. This count is **not** an extraction-accuracy estimate; TBA and uncertain records remain visible but excluded.
- Four numeric fields are accepted together only when readable and quota − enrollment equals available seats: 747 rows pass that consistency check. Arithmetic consistency does not verify current availability.
- 25 courses have a literal CC26 tag detected. No domain or degree-eligibility inference is made from departments or absent tags.
- Original capture date unknown. Upload date is 2026-11-03. All records belong to the visibly stated 2026–27 Fall term, not the synthetic Spring 2027 demonstration.
- Two initially ambiguous OCR codes were visually checked with enlarged source crops: ACCT69704 → ACCT6970A and ACCT79001 → ACCT7900I. Along with five other checked suffix corrections, the collector list now contains 462 well-formed codes. This is not a full human audit of all course fields. Narrow manual corrections are recorded in `scripts/schedule-corrections.json`; verified fields are listed per affected record. No blanket certification is implied.
- Public PDFs preserve page content with metadata removed. Both original and republished SHA-256 values are recorded; tests verify the public assets against the republished hashes.

## Executed checks

| Suite | Outcome | What it establishes |
| --- | --- | --- |
| JavaScript (`npm test`) | 36 passed | Original demo solver plus real interval/date handling, component completeness, safe unknown fields, section locks, calendar duration, schema validation and source integrity |
| Python collector helpers | 11 passed | Course validation, observed-route templates, host boundaries, text sanitization, partial results, access rejection and downloadable-package consistency |
| Real-workspace Chromium journey | 18 checkpoints passed | Search/filtering, PDF asset, real section plans, lock conflict/recovery, unknown-data failures, exports, JSON import, downloads, mode boundaries, persistence and mobile layout |
| Preference-demo Chromium regression | 20 checkpoints passed | Prior sample workflow remains functional in its explicitly labeled synthetic mode |
| Collector simulated-browser test | Passed | Load-more and next-page handling on a locally fulfilled TEST FIXTURE, redaction, course matching and rate-limit stopping |

Evidence outputs are stored in `submission/evidence/` after the final validation run. Browser tests use fresh contexts. No real USTSpace review has been claimed as collected by these tests.

## Problems found and fixed

1. Image-only PDFs required OCR; a text-only import would have produced an empty dataset.
2. Wrapped dates and room text near a column boundary initially contaminated date parsing. Improved column boundaries and strict calendar-date validation; COMP 1021 split date ranges now have explicit regression coverage.
3. Ambiguous OCR labels could previously pass a readability flag even when marked unclear. Their ambiguity now blocks automatic selection. Unclassified component types and explicit lecture/tutorial matching rules also block automatic pairing.
4. The first browser test assumed a locked L02 could coexist with the example's other constraints. The application correctly returned no plan; the test was corrected to exercise conflict and recovery instead of relaxing the constraint.
5. A non-Monday calendar input could mislabel displayed weekdays. Invalid starts are now rejected while preserving the last valid Monday. Exported durations use actual session ends, not a constant 90 minutes.
6. The real-example button now scrolls to results, and a selection summary links directly to the timetable builder.

## Still unverified or deliberately limited

- Actual USTSpace login, DOM compatibility, site permission/robots outcome, successful bulk collection, full pagination and review completeness require the owner's local first-course check.
- The Windows launcher is supplied for convenience but has not been executed on Windows in this Linux environment. The Python tool and simulated-browser logic were tested here with Playwright 1.62.0; that pinned release was confirmed available from official PyPI.
- Visible page text is not automatically a verified review, workload estimate, grading outcome or assessment rule. Imported text does not change the unknown academic fields.
- No live SIS connection, actual enrollment, continuous waitlist monitor, automatic grade prediction, complete human OCR audit, enrollment-link validation, official holiday calendar or guarantee of review-window uptime.
- Real schedule search is capped by state/time budgets; hitting a cap is labeled partial and does not prove an empty result is unsatisfiable. Real outputs remain provisional; source PDFs and SIS must be checked.
