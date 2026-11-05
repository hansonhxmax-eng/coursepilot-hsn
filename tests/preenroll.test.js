import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parsePreenrolledIcs, normalisePreenrolled, lockedMeetings, meetingsForWeek } from "../src/schedules/preenroll.js";
import { generateSchedules, REAL_DEFAULT, calendarSnapshot } from "../src/schedules/model.js";
import { normalizeWorkspace } from "../src/auth/workspace.js";

const ics = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:acct-one\r\nSUMMARY:ACCT 2010 Lecture\r\nDESCRIPTION:Instructor: YE, Guibo\\nPre-enrolled in SIS\r\nLOCATION:Lecture Theater E (143)\r\nDTSTART;TZID=Asia/Hong_Kong:20261103T133000\r\nDTEND;TZID=Asia/Hong_Kong:20261103T145000\r\nRRULE:FREQ=WEEKLY;COUNT=2\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:unrelated\r\nSUMMARY:Personal appointment\r\nDTSTART:20261103T160000Z\r\nDTEND:20261103T170000Z\r\nEND:VEVENT\r\nEND:VCALENDAR`;
const catalog = JSON.parse(fs.readFileSync(new URL("../src/schedules/uploaded.json", import.meta.url)));

test("SIS calendar import expands recurring HKT meetings and retains room and instructor", () => {
  const result = parsePreenrolledIcs(ics);
  assert.equal(result.courseCount, 1);
  assert.equal(result.skipped, 1);
  assert.equal(result.meetings.length, 2);
  assert.equal(result.meetings[0].startsAt, "2026-11-03T05:30:00.000Z");
  assert.equal(result.meetings[0].endsAt, "2026-11-03T06:50:00.000Z");
  assert.equal(result.meetings[0].room, "Lecture Theater E (143)");
  assert.equal(result.meetings[0].instructor, "YE, Guibo");
  assert.deepEqual(lockedMeetings(result.meetings).map(x => [x.date, x.day, x.start, x.end]), [
    ["2026-11-03", 1, 810, 890], ["2026-11-10", 1, 810, 890],
  ]);
  assert.equal(meetingsForWeek(result.meetings, "2026-11-02").length, 1);
  assert.equal(meetingsForWeek(result.meetings, "2026-11-09").length, 1);
});

test("invalid or non-course calendars cannot replace the current locked timetable", () => {
  for (const bad of ["not a calendar", "BEGIN:VCALENDAR\r\nEND:VCALENDAR", ics.replace(/ACCT 2010/g, "Personal time")]) {
    assert.throws(() => parsePreenrolledIcs(bad));
  }
  assert.deepEqual(normalisePreenrolled([{ code: "BAD", startsAt: "2026-11-03T05:30:00Z", endsAt: "2026-11-03T06:50:00Z" }]), []);
});

test("locked meetings survive account restore and block overlapping proposed sections", () => {
  const meetings = parsePreenrolledIcs(ics).meetings;
  const saved = normalizeWorkspace({ schedules: { selected: ["ACCT2010", "ISOM1380"], preenrolled: meetings } }, { realCourses: catalog.courses, realDefaults: REAL_DEFAULT });
  assert.deepEqual(saved.schedules.selected, ["ISOM1380"]);
  assert.deepEqual(saved.schedules.preenrolled, meetings);
  const course = catalog.courses.find(c => c.id === "ACCT2010");
  const l01 = course.sections.find(s => s.label === "L01");
  const result = generateSchedules([course], REAL_DEFAULT, { ACCT2010: { lecture: l01.id } }, { preenrolled: meetings });
  assert.equal(result.plans.length, 0);
  assert.match(result.issues.join(" "), /locked pre-enrolled class/);
  const exportText = calendarSnapshot([], "2026-11-02", meetings);
  assert.match(exportText, /ACCT2010.*Pre-enrolled/);
  assert.match(exportText, /DTSTART;TZID=Asia\/Hong_Kong:20261103T133000/);
});
