import ICAL from "ical.js";

const zone = new ICAL.Component(ICAL.parse("BEGIN:VTIMEZONE\r\nTZID:Asia/Hong_Kong\r\nBEGIN:STANDARD\r\nDTSTART:19700101T000000\r\nTZOFFSETFROM:+0800\r\nTZOFFSETTO:+0800\r\nTZNAME:HKT\r\nEND:STANDARD\r\nEND:VTIMEZONE\r\n"));
ICAL.TimezoneService.register("Asia/Hong_Kong", new ICAL.Timezone({ component: zone, tzid: "Asia/Hong_Kong" }));

const codePattern = /\b([A-Z]{2,5})[ -]?(\d{4}[A-Z]?)\b/i;
const hkt = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Hong_Kong", weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
function local(value) {
  const p = Object.fromEntries(hkt.formatToParts(new Date(value)).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, day: days.indexOf(p.weekday), minute: Number(p.hour) * 60 + Number(p.minute) };
}
function clean(value, limit = 160) { return String(value || "").replace(/[\u0000-\u001f]+/g, " ").trim().slice(0, limit); }
export function normalisePreenrolled(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set(), rows = [];
  for (const item of value.slice(0, 320)) {
    if (!item || typeof item !== "object") continue;
    const code = clean(item.code, 12).toUpperCase();
    const start = new Date(item.startsAt), end = new Date(item.endsAt);
    if (!/^[A-Z]{2,5}\d{4}[A-Z]?$/.test(code) || !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start.getUTCFullYear() < 2020 || start.getUTCFullYear() > 2035 || end - start < 300000 || end - start > 21600000) continue;
    const startsAt = start.toISOString(), endsAt = end.toISOString(), key = `${code}|${startsAt}|${endsAt}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ id: key, code, summary: clean(item.summary), room: clean(item.room), instructor: clean(item.instructor), startsAt, endsAt });
  }
  return rows.sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.code.localeCompare(b.code));
}

export function parsePreenrolledIcs(text) {
  if (typeof text !== "string" || text.length > 512000 || !/BEGIN:VCALENDAR/i.test(text)) throw new Error("Choose a valid SIS .ics file under 500 KB.");
  let calendar;
  try { calendar = new ICAL.Component(ICAL.parse(text)); }
  catch { throw new Error("The calendar could not be read. Export a new .ics file from SIS."); }
  if (calendar.name !== "vcalendar") throw new Error("The selected file is not an iCalendar export.");
  const components = calendar.getAllSubcomponents("vevent");
  if (components.length > 500) throw new Error("This calendar contains too many events to import.");
  const rows = [], skipped = [];
  for (const component of components) {
    if (String(component.getFirstPropertyValue("status") || "").toUpperCase() === "CANCELLED") continue;
    let event;
    try { event = new ICAL.Event(component); } catch { skipped.push("invalid event"); continue; }
    const summary = clean(component.getFirstPropertyValue("summary"));
    const rawDescription = String(component.getFirstPropertyValue("description") || "");
    const description = clean(rawDescription, 1000);
    const codeMatch = `${summary} ${description}`.match(codePattern);
    if (!codeMatch || event.startDate?.isDate || !event.endDate) { skipped.push(summary || "untitled event"); continue; }
    const code = (codeMatch[1] + codeMatch[2]).toUpperCase();
    const room = clean(component.getFirstPropertyValue("location") || rawDescription.match(/\b(?:Room|Venue)\s*:\s*([^;\n]+)/i)?.[1]);
    const instructor = clean(component.getFirstPropertyValue("x-instructor") || rawDescription.match(/\bInstructor(?:s)?\s*:\s*([^;\n]+)/i)?.[1] || component.getFirstProperty("organizer")?.getParameter("cn"));
    const duration = event.duration.toSeconds();
    if (duration < 300 || duration > 21600) { skipped.push(summary); continue; }
    const iterator = event.isRecurring() ? event.iterator() : null;
    for (let i = 0; i < (iterator ? 60 : 1); i++) {
      const occurrence = iterator ? iterator.next() : event.startDate;
      if (!occurrence) break;
      const startsAt = occurrence.toJSDate().toISOString();
      const endsAt = new Date(new Date(startsAt).getTime() + duration * 1000).toISOString();
      rows.push({ code, summary, room, instructor, startsAt, endsAt });
      if (rows.length > 320) throw new Error("This calendar has more than 320 class meetings. Export one term at a time.");
    }
  }
  const meetings = normalisePreenrolled(rows);
  if (!meetings.length) throw new Error("No dated course meetings with course codes were found. Check the SIS export.");
  return { meetings, skipped: skipped.length, courseCount: new Set(meetings.map(x => x.code)).size };
}

export function lockedMeetings(meetings) {
  return meetings.map(row => {
    const start = local(row.startsAt), end = local(row.endsAt);
    return { ...start, start: start.minute, end: end.minute, code: row.code };
  }).filter(row => row.day >= 0 && row.end > row.start);
}
export function meetingsForWeek(meetings, week) {
  const first = new Date(`${week}T00:00:00Z`);
  if (!Number.isFinite(first.getTime())) return [];
  const last = new Date(first.getTime() + 7 * 86400000).toISOString().slice(0, 10);
  return meetings.map(row => ({ ...row, ...local(row.startsAt) })).filter(row => row.date >= week && row.date < last);
}
export function meetingLabel(row) {
  const start = local(row.startsAt), end = local(row.endsAt);
  const clock = minute => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
  return `${days[start.day]} ${clock(start.minute)}–${clock(end.minute)}`;
}
