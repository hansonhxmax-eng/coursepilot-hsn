import test from "node:test";
import assert from "node:assert/strict";
import { courses, DEFAULT, SCENARIOS } from "../src/data.js";
import { reasons, overlaps, plan, parseQuery, score } from "../src/engine.js";
const profiles = [
  DEFAULT,
  { ...DEFAULT, noGroups: true },
  { ...DEFAULT, days: [0, 1, 2, 3] },
  { ...DEFAULT, count: 2, domains: ["A", "H"] },
  { ...DEFAULT, priority: "safe" },
  { ...DEFAULT, count: 2, domains: ["SUS"], noGroups: true },
  { ...DEFAULT, count: 4 },
  { ...DEFAULT, maxDays: 2 },
  { ...DEFAULT, noAttendance: false, noQuizzes: false, noEarly: false },
  { ...DEFAULT, days: [1, 3], noGroups: true },
];
for (const [i, p] of profiles.entries())
  test(`profile ${i + 1}: every returned plan satisfies all hard constraints`, () => {
    const result = plan(courses, p);
    assert.ok(result.plans.length > 0, `Profile ${i + 1} should return plans`);
    assert.equal(result.plans.length, 3);
    const signatures = new Set();
    for (const option of result.plans) {
      assert.equal(option.courses.length, p.count);
      assert.ok(option.days.length <= p.maxDays);
      signatures.add(
        option.courses
          .map((c) => c.id)
          .sort()
          .join(","),
      );
      for (const [index, c] of option.courses.entries()) {
        assert.deepEqual(reasons(c, p), []);
        for (const other of option.courses.slice(index + 1))
          assert.equal(overlaps(c, other), false);
      }
    }
    assert.equal(signatures.size, result.plans.length);
  });
test("impossible constraints produce no plans without relaxation", () => {
  const p = { ...DEFAULT, days: [], count: 3 };
  const copy = JSON.stringify(p);
  const r = plan(courses, p);
  assert.equal(r.plans.length, 0);
  assert.equal(r.total, 0);
  assert.equal(JSON.stringify(p), copy);
});
test("individual matches cannot bypass timetable conflicts", () => {
  const c = courses[0],
    clone = { ...c, id: "CONFLICT" };
  assert.equal(plan([c, clone], { ...DEFAULT, count: 2 }).plans.length, 0);
});
test("unknown attendance and stale data are excluded", () => {
  const unknown = courses.find((c) => c.attendance === null);
  assert.ok(
    reasons({ ...unknown, stale: false }, DEFAULT).some((r) =>
      r.includes("missing"),
    ),
  );
  assert.ok(reasons(unknown, DEFAULT).includes("Stale source record"));
  assert.equal(plan([unknown], { ...DEFAULT, count: 1 }).plans.length, 0);
});
test("back-to-back sessions are allowed, overlapping sessions rejected", () => {
  const a = { sessions: [{ day: 0, start: 600, end: 690 }] };
  assert.equal(
    overlaps(a, { sessions: [{ day: 0, start: 690, end: 780 }] }),
    false,
  );
  assert.equal(
    overlaps(a, { sessions: [{ day: 0, start: 689, end: 780 }] }),
    true,
  );
  assert.equal(
    overlaps(a, { sessions: [{ day: 1, start: 600, end: 690 }] }),
    false,
  );
});
test("30 unique synthetic records have explicit provenance and valid session bounds", () => {
  assert.equal(courses.length, 30);
  assert.equal(new Set(courses.map((c) => c.id)).size, 30);
  for (const c of courses) {
    assert.equal(c.source, "Synthetic demo fixture");
    assert.ok(c.credits > 0);
    for (const s of c.sessions) {
      assert.ok(s.day >= 0 && s.day <= 4);
      assert.ok(s.start >= 540 && s.end <= 1200);
      assert.ok(s.end > s.start);
    }
  }
});
test("all five reviewer scenarios produce three valid options", () => {
  for (const s of SCENARIOS)
    assert.equal(plan(courses, s.prefs).plans.length, 3, s.title);
});
test("limited English and Chinese parser applies only recognized filters", () => {
  assert.deepEqual(
    parseQuery("Find 2 Arts courses, no quizzes, no group projects, no Friday")
      .patch,
    {
      noQuizzes: true,
      noGroups: true,
      days: [0, 1, 2, 3],
      count: 2,
      domains: ["A"],
    },
  );
  assert.deepEqual(
    parseQuery("推荐2门艺术课，不要小测，不要早课，不要周五").patch,
    {
      noQuizzes: true,
      noEarly: true,
      days: [0, 1, 2, 3],
      count: 2,
      domains: ["A"],
    },
  );
  assert.equal(parseQuery("Write me a poem").matched, 0);
});
test("seat updates change safe eligibility and do not mutate original fixtures", () => {
  const c = courses.find((c) => c.seats === 0),
    p = { ...DEFAULT, priority: "safe" };
  assert.ok(reasons(c, p).includes("No open seats"));
  assert.ok(!reasons({ ...c, seats: 2 }, p).includes("No open seats"));
  assert.equal(c.seats, 0);
});
test("four-course planning remains comfortably inside 90-second goal", () => {
  const r = plan(courses, {
    ...DEFAULT,
    count: 4,
    noAttendance: false,
    noQuizzes: false,
    noEarly: false,
  });
  assert.ok(r.elapsed < 90000);
  assert.equal(r.plans.length, 3);
  for (const p of r.plans)
    assert.equal(
      p.score,
      Math.round(
        p.courses.reduce((n, c) => n + score(c, DEFAULT), 0) / p.courses.length,
      ),
    );
});
