import React, { useState, useMemo, useEffect } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  Sparkles,
  SlidersHorizontal,
  LayoutDashboard,
  Library,
  Bell,
  CalendarDays,
  Clock3,
  Users,
  X,
  Search,
  Plus,
  Bookmark,
  CheckCircle2,
  CircleHelp,
  GraduationCap,
  Leaf,
  RefreshCw,
  AlertCircle,
  ExternalLink,
  Download,
  Send,
  ShieldCheck,
  Menu,
  Activity,
} from "lucide-react";
import {
  courses as initialCourses,
  DAYS,
  DOMAINS,
  DEFAULT,
  SCENARIOS,
} from "./data";
import { plan, reasons, score, timeLabel, parseQuery } from "./engine";
import "./style.css";
import ScheduleWorkspace from "./schedules/ScheduleWorkspace";
const COLORS = ["sage", "lavender", "peach", "blue"];
function readSaved() {
  try {
    return JSON.parse(localStorage.getItem("coursepilot:v1") || "{}");
  } catch {
    return {};
  }
}
function App() {
  const saved = useMemo(readSaved, []);
  const [prefs, setPrefs] = useState({ ...DEFAULT, ...saved.prefs });
  const [applied, setApplied] = useState({ ...DEFAULT, ...saved.prefs });
  const [data, setData] = useState(initialCourses);
  const [view, setView] = useState("schedules");
  const [selected, setSelected] = useState(0);
  const [query, setQuery] = useState("");
  const [queryNote, setQueryNote] = useState("");
  const [search, setSearch] = useState("");
  const [domain, setDomain] = useState("all");
  const [detail, setDetail] = useState(null);
  const [about, setAbout] = useState(false);
  const [watched, setWatched] = useState(
    saved.watched || ["HUMA1002", "SCIE1002"],
  );
  const [logs, setLogs] = useState([
    {
      id: 1,
      text: "Loaded 30 synthetic course records. Live SIS and USTspace are not connected.",
      time: "This session",
    },
  ]);
  const [notifications, setNotifications] = useState([]);
  const [toast, setToast] = useState("");
  const [mobile, setMobile] = useState(false);
  const result = useMemo(() => plan(data, applied), [data, applied]);
  const active = result.plans[Math.min(selected, result.plans.length - 1)];
  const dirty = JSON.stringify(prefs) !== JSON.stringify(applied);
  function notify(t) {
    setToast(t);
    window.clearTimeout(window.__toast);
    window.__toast = setTimeout(() => setToast(""), 4000);
  }
  function addLog(text) {
    setLogs((l) =>
      [
        {
          id: Date.now() + Math.random(),
          text,
          time: new Date().toLocaleTimeString("en-GB"),
        },
        ...l,
      ].slice(0, 60),
    );
  }
  function persist(p, w) {
    try {
      localStorage.setItem(
        "coursepilot:v1",
        JSON.stringify({ prefs: p, watched: w }),
      );
    } catch {
      notify(
        "Browser storage unavailable. Your changes are kept for this session.",
      );
    }
  }
  function generate(p = prefs) {
    setApplied({ ...p });
    setPrefs({ ...p });
    setSelected(0);
    const r = plan(data, p);
    persist(p, watched);
    addLog(
      `Planner checked ${data.length} records: ${r.eligible} eligible, ${r.total} conflict-free combinations; returned ${r.plans.length} plans. Hard constraints were not relaxed.`,
    );
    notify(
      r.plans.length
        ? "Your plans are ready. Every hard constraint checked."
        : "No matching plan. Try adjusting your preferences.",
    );
    setView("planner");
  }
  function applyQuery(e) {
    e.preventDefault();
    if (!query.trim()) return;
    const exact = SCENARIOS.find((s) => s.text === query);
    const parsed = parseQuery(query);
    if (!exact && !parsed.matched) {
      setQueryNote(
        "I could not map that request to supported filters. Try a sample scenario or use the preference controls.",
      );
      return;
    }
    const p = exact ? exact.prefs : { ...prefs, ...parsed.patch };
    setPrefs(p);
    setQueryNote(
      "Recognized filters are shown below. The parser supports a limited set of English and Chinese phrases; review all controls before generating.",
    );
    addLog(
      "Mapped a request to visible preference controls. Awaiting Generate plans.",
    );
    notify("Preferences updated. Review them, then generate your plans.");
  }
  function watch(id) {
    const next = watched.includes(id)
      ? watched.filter((x) => x !== id)
      : [...watched, id];
    setWatched(next);
    persist(applied, next);
    notify(
      next.includes(id)
        ? "Course added to your watchlist."
        : "Course removed from your watchlist.",
    );
  }
  function simulate() {
    if (!watched.length) {
      notify("Watch a course first to simulate an update.");
      return;
    }
    const id = watched[0],
      c = data.find((c) => c.id === id);
    const next = {
      ...c,
      seats: c.seats + 2,
      waitlist: Math.max(0, c.waitlist - 5),
    };
    setData((d) => d.map((x) => (x.id === id ? next : x)));
    const message = `${id}: ${next.seats} open seats · waitlist ${c.waitlist} → ${next.waitlist}`;
    setNotifications((n) => [
      { message, time: new Date().toLocaleTimeString("en-GB") },
      ...n,
    ]);
    addLog(
      `SIMULATED update — ${message}. Plans rechecked using updated fixtures.`,
    );
    notify("Demo update received. Plans and availability refreshed.");
  }
  function exportPlan() {
    if (!active) return;
    const escape = (s) =>
      s
        .replace(/\\/g, "\\\\")
        .replace(/\n/g, "\\n")
        .replace(/,/g, "\\,")
        .replace(/;/g, "\\;");
    const entries = active.courses.flatMap((c) =>
      c.sessions.map((s, i) => {
        const date = new Date(Date.UTC(2027, 1, 1 + s.day, 0, s.start));
        const stamp = (d) =>
          d
            .toISOString()
            .replace(/[-:]/g, "")
            .replace(/\.\d{3}Z/, "");
        return [
          "BEGIN:VEVENT",
          `UID:${c.id}-${i}@coursepilot.demo`,
          "DTSTAMP:20270101T000000Z",
          `DTSTART;TZID=Asia/Hong_Kong:${stamp(date)}`,
          `DTEND;TZID=Asia/Hong_Kong:${stamp(new Date(date.getTime() + 90 * 60000))}`,
          "RRULE:FREQ=WEEKLY;COUNT=12",
          `SUMMARY:${escape(c.id + " " + c.title + " [DEMO]")}`,
          "DESCRIPTION:Synthetic course schedule. Not official SIS data.",
          "END:VEVENT",
        ].join("\r\n");
      }),
    );
    const blob = new Blob(
      [
        [
          "BEGIN:VCALENDAR",
          "VERSION:2.0",
          "PRODID:-//CoursePilot//Demo planner//EN",
          "X-WR-CALNAME:CoursePilot DEMO",
          ...entries,
          "END:VCALENDAR",
        ].join("\r\n"),
      ],
      { type: "text/calendar" },
    );
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = "coursepilot-demo-plan.ics";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    addLog(
      "Exported demonstration timetable (12 sample weeks from 1 February 2027, Hong Kong time).",
    );
    notify("Demo timetable exported. Dates are illustrative.");
  }
  useEffect(() => {
    if (!detail && !about) return;
    const previous = document.activeElement;
    function keys(e) {
      if (e.key === "Escape") {
        setDetail(null);
        setAbout(false);
      }
      if (e.key === "Tab") {
        const dialog = document.querySelector("[role=dialog]");
        const items = dialog?.querySelectorAll(
          'button, a[href], input, select, [tabindex="0"]',
        );
        if (!items?.length) return;
        const first = items[0],
          last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", keys);
    return () => {
      document.removeEventListener("keydown", keys);
      previous?.focus();
    };
  }, [detail, about]);
  const toggle = (k, v) => setPrefs((p) => ({ ...p, [k]: v }));
  const navigate = (v) => {
    setView(v);
    setMobile(false);
  };
  return (
    <div className="app">
      <aside className={`sidebar ${mobile ? "mobile-open" : ""}`}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate("schedules");
          }}
        >
          <span className="brand-icon">
            <GraduationCap size={24} />
          </span>
          coursepilot<span className="brand-dot">.</span>
        </a>
        <div className="workspace-label">YOUR WORKSPACE</div>
        <nav>
          {[
            ["schedules", CalendarDays, "Real schedules"],
            ["planner", LayoutDashboard, "Preference demo"],
            ["catalog", Library, "Demo catalog"],
            ["watchlist", Bell, "Demo watchlist"],
            ["sources", ExternalLink, "Official sources"],
            ["activity", Activity, "Demo activity"],
          ].map(([id, Icon, label]) => (
            <button
              key={id}
              className={view === id ? "nav-item active" : "nav-item"}
              onClick={() => navigate(id)}
            >
              <Icon size={19} />
              {label}
              {id === "watchlist" && (
                <span className="nav-count">{watched.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <div className="orb">
            <Sparkles size={20} />
          </div>
          <h3>
            Less guesswork.
            <br />
            More possibilities.
          </h3>
          <p>A little planning makes room for a lot more life.</p>
          <span className="little-doodle">
            ✧ <span>↗</span>
          </span>
        </div>
        <div className="sidebar-bottom">
          <button onClick={() => setAbout(true)}>
            <CircleHelp size={17} /> About this prototype{" "}
            <ArrowUpRight size={14} />
          </button>
          <div className="profile">
            <span className="avatar">Y</span>
            <div>
              <strong>Your workspace</strong>
              <small>Student · local session</small>
            </div>
            <span className="status-dot" />
          </div>
        </div>
      </aside>
      {mobile && (
        <button
          className="scrim"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <main>
        <header>
          <div className="breadcrumb">
            <button
              className="mobile-menu icon-btn"
              aria-label="Open menu"
              onClick={() => setMobile(true)}
            >
              <Menu size={21} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>
              {
                {
                  schedules: "Real schedules",
                  planner: "Preference demo",
                  catalog: "Demo catalog",
                  watchlist: "Demo watchlist",
                  activity: "Demo activity",
                  sources: "Official sources",
                }[view]
              }
            </strong>
          </div>
          <div className="header-right">
            <span className="term">
              <CalendarDays size={14} />{" "}
              {view === "schedules" ? "2026–27 Fall" : "Spring 2027"}{" "}
              <span className="demo-mini">
                {view === "schedules" ? "COURSES & REVIEWS" : "DEMO"}
              </span>
            </span>
            <button
              className="notification-btn icon-btn"
              aria-label={`Notifications: ${notifications.length}`}
              onClick={() => navigate("watchlist")}
            >
              <Bell size={19} />
              {notifications.length > 0 && <i />}
            </button>
            <span className="avatar small">Y</span>
          </div>
        </header>
        <div className="main-inner">
          <div className="demo-banner">
            <span>
              <span className="live-dot" />{" "}
              {view === "schedules" ? "UPLOADED SCHEDULES" : "SAMPLE MODE"}
            </span>
            <p>
              {view === "schedules"
                ? "Your 2026–27 Fall courses, student reviews and timetable planner."
                : "Preference demo: 30 synthetic courses. Reviews and availability in this mode are simulated."}
            </p>
            <button onClick={() => navigate("sources")}>
              Official sources <ArrowUpRight size={13} />
            </button>
          </div>
          <section className="page-title">
            <div>
              <div className="eyebrow">
                {view === "planner"
                  ? "YOUR NEXT SEMESTER, REIMAGINED"
                  : "A CLEARER PICTURE"}
              </div>
              <h1>
                {
                  {
                    schedules: (
                      <>
                        Your real courses. <em>A clearer plan.</em>
                      </>
                    ),
                    planner: (
                      <>
                        Make room for <em>what matters.</em>
                      </>
                    ),
                    catalog: (
                      <>
                        Find your next <em>curiosity.</em>
                      </>
                    ),
                    watchlist: (
                      <>
                        Keep your options <em>open.</em>
                      </>
                    ),
                    activity: (
                      <>
                        Every decision, <em>in the open.</em>
                      </>
                    ),
                    sources: (
                      <>
                        Your campus, <em>one click away.</em>
                      </>
                    ),
                  }[view]
                }
              </h1>
              <p>
                {
                  {
                    schedules:
                      "Browse courses and student reviews, choose sections, and plan your timetable.",
                    planner:
                      "Good courses. A better schedule. A little more breathing room.",
                    catalog: "Explore the details behind every recommendation.",
                    watchlist:
                      "Follow the courses you care about and explore simulated seat updates.",
                    activity:
                      "A transparent trail of your preferences, plans, and demo updates.",
                    sources:
                      "Open your official sources. Sign in securely. Verify before you enroll.",
                  }[view]
                }
              </p>
            </div>
            <div className="title-mark">
              <Leaf size={30} />
              <span>
                Thoughtfully planned.
                <br />
                Personally yours.
              </span>
            </div>
          </section>
          <div hidden={view !== "schedules"}>
            <ScheduleWorkspace />
          </div>
          {view === "planner" && (
            <>
              <form className="ask-bar" onSubmit={applyQuery}>
                <span className="ask-icon">
                  <Sparkles size={20} />
                </span>
                <input
                  aria-label="Describe your ideal semester"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Describe your ideal semester. Try ‘no early classes, no quizzes…’"
                />
                <button
                  type="submit"
                  className="ask-submit"
                  aria-label="Apply request"
                >
                  <ArrowRight size={20} />
                </button>
              </form>
              <div className="query-examples">
                <span>START WITH AN IDEA</span>
                {SCENARIOS.slice(0, 3).map((s, i) => (
                  <button
                    key={s.title}
                    onClick={() => {
                      setQuery(s.text);
                      setPrefs({ ...s.prefs });
                      setQueryNote(
                        "Sample preferences loaded. Review the controls, then generate your plans.",
                      );
                    }}
                  >
                    {
                      [
                        "Mornings are mine",
                        "A four-day week",
                        "Arts & humanities",
                      ][i]
                    }{" "}
                    <Plus size={12} />
                  </button>
                ))}
                <button className="text-link" onClick={() => setAbout(true)}>
                  All 5 scenarios <ArrowUpRight size={12} />
                </button>
              </div>
              {queryNote && (
                <div className="query-note">
                  <CircleHelp size={14} />
                  {queryNote}
                  <button
                    className="icon-btn"
                    aria-label="Dismiss query information"
                    onClick={() => setQueryNote("")}
                  >
                    <X size={13} />
                  </button>
                </div>
              )}
              <div className="planner-grid">
                <section className="preferences card">
                  <div className="section-heading">
                    <h2>
                      <SlidersHorizontal size={17} />
                      Your preferences
                    </h2>
                    <button
                      className="text-link"
                      onClick={() => {
                        setPrefs({ ...DEFAULT });
                        setQuery("");
                        setQueryNote("");
                      }}
                    >
                      Reset
                    </button>
                  </div>
                  <div className="pref-content">
                    <label className="field-label" htmlFor="course-count">
                      YOUR COURSE LOAD
                    </label>
                    <div className="select-wrapper">
                      <select
                        id="course-count"
                        value={prefs.count}
                        onChange={(e) =>
                          toggle("count", Number(e.target.value))
                        }
                      >
                        <option value={2}>2 courses · 6 credits</option>
                        <option value={3}>3 courses · 9 credits</option>
                        <option value={4}>4 courses · 12 credits</option>
                      </select>
                      <ChevronDown size={14} />
                    </div>
                    <div className="field-label spaced">
                      COMMON CORE DOMAINS <span>Any if none selected</span>
                    </div>
                    <div className="domain-pills">
                      {Object.keys(DOMAINS).map((d) => (
                        <button
                          key={d}
                          title={DOMAINS[d]}
                          aria-pressed={prefs.domains.includes(d)}
                          className={prefs.domains.includes(d) ? "chosen" : ""}
                          onClick={() =>
                            toggle(
                              "domains",
                              prefs.domains.includes(d)
                                ? prefs.domains.filter((x) => x !== d)
                                : [...prefs.domains, d],
                            )
                          }
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                    <div className="field-label spaced">
                      MY NON-NEGOTIABLES <ShieldCheck size={13} />
                    </div>
                    <div className="toggles">
                      {[
                        ["noEarly", "No early classes", "Nothing before 10:00"],
                        [
                          "noAttendance",
                          "No mandatory attendance",
                          "Learn on your own terms",
                        ],
                        ["noQuizzes", "No quizzes", "One less thing to juggle"],
                        [
                          "noGroups",
                          "No group projects",
                          "Keep your work your own",
                        ],
                      ].map(([key, label, sub]) => (
                        <label className="toggle-row" key={key}>
                          <span>
                            <strong>{label}</strong>
                            <small>{sub}</small>
                          </span>
                          <input
                            type="checkbox"
                            checked={prefs[key]}
                            onChange={(e) => toggle(key, e.target.checked)}
                          />
                          <span className="switch" />
                        </label>
                      ))}
                    </div>
                    <div className="field-label spaced">DAYS I CAN ATTEND</div>
                    <div className="day-buttons">
                      {DAYS.map((d, i) => (
                        <button
                          key={d}
                          aria-pressed={prefs.days.includes(i)}
                          className={prefs.days.includes(i) ? "chosen" : ""}
                          onClick={() =>
                            toggle(
                              "days",
                              prefs.days.includes(i)
                                ? prefs.days.filter((x) => x !== i)
                                : [...prefs.days, i],
                            )
                          }
                        >
                          {d.slice(0, 1)}
                        </button>
                      ))}
                    </div>
                    <label className="max-days" htmlFor="max-days">
                      Maximum days on campus{" "}
                      <select
                        id="max-days"
                        value={prefs.maxDays}
                        onChange={(e) =>
                          toggle("maxDays", Number(e.target.value))
                        }
                      >
                        {[1, 2, 3, 4, 5].map((n) => (
                          <option key={n} value={n}>
                            {n} days
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="field-label spaced">WHAT MATTERS MOST?</div>
                    <div className="priority-options">
                      {[
                        ["balanced", "A good balance"],
                        ["safe", "Open seats only"],
                        ["fit", "Review & workload fit"],
                      ].map(([v, t]) => (
                        <label key={v}>
                          <input
                            type="radio"
                            name="priority"
                            checked={prefs.priority === v}
                            onChange={() => toggle("priority", v)}
                          />
                          {t}
                        </label>
                      ))}
                    </div>
                    <button
                      className="primary generate"
                      onClick={() => generate()}
                    >
                      <Sparkles size={16} />
                      Generate my plans <ArrowRight size={16} />
                    </button>
                    <p className="private-note">
                      <ShieldCheck size={12} />
                      Preferences stay in this browser
                    </p>
                  </div>
                </section>
                <div className="results">
                  <div className="results-title">
                    <div>
                      <h2>
                        Your possibilities{" "}
                        <span>{result.plans.length} plans</span>
                      </h2>
                      <p>
                        {dirty
                          ? "Preferences changed. Generate to update these results."
                          : "Different routes. The same non-negotiables."}
                      </p>
                    </div>
                    <span className={`checked-label ${dirty ? "pending" : ""}`}>
                      <span />
                      {dirty ? "Update pending" : "Constraints checked"}
                    </span>
                  </div>
                  {result.plans.length > 0 ? (
                    <>
                      <div className="plan-tabs">
                        {result.plans.map((p, i) => (
                          <button
                            className={`plan-tab ${selected === i ? "selected" : ""}`}
                            key={i}
                            onClick={() => setSelected(i)}
                          >
                            <div>
                              <span className="plan-name">
                                PLAN {String.fromCharCode(65 + i)}
                              </span>
                              {i === 0 && (
                                <span className="recommended">
                                  <Sparkles size={10} /> Best fit
                                </span>
                              )}
                            </div>
                            <h3>
                              {
                                [
                                  "Your sweet spot",
                                  "Another good direction",
                                  "Room for a backup",
                                ][i]
                              }
                            </h3>
                            <div className="plan-score">
                              <strong>
                                {p.score}
                                <small>/100</small>
                              </strong>
                              <span>
                                fit score
                                <ArrowUpRight size={13} />
                              </span>
                            </div>
                            <div className="plan-footer">
                              <span>
                                {p.courses.length * 3} credits · {p.days.length}{" "}
                                days
                              </span>
                              <span>
                                {p.waitlisted
                                  ? `${p.waitlisted} waitlisted`
                                  : "All open seats"}
                              </span>
                            </div>
                          </button>
                        ))}
                      </div>
                      <section className="schedule card">
                        <div className="section-heading">
                          <h2>
                            <CalendarDays size={17} /> Your week, at a glance
                          </h2>
                          <button className="text-link" onClick={exportPlan}>
                            <Download size={14} /> Export .ics
                          </button>
                        </div>
                        <div className="calendar-scroll">
                          <div className="calendar">
                            <div className="calendar-head">
                              <span>HKT</span>
                              {DAYS.map((d) => (
                                <strong key={d}>{d}</strong>
                              ))}
                            </div>
                            <div className="calendar-body">
                              <div className="time-axis">
                                {[9, 11, 13, 15, 17, 19].map((h) => (
                                  <span
                                    key={h}
                                    style={{ top: `${((h - 9) / 11) * 100}%` }}
                                  >
                                    {h}:00
                                  </span>
                                ))}
                              </div>
                              {DAYS.map((d, di) => (
                                <div className="day-column" key={d}>
                                  {[9, 11, 13, 15, 17, 19].map((h) => (
                                    <div
                                      key={h}
                                      className="gridline"
                                      style={{
                                        top: `${((h - 9) / 11) * 100}%`,
                                      }}
                                    />
                                  ))}
                                  {active.courses.flatMap((c, ci) =>
                                    c.sessions
                                      .filter((s) => s.day === di)
                                      .map((s, si) => (
                                        <button
                                          key={`${c.id}-${si}`}
                                          className={`calendar-event ${COLORS[ci % 4]}`}
                                          style={{
                                            top: `${((s.start - 540) / 660) * 100}%`,
                                            height: `${((s.end - s.start) / 660) * 100}%`,
                                          }}
                                          onClick={() => setDetail(c)}
                                        >
                                          <strong>{c.id}</strong>
                                          <span>{c.title}</span>
                                          <small>
                                            {timeLabel(s.start)} –{" "}
                                            {timeLabel(s.end)}
                                          </small>
                                        </button>
                                      )),
                                  )}
                                  {!active.days.includes(di) && (
                                    <span className="free-day">
                                      <Leaf size={17} />
                                      Room to breathe
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className="schedule-foot">
                          <span>
                            <CheckCircle2 size={13} />
                            No timetable clashes
                          </span>
                          <span>
                            <CheckCircle2 size={13} />
                            All hard constraints met
                          </span>
                          <span>
                            {result.elapsed.toFixed(0)} ms planning time
                          </span>
                        </div>
                      </section>
                      <div className="plan-insight">
                        <div>
                          <Sparkles size={16} />
                          <strong>
                            Why Plan{" "}
                            {String.fromCharCode(
                              65 + Math.min(selected, result.plans.length - 1),
                            )}{" "}
                            works
                          </strong>
                        </div>
                        <p>
                          {active.courses.length} courses across{" "}
                          {active.days.length} campus days, with{" "}
                          {5 - active.days.length} weekday
                          {5 - active.days.length === 1 ? "" : "s"} free.{" "}
                          {active.waitlisted
                            ? `${active.waitlisted} course(s) have no open seats; watch them and keep an alternative ready.`
                            : "Every course currently has open seats in the demo data."}
                        </p>
                        <small>
                          Trade-offs:{" "}
                          {active.courses.some((c) => c.group)
                            ? "Includes group work. "
                            : "No group projects. "}
                          {active.courses.some((c) => c.quizzes)
                            ? "Includes quizzes. "
                            : "No quizzes. "}
                          Estimated independent workload:{" "}
                          {active.courses.reduce((n, c) => n + c.workload, 0)}{" "}
                          hours/week. Seat availability can change.
                        </small>
                      </div>
                      <section className="course-list">
                        <div className="results-title">
                          <h2>The courses behind your plan</h2>
                          <span className="muted">
                            Click a course for the full picture
                          </span>
                        </div>
                        {active.courses.map((c, i) => (
                          <CourseRow
                            key={c.id}
                            c={c}
                            color={COLORS[i % 4]}
                            p={applied}
                            onOpen={() => setDetail(c)}
                            watched={watched.includes(c.id)}
                            onWatch={() => watch(c.id)}
                          />
                        ))}
                      </section>
                      <div className="transparency">
                        <ShieldCheck size={17} />
                        <div>
                          <strong>A fit score, not a promise.</strong>
                          <p>
                            Scores combine sample review ratings, workload and
                            seat availability. They do not predict grades or
                            admission. Always verify official course details
                            before enrolling.
                          </p>
                        </div>
                        <button
                          onClick={() => setAbout(true)}
                          aria-label="Read scoring methodology"
                        >
                          <ArrowUpRight size={17} />
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="empty-state card">
                      <span className="empty-icon">
                        <Search size={32} />
                      </span>
                      <h2>No plan fits every constraint yet.</h2>
                      <p>
                        {result.eligible} courses match individually, but no set
                        of {applied.count} fits your timetable and maximum
                        campus days. Your hard constraints have not been
                        relaxed.
                      </p>
                      <button
                        className="primary"
                        onClick={() => {
                          setPrefs({ ...DEFAULT });
                          generate({ ...DEFAULT });
                        }}
                      >
                        Try the balanced sample <ArrowRight size={16} />
                      </button>
                      <button
                        className="text-link"
                        onClick={() => navigate("catalog")}
                      >
                        Explore courses and exclusions
                      </button>
                    </div>
                  )}
                  <div className="pipeline">
                    <span>
                      <Check size={12} />
                      30 records loaded
                    </span>
                    <ChevronRight size={12} />
                    <span>
                      <Check size={12} />
                      {result.eligible} eligible
                    </span>
                    <ChevronRight size={12} />
                    <span>
                      <Check size={12} />
                      {result.total} valid combinations
                    </span>
                    <button onClick={() => navigate("activity")}>
                      View log <ArrowUpRight size={12} />
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
          {view === "sources" && (
            <>
              <div className="source-boundary">
                <ShieldCheck size={22} />
                <div>
                  <strong>Your accounts stay yours.</strong>
                  <p>
                    Sign in or create an account on the official websites.
                    CoursePilot does not ask for your password, inspect your
                    login session, or claim to sync protected data. Opening a
                    website does not connect it to this prototype.
                  </p>
                </div>
                <span className="connection-state">
                  <span />
                  Manual access
                </span>
              </div>
              <div className="source-grid">
                <article className="source-card card">
                  <div className="source-card-top">
                    <span className="source-logo lavender">
                      <Library size={25} />
                    </span>
                    <span className="source-type">COURSE REVIEWS</span>
                  </div>
                  <h2>USTSpace</h2>
                  <p className="source-intro">
                    Hear from students who have been there. Use reviews to check
                    workload, grading experiences, quizzes and group projects.
                  </p>
                  <div className="source-address">
                    ust.space/review <ExternalLink size={12} />
                  </div>
                  <ol className="source-steps">
                    <li>
                      <span>01</span>
                      <div>
                        <strong>Open the review website</strong>
                        <p>Use the official USTSpace review entry below.</p>
                      </div>
                    </li>
                    <li>
                      <span>02</span>
                      <div>
                        <strong>Log in or create your own account</strong>
                        <p>
                          Complete any registration or sign-in directly on
                          USTSpace. Never enter those credentials here.
                        </p>
                      </div>
                    </li>
                    <li>
                      <span>03</span>
                      <div>
                        <strong>Look up your intended courses</strong>
                        <p>
                          Check the semester, instructor and review context.
                          Student opinions are not guaranteed grading outcomes.
                        </p>
                      </div>
                    </li>
                  </ol>
                  <a
                    className="primary full"
                    href="https://ust.space/review"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open USTSpace reviews <ArrowUpRight size={16} />
                  </a>
                  <small>
                    Opens a new tab · Login or registration may be required
                  </small>
                </article>
                <article className="source-card card">
                  <div className="source-card-top">
                    <span className="source-logo sage">
                      <GraduationCap size={26} />
                    </span>
                    <span className="source-type">OFFICIAL ENROLLMENT</span>
                  </div>
                  <h2>HKUST Student Center</h2>
                  <p className="source-intro">
                    Confirm official class times, enrollment restrictions,
                    available seats and waitlists through your university
                    portal.
                  </p>
                  <div className="source-address">
                    itso.hkust.edu.hk/student-hotlinks/{" "}
                    <ExternalLink size={12} />
                  </div>
                  <ol className="source-steps">
                    <li>
                      <span>01</span>
                      <div>
                        <strong>Open Student Hotlinks</strong>
                        <p>
                          Start at the official HKUST ITSO student directory.
                        </p>
                      </div>
                    </li>
                    <li>
                      <span>02</span>
                      <div>
                        <strong>Select Student Center and sign in</strong>
                        <p>
                          Complete university authentication on the official
                          site.
                        </p>
                      </div>
                    </li>
                    <li>
                      <span>03</span>
                      <div>
                        <strong>My Favorites → Academics</strong>
                        <p>
                          Follow your usual SIS path and verify the current
                          semester before making enrollment decisions.
                        </p>
                      </div>
                    </li>
                  </ol>
                  <a
                    className="primary full"
                    href="https://itso.hkust.edu.hk/student-hotlinks/"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open HKUST Student Hotlinks <ArrowUpRight size={16} />
                  </a>
                  <small>
                    Opens a new tab · University authentication required
                  </small>
                </article>
              </div>
              <section className="official-route card">
                <div>
                  <span className="eyebrow">YOUR SIS ACCESS PATH</span>
                  <h2>Follow the familiar route.</h2>
                </div>
                <div className="route-steps">
                  {[
                    "Student Hotlinks",
                    "Student Center",
                    "My Favorites",
                    "Academics",
                  ].map((step, i) => (
                    <React.Fragment key={step}>
                      <span>
                        <small>0{i + 1}</small>
                        {step}
                      </span>
                      {i < 3 && <ChevronRight size={15} />}
                    </React.Fragment>
                  ))}
                </div>
              </section>
              <section className="source-return">
                <CircleHelp size={20} />
                <div>
                  <h3>What happens after I log in?</h3>
                  <p>
                    Your login session stays on the official website. Return to
                    this tab to continue planning. Real schedules uses uploaded
                    course records; the preference demo uses synthetic course
                    records. This version does not scrape reviews or read your
                    SIS account. Compare the planner output with official
                    information, and complete any real enrollment yourself in
                    SIS.
                  </p>
                </div>
                <button
                  className="text-link"
                  onClick={() => navigate("planner")}
                >
                  Back to planner <ArrowRight size={14} />
                </button>
              </section>
            </>
          )}
          {view === "catalog" && (
            <>
              <div className="catalog-toolbar">
                <label className="search-field">
                  <Search size={18} />
                  <input
                    aria-label="Search courses"
                    placeholder="Search courses, codes, or instructors"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
                <select
                  aria-label="Filter by domain"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                >
                  <option value="all">All domains</option>
                  {Object.entries(DOMAINS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v} ({k})
                    </option>
                  ))}
                </select>
                <span className="muted">30 demo records</span>
              </div>
              <div className="catalog-grid">
                {data
                  .filter(
                    (c) =>
                      (domain === "all" || c.domain === domain) &&
                      `${c.title} ${c.id} ${c.instructor}`
                        .toLowerCase()
                        .includes(search.toLowerCase()),
                  )
                  .map((c) => (
                    <article className="catalog-card card" key={c.id}>
                      <div className="catalog-top">
                        <span
                          className={`domain-tag ${COLORS[Object.keys(DOMAINS).indexOf(c.domain) % 4]}`}
                        >
                          {DOMAINS[c.domain]}
                        </span>
                        <button
                          className={`icon-btn ${watched.includes(c.id) ? "saved" : ""}`}
                          aria-label={`${watched.includes(c.id) ? "Unwatch" : "Watch"} ${c.id}`}
                          onClick={() => watch(c.id)}
                        >
                          <Bookmark
                            size={18}
                            fill={
                              watched.includes(c.id) ? "currentColor" : "none"
                            }
                          />
                        </button>
                      </div>
                      <small className="course-code">
                        {c.id} · {c.credits} credits
                      </small>
                      <button
                        className="course-title-button"
                        onClick={() => setDetail(c)}
                      >
                        {c.title}
                        <ArrowUpRight size={16} />
                      </button>
                      <p>
                        {c.instructor} · {c.workload}h weekly workload
                      </p>
                      <div className="tags">
                        {c.attendance === false && <span>No attendance</span>}
                        {!c.quizzes && <span>No quizzes</span>}
                        {!c.group && <span>Individual work</span>}
                      </div>
                      <div className="catalog-status">
                        <Availability c={c} />
                        <button
                          className="text-link"
                          onClick={() => setDetail(c)}
                        >
                          Details <ChevronRight size={13} />
                        </button>
                      </div>
                      {reasons(c, applied).length > 0 && (
                        <div className="excluded">
                          <AlertCircle size={12} />
                          {reasons(c, applied)[0]}
                        </div>
                      )}
                    </article>
                  ))}
              </div>
              {!data.some(
                (c) =>
                  (domain === "all" || c.domain === domain) &&
                  `${c.title} ${c.id} ${c.instructor}`
                    .toLowerCase()
                    .includes(search.toLowerCase()),
              ) && (
                <div className="empty-state card">
                  <Search size={30} />
                  <h2>No courses found</h2>
                  <p>Try another keyword or domain.</p>
                  <button
                    className="primary"
                    onClick={() => {
                      setSearch("");
                      setDomain("all");
                    }}
                  >
                    Clear filters
                  </button>
                </div>
              )}
            </>
          )}
          {view === "watchlist" && (
            <>
              <div className="watch-info">
                <div>
                  <span className="eyebrow">SIMULATION MODE</span>
                  <h2>A backup plan starts here.</h2>
                  <p>
                    Updates run only when you click the button. There is no
                    background polling, SIS connection, or external notification
                    delivery.
                  </p>
                </div>
                <button className="primary" onClick={simulate}>
                  <RefreshCw size={16} />
                  Simulate seat update
                </button>
              </div>
              <div className="watch-layout">
                <section>
                  <div className="results-title">
                    <h2>Watching {watched.length} courses</h2>
                    <button
                      className="text-link"
                      onClick={() => navigate("catalog")}
                    >
                      Add courses <Plus size={14} />
                    </button>
                  </div>
                  {watched.map((id, i) => {
                    const c = data.find((x) => x.id === id);
                    return (
                      c && (
                        <CourseRow
                          key={id}
                          c={c}
                          color={COLORS[i % 4]}
                          p={applied}
                          onOpen={() => setDetail(c)}
                          watched
                          onWatch={() => watch(id)}
                        />
                      )
                    );
                  })}
                  {!watched.length && (
                    <div className="empty-state card">
                      <Bell size={30} />
                      <h2>Your watchlist is clear.</h2>
                      <p>
                        Bookmark a course in the explorer to follow its demo
                        availability.
                      </p>
                      <button
                        className="primary"
                        onClick={() => navigate("catalog")}
                      >
                        Explore courses
                      </button>
                    </div>
                  )}
                </section>
                <section className="card updates">
                  <h2>
                    <Bell size={17} />
                    Demo notifications
                  </h2>
                  {notifications.length ? (
                    notifications.map((n, i) => (
                      <div className="update-item" key={i}>
                        <span className="live-dot" />
                        <div>
                          <strong>{n.message}</strong>
                          <p>{n.time} · Simulated, this session only</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="notification-empty">
                      <Bell size={26} />
                      <p>
                        No updates yet.
                        <br />
                        Run a simulation to see what happens.
                      </p>
                    </div>
                  )}
                </section>
              </div>
            </>
          )}
          {view === "activity" && (
            <section className="card activity">
              <div className="section-heading">
                <h2>
                  <Activity size={18} />
                  Decision trail
                </h2>
                <span className="muted">Current session only</span>
              </div>
              {logs.map((l) => (
                <div className="log-item" key={l.id}>
                  <span className="log-dot" />
                  <div>
                    <time>{l.time}</time>
                    <p>{l.text}</p>
                  </div>
                  <CheckCircle2 size={16} />
                </div>
              ))}
              <div className="audit">
                <h3>Current exclusion matrix</h3>
                <p>
                  These courses were excluded by the last generated preferences.
                </p>
                {result.rejected.map((c) => (
                  <div key={c.id}>
                    <strong>{c.id}</strong>
                    <span>{c.reasons.join(" · ")}</span>
                  </div>
                ))}
                {!result.rejected.length && (
                  <p>
                    No individual exclusions. Timetable conflicts are still
                    checked.
                  </p>
                )}
              </div>
            </section>
          )}
          <footer>
            <span>
              <GraduationCap size={15} />
              coursepilot <span>·</span> Built for a little more balance.
            </span>
            <span>
              AISC · Group 12 <span>✦</span> Prototype v1.0
            </span>
          </footer>
        </div>
      </main>
      {detail && (
        <div className="modal-backdrop" onClick={() => setDetail(null)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="course-dialog-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              autoFocus
              className="modal-close icon-btn"
              aria-label="Close course details"
              onClick={() => setDetail(null)}
            >
              <X size={20} />
            </button>
            <span className="eyebrow">
              SYNTHETIC COURSE RECORD · {detail.domain}
            </span>
            <p className="course-code">
              {detail.id} · {detail.credits} credits
            </p>
            <h2 id="course-dialog-title">{detail.title}</h2>
            <p className="modal-intro">{detail.description}</p>
            <div className="detail-stats">
              <div>
                <strong>{detail.rating}/5</strong>
                <span>Demo review rating</span>
              </div>
              <div>
                <strong>{detail.workload}h</strong>
                <span>Weekly workload</span>
              </div>
              <div>
                <strong>{score(detail, applied)}/100</strong>
                <span>Heuristic fit score</span>
              </div>
            </div>
            <h3>What to expect</h3>
            <div className="detail-rows">
              {[
                ["Instructor", detail.instructor],
                [
                  "Attendance",
                  detail.attendance === null
                    ? "Unknown — excluded when no attendance is required"
                    : detail.attendance
                      ? "Required"
                      : "Not required",
                ],
                ["Quizzes", detail.quizzes ? "Yes" : "None"],
                ["Group work", detail.group ? "Required" : "None"],
                ["Assessments", detail.assessment],
                [
                  "Sessions",
                  detail.sessions
                    .map(
                      (s) =>
                        `${DAYS[s.day]} ${timeLabel(s.start)}–${timeLabel(s.end)}`,
                    )
                    .join(" · "),
                ],
                [
                  "Availability",
                  `${data.find((c) => c.id === detail.id).seats} seats · ${data.find((c) => c.id === detail.id).waitlist} waitlisted`,
                ],
              ].map(([a, b]) => (
                <div key={a}>
                  <span>{a}</span>
                  <strong>{b}</strong>
                </div>
              ))}
            </div>
            {reasons(detail, applied).length > 0 && (
              <div className="detail-warning">
                <AlertCircle size={17} />
                <p>
                  Excluded from your current plans:{" "}
                  {reasons(detail, applied).join("; ")}.
                </p>
              </div>
            )}
            <div className="source-note">
              <ShieldCheck size={16} />
              <p>
                <strong>Source: {detail.source}</strong>
                <br />
                {detail.stale
                  ? "Stale fixture — never included in recommendations."
                  : "Illustrative data. Not verified against SIS or USTspace."}{" "}
                Ratings are not grade predictions.
              </p>
            </div>
            <div className="official-detail-links">
              <a
                href="https://ust.space/review"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Library size={14} />
                Check USTSpace <ArrowUpRight size={12} />
              </a>
              <a
                href="https://itso.hkust.edu.hk/student-hotlinks/"
                target="_blank"
                rel="noopener noreferrer"
              >
                <GraduationCap size={15} />
                Open SIS entry <ArrowUpRight size={12} />
              </a>
            </div>
            <p className="detail-link-note">
              SIS path: Student Center → My Favorites → Academics. These links
              open official entry pages, not a verified record for this demo
              course.
            </p>
            <button className="primary full" onClick={() => watch(detail.id)}>
              <Bookmark size={16} />
              {watched.includes(detail.id)
                ? "Remove from watchlist"
                : "Watch this course"}
            </button>
            <p className="private-note">
              Planning only. CoursePilot never enrolls on your behalf.
            </p>
          </section>
        </div>
      )}
      {about && (
        <div className="modal-backdrop" onClick={() => setAbout(false)}>
          <section
            className="modal about-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="about-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              autoFocus
              className="modal-close icon-btn"
              aria-label="Close prototype information"
              onClick={() => setAbout(false)}
            >
              <X size={20} />
            </button>
            <span className="eyebrow">AISC · GROUP 12</span>
            <h2 id="about-title">
              A thoughtful plan.
              <br />
              An honest prototype.
            </h2>
            <p className="modal-intro">
              CoursePilot turns your preferences into three ranked,
              conflict-free Common Core plans. This prototype demonstrates
              constraint-based planning, transparent scoring and simulated
              waitlist monitoring.
            </p>
            <h3>What is real here?</h3>
            <p>
              The constraint solver, course search, timetable generation,
              calendar export, watchlist, browser storage, and action logs work.
              The Real schedules workspace includes 2026–27 Fall course details
              and anonymous student reviews. The separate
              preference demo uses 30 synthetic records, names, ratings and
              availability. No live scraper, language model, institutional
              login, actual enrollment, or background alerts are connected.
            </p>
            <h3>How scores work</h3>
            <p>
              Review rating contributes up to 50 points, estimated workload
              10–20, and availability up to 20. Review & workload mode shifts
              the weights to 55 for reviews, 15–30 for workload, and up to 10
              for availability. Scores are capped at 99. Each plan averages
              course scores. All hard constraints and clashes are checked before
              ranking. Unknown required fields and stale records are excluded.
              Rankings are heuristics, never enrollment probabilities.
            </p>
            <h3>Try these five scenarios</h3>
            <div className="scenario-list">
              {SCENARIOS.map((s, i) => (
                <button
                  key={s.title}
                  onClick={() => {
                    setQuery(s.text);
                    setAbout(false);
                    generate({ ...s.prefs });
                  }}
                >
                  <span>0{i + 1}</span>
                  <div>
                    <strong>{s.title}</strong>
                    <p>{s.text}</p>
                  </div>
                  <ArrowUpRight size={17} />
                </button>
              ))}
            </div>
            <p className="source-note">
              Your preferences and watched course IDs are stored in this
              browser. Demo seat updates and logs last for this session.
              Calendar dates are illustrative. Always confirm official details
              in SIS.
            </p>
          </section>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {toast}
          <button
            className="icon-btn"
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
function Availability({ c }) {
  return (
    <span className={`availability ${c.seats ? "open" : "waiting"}`}>
      <span />
      {c.seats ? `${c.seats} seats open` : `Waitlist · ${c.waitlist}`}
    </span>
  );
}
function CourseRow({ c, color, p, onOpen, watched, onWatch }) {
  return (
    <article className="course-row card">
      <button
        className={`course-monogram ${color}`}
        onClick={onOpen}
        aria-label={`View ${c.id}`}
      >
        {c.domain}
      </button>
      <button className="course-row-main" onClick={onOpen}>
        <span className="course-code">
          {c.id} <span>· {c.credits} CREDITS</span>
        </span>
        <h3>{c.title}</h3>
        <div className="course-row-tags">
          {c.attendance === false && (
            <span>
              <Check size={11} />
              No attendance
            </span>
          )}
          {!c.quizzes && (
            <span>
              <Check size={11} />
              No quizzes
            </span>
          )}
          {!c.group && (
            <span>
              <Check size={11} />
              No group work
            </span>
          )}
        </div>
      </button>
      <div className="course-right">
        <Availability c={c} />
        <span className="course-rating">
          {score(c, p)} fit <span>·</span> {c.workload}h / week
        </span>
      </div>
      <button
        className={`icon-btn bookmark ${watched ? "saved" : ""}`}
        aria-label={`${watched ? "Unwatch" : "Watch"} ${c.id}`}
        onClick={onWatch}
      >
        <Bookmark size={18} fill={watched ? "currentColor" : "none"} />
      </button>
    </article>
  );
}
createRoot(document.getElementById("root")).render(<App />);
