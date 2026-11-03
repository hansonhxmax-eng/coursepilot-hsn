# CoursePilot

A working HKUST course-planning prototype based on the AISC Group 12 proposal. The default workspace now uses the team’s real 2026–27 Fall PDF schedule snapshots; the preference demo remains explicitly synthetic. React + Vite; no API key, backend account, or database required.

## Run

Use Node.js 24 (tested: 24.22.1) and npm 11.

```sh
cd /workspace/first-project
npm ci
npm run dev -- --port 5173
```

The server prints its local address. Local addresses are for development; they are not a reviewer-accessible deployment link.

```sh
npm test
npm run build
npm run preview -- --port 4173
```

`dist/` is the self-contained static production site. Assets use relative paths, so it can be hosted at a root or a project subdirectory. Serve through HTTP rather than opening `index.html` as a local file.

## Real uploaded schedules (default workspace)

- 12 offline PDFs / 135 pages → 544 detected courses / 1,443 section records. 1,206 records have parseable times and labels; source files are kept offline and are not published on this website. Original capture date is unknown. These are OCR transcriptions, not a live SIS connection or certified extraction accuracy.
- Department search, pagination and literal CC26-tag filtering. The files also contain major and postgraduate courses; departments are never converted into Common Core domains or eligibility claims.
- Select up to six courses, lock sections and generate up to three provisional lecture/tutorial/lab schedules. Date-limited sessions are handled, TBA/ambiguous components are excluded, and explicit section-matching requirements block automatic pairing until verified.
- Timetable ranking uses campus-day count and early meetings only. Attendance, quizzes, groups, ratings and workload remain unknown. Enabling unsupported hard constraints returns no plan.
- User-selected Monday-week calendar exports preserve actual meeting durations; no official academic calendar or holiday assumptions are invented.
- Local collector downloads and USTSpace JSON import show visible page evidence without converting it into ratings or assessment assertions. Imported evidence remains in tab memory and clears on reload.

See [real-data validation and limitations](submission/real-data-validation.md), [current five reviewer scenarios](submission/reviewer-scenarios.md), and [the local collector guide](tools/ustspace/README.md). Authenticated USTSpace compatibility remains unverified until the owner runs the first-three-course check locally. No login information is collected by the platform.

## Preference demonstration (synthetic mode)



- 30 explicitly synthetic Common Core records spanning A/H/S/T/SA/SUS.
- Hard filters: domain, attendance, quizzes, group work, start time, available weekdays, campus-day limit and open seats.
- Exhaustive conflict-free combinations with three distinct ranked alternatives; no silent relaxation on impossible requests.
- A/B/C timetables, course detail panels, sample workload and availability trade-offs, watchlist and an exclusion matrix.
- Limited English/Chinese phrase parsing and five guaranteed supported presets. Review mapped controls before generating; this is not an LLM interface.
- Catalog search, domain filters, local preference/watchlist persistence, explicit simulated seat updates and session action logs.
- .ics export: illustrative 12-week schedules starting Monday 1 February 2027, Hong Kong time. These are not official academic dates.
- Responsive navigation, keyboard-operable controls, modal Escape/focus containment.

## Official sources and accounts

- USTSpace: <https://ust.space/review>. The user logs in or creates their own account on USTSpace.
- SIS entry: <https://itso.hkust.edu.hk/student-hotlinks/>. Follow **Student Center → My Favorites → Academics** and complete university authentication there.

The **Official sources** page and course details provide safe new-tab entry links and the SIS path. No institutional password is collected, login state is not inspected, and opening an external page is never presented as an authenticated connection. Codes in the synthetic preference demonstration may not correspond to actual offerings: verify official details independently.

There is no hosted live scraper, institutional integration, trained NLP model, grade prediction, external notification delivery, background monitor, or automatic enrollment. The separately downloaded local collector reads permitted visible pages only after the owner logs in on their own computer; its real-site compatibility has not yet been verified. Seat updates and logs reset on reload; preferences and watched IDs persist only in the same browser. Course selections remain local; imported review text is not sent to a backend or GitHub. Static app assets are served by GitHub Pages; uploaded PDFs are excluded. Third-party sites receive normal browser requests when explicitly opened. Review scores are sample fixtures, not verified student opinions.

