export const DIMENSIONS = [
  ["content", "Content", "课程内容"],
  ["teaching", "Teaching", "教学体验"],
  ["grading", "Grading", "评分体验"],
  ["workload", "Workload", "任务负担"],
];
export function commonGrade(distribution = {}) {
  return Object.entries(distribution).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || "—";
}
export function selectReviews(reviews, { term = "all", instructor = "all", query = "", sort = "newest", evidence = null } = {}) {
  const needle = query.trim().toLocaleLowerCase();
  return reviews.filter(r => (term === "all" || r.term === term)
    && (instructor === "all" || r.instructor === instructor)
    && (!evidence || evidence.includes(r.id))
    && (!needle || Object.values(r.sections).join(" ").toLocaleLowerCase().includes(needle)))
    .sort((a, b) => (sort === "helpful" ? b.helpful - a.helpful : 0) || b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}
export function updatedLabel(value) {
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
}
