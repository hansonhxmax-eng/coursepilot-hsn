export const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const REAL_DEFAULT = {
  noEarly: false,
  days: [0, 1, 2, 3, 4, 5, 6],
  maxDays: 7,
  snapshotOpen: false,
  noAttendance: false,
  noQuizzes: false,
  noGroups: false,
};
export function meetingsOverlap(a, b) {
  if (a.day !== b.day || a.start >= b.end || b.start >= a.end) return false;
  const start = [a.dateStart, b.dateStart].filter(Boolean).sort().at(-1);
  const end = [a.dateEnd, b.dateEnd].filter(Boolean).sort()[0];
  if (start && end) {
    if (start > end) return false;
    const date = new Date(start + "T00:00:00Z");
    if (Number.isNaN(date.getTime())) return true;
    const day = (date.getUTCDay() + 6) % 7;
    date.setUTCDate(date.getUTCDate() + ((a.day - day + 7) % 7));
    if (date.toISOString().slice(0, 10) > end) return false;
  }
  return true;
}
export function sectionsOverlap(a, b) {
  return a.sessions.some((x) => b.sessions.some((y) => meetingsOverlap(x, y)));
}
export function sectionIssues(section, prefs) {
  const issues = [];
  if (!section.scheduleReadable || !section.sessions.length)
    issues.push("Time or section label needs verification");
  if (prefs.noEarly && section.sessions.some((s) => s.start < 600))
    issues.push("Class before 10:00");
  if (section.sessions.some((s) => !prefs.days.includes(s.day)))
    issues.push("Unavailable weekday");
  if (
    prefs.snapshotOpen &&
    !(typeof section.seats === "number" && section.seats > 0)
  )
    issues.push("No readable positive seat count in snapshot");
  return issues;
}
export function courseOptions(course, prefs, locks = {}, limit = 2000) {
  const unknowns = [];
  for (const [pref, key, label] of [
    ["noAttendance", "attendance", "attendance"],
    ["noQuizzes", "quizzes", "quizzes"],
    ["noGroups", "group", "group projects"],
  ]) {
    if (prefs[pref] && course[key] !== false)
      unknowns.push(`${label} not established by schedule PDFs`);
  }
  if (course.issues.length) unknowns.push(...course.issues);
  if (course.sections.some((s) => s.kind === "unknown"))
    unknowns.push(
      "Unclassified section component requires PDF verification; automatic pairing disabled",
    );
  if (/Matching between Lecture.*Tutorial required/i.test(course.sourceHeader))
    unknowns.push(
      "Lecture/tutorial matching requires SIS verification; automatic pairing disabled",
    );
  if (unknowns.length) return { options: [], issues: unknowns, limited: false };
  const groups = new Map();
  for (const s of course.sections) {
    if (!groups.has(s.kind)) groups.set(s.kind, []);
    if (
      s.kind !== "unknown" &&
      !sectionIssues(s, prefs).length &&
      (!locks[s.kind] || locks[s.kind] === s.id)
    )
      groups.get(s.kind).push(s);
  }
  // An unclassified alternative does not create a new required component. It is
  // excluded from search; known component types are never silently dropped.
  groups.delete("unknown");
  if (!groups.size)
    return {
      options: [],
      issues: ["No classified, readable components"],
      limited: false,
    };
  for (const [kind, sections] of groups)
    if (!sections.length)
      return {
        options: [],
        issues: [`No usable ${kind} section under these filters`],
        limited: false,
      };
  const options = [];
  let limited = false,
    steps = 0;
  const lists = [...groups.values()];
  function visit(chosen, i) {
    if (++steps > limit) {
      limited = true;
      return;
    }
    if (i === lists.length) {
      options.push(chosen);
      return;
    }
    for (const s of lists[i]) {
      if (!chosen.some((x) => sectionsOverlap(x, s)))
        visit([...chosen, s], i + 1);
      if (limited) break;
    }
  }
  visit([], 0);
  return {
    options,
    issues: options.length ? [] : ["Required components clash"],
    limited,
  };
}
export function generateSchedules(courses, prefs, locks = {}, settings = {}) {
  const started = performance.now();
  const maxStates = settings.maxStates ?? 200000;
  const maxMs = settings.maxMs ?? 1500;
  if (!courses.length)
    return {
      plans: [],
      issues: ["Choose at least one course."],
      visited: 0,
      limited: false,
      elapsed: 0,
    };
  if (courses.length > 6)
    return {
      plans: [],
      issues: ["Choose at most six courses."],
      visited: 0,
      limited: false,
      elapsed: 0,
    };
  const entries = courses.map((c) => ({
    course: c,
    ...courseOptions(c, prefs, locks[c.id]),
  }));
  const issues = entries
    .filter((e) => !e.options.length)
    .flatMap((e) => e.issues.map((i) => `${e.course.code}: ${i}`));
  if (issues.length)
    return {
      plans: [],
      issues,
      visited: 0,
      limited: entries.some((e) => e.limited),
      elapsed: performance.now() - started,
    };
  entries.sort((a, b) => a.options.length - b.options.length);
  let visited = 0,
    limited = entries.some((e) => e.limited),
    feasible = 0;
  const best = [];
  const compare = (a, b) =>
    a.days.length - b.days.length ||
    a.early - b.early ||
    a.signature.localeCompare(b.signature);
  function visit(chosen, i) {
    if (++visited > maxStates || performance.now() - started > maxMs) {
      limited = true;
      return;
    }
    if (i === entries.length) {
      const sections = chosen.flatMap((x) => x.sections),
        days = [
          ...new Set(sections.flatMap((s) => s.sessions.map((m) => m.day))),
        ].sort();
      if (days.length > prefs.maxDays) return;
      feasible++;
      const option = {
        items: chosen,
        days,
        early: sections.flatMap((s) => s.sessions).filter((m) => m.start < 600)
          .length,
        signature: sections
          .map((s) => s.id)
          .sort()
          .join("|"),
      };
      best.push(option);
      best.sort(compare);
      if (best.length > 3) best.pop();
      return;
    }
    for (const sections of entries[i].options) {
      if (
        sections.some((s) =>
          chosen.some((item) =>
            item.sections.some((x) => sectionsOverlap(s, x)),
          ),
        )
      )
        continue;
      const days = new Set([
        ...chosen.flatMap((item) =>
          item.sections.flatMap((s) => s.sessions.map((m) => m.day)),
        ),
        ...sections.flatMap((s) => s.sessions.map((m) => m.day)),
      ]);
      if (days.size > prefs.maxDays) continue;
      visit([...chosen, { course: entries[i].course, sections }], i + 1);
      if (visited > maxStates || performance.now() - started > maxMs) break;
    }
  }
  visit([], 0);
  return {
    plans: best,
    issues: best.length
      ? []
      : [
          "No conflict-free schedule under the current filters. Hard constraints were not relaxed.",
        ],
    visited,
    feasible,
    limited,
    elapsed: performance.now() - started,
  };
}
export function validateReviewImport(payload, knownCodes) {
  if (
    !payload ||
    payload.schemaVersion !== 1 ||
    payload.kind !== "ustspace-visible-snapshots" ||
    !Array.isArray(payload.courses)
  )
    throw new Error(
      "Expected a CoursePilot USTSpace snapshot JSON file (schemaVersion 1).",
    );
  if (payload.courses.length > 1000)
    throw new Error("Import exceeds 1,000 course entries.");
  const records = {};
  let skipped = 0;
  for (const row of payload.courses) {
    if (
      !row ||
      typeof row.courseCode !== "string" ||
      !knownCodes.has(row.courseCode)
    ) {
      skipped++;
      continue;
    }
    if (row.status !== "captured") continue;
    if (
      typeof row.text !== "string" ||
      !row.text.trim() ||
      row.text.length > 250000
    )
      throw new Error(`Invalid visible text for ${row.courseCode}.`);
    let u;
    try {
      u = new URL(row.sourceUrl);
    } catch {
      throw new Error("Invalid source URL.");
    }
    if (
      u.protocol !== "https:" ||
      !(u.hostname === "ust.space" || u.hostname.endsWith(".ust.space")) ||
      u.username ||
      u.password
    )
      throw new Error("Review sources must be HTTPS pages on ust.space.");
    u.search = "";
    u.hash = "";
    if (
      typeof row.capturedAt !== "string" ||
      Number.isNaN(Date.parse(row.capturedAt))
    )
      throw new Error("Missing capture timestamp.");
    records[row.courseCode] = {
      courseCode: row.courseCode,
      text: row.text,
      sourceUrl: u.toString(),
      capturedAt: row.capturedAt,
      completeness:
        row.completeness === "visible-content-only"
          ? "visible-content-only"
          : "unknown",
    };
  }
  return { records, skipped };
}
export function calendarSnapshot(items, weekStart) {
  // Week start is selected by the student. No official term/holiday dates are invented.
  const day = new Date(weekStart + "T00:00:00Z");
  if (Number.isNaN(day.getTime()) || day.getUTCDay() !== 1)
    throw new Error("Choose a Monday to export a single sample week.");
  const esc = (s) =>
    s
      .replace(/\\/g, "\\\\")
      .replace(/\r?\n/g, "\\n")
      .replace(/,/g, "\\,")
      .replace(/;/g, "\\;");
  const stamp = (d) =>
    d
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}Z/, "");
  const events = [];
  for (const { course, sections } of items)
    for (const section of sections)
      for (const [i, s] of section.sessions.entries()) {
        const base = new Date(day);
        base.setUTCDate(base.getUTCDate() + s.day);
        const date = base.toISOString().slice(0, 10);
        if (
          (s.dateStart && date < s.dateStart) ||
          (s.dateEnd && date > s.dateEnd)
        )
          continue;
        const start = new Date(base);
        start.setUTCMinutes(s.start);
        const end = new Date(base);
        end.setUTCMinutes(s.end);
        const event = [
          "BEGIN:VEVENT",
          `UID:${section.id}-${i}-${date}@coursepilot.snapshot`,
          `DTSTAMP:${stamp(new Date())}Z`,
          `DTSTART;TZID=Asia/Hong_Kong:${stamp(start)}`,
          `DTEND;TZID=Asia/Hong_Kong:${stamp(end)}`,
          `SUMMARY:${esc(course.code + " " + section.label + " " + course.title + " [PDF snapshot]")}`,
          `DESCRIPTION:${esc("User-selected sample week, not an official enrollment record. Verify dates and section pairing in SIS. Source: " + section.sourceFile)}`,
          "END:VEVENT",
        ].join("\r\n");
        // Multiple date-limited records for the same meeting should not duplicate an event.
        if (
          !events.some(
            (e) =>
              e.includes(`DTSTART;TZID=Asia/Hong_Kong:${stamp(start)}`) &&
              e.includes(
                "SUMMARY:" + esc(course.code + " " + section.label + " "),
              ),
          )
        )
          events.push(event);
      }
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CoursePilot//Uploaded Schedule Snapshot//EN",
    ...events,
    "END:VCALENDAR",
  ].join("\r\n");
}
