# Embedded course reviews

The supplied main export covers 544 courses: 172 captured and 372 unavailable.
All four part files were compared by course code with the main export and match
exactly. The main file is used once; parts are not imported again.

Preparation recognizes term, instructor, the four individual letter grades,
the four comment sections and the dated review footer. It yields 14,740 distinct
structured comments across 166 courses. Three repeated blocks are deduplicated;
38 recognized blocks with missing/empty/ambiguous sections are excluded. Leading
fragments without a full header are also excluded rather than attributed to the
following review. Six captured courses contain aggregate ratings but no complete
comment blocks. Attachment lists and the common assessment-control labels are
excluded; those labels do not establish which assessments actually apply.

All 172 captured courses have explicit aggregate letter ratings (including the
page ending in “Edit Review”). Aggregate counts and grades are preserved
separately from individual comment counts and distributions. No numeric star
scale, weekly workload hours or current grading rules are invented.

Author footer handles and email addresses are removed. Instructor names remain
as public course context. Students are labeled anonymously; prose is preserved
as supplied, which is not a claim that every third-party reference inside a
comment is identifiable or fully anonymized. Raw exports, account information,
attachments and PDFs are not added to site assets.

Each course JSON is fetched only when its detail dialog opens. The root index
contains counts and ratings, not the full comment collection. Comments support
term/teacher filtering, text search, newest/helpful ordering and pagination.
Summaries are deterministic, extractive topic analyses over the prepared
comments, with mention counts, linked quotations and conditional study/selection
advice. A theme mention is not a sentiment vote or a current course requirement.
Advice is a reference, not a personalized guarantee. Historical ratings do not
silently enable attendance/quiz/group-work hard filters in the timetable engine.

Unavailable courses use the requested “No Review Published yet~” text. Courses
with ratings but no complete comment text retain their ratings and have a
different empty-comment message. Loading errors have a separate retry state.

Normal course labels omit OCR/PDF/snapshot terminology. The footer displays the
collection update timestamp in Asia/Shanghai: 2026-11-03 22:30 UTC+8. This is not
a new assertion about when the original schedule/seat data was captured.

Validation: 39 JavaScript tests, 21 Python tests, 7 review browser checks,
16 real-workspace checks and 20 synthetic-mode checks pass against the local
production build. Review tests cover anonymous output, deduplication, partial
blocks, preserved aggregate ratings, evidence links, lazy requests, filters,
pagination, empty states, retry, persistence and desktop overflow. The release targets the desktop website; the newly added mobile-specific review overrides are omitted.

The user has authorized publishing this revision. Release targets are the main
source branch and the gh-pages static branch; verify the public site after both pushes.
