export const DIMENSIONS = [
  ["content", "Content", "Course material"],
  ["teaching", "Teaching", "Instruction"],
  ["grading", "Grading", "Assessment"],
  ["workload", "Workload", "Time and effort"],
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
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Shanghai", year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
}
