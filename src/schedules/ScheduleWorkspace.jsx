import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  Search,
  ArrowUpRight,
  Plus,
  X,
  Check,
  CalendarDays,
  FileText,
  AlertCircle,
  ShieldCheck,
  Download,
  Upload,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  SlidersHorizontal,
  Layers,
  ArrowRight,
  FolderOpen,
  MessageSquare,
} from "lucide-react";
import snapshot from "./uploaded.json";
import {
  WEEK,
  REAL_DEFAULT,
  generateSchedules,
  sectionIssues,
  calendarSnapshot,
} from "./model";
import { timeLabel } from "../engine";
import "./schedules.css";
import reviewCatalog from "../reviews/catalog.json";
import CourseReviews from "../reviews/CourseReviews";
import { updatedLabel } from "../reviews/model";
import { useAccount } from "../auth/AccountRoot";
const displayIssue = (text) => text.replace(/OCR /gi, "").replace(/PDF/gi, "course").replace(/snapshot/gi, "record");
const PALETTE = ["sage", "lavender", "peach", "blue"];
function saveFile(content, name, type) {
  const u = URL.createObjectURL(new Blob([content], { type })),
    a = document.createElement("a");
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}
function meetingInWeek(s, week) {
  const date = new Date(week + "T00:00:00Z");
  if (Number.isNaN(date.getTime())) return true;
  date.setUTCDate(date.getUTCDate() + s.day);
  const str = date.toISOString().slice(0, 10);
  return (
    (!s.dateStart || str >= s.dateStart) && (!s.dateEnd || str <= s.dateEnd)
  );
}
function sessionText(s) {
  return `${WEEK[s.day]} ${timeLabel(s.start)}–${timeLabel(s.end)}${s.dateStart ? ` (${s.dateStart} → ${s.dateEnd})` : ""}`;
}
export default function ScheduleWorkspace() {
  const { initialWorkspace, saveSection } = useAccount();
  const saved = initialWorkspace.schedules;
  const [search, setSearch] = useState(""),
    [department, setDepartment] = useState("all"),
    [ccOnly, setCcOnly] = useState(false),
    [page, setPage] = useState(1);
  const [selected, setSelected] = useState(saved.selected),
    [prefs, setPrefs] = useState(saved.prefs),
    [locks, setLocks] = useState(saved.locks),
    [results, setResults] = useState(null),
    [activePlan, setActivePlan] = useState(0),
    [dirty, setDirty] = useState(false);
  const [detail, setDetail] = useState(null),
    [week, setWeek] = useState(saved.week),
    [message, setMessage] = useState("");
  const modalRef = useRef();
  const selectedCourses = selected.map((id) =>
    snapshot.courses.find((c) => c.id === id),
  );
  const filtered = useMemo(
    () =>
      snapshot.courses.filter(
        (c) =>
          (department === "all" || c.department === department) &&
          (!ccOnly || c.commonCore2026) &&
          `${c.code} ${c.title}`
            .toLowerCase()
            .replace(/\s/g, "")
            .includes(search.toLowerCase().replace(/\s/g, "")),
      ),
    [search, department, ccOnly],
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / 12)),
    visible = filtered.slice(
      (Math.min(page, totalPages) - 1) * 12,
      Math.min(page, totalPages) * 12,
    ),
    option = results?.plans[activePlan];
  useEffect(() => {
    saveSection("schedules", { selected, prefs, locks, week });
  }, [selected, prefs, locks, week, saveSection]);
  useEffect(() => {
    setPage(1);
  }, [search, department, ccOnly]);
  useEffect(() => {
    if (!detail) return;
    const previous = document.activeElement;
    modalRef.current?.querySelector("button")?.focus();
    function keys(e) {
      if (e.key === "Escape") setDetail(null);
      if (e.key === "Tab") {
        const list = modalRef.current?.querySelectorAll(
          "button:not([disabled]),a[href],select,input",
        );
        if (!list?.length) return;
        const first = list[0],
          last = list[list.length - 1];
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
  }, [detail]);
  function select(id) {
    if (!selected.includes(id) && selected.length === 6) {
      setMessage(
        "Choose at most six courses to keep the section search bounded.",
      );
      return;
    }
    setSelected((ids) =>
      ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
    );
    setDirty(true);
  }
  function update(key, value) {
    setPrefs((p) => ({ ...p, [key]: value }));
    setDirty(true);
  }
  function build() {
    const r = generateSchedules(selectedCourses, prefs, locks);
    setResults(r);
    setActivePlan(0);
    setDirty(false);
    setMessage(
      r.plans.length
        ? `${r.plans.length} provisional schedule(s) found. Verify lecture/tutorial matching and eligibility in SIS.`
        : "No schedule returned. See the exact blockers below.",
    );
  }
  function example() {
    const ids = ["ACCT2010", "ISOM1380", "AISC1000B"];
    const p = { ...REAL_DEFAULT, noEarly: true, maxDays: 4 };
    setSelected(ids);
    setPrefs(p);
    setLocks({});
    setResults(
      generateSchedules(
        snapshot.courses.filter((c) => ids.includes(c.id)),
        p,
      ),
    );
    setActivePlan(0);
    setDirty(false);
    setMessage(
      "Course example loaded: ACCT 2010, ISOM 1380 and AISC 1000B. No review-based claims are made.",
    );
    requestAnimationFrame(() =>
      document
        .getElementById("real-builder")
        ?.scrollIntoView({
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? "auto"
            : "smooth",
          block: "start",
        }),
    );
  }
  function lock(course, kind, id) {
    setLocks((l) => ({ ...l, [course]: { ...l[course], [kind]: id } }));
    setDirty(true);
  }
  function exportWeek() {
    try {
      const text = calendarSnapshot(option.items, week);
      if (!text.includes("BEGIN:VEVENT")) {
        setMessage(
          "No meetings fall in this selected week. Choose another Monday.",
        );
        return;
      }
      saveFile(text, "coursepilot-week.ics", "text/calendar");
      setMessage(
        "One sample week exported, using the actual parsed meeting durations. This is not an official enrollment record.",
      );
    } catch (e) {
      setMessage(e.message);
    }
  }
  function downloadCodes() {
    const rows = snapshot.courses
      .filter((c) => !c.issues.length)
      .map((c) => c.id);
    saveFile(
      JSON.stringify(
        {
          schemaVersion: 1,
          term: snapshot.term,
          courseCodes: rows,
          excluded: snapshot.courses
            .filter((c) => c.issues.length)
            .map((c) => ({ courseCode: c.id, reason: c.issues.join("; ") })),
        },
        null,
        2,
      ),
      "coursepilot-course-codes.json",
      "application/json",
    );
  }
  return (
    <section className="real-workspace">
      <div className="snapshot-note">
        <FileText size={21} />
        <div>
          <strong>Your courses, with student perspectives.</strong>
          <p>2026–27 Fall · browse classes, compare student experiences and plan your timetable. Check current enrollment and course requirements in SIS.</p>
        </div>
      </div>
      <div className="real-stats">
        {[
          [snapshot.counts.sources, "departments"],
          [reviewCatalog.stats.reviews, "student reviews"],
          [snapshot.counts.courses, "courses"],
          [snapshot.counts.sections, "section records"],
        ].map(([n, label]) => (
          <div key={label}>
            <strong>{n.toLocaleString()}</strong>
            <span>{label}</span>
          </div>
        ))}
        <div className="stat-annotation">
          <ShieldCheck size={19} />
          <span>
            Ratings &amp; reviews
            <br />
            in every course
          </span>
        </div>
      </div>
      <div className="real-tabs">
        <a href="#real-catalog">
          <BookOpen size={15} />
          Course catalog
        </a>
        <a href="#real-builder">
          <CalendarDays size={15} />
          Build my timetable
        </a>
        <a href="#real-reviews">
          <MessageSquare size={15} />
          Course reviews
        </a>
      </div>
      <section id="real-catalog" className="real-section">
        <div className="real-heading">
          <div>
            <span className="eyebrow">COURSES FOR YOUR NEXT TERM</span>
            <h2>A real starting point.</h2>
            <p>
              Includes undergraduate and postgraduate courses. A department is
              not a Common Core domain.
            </p>
          </div>
          <button className="real-outline" onClick={example}>
            Try a real schedule <ArrowRight size={14} />
          </button>
        </div>
        <div className="real-toolbar">
          <label className="search-field">
            <Search size={17} />
            <input
              aria-label="Search uploaded courses"
              placeholder="Search course code or title, e.g. ACCT 2010"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <select
            aria-label="Schedule department"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
          >
            <option value="all">All {snapshot.counts.sources} departments</option>
            {snapshot.sources.map((s) => (
              <option key={s.department} value={s.department}>
                {s.department}
              </option>
            ))}
          </select>
          <label className="cc-filter">
            <input
              type="checkbox"
              checked={ccOnly}
              onChange={(e) => setCcOnly(e.target.checked)}
            />
            CC26 tag detected
          </label>
        </div>
        <div className="real-catalog-meta">
          <span>
            {filtered.length} course(s) found
            {ccOnly
              ? " · A detected tag is not proof of degree eligibility."
              : ""}
          </span>
          <span>
            {snapshot.counts.readableSections}/{snapshot.counts.sections}{" "}
            sections have parseable times and labels
          </span>
        </div>
        {selected.length > 0 && (
          <div className="real-selection-summary">
            <span>
              <Check size={13} />
              {selected.length}/6 courses selected{" "}
              <small>{selectedCourses.map((c) => c.code).join(" · ")}</small>
            </span>
            <a href="#real-builder">
              Build timetable <ArrowRight size={13} />
            </a>
          </div>
        )}
        <div className="real-catalog">
          {visible.map((c) => (
            <article key={c.id} className="real-course card">
              <div className="real-course-top">
                <span className="real-dept">{c.department}</span>
                {c.commonCore2026 && (
                  <span className="real-cc">CC26 tag</span>
                )}
                <span className="real-credits">{c.credits ?? "?"} credits</span>
              </div>
              <button
                className="real-course-title"
                onClick={() => setDetail(c)}
              >
                <small>{c.code}</small>
                <h3>{c.title}</h3>
              </button>
              <p>
                {c.sections.length} sections ·{" "}
                {c.sections.filter((s) => s.scheduleReadable).length} with
                readable times
              </p>
              <div className="real-course-bottom">
                <button className="course-review-link" onClick={() => setDetail(c)} aria-label={`Read reviews for ${c.code}`}><MessageSquare size={14} />{reviewCatalog.courses[c.id] ? `${(reviewCatalog.courses[c.id].reviewCount || reviewCatalog.courses[c.id].ratingCount || 0).toLocaleString()} ${reviewCatalog.courses[c.id].reviewCount ? "reviews" : "ratings"}` : "No Review Published yet~"}</button>
                <button
                  aria-label={`${selected.includes(c.id) ? "Remove" : "Add"} ${c.code}`}
                  className={`real-add ${selected.includes(c.id) ? "is-added" : ""}`}
                  onClick={() => select(c.id)}
                >
                  {selected.includes(c.id) ? (
                    <Check size={15} />
                  ) : (
                    <Plus size={15} />
                  )}
                </button>
              </div>
              {(c.issues.length > 0 ||
                !c.sections.some((s) => s.scheduleReadable)) && (
                <span className="real-needs-check">
                  <AlertCircle size={12} />
                  {c.issues.length
                    ? "Course code needs verification"
                    : "Time pending / not readable"}
                </span>
              )}
            </article>
          ))}
        </div>
        {!visible.length && (
          <div className="real-empty">
            <Search size={25} />
            <h3>No matching courses</h3>
            <p>Try another course code or clear your filters.</p>
            <button
              className="text-link"
              onClick={() => {
                setSearch("");
                setDepartment("all");
                setCcOnly(false);
              }}
            >
              Clear filters
            </button>
          </div>
        )}
        <div className="real-pagination">
          <button
            aria-label="Previous course page"
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft size={15} />
          </button>
          <span>
            Page {Math.min(page, totalPages)} of {totalPages}
          </span>
          <button
            aria-label="Next course page"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            <ChevronRight size={15} />
          </button>
        </div>
      </section>
      <section id="real-builder" className="real-section real-builder card">
        <div className="real-heading">
          <div>
            <span className="eyebrow">PLAN WITH THE ACTUAL CLASS TIMES</span>
            <h2>Your courses. Your week.</h2>
            <p>
              Select up to six courses above. Each option includes one section
              of every recognized component type.
            </p>
          </div>
          <Layers size={25} />
        </div>
        <div className="real-basket">
          {selectedCourses.map((c) => (
            <span key={c.id}>
              {c.code}
              <button
                aria-label={`Remove selected ${c.code}`}
                onClick={() => select(c.id)}
              >
                <X size={12} />
              </button>
            </span>
          ))}
          {!selected.length && (
            <p>
              No courses selected yet. Add courses from the catalog, or try the
              real example.
            </p>
          )}
        </div>
        {selectedCourses.length > 0 && (
          <div className="real-component-locks">
            {selectedCourses.map((c) => (
              <div key={c.id}>
                <strong>{c.code}</strong>
                {[
                  ...new Set(
                    c.sections
                      .filter((s) => s.kind !== "unknown")
                      .map((s) => s.kind),
                  ),
                ].map((kind) => (
                  <label key={kind}>
                    {kind}
                    <select
                      aria-label={`${c.code} ${kind} section`}
                      value={locks[c.id]?.[kind] || ""}
                      onChange={(e) => lock(c.id, kind, e.target.value)}
                    >
                      <option value="">Any readable section</option>
                      {c.sections
                        .filter((s) => s.kind === kind)
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.label} · {s.classNumber || "ID unclear"}
                            {!s.scheduleReadable ? " · time unclear" : ""}
                          </option>
                        ))}
                    </select>
                  </label>
                ))}
              </div>
            ))}
          </div>
        )}
        <div className="real-controls">
          <label>
            <input
              type="checkbox"
              checked={prefs.noEarly}
              onChange={(e) => update("noEarly", e.target.checked)}
            />
            No classes before 10:00
          </label>
          <label>
            <input
              type="checkbox"
              checked={prefs.snapshotOpen}
              onChange={(e) => update("snapshotOpen", e.target.checked)}
            />
            Available seats recorded
          </label>
          <label>
            Max campus days
            <select
              aria-label="Maximum real campus days"
              value={prefs.maxDays}
              onChange={(e) => update("maxDays", Number(e.target.value))}
            >
              {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div
          className="real-days"
          aria-label="Available days for uploaded schedules"
        >
          {WEEK.map((d, i) => (
            <button
              key={d}
              aria-pressed={prefs.days.includes(i)}
              onClick={() =>
                update(
                  "days",
                  prefs.days.includes(i)
                    ? prefs.days.filter((x) => x !== i)
                    : [...prefs.days, i],
                )
              }
            >
              {d}
            </button>
          ))}
        </div>
        <div className="unknown-controls">
          <strong>These preferences need review or syllabus evidence:</strong>
          {[
            ["noAttendance", "No mandatory attendance"],
            ["noQuizzes", "No quizzes"],
            ["noGroups", "No group projects"],
          ].map(([k, label]) => (
            <label key={k}>
              <input
                type="checkbox"
                checked={prefs[k]}
                onChange={(e) => update(k, e.target.checked)}
              />
              {label}
            </label>
          ))}
          <small>
            Enabling an unsupported hard constraint returns no plan. Missing
            information is never treated as “none”.
          </small>
        </div>
        <div className="real-build-actions">
          <button className="primary" onClick={build}>
            <CalendarDays size={16} />
            Generate section plans
          </button>
          <button
            className="text-link"
            onClick={() => {
              setSelected([]);
              setResults(null);
              setLocks({});
              setPrefs({ ...REAL_DEFAULT });
              setMessage("");
              setDirty(false);
            }}
          >
            Clear selection
          </button>
          {dirty && results && (
            <span>Selection changed — regenerate to update.</span>
          )}
        </div>
        {message && (
          <p className="real-message" role="status">
            {message}
          </p>
        )}
        {results && (
          <div className="real-plans">
            {results.limited && (
              <div className="real-limit">
                <AlertCircle size={16} />
                Search budget reached. Results are partial; an empty result is
                not proof that no schedule exists.
              </div>
            )}
            {!results.plans.length && (
              <div className="real-blockers">
                <h3>No complete plan returned</h3>
                <ul>
                  {results.issues.map((i) => (
                    <li key={i}>{displayIssue(i)}</li>
                  ))}
                </ul>
              </div>
            )}
            {results.plans.length > 0 && (
              <>
                <div className="real-plan-tabs">
                  {results.plans.map((p, i) => (
                    <button
                      key={p.signature}
                      className={activePlan === i ? "selected" : ""}
                      onClick={() => setActivePlan(i)}
                    >
                      <span>PLAN {String.fromCharCode(65 + i)}</span>
                      <strong>{p.days.length} campus days</strong>
                      <small>
                        {p.items.length} courses · timetable-only ranking
                      </small>
                    </button>
                  ))}
                </div>
                <div className="real-week-controls">
                  <label>
                    Week starting (Monday)
                    <input
                      type="date"
                      aria-label="Week starting Monday"
                      value={week}
                      onChange={(e) => {
                        const d = new Date(e.target.value + "T00:00:00Z");
                        if (Number.isNaN(d.getTime()) || d.getUTCDay() !== 1) {
                          setMessage(
                            "Choose a Monday for the sample week. The previous valid week is retained.",
                          );
                          return;
                        }
                        setWeek(e.target.value);
                      }}
                    />
                  </label>
                  <button className="text-link" onClick={exportWeek}>
                    <Download size={14} />
                    Export selected week
                  </button>
                </div>
                <div className="real-calendar-scroll">
                  <div className="real-calendar">
                    <div className="real-calendar-head">
                      <span>HKT</span>
                      {WEEK.map((d) => (
                        <strong key={d}>{d}</strong>
                      ))}
                    </div>
                    <div className="real-calendar-body">
                      <div className="real-time-axis">
                        {[8, 11, 14, 17, 20, 23].map((h) => (
                          <span
                            key={h}
                            style={{ top: `${((h - 8) / 15) * 100}%` }}
                          >
                            {h}:00
                          </span>
                        ))}
                      </div>
                      {WEEK.map((d, di) => (
                        <div className="real-day-column" key={d}>
                          {[8, 11, 14, 17, 20].map((h) => (
                            <i
                              key={h}
                              style={{ top: `${((h - 8) / 15) * 100}%` }}
                            />
                          ))}
                          {option.items.flatMap((item, ci) => {
                            const seen = new Set();
                            return item.sections.flatMap((s) =>
                              s.sessions
                                .filter(
                                  (m) => m.day === di && meetingInWeek(m, week),
                                )
                                .filter((m) => {
                                  const key =
                                    m.day + "-" + m.start + "-" + m.end;
                                  if (seen.has(key)) return false;
                                  seen.add(key);
                                  return true;
                                })
                                .map((m, mi) => (
                                  <button
                                    className={`real-calendar-event ${PALETTE[ci % 4]}`}
                                    key={`${s.id}-${mi}-${m.start}`}
                                    style={{
                                      top: `${((m.start - 480) / 900) * 100}%`,
                                      height: `${((m.end - m.start) / 900) * 100}%`,
                                    }}
                                    title={`${item.course.code} ${s.label} · ${sessionText(m)}`}
                                    onClick={() => setDetail(item.course)}
                                  >
                                    <strong>{item.course.id}</strong>
                                    <span>
                                      {s.label} · {timeLabel(m.start)}–
                                      {timeLabel(m.end)}
                                    </span>
                                  </button>
                                )),
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="real-plan-details">
                  {option.items.map(({ course, sections }) => (
                    <div key={course.id}>
                      <strong>
                        {course.code} · {course.title}
                      </strong>
                      {sections.map((s) => (
                        <p key={s.id}>
                          <span>{s.label}</span>
                          {s.sessions.map(sessionText).join(" · ")}
                        </p>
                      ))}
                    </div>
                  ))}
                </div>
                <div className="real-verification">
                  <ShieldCheck size={16} />
                  <p>
                    <strong>
                      Provisional time compatibility, not enrollment approval.
                    </strong>{" "}
                    Ranking favors fewer campus days, then fewer early meetings.
                    Reviews and grades are not scored. Each known
                    lecture/tutorial/lab component is included; section links,
                    prerequisites, cohort eligibility, holidays and actual
                    availability still need SIS verification. The calendar shows
                    a user-selected week.
                  </p>
                </div>
              </>
            )}
            <p className="real-search-info">
              {results.visited.toLocaleString()} search states ·{" "}
              {results.elapsed.toFixed(0)} ms
              {results.feasible !== undefined
                ? ` · ${results.feasible} ${results.limited ? "found" : "valid"} combinations`
                : ""}
            </p>
          </div>
        )}
      </section>
      <section id="real-reviews" className="real-section card real-review-panel">
        <div className="real-heading"><div><span className="eyebrow">STUDENT PERSPECTIVES</span><h2>Read reviews. Choose with confidence.</h2><p>Explore four rating dimensions, anonymous reviews and practical advice in each course. Browse {reviewCatalog.stats.reviews.toLocaleString("en-US")} reviews by term and instructor to find perspectives that matter to you.</p></div><MessageSquare size={26} /></div>
        <div className="review-featured-courses">{["COMP1023", "ACCT2010", "MATH1013", "ISOM1380"].map(id => <button key={id} onClick={() => setDetail(snapshot.courses.find(c => c.id === id))}><strong>{id}</strong><span>{reviewCatalog.courses[id]?.reviewCount.toLocaleString() || 0} reviews →</span></button>)}</div>
        <details className="review-basis"><summary>Course list</summary><button className="real-outline" onClick={downloadCodes}><Download size={14} />Download course codes</button></details>
      </section>
      <footer className="course-data-footer">Data updated: <time dateTime={reviewCatalog.updatedAt}>{updatedLabel(reviewCatalog.updatedAt)} (UTC+8)</time><br />Schedule term: {snapshot.term} · Seat availability is not live. Check SIS for current enrollment requirements.</footer>
      {detail && (
        <div className="modal-backdrop" onClick={() => setDetail(null)}>
          <section
            className="modal real-modal"
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="real-course-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close icon-btn"
              aria-label="Close uploaded course"
              onClick={() => setDetail(null)}
            >
              <X size={20} />
            </button>
            <span className="eyebrow">COURSE DETAILS · {snapshot.term}</span>
            <p className="course-code">
              {detail.code} · {detail.credits ?? "?"} credits
            </p>
            <h2 id="real-course-title">{detail.title}</h2>
            <p className="real-modal-notice">
              Compare student experiences below. Confirm the current syllabus,
              course requirements and enrollment in SIS.
            </p>
            <div className="real-modal-actions">
              <button className="primary" onClick={() => select(detail.id)}>
                {selected.includes(detail.id)
                  ? "Remove from selection"
                  : "Add to timetable"}
              </button>
            </div>
            {detail.issues.length > 0 && (
              <div className="detail-warning">{detail.issues.map(displayIssue).join("; ")}</div>
            )}
            <CourseReviews key={detail.id} courseId={detail.id} />
            <details className="course-class-sections"><summary>Class sections · {detail.sections.length}</summary>
            <div className="real-section-records">
              {detail.sections.map((s) => (
                <article key={s.id}>
                  <div>
                    <strong>{s.label}</strong>
                    <span>
                      #{s.classNumber || "unknown"} · {s.kind}
                    </span>
                  </div>
                  <p className="section-time">
                    {s.sessions.length
                      ? s.sessions.map(sessionText).join(" · ")
                      : "Time unknown / TBA"}
                  </p>
                  <p>
                    Room: {s.room || "Unknown"}
                    <br />
                    Instructor: {s.instructor || "Unknown"}
                  </p>
                  <p>
                    Seats:{" "}
                    {s.seats === null
                      ? "seat counts unknown"
                      : `${s.seats} available · ${s.enrolled}/${s.quota} enrolled · ${s.waitlist} waiting`}
                  </p>
                  {s.issues.length > 0 && <small>{s.issues.map(displayIssue).join(" · ")}</small>}

                </article>
              ))}
            </div>
            </details>
          </section>
        </div>
      )}
    </section>
  );
}
