import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  REAL_DEFAULT,
  meetingsOverlap,
  sectionsOverlap,
  courseOptions,
  generateSchedules,
  calendarSnapshot,
  validateReviewImport,
} from "../src/schedules/model.js";
const data = JSON.parse(
  fs.readFileSync(new URL("../src/schedules/uploaded.json", import.meta.url)),
);
const c = (id) => data.courses.find((x) => x.id === id);
const chosen = ["ACCT2010", "ISOM1380", "AISC1000B"].map(c);
test("all 12 offline sources and 135 pages are accounted for, with unique courses and sections", () => {
  assert.equal(data.sources.length, 12);
  assert.equal(
    data.sources.reduce((n, s) => n + s.pages, 0),
    135,
  );
  assert.equal(
    new Set(data.courses.map((c) => c.id)).size,
    data.courses.length,
  );
  const sections = data.courses.flatMap((c) => c.sections);
  assert.equal(new Set(sections.map((s) => s.id)).size, sections.length);
  assert.equal(sections.length, data.counts.sections);
  assert.equal(data.capturedAt, null);
});
test("real snapshot never invents reviews, assessments or Common Core domains", () => {
  for (const course of data.courses)
    for (const field of [
      "rating",
      "workload",
      "attendance",
      "quizzes",
      "group",
      "domain",
    ])
      assert.equal(course[field], null, course.id + " " + field);
});
test("every parsed interval is valid, every source page lies within its PDF", () => {
  for (const course of data.courses) {
    const source = data.sources.find((s) => s.file === course.sourceFile);
    for (const section of course.sections) {
      for (const page of section.sourcePages)
        assert.ok(page >= 1 && page <= source.pages);
      for (const m of section.sessions) {
        assert.ok(m.day >= 0 && m.day <= 6);
        assert.ok(m.start >= 0 && m.start < m.end && m.end <= 1440);
        if (m.dateStart) {
          assert.ok(!Number.isNaN(Date.parse(m.dateStart)));
          assert.ok(m.dateStart <= m.dateEnd);
        }
      }
      if (section.scheduleReadable)
        assert.ok(!section.issues.includes("Unclear section label"));
      if (section.seats !== null)
        assert.equal(section.quota - section.enrolled, section.seats);
    }
  }
});
test("visually checked anchors retain 80-minute ACCT and 110-minute AISC classes", () => {
  const acct = c("ACCT2010").sections.find((s) => s.label === "L01");
  assert.deepEqual(
    acct.sessions.map((m) => [m.day, m.start, m.end]),
    [
      [1, 810, 890],
      [3, 810, 890],
    ],
  );
  const aisc = c("AISC1000B").sections[0];
  assert.equal(aisc.classNumber, "3026");
  assert.equal(aisc.sessions[0].end - aisc.sessions[0].start, 110);
  assert.equal(c("AISC1000A").sections.length, 16);
  assert.ok(c("AISC1000A").sections.every((s) => !s.scheduleReadable));
});
test("COMP split date ranges are parsed rather than merged into fictitious semester-wide times", () => {
  const lecture = c("COMP1021").sections.find((s) => s.label === "L1");
  assert.deepEqual(
    lecture.sessions.map((s) => [s.dateStart, s.dateEnd]),
    [
      ["2026-09-01", "2026-09-17"],
      ["2026-09-01", "2026-09-17"],
      ["2026-09-22", "2026-11-26"],
      ["2026-09-22", "2026-11-26"],
    ],
  );
});
test("date-aware conflict check allows disjoint teaching periods and back-to-back meetings", () => {
  const a = {
    day: 0,
    start: 600,
    end: 680,
    dateStart: "2026-09-01",
    dateEnd: "2026-09-30",
  };
  assert.equal(
    meetingsOverlap(a, {
      ...a,
      dateStart: "2026-10-01",
      dateEnd: "2026-10-31",
    }),
    false,
  );
  assert.equal(meetingsOverlap(a, { ...a, start: 680, end: 720 }), false);
  assert.equal(meetingsOverlap(a, { ...a, start: 679, end: 720 }), true);
  assert.equal(
    meetingsOverlap(
      { ...a, dateStart: "2026-09-01", dateEnd: "2026-09-01" },
      { ...a, dateStart: "2026-09-01", dateEnd: "2026-09-01" },
    ),
    false,
  ); // Tuesday range cannot contain Monday.
});
test("real example returns complete, distinct, conflict-free section plans", () => {
  const p = { ...REAL_DEFAULT, noEarly: true, maxDays: 4 };
  const r = generateSchedules(chosen, p);
  assert.equal(r.plans.length, 3);
  assert.equal(r.limited, false);
  for (const option of r.plans) {
    assert.ok(option.days.length <= 4);
    assert.equal(option.items.length, 3);
    const sections = option.items.flatMap((x) => x.sections);
    for (let i = 0; i < sections.length; i++) {
      assert.ok(sections[i].sessions.every((s) => s.start >= 600));
      for (let j = i + 1; j < sections.length; j++)
        assert.equal(sectionsOverlap(sections[i], sections[j]), false);
    }
  }
  assert.equal(new Set(r.plans.map((p) => p.signature)).size, 3);
});
test("lecture plus tutorial/lab components are retained instead of recommending lectures alone", () => {
  const result = generateSchedules(
    [c("AMCC2010"), c("SOSC1350")],
    REAL_DEFAULT,
  );
  assert.equal(result.plans.length, 3);
  for (const p of result.plans)
    for (const i of p.items)
      assert.deepEqual(i.sections.map((s) => s.kind).sort(), [
        "lecture",
        "tutorial",
      ]);
});
test("TBA required components and unverified linked sections block automatic plans", () => {
  assert.equal(
    generateSchedules([c("AISC1000A")], REAL_DEFAULT).plans.length,
    0,
  );
  const linked = generateSchedules([c("MGMT3110")], REAL_DEFAULT);
  assert.equal(linked.plans.length, 0);
  assert.match(linked.issues.join(), /matching requires SIS/);
});
test("unknown assessment preference is a hard blocker, never inferred from absent reviews", () => {
  for (const key of ["noAttendance", "noQuizzes", "noGroups"]) {
    const r = generateSchedules(chosen, { ...REAL_DEFAULT, [key]: true });
    assert.equal(r.plans.length, 0);
    assert.match(r.issues.join(), /not established/);
  }
});
test("locking a section is respected; invalid locks are not silently ignored", () => {
  const a = c("ACCT2010"),
    s = a.sections.find((s) => s.label === "L02");
  const valid = courseOptions(a, REAL_DEFAULT, { lecture: s.id });
  assert.equal(valid.options.length, 1);
  assert.equal(valid.options[0][0].id, s.id);
  assert.equal(
    courseOptions(a, REAL_DEFAULT, { lecture: "not-a-section" }).options.length,
    0,
  );
});
test("zero availability, empty weekdays and bounded search never silently relax constraints", () => {
  assert.equal(
    generateSchedules(chosen, { ...REAL_DEFAULT, days: [] }).plans.length,
    0,
  );
  const limited = generateSchedules(chosen, REAL_DEFAULT, {}, { maxStates: 1 });
  assert.equal(limited.limited, true);
  const a = c("AISC1000B");
  const unknown = {
    ...a,
    sections: a.sections.map((s) => ({ ...s, seats: null })),
  };
  assert.equal(
    generateSchedules([unknown], { ...REAL_DEFAULT, snapshotOpen: true }).plans
      .length,
    0,
  );
});
test("ICS preserves actual section duration and exports only a user-selected Monday week", () => {
  const r = generateSchedules(chosen, { ...REAL_DEFAULT, noEarly: true });
  const text = calendarSnapshot(r.plans[0].items, "2026-11-02");
  assert.ok(text.includes("DTSTART;TZID=Asia/Hong_Kong:20261105T160000"));
  assert.ok(text.includes("DTEND;TZID=Asia/Hong_Kong:20261105T175000"));
  assert.ok(text.includes("[PDF snapshot]"));
  assert.ok(!text.includes("RRULE:"));
  assert.throws(
    () => calendarSnapshot(r.plans[0].items, "2026-11-03"),
    /Monday/,
  );
});
const review = {
  schemaVersion: 1,
  kind: "ustspace-visible-snapshots",
  courses: [
    {
      courseCode: "ACCT2010",
      status: "captured",
      sourceUrl: "https://ust.space/review/ACCT2010?token=discarded",
      capturedAt: "2026-11-03T03:00:00Z",
      text: "A test-only visible page snapshot.",
      completeness: "visible-content-only",
    },
  ],
};
test("review import matches course code, strips query data and leaves academic assertions unknown", () => {
  const { records, skipped } = validateReviewImport(
    review,
    new Set(["ACCT2010"]),
  );
  assert.equal(skipped, 0);
  assert.equal(records.ACCT2010.sourceUrl, "https://ust.space/review/ACCT2010");
  assert.equal(records.ACCT2010.rating, undefined);
  assert.equal(validateReviewImport(review, new Set(["OTHER1000"])).skipped, 1);
});
test("malformed review imports, non-USTSpace URLs and oversized text are rejected atomically", () => {
  for (const url of [
    "javascript:alert(1)",
    "https://ust.space.evil.example/review/ACCT2010",
    "http://ust.space/review",
    "https://name:password@ust.space/review",
  ])
    assert.throws(() =>
      validateReviewImport(
        { ...review, courses: [{ ...review.courses[0], sourceUrl: url }] },
        new Set(["ACCT2010"]),
      ),
    );
  assert.throws(() => validateReviewImport({ courses: [] }, new Set()));
  assert.throws(() =>
    validateReviewImport(
      {
        ...review,
        courses: [{ ...review.courses[0], text: "x".repeat(250001) }],
      },
      new Set(["ACCT2010"]),
    ),
  );
});

test("unclassified components cannot be silently dropped from an otherwise readable course", () => {
  const base = c("ACCT2010");
  const unknown = {
    ...base.sections[0],
    id: "unclassified",
    kind: "unknown",
    scheduleReadable: false,
  };
  const result = generateSchedules(
    [{ ...base, sections: [base.sections[0], unknown] }],
    REAL_DEFAULT,
  );
  assert.equal(result.plans.length, 0);
  assert.match(result.issues.join(), /Unclassified section component/);
});
test("source files are excluded from public assets and MATH codes are unique", () => {
  for (const source of data.sources) {
    assert.equal(fs.existsSync(new URL("../public/schedules/" + source.file, import.meta.url)), false);
    assert.match(source.originalSha256, /^[a-f0-9]{64}$/);
  }
  assert.equal(data.courses.length, 544);
  assert.equal(data.courses.filter(c => c.department === "MATH").length, 82);
  assert.equal(data.courses.filter(c => c.department === "COMP").length, 76);
  assert.equal(c("MATH4052").title, "Partial Differential Equations");
  assert.ok(c("MATH6907O")); assert.ok(c("MATH6907Q"));
  assert.ok(c("MATH1003").sections.some(s => s.label === "L3" && s.classNumber === "3668"));
});
