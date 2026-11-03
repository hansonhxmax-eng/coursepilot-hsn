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
    fetch(`${import.meta.env.BASE_URL}reviews/${courseId}.json`, { signal: controller.signal })
      .then(r => { if (!r.ok) throw new Error("Unavailable"); return r.json(); })
      .then(value => { if (value.courseCode !== courseId) throw new Error("Course mismatch"); cache.set(courseId, value); setData(value); })
      .catch(e => { if (e.name !== "AbortError") setError(true); });
    return () => controller.abort();
  }, [courseId, entry, attempt]);
  const comments = useMemo(() => selectReviews(data?.reviews || [], { term, instructor, query, sort, evidence }), [data, term, instructor, query, sort, evidence]);
  useEffect(() => { setPage(1); }, [term, instructor, query, sort, evidence]);
  if (!entry) return <section className="course-reviews review-empty"><MessageSquare size={24} /><h3>No Review Published yet~</h3><p>欢迎之后回来看看这门课程的评价。</p></section>;
  if (error) return <section className="course-reviews review-empty" role="alert"><p>评价暂时加载失败。</p><button className="real-outline" onClick={() => setAttempt(a => a + 1)}>重新加载评价</button></section>;
  if (!data) return <p className="course-reviews" role="status">正在加载课程评价…</p>;
  const themes = data.analysis.themes.slice(0, 3), totalPages = Math.max(1, Math.ceil(comments.length / 8));
  const currentPage = Math.min(page, totalPages), shown = comments.slice((currentPage - 1) * 8, currentPage * 8);
  function showEvidence(theme) {
    setTerm("all"); setInstructor("all"); setQuery(""); setEvidence(theme.evidence.map(e => e.reviewId));
    requestAnimationFrame(() => document.getElementById(`comments-${courseId}`)?.scrollIntoView({ block: "start", behavior: "smooth" }));
  }
  return <section className="course-reviews" aria-label={`${courseId} reviews`}>
    {data.reviewCount > 0 && <section className="review-overview">
      <div className="review-section-heading"><Sparkles size={20} /><div><span className="review-kicker">AT A GLANCE</span><h3>大家怎么说</h3></div><span className="review-count-pill">{data.reviewCount.toLocaleString()} 条评价</span></div>
      <p className="review-synthesis">综合 {data.reviewCount.toLocaleString()} 条评价，讨论最多的是{themes.map(t => t.label).join("、") || "课程体验"}。内容评价最常见的等级为 <strong>{commonGrade(data.analysis.distributions.content)}</strong>，教学评价最常见的等级为 <strong>{commonGrade(data.analysis.distributions.teaching)}</strong>。</p>
      <p className="review-context">评价覆盖 {data.analysis.terms} 个学期{data.analysis.instructors ? "，涉及不同授课教师" : ""}。不同学期、教师与个人基础的体验可能不同，建议优先阅读与你情况接近的评价。</p>
      <div className="review-topic-list">{themes.map(t => <button key={t.id} onClick={() => showEvidence(t)} disabled={!t.evidence.length}>{t.label}<span>{t.mentions.toLocaleString()} 条提及</span></button>)}</div>
      {themes.length > 0 && <div className="review-advice-grid">
        <div><h4><GraduationCap size={17} />选课参考</h4><ul>{themes.map(t => <li key={t.id}>{t.selection}</li>)}</ul></div>
        <div><h4><BookOpen size={17} />学习建议</h4><ul>{themes.map(t => <li key={t.id}>{t.study}</li>)}</ul></div>
      </div>}
      <details className="review-basis"><summary>查看总结依据</summary><p>主题数量表示讨论该主题的评价条数，不表示赞同票数或本学期课程要求。</p>{themes.map(t => <div key={t.id}><strong>{t.label} · {t.mentions} 条评价提及</strong>{t.evidence.map(e => <blockquote key={e.reviewId}><p>{e.quote}</p><button onClick={() => showEvidence(t)}>阅读对应匿名评价 →</button></blockquote>)}</div>)}</details>
    </section>}
    <section className="review-ratings" aria-label="四个维度的评分">
      <div className="review-section-heading"><div><span className="review-kicker">RATINGS</span><h3>四维评分</h3></div><span>{data.ratingCount != null ? `${data.ratingCount.toLocaleString()} 份评分` : `${data.reviewCount.toLocaleString()} 条评价的等级分布`}</span></div>
      <div className="review-rating-grid">{DIMENSIONS.map(([key, label, cn]) => <article key={key}><span>{label}</span><h4>{cn}</h4><strong className="review-grade">{data.ratings[key] || commonGrade(data.analysis.distributions[key])}</strong><small>{data.ratings[key] ? "综合等级" : "最常见等级"}</small><div className="review-grade-distribution" aria-label={`${label} grade distribution`}>{["A", "B", "C", "D", "E"].map(g => <span key={g} title={`${g}: ${data.analysis.distributions[key]?.[g] || 0}`}><i style={{ height: `${Math.max(2, 30 * (data.analysis.distributions[key]?.[g] || 0) / (data.reviewCount || 1))}px` }} /><small>{g}</small></span>)}</div></article>)}</div>
      <p className="review-context">采用 A–E 等级评分。评价反映个人体验，不代表成绩或录取保证。</p>
    </section>
    <section id={`comments-${courseId}`} className="review-comments">
      <div className="review-section-heading"><div><span className="review-kicker">STUDENT VOICES</span><h3>匿名评价</h3></div><span>{data.reviewCount.toLocaleString()} 条</span></div>
      {!data.reviewCount ? <p className="review-empty-text">暂无可展示的完整评价正文。</p> : <>
        <div className="review-filters">
          <select aria-label="按学期筛选评价" value={term} onChange={e => setTerm(e.target.value)}><option value="all">所有学期</option>{[...new Set(data.reviews.map(r => r.term))].sort().reverse().map(t => <option key={t}>{t}</option>)}</select>
          <select aria-label="按教师筛选评价" value={instructor} onChange={e => setInstructor(e.target.value)}><option value="all">所有教师</option>{[...new Set(data.reviews.map(r => r.instructor).filter(Boolean))].sort().map(t => <option key={t}>{t}</option>)}</select>
          <select aria-label="评价排序" value={sort} onChange={e => setSort(e.target.value)}><option value="newest">最新评价</option><option value="helpful">最多人觉得有用</option></select>
          <input aria-label="搜索评价内容" placeholder="搜索评价内容" value={query} onChange={e => setQuery(e.target.value)} />
        </div>
        {evidence && <div className="review-evidence-filter">正在展示总结对应的评价。<button onClick={() => setEvidence(null)}>查看所有评价</button></div>}
        <p className="review-result-count" aria-live="polite">{comments.length.toLocaleString()} 条符合条件</p>
        {!comments.length && <p className="review-empty-text">没有符合条件的评价，请调整筛选。</p>}
        {shown.map(r => <article className="anonymous-review" key={r.id}>
          <header><span className="review-avatar" aria-hidden="true">匿</span><div><strong>匿名同学</strong><p>{r.term}{r.instructor ? ` · ${r.instructor}` : ""}</p></div><time dateTime={r.date}>{r.date}</time></header>
          <div className="review-personal-grades">{DIMENSIONS.map(([key, label]) => <span key={key}>{label} <b>{r.ratings[key]}</b></span>)}</div>
          <div className="review-text-preview">{(r.sections.content || r.sections.teaching || r.sections.grading || r.sections.workload).slice(0, 240)}{Object.values(r.sections).join("").length > 240 ? "…" : ""}</div>
          <details className="review-full-text"><summary>展开这条评价</summary>{DIMENSIONS.map(([key, label, cn]) => r.sections[key] && <section key={key}><h4>{cn} · {label}</h4><p>{r.sections[key]}</p></section>)}</details>
          {r.helpful > 0 && <footer>{r.helpful} 人觉得这条评价有帮助</footer>}
        </article>)}
        {comments.length > 8 && <nav className="review-pagination" aria-label="评价分页"><button aria-label="上一页评价" disabled={currentPage === 1} onClick={() => setPage(p => p - 1)}><ChevronLeft size={16} /></button><span>第 {currentPage} / {totalPages} 页</span><button aria-label="下一页评价" disabled={currentPage === totalPages} onClick={() => setPage(p => p + 1)}><ChevronRight size={16} /></button></nav>}
      </>}
    </section>
  </section>;
}
