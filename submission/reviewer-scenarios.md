# Five reviewer scenarios — current version

Demo: https://hansonhxmax-eng.github.io/coursepilot-hsn/

The default **Real schedules** workspace uses OCR transcriptions of 11 user-uploaded PDFs for **2026–27 Fall**. These are real schedule snapshots, not live SIS availability. Course codes, titles and times may contain OCR errors; source PDFs are linked for checking. The separate **Preference demo** page retains synthetic data for the preference-flow demonstration.

## 1. Build a real three-course timetable

Click **Try a real schedule**. This selects ACCT 2010, ISOM 1380 and AISC 1000B, with no classes before 10:00 and at most four campus days.

Expected: Plan A/B/C use real section times, and the page scrolls to the timetable builder. Switch plans to inspect different section choices. The output is provisional time compatibility; it does not establish enrollment eligibility or live seats.

## 2. Include tutorials, not just lectures

Click **Clear selection**. Search and add AMCC 2010, then SOSC 1350; leave the early-class restriction off. Click **Generate section plans**.

Expected: every returned plan includes one lecture and one tutorial per course. Open a course's original PDF to compare the transcribed components. Changing a tutorial lock should affect the plan or produce a clear conflict.

## 3. Force a conflict, then recover

Reload **Try a real schedule**. Lock ACCT 2010 to **L02**, retaining the no-early-class constraint, and generate.

Expected: no plan. L02 overlaps ISOM 1380 L1, while the alternative ISOM lecture has a 09:00 Friday meeting that is excluded. Change ACCT to **L01** and regenerate to recover a valid plan. The planner must not silently change the lock or relax your time preference.

## 4. Test an unsupported academic preference

Load the real example, enable **No mandatory attendance**, and generate.

Expected: no plan, with an explanation that attendance is not established by the schedule PDFs. The same applies to no-quizzes and no-group-projects preferences. USTSpace page-text imports are evidence only; they do not automatically become syllabus assertions or grade predictions.

## 5. Inspect uncertainty and export evidence

Clear selection, search **AISC 1000A**, add it and generate.

Expected: no complete timetable because the PDF lists TBA sessions. Open the source to verify. Then load the real example and export the Monday week starting **2026-11-02**. The .ics contains single-week events with actual parsed durations, not an invented semester calendar. Choosing a Tuesday as week start is rejected.

## Optional review-data exercise

Under **USTSpace snapshots**, download the local collector and guide. The owner logs into USTSpace personally on their computer; begin with three courses and inspect the output before attempting the full list. Actual authenticated-site compatibility has not been verified. A successful JSON export can be imported into the platform; captured page text is shown literally, stays in tab memory, and clears on reload. No passwords, login tokens or browser profile files should be imported.

The source PDF capture time is unknown. Seat counts are historical, not live. CC26 labels mean a literal tag was detected in OCR, not a guarantee of Common Core eligibility. Always verify current details and section links in SIS.
