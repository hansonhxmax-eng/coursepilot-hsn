# Current validation

See [real-data-validation.md](real-data-validation.md) for the current real-schedule and local-collector checks. The table below preserves the original v1 synthetic preference-demo cases; its first-load expectations apply after selecting **Preference demo**, not the new default Real schedules workspace.

# Executed test cases

Run date: 2026-11-03 (Asia/Shanghai). Target: Vite production build served on port 4173. Browser: Chromium, headless; desktop 1440×1000 and mobile 390×844. Final outcome: **19/19 solver tests, 20/20 browser checkpoints, production build passed**. No skipped solver tests. Saved output is in `evidence/`.

## Solver cases (`npm test`)

| ID | Input / case | Expected and actual result |
| --- | --- | --- |
| U01 | Default three-course profile | Three distinct conflict-free plans satisfying every hard filter; passed |
| U02 | No group projects | No group-work course in any returned plan; passed |
| U03 | Monday–Thursday only | No Friday sessions; passed |
| U04 | Two courses, A/H domains | Two A/H courses per plan; passed |
| U05 | Open seats only | Zero-seat courses excluded; passed |
| U06 | Two SUS courses, no groups | Three valid alternatives; passed |
| U07 | Four-course load | Four courses per plan with no clashes; passed |
| U08 | At most two campus days | Every plan fits two days; passed |
| U09 | Attendance, quizzes and early classes allowed | Relaxed profile remains conflict-free; passed |
| U10 | Tuesday/Thursday, no groups | All sessions on allowed days; passed |
| U11 | No available weekdays | No plan, no mutation or relaxation of input; passed |
| U12 | Two records sharing the same sessions | No false feasible combination; passed |
| U13 | Unknown attendance, stale fixture | Unknown required field and stale record excluded; passed |
| U14 | Adjacent / overlapping intervals | End-to-start adjacency allowed, overlap rejected, different days allowed; passed |
| U15 | All fixture records | 30 unique IDs, explicit synthetic provenance and session bounds; initially failed display-boundary check, passed after timetable fix |
| U16 | All five built-in presets | Each returns three alternatives; passed |
| U17 | English, Chinese, unsupported phrases | Recognized filters extracted; unsupported request has zero matches; passed |
| U18 | Seat update | Zero-seat exclusion removed after a local seat update; fixtures not mutated; passed |
| U19 | Larger four-course search | Three valid plans, correct average scores, solver below 90 seconds (~48 ms locally); passed |

## Production browser journey (`tests/browser_smoke.py`)

| ID | Action | Expected and actual result |
| --- | --- | --- |
| B01 | First load | Three plans and three courses; demo disclosure visible; passed |
| B02 | Select Plan B | Different courses and selected timetable; passed |
| B03 | Export calendar | Six recurring events, Hong Kong timezone and demo labels; passed |
| B04 | Open information modal; Escape | Dialog closes and restores focus; passed |
| B05–B09 | Run all five reviewer scenarios | Three alternatives, correct two/three-course loads; passed |
| B10 | Unsupported request | Limitation message instead of fabricated answer; passed |
| B11 | Chinese supported query | Visible filters update; results wait for Generate; passed |
| B12 | Deselect every weekday; recover | Empty state then valid plans; passed |
| B13 | Search, empty search, SUS filter, bookmark | 30 records, five SUS matches, correct search and bookmark behavior; passed |
| B14 | Reload; simulate seat update | Watched ID retained; waitlist 28→23; notification appears; passed |
| B15 | Open action log | Simulated update and stale-data exclusion visible; passed |
| B16 | Open official sources | Exact user-provided URLs, safe new-tab links, SIS path, no password fields, manual-access disclosure; passed |
| B17 | Open course details; keyboard navigation | Provenance and source links present; focus remains in modal; passed |
| B18 | Desktop layout | No document overflow; screenshot captured; passed |
| B19 | Mobile menu and page switch | Sidebar collapses correctly, menu works, no document overflow; passed |
| B20 | Full desktop journey | No uncaught JavaScript exceptions; passed |

## Issues and disposition

- **Fixed:** the original 09:00–19:00 calendar range clipped synthetic sessions ending at 19:30. Expanded to 20:00 and aligned gridlines with labels. Rebuilt and verified the final production version.
- **Test infrastructure corrected:** used Node's no-isolation test runner in this sandbox; renamed a Python script that shadowed `inspect`; corrected the Playwright mobile-page API and scoped the duplicate “Official sources” button locator to navigation. These were harness corrections, not application defects.
- **Unrun:** actual USTSpace registration/sign-in, SIS authentication, live data extraction, real enrollment, external alerts, other browsers, screen-reader audit, and long-term public hosting availability. No account credentials or approved data integrations were supplied; no claim of passing these checks is made.
- **Deliberately limited:** local browser storage, synthetic records, limited phrase parsing, session-only logs/seat updates and manual official-source access. Reviewers can test the planning workflow without sharing accounts.
