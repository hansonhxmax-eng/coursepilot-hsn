export function reasons(course, p) {
  const errors = [];
  if (p.domains.length && !p.domains.includes(course.domain))
    errors.push("Outside selected domains");
  for (const [key, field, label] of [
    ["noAttendance", "attendance", "Attendance"],
    ["noQuizzes", "quizzes", "Quizzes"],
    ["noGroups", "group", "Group projects"],
  ]) {
    if (p[key] && course[field] !== false)
      errors.push(
        course[field] === null
          ? `${label} information missing`
          : `${label} required`,
      );
  }
  if (p.noEarly && course.sessions.some((s) => s.start < 600))
    errors.push("Class before 10:00");
  if (course.sessions.some((s) => !p.days.includes(s.day)))
    errors.push("Class on an unavailable day");
  if (p.priority === "safe" && course.seats < 1) errors.push("No open seats");
  if (course.stale) errors.push("Stale source record");
  return errors;
}
export function overlaps(a, b) {
  return a.sessions.some((x) =>
    b.sessions.some(
      (y) => x.day === y.day && x.start < y.end && y.start < x.end,
    ),
  );
}
export function score(c, p) {
  const fit = p.priority === "fit";
  const review = (c.rating / 5) * (fit ? 55 : 50),
    load = (4 - c.workload) * (fit ? 15 : 10);
  const access =
    c.seats > 0
      ? fit
        ? 10
        : 20
      : Math.max(0, (fit ? 7.5 : 15) - c.waitlist / (fit ? 8 : 4));
  return Math.round(Math.min(99, review + load + access));
}
export function plan(courses, p) {
  const started = performance.now();
  const eligible = courses.filter((c) => reasons(c, p).length === 0);
  const rejected = courses
    .filter((c) => reasons(c, p).length > 0)
    .map((c) => ({ id: c.id, reasons: reasons(c, p) }));
  const combos = [];
  function visit(chosen, from) {
    if (chosen.length === p.count) {
      const days = new Set(chosen.flatMap((c) => c.sessions.map((s) => s.day)));
      if (days.size > p.maxDays) return;
      const avg =
        chosen.reduce((sum, c) => sum + score(c, p), 0) / chosen.length;
      combos.push({
        courses: chosen,
        score: Math.round(avg),
        days: [...days].sort(),
        waitlisted: chosen.filter((c) => c.seats === 0).length,
      });
      return;
    }
    for (let i = from; i < eligible.length; i++)
      if (!chosen.some((c) => overlaps(c, eligible[i])))
        visit([...chosen, eligible[i]], i + 1);
  }
  visit([], 0);
  combos.sort(
    (a, b) =>
      b.score - a.score ||
      a.waitlisted - b.waitlisted ||
      a.days.length - b.days.length ||
      a.courses
        .map((c) => c.id)
        .join()
        .localeCompare(b.courses.map((c) => c.id).join()),
  );
  const picks = [];
  for (const c of combos) {
    if (
      picks.every(
        (pick) =>
          pick.courses.filter((x) => c.courses.some((y) => y.id === x.id))
            .length <= Math.max(0, p.count - 2),
      )
    )
      picks.push(c);
    if (picks.length === 3) break;
  }
  // If strict diversity yields fewer than three plans, retain other valid alternatives.
  for (const c of combos) {
    if (picks.length === 3) break;
    if (!picks.includes(c)) picks.push(c);
  }
  return {
    plans: picks,
    eligible: eligible.length,
    rejected,
    total: combos.length,
    elapsed: performance.now() - started,
  };
}
export function parseQuery(text) {
  const t = text.toLowerCase();
  const patch = {};
  let matched = 0;
  const flag = (regex, key, value = true) => {
    if (regex.test(t)) {
      patch[key] = value;
      matched++;
    }
  };
  flag(/no (?:mandatory )?attendance|不用签到|不(?:要|用)考勤/, "noAttendance");
  flag(/no quiz(?:zes)?|不要(?:测验|小测)/, "noQuizzes");
  flag(/no group(?: projects?)?|不要(?:小组|团队)/, "noGroups");
  flag(
    /no (?:early|morning)|before 10|mornings free|不要早[八课]|10am/,
    "noEarly",
  );
  flag(/four.day|4.day|四天/, "maxDays", 4);
  flag(/open seats|skip the waitlist|有余位|不要候补/, "priority", "safe");
  if (/no friday|friday (?:free|off)|周五没课|不要周五/.test(t)) {
    patch.days = [0, 1, 2, 3];
    matched++;
  }
  const count = t.match(/(?:find|give me|recommend|选|推荐)\s*([234])/);
  if (count) {
    patch.count = Number(count[1]);
    matched++;
  }
  const domains = [];
  for (const [regex, d] of [
    [/\barts?\b|艺术/, "A"],
    [/humanities|人文/, "H"],
    [/sustainab|可持续/, "SUS"],
    [/\btechnology\b|科技/, "T"],
  ])
    if (regex.test(t)) domains.push(d);
  if (domains.length) {
    patch.domains = domains;
    matched++;
  }
  return { patch, matched };
}
export const timeLabel = (m) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
