import test from "node:test";
import assert from "node:assert/strict";
import { commonGrade, selectReviews, updatedLabel } from "../src/reviews/model.js";
const rows = [
  { id: "a", term: "2025-26 Fall", instructor: "Teacher A", date: "2026-01-01", helpful: 3, sections: { content: "Python practice" } },
  { id: "b", term: "2024-25 Fall", instructor: "Teacher B", date: "2025-01-01", helpful: 9, sections: { content: "Calculus examples" } },
];
test("review filtering combines teacher, term, text and evidence without changing original data", () => {
  assert.deepEqual(selectReviews(rows, { instructor: "Teacher B", term: "2024-25 Fall", query: "CALCULUS" }).map(r => r.id), ["b"]);
  assert.deepEqual(selectReviews(rows, { evidence: ["b"], query: "python" }), []);
  assert.deepEqual(selectReviews(rows, { sort: "helpful" }).map(r => r.id), ["b", "a"]);
  assert.equal(rows[0].id, "a");
});
test("missing ratings stay empty and grade mode is not presented as a numeric average", () => {
  assert.equal(commonGrade(), "—"); assert.equal(commonGrade({ A: 2, B: 7 }), "B");
});
test("data update time uses the client UTC+8 timezone", () => {
  assert.match(updatedLabel("2026-11-03T14:30:09+00:00"), /22:30/);
});