## Synthetic-mode ranking

Hard constraints are applied before scoring, including unknown-field and stale-record exclusions. Search then checks every pair of course sessions and the union of campus days. Returned combinations favor distinct alternatives.

Balanced scoring = rating/5 × 50 + (4 − weekly workload) × 10 + availability. Availability = 20 for an open course, otherwise max(0, 15 − waitlist/4). Review/workload mode uses weights 55, 15 and availability 10 (open) or max(0, 7.5 − waitlist/8). Scores are rounded and capped at 99. Plans average course scores; equal scores favor fewer waitlisted courses and fewer campus days. These are fit heuristics, not probabilities. “Open seats only” is a hard filter, not a guarantee of enrollment.

## Validation and submission files

- [~300-word test log](submission/test-log.md)
- [Five reviewer scenarios](submission/reviewer-scenarios.md)
- [Executed testcase matrix and limitations](submission/test-cases.md)
- [Raw unit-test evidence](submission/evidence/unit-results.txt)
- [Raw browser-test evidence](submission/evidence/browser-results.txt)

Final validation: 36 JavaScript tests, 14 Python collector helper tests, 19 real-workspace browser checkpoints, 20 synthetic-mode browser checkpoints, and a collector MOCK-browser test passed. See the validation document for the precise scope. No authenticated USTSpace collection or full-review-window uptime is claimed.

Optional browser suite (Python 3.12; Playwright must be installed separately):

```sh
python3 -m pip install playwright
python3 -m playwright install chromium
# With the production preview server already running:
BASE_URL=http://127.0.0.1:4173 python3 tests/browser_smoke.py
# Or use an existing Chromium installation:
BASE_URL=http://127.0.0.1:4173 CHROMIUM_PATH=/usr/bin/chromium python3 tests/browser_smoke.py
```

Tests save screenshots, a downloaded calendar and results under `/tmp/coursepilot-evidence` by default. Override `EVIDENCE_DIR` if needed. Do not publish session evidence containing real personal data if future integrations are added.

## GitHub Pages deployment

The team has authorized publishing to `hansonhxmax-eng/first-project`. Source lives on `main`; the compiled static site is published from `gh-pages`. See [activation instructions and validation status](submission/deployment.md). The public URL is `https://hansonhxmax-eng.github.io/first-project/`; Pages is enabled and the prior public version was functionally verified. Each new deployment must still pass a fresh public check. No automatic rebuild workflow is configured; republish `dist/` when changing source. Keep the site enabled for the full review window.

This checkout is already isolated in the cloud task; no additional Git worktree is needed. Dependencies/build files can be restored from the prepared environment, but running development/preview servers must be restarted in new tasks.

## Optional dataset rebuild (not needed to run the app)

The curated JSON is committed at `src/schedules/uploaded.json`. To reproduce OCR for these specific Fall-2026 inputs, install PyMuPDF and the Tesseract executable, then run:

```sh
python3 scripts/ocr-schedules.py --input-dir /path/to/offline-schedules --work-dir /tmp/coursepilot-schedules
python3 scripts/import-schedules.py --ocr-dir /tmp/coursepilot-schedules --manifest /tmp/coursepilot-schedules/files.json
python3 scripts/package-collector.py
```

Inspect the results and original PDFs before publishing. The parser and narrow corrections target this specific uploaded snapshot; they are not a general validated importer for another term or different page layout. Browser and collector tests are documented under `tests/`; the collector must be used on the account owner's machine, never by copying cookies or passwords into the cloud. Rebuild its downloadable ZIP with `python3 scripts/package-collector.py` after any tool/guide change.

MATH and collector update: 82 MATH courses are included in the 544-code list. The Windows launcher processes the full list with automatic resume; unavailable records do not stop collection. Uploaded PDFs and all PDF links have been removed from the deployed site.

Collector `2026.11.03.4-auto`: log in locally and open any listed course, including in a new tab. The collector automatically runs a visible-page test and then processes the remaining list, without terminal confirmation. Existing captured records are retained during resume. The four automatic workflow fixtures run with `CHROMIUM_PATH=/usr/bin/chromium python3 tests/collector_auto_browser.py`; real authenticated-site compatibility still needs the owner's local run.
