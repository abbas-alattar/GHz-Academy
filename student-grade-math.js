import { db } from "./firebase-config.js?v=auth8";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

export function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

export function itemPercent(earned, max) {
  const e = num(earned);
  const m = num(max);
  if (!Number.isFinite(m) || m <= 0 || !Number.isFinite(e)) return null;
  const pct = (e / m) * 100;
  if (pct > 100 || pct < 0) {
    console.warn("grade percent out of range", { earned: e, max: m, pct });
    return null;
  }
  return Math.round(pct);
}

export function scoreText(earned, max, { deletedHomework } = {}) {
  const e = num(earned);
  if (!Number.isFinite(e)) return "—";
  if (deletedHomework) return "—";
  const p = itemPercent(e, max);
  return p == null ? "—" : p + "/100";
}

const cache = new Map();

export async function getParent(col, id) {
  if (!id) return { missing: true, doc: null, error: null };
  const key = col + "/" + id;
  if (cache.has(key)) return cache.get(key);
  try {
    const snap = await getDoc(doc(db, col, id));
    const val = snap.exists() ? { missing: false, doc: { id: snap.id, ...snap.data() }, error: null } : { missing: true, doc: null, error: null };
    cache.set(key, val);
    return val;
  } catch (e) {
    console.warn((e && e.code) || e, col + "/" + id);
    const val = { missing: false, doc: null, error: e };
    cache.set(key, val);
    return val;
  }
}

export function homeworkGradeItem(sub, assignment, meta = {}) {
  if (!sub || sub.status !== "graded") return null;
  const earned = num(sub.grade);
  if (!Number.isFinite(earned)) return null;
  const failed = !!meta.error;
  const deleted = !!meta.missing && !assignment;
  const parent = assignment || null;
  const max = deleted ? NaN : num(parent?.maxPoints);
  const inAvg = !deleted && Number.isFinite(max) && max > 0;
  const pct = inAvg ? itemPercent(earned, max) : null;
  if (inAvg && pct == null) console.warn("homework item", { title: parent?.title, earned, max });
  let title = parent?.title || "Homework";
  if (deleted) title = "Deleted homework";
  return {
    type: "homework",
    title,
    earned,
    max: inAvg ? max : null,
    pct,
    inAvg,
    deletedHomework: deleted,
    courseId: sub.courseId || parent?.courseId,
    at: sub.gradedAt?.toMillis?.() || 0,
    display: scoreText(earned, max, { deletedHomework: deleted })
  };
}

export function quizGradeItem(attempt, quiz, meta = {}) {
  if (!attempt || attempt.status !== "graded") return null;
  const earned = num(attempt.score);
  const max = num(attempt.maxScore);
  const pct = itemPercent(earned, max);
  if (pct == null && Number.isFinite(earned)) console.warn("quiz item", { title: quiz?.title, earned, max });
  const inAvg = pct != null;
  const deleted = !!meta.missing && !quiz;
  let title = quiz ? (quiz.title || "Quiz") : "Quiz";
  if (deleted) title = "Deleted quiz";
  return {
    type: "quiz",
    title,
    earned,
    max: Number.isFinite(max) && max > 0 ? max : null,
    pct,
    inAvg,
    courseId: attempt.courseId || quiz?.courseId,
    at: attempt.gradedAt?.toMillis?.() || attempt.submittedAt?.toMillis?.() || 0,
    display: scoreText(earned, max)
  };
}

export async function resolveGradedItems(data, courseId) {
  const items = [];
  for (const s of data.submissions || []) {
    if (s.status !== "graded") continue;
    if (courseId && s.courseId && s.courseId !== courseId) continue;
    const parent = await getParent("assignments", s.assignmentId);
    const it = homeworkGradeItem(s, parent.doc, parent);
    if (!it) continue;
    if (courseId && it.courseId && it.courseId !== courseId) continue;
    items.push(it);
  }
  for (const s of data.quizAttempts || []) {
    if (s.status !== "graded") continue;
    if (courseId && s.courseId && s.courseId !== courseId) continue;
    const parent = await getParent("quizzes", s.quizId);
    const it = quizGradeItem(s, parent.doc, parent);
    if (!it) continue;
    if (courseId && it.courseId && it.courseId !== courseId) continue;
    items.push(it);
  }
  return items;
}

export function allGradedItems(data, courseId) {
  const items = [];
  (data.submissions || []).forEach((s) => {
    const a = (data.assignments || []).find((x) => x.id === s.assignmentId);
    const it = homeworkGradeItem(s, a, a ? {} : { missing: true });
    if (!it) return;
    if (courseId && it.courseId && it.courseId !== courseId) return;
    items.push(it);
  });
  (data.quizAttempts || []).forEach((s) => {
    const q = (data.quizzes || []).find((x) => x.id === s.quizId);
    const it = quizGradeItem(s, q, q ? {} : { missing: true });
    if (!it) return;
    if (courseId && it.courseId && it.courseId !== courseId) return;
    items.push(it);
  });
  return items;
}

export function courseAverage(courseId, data) {
  const items = allGradedItems(data, courseId).filter((i) => i.inAvg);
  if (!items.length) return { pct: null, count: 0, items };
  const earned = items.reduce((n, i) => n + i.earned, 0);
  const max = items.reduce((n, i) => n + i.max, 0);
  const pct = itemPercent(earned, max);
  if (pct == null) {
    console.warn("courseAverage out of range", courseId, items);
    return { pct: null, count: items.length, items, invalid: true };
  }
  return { pct, count: items.length, items };
}

export async function courseAverageResolved(courseId, data) {
  const items = (await resolveGradedItems(data, courseId)).filter((i) => i.inAvg);
  if (!items.length) return { pct: null, count: 0, items };
  const earned = items.reduce((n, i) => n + i.earned, 0);
  const max = items.reduce((n, i) => n + i.max, 0);
  const pct = itemPercent(earned, max);
  if (pct == null) {
    console.warn("courseAverage out of range", courseId, items);
    return { pct: null, count: items.length, items, invalid: true };
  }
  return { pct, count: items.length, items };
}

export function courseAttendancePct(courseId, data) {
  const recs = (data.attendance || []).filter((a) => a.courseId === courseId && a.status);
  const den = recs.filter((r) => r.status !== "excused").length;
  const good = recs.filter((r) => r.status === "present" || r.status === "late").length;
  if (!den) return null;
  return Math.round((good / den) * 100);
}
