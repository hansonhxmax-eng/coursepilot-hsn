import React, { useEffect, useMemo, useState } from "react";
import { MessageSquare, Sparkles, BookOpen, GraduationCap, ChevronLeft, ChevronRight } from "lucide-react";
import catalog from "./catalog.json";
import { DIMENSIONS, commonGrade, selectReviews } from "./model";
import "./reviews.css";

const cache = new Map();
export default function CourseReviews({ courseId }) {
  const entry = catalog.courses[courseId];
  const [data, setData] = useState(cache.get(courseId) || null);
  const [error, setError] = useState(false), [attempt, setAttempt] = useState(0);
  const [term, setTerm] = useState("all"), [instructor, setInstructor] = useState("all");
  const [query, setQuery] = useState(""), [sort, setSort] = useState("newest"), [page, setPage] = useState(1);
  const [evidence, setEvidence] = useState(null);
  useEffect(() => {
    if (!entry || cache.has(courseId)) return;
    const controller = new AbortController();
    setError(false);
    fetch(`${import.meta.env.BASE_URL}reviews/${courseId}.json${catalog.contentVersion ? `?v=${encodeURIComponent(catalog.contentVersion)}` : ""}`, { signal: controller.signal })
      .then(r => { if (!r.ok) throw new Error("Unavailable"); return r.json(); })
      .then(value => { if (value.courseCode !== courseId) throw new Error("Course mismatch"); cache.set(courseId, value); setData(value); })
      .catch(e => { if (e.name !== "AbortError") setError(true); });
    return () => controller.abort();
  }, [courseId, entry, attempt]);
  const comments = useMemo(() => selectReviews(data?.reviews || [], { term, instructor, query, sort, evidence }), [data, term, instructor, query, sort, evidence]);
  useEffect(() => { setPage(1); }, [term, instructor, query, sort, evidence]);
  if (!entry) return <section className="course-reviews review-empty"><MessageSquare size={24} /><h3>No Review Published yet~</h3><p>Check back later for reviews of this course.</p></section>;
  if (error) return <section className="course-reviews review-empty" role="alert"><p>Reviews could not be loaded. Please try again.</p><button className="real-outline" onClick={() => setAttempt(a => a + 1)}>Retry loading reviews</button></section>;
  if (!data) return <p className="course-reviews" role="status">Loading course reviews…</p>;
  const themes = data.analysis.themes.slice(0, 3), totalPages = Math.max(1, Math.ceil(comments.length / 8));
  const currentPage = Math.min(page, totalPages), shown = comments.slice((currentPage - 1) * 8, currentPage * 8);
  function showEvidence(theme) {
    setTerm("all"); setInstructor("all"); setQuery(""); setEvidence(theme.evidence.map(e => e.reviewId));
    requestAnimationFrame(() => document.getElementById(`comments-${courseId}`)?.scrollIntoView({ block: "start", behavior: "smooth" }));
  }
  return <section className="course-reviews" aria-label={`${courseId} reviews`}>
    {data.reviewCount > 0 && <section className="review-overview">
      <div className="review-section-heading"><Sparkles size={20} /><div><span className="review-kicker">AT A GLANCE</span><h3>What students say</h3></div><span className="review-count-pill">{data.reviewCount.toLocaleString("en-US")} {data.reviewCount === 1 ? "review" : "reviews"}</span></div>
      <p className="review-synthesis">Across {data.reviewCount.toLocaleString("en-US")} {data.reviewCount === 1 ? "review" : "reviews"}, the most discussed topics are {themes.map(t => t.label.toLowerCase()).join(", ") || "the course experience"}. The most common ratings are <strong>{commonGrade(data.analysis.distributions.content)}</strong> for content and <strong>{commonGrade(data.analysis.distributions.teaching)}</strong> for teaching.</p>
      <p className="review-context">These reviews span {data.analysis.terms} {data.analysis.terms === 1 ? "term" : "terms"}. Experiences can vary by term, instructor and prior knowledge. Look for reviews that match your circumstances.</p>
      <div className="review-topic-list">{themes.map(t => <button key={t.id} onClick={() => showEvidence(t)} disabled={!t.evidence.length}>{t.label}<span>{t.mentions.toLocaleString("en-US")} {t.mentions === 1 ? "mention" : "mentions"}</span></button>)}</div>
      {themes.length > 0 && <div className="review-advice-grid">
        <div><h4><GraduationCap size={17} />Choosing this course</h4><ul>{themes.map(t => <li key={t.id}>{t.selection}</li>)}</ul></div>
        <div><h4><BookOpen size={17} />Study tips</h4><ul>{themes.map(t => <li key={t.id}>{t.study}</li>)}</ul></div>
      </div>}
      <details className="review-basis"><summary>Reviews behind this summary</summary><p>Topic counts show how many reviews discuss each theme. They do not indicate agreement or current course requirements.</p>{themes.map(t => <div key={t.id}><strong>{t.label} · mentioned in {t.mentions.toLocaleString("en-US")} {t.mentions === 1 ? "review" : "reviews"}</strong>{t.evidence.map(e => <blockquote key={e.reviewId}><p>{e.quote}</p><button onClick={() => showEvidence(t)}>Read related anonymous reviews →</button></blockquote>)}</div>)}</details>
    </section>}
    <section className="review-ratings" aria-label="Ratings across four dimensions">
      <div className="review-section-heading"><div><span className="review-kicker">RATINGS</span><h3>Four rating dimensions</h3></div><span>{data.ratingCount != null ? `${data.ratingCount.toLocaleString("en-US")} ${data.ratingCount === 1 ? "rating" : "ratings"}` : `Grade distribution across ${data.reviewCount.toLocaleString("en-US")} ${data.reviewCount === 1 ? "review" : "reviews"}`}</span></div>
      <div className="review-rating-grid">{DIMENSIONS.map(([key, label, description]) => <article key={key}><span>{label}</span><h4>{description}</h4><strong className="review-grade">{data.ratings[key] || commonGrade(data.analysis.distributions[key])}</strong><small>{data.ratings[key] ? "Overall rating" : "Most common rating"}</small><div className="review-grade-distribution" aria-label={`${label} grade distribution`}>{["A", "B", "C", "D", "E"].map(g => <span key={g} title={`${g}: ${data.analysis.distributions[key]?.[g] || 0}`}><i style={{ height: `${Math.max(2, 30 * (data.analysis.distributions[key]?.[g] || 0) / (data.reviewCount || 1))}px` }} /><small>{g}</small></span>)}</div></article>)}</div>
      <p className="review-context">Ratings use an A–E scale and reflect individual experiences. They do not guarantee a grade or a place in the course.</p>
    </section>
    <section id={`comments-${courseId}`} className="review-comments">
      <div className="review-section-heading"><div><span className="review-kicker">STUDENT VOICES</span><h3>Anonymous reviews</h3></div><span>{data.reviewCount.toLocaleString("en-US")} {data.reviewCount === 1 ? "review" : "reviews"}</span></div>
      {!data.reviewCount ? <p className="review-empty-text">No written reviews are available yet.</p> : <>
        <div className="review-filters">
          <select aria-label="Filter reviews by term" value={term} onChange={e => setTerm(e.target.value)}><option value="all">All terms</option>{[...new Set(data.reviews.map(r => r.term))].sort().reverse().map(t => <option key={t}>{t}</option>)}</select>
          <select aria-label="Filter reviews by instructor" value={instructor} onChange={e => setInstructor(e.target.value)}><option value="all">All instructors</option>{[...new Set(data.reviews.map(r => r.instructor).filter(Boolean))].sort().map(t => <option key={t}>{t}</option>)}</select>
          <select aria-label="Sort reviews" value={sort} onChange={e => setSort(e.target.value)}><option value="newest">Newest first</option><option value="helpful">Most helpful</option></select>
          <input aria-label="Search reviews" placeholder="Search reviews" value={query} onChange={e => setQuery(e.target.value)} />
        </div>
        {evidence && <div className="review-evidence-filter">Showing reviews referenced in the summary.<button onClick={() => setEvidence(null)}>View all reviews</button></div>}
        <p className="review-result-count" aria-live="polite">{comments.length.toLocaleString("en-US")} matching {comments.length === 1 ? "review" : "reviews"}</p>
        {!comments.length && <p className="review-empty-text">No reviews match your filters. Try adjusting them.</p>}
        {shown.map(r => <article className="anonymous-review" key={r.id}>
          <header><span className="review-avatar" aria-hidden="true">A</span><div><strong>Anonymous student</strong><p>{r.term}{r.instructor ? ` · ${r.instructor}` : ""}</p></div><time dateTime={r.date}>{r.date}</time></header>
          <div className="review-personal-grades">{DIMENSIONS.map(([key, label]) => <span key={key}>{label} <b>{r.ratings[key]}</b></span>)}</div>
          <div className="review-text-preview">{(r.sections.content || r.sections.teaching || r.sections.grading || r.sections.workload).slice(0, 240)}{Object.values(r.sections).join("").length > 240 ? "…" : ""}</div>
          <details className="review-full-text"><summary>Read full review</summary>{DIMENSIONS.map(([key, label]) => r.sections[key] && <section key={key}><h4>{label}</h4><p>{r.sections[key]}</p></section>)}</details>
          {r.helpful > 0 && <footer>{r.helpful.toLocaleString("en-US")} {r.helpful === 1 ? "person found" : "people found"} this review helpful</footer>}
        </article>)}
        {comments.length > 8 && <nav className="review-pagination" aria-label="Review pagination"><button aria-label="Previous page of reviews" disabled={currentPage === 1} onClick={() => setPage(p => p - 1)}><ChevronLeft size={16} /></button><span>Page {currentPage} of {totalPages}</span><button aria-label="Next page of reviews" disabled={currentPage === totalPages} onClick={() => setPage(p => p + 1)}><ChevronRight size={16} /></button></nav>}
      </>}
    </section>
  </section>;
}
