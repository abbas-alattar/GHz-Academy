const todayStr = () => new Date().toISOString().slice(0, 10);
const duePast = (due) => {
  if (!due) return false;
  const d = String(due).slice(0, 10);
  return d < todayStr();
};
const round1 = (n) => Math.round(n * 10) / 10;
export function fmt1(n) {
  if (n == null || n === "" || !Number.isFinite(Number(n))) return "—";
  const r = round1(Number(n));
  return Math.abs(r - Math.round(r)) < 1e-9 ? String(Math.round(r)) : r.toFixed(1);
}
export function bestNTip(pcts, n) {
  const take = (pcts || []).slice(0, Math.max(0, Number(n) || 0));
  if (!take.length) return "";
  return "(" + take.map(fmt1).join(" + ") + ") ÷ " + take.length + " = " + fmt1(take.reduce((a, b) => a + b, 0) / take.length);
}
export const parseScore = (raw) => {
  if (raw === "" || raw == null) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.min(100, Math.max(0, n));
};

function recStatus(r) { return String(r?.status || "").toLowerCase(); }
/** One shared attendance %: (present + late) ÷ (marked − excused). Marked = one doc per session of THIS course. */
export function attendancePct(courseId, uid, pack) {
  const p = pack || {};
  const cid = courseId || p.courseId || "";
  const sessions = (p.sessions || []).filter((s) => (!cid || s.courseId === cid) && String(s.status || "") !== "Cancelled");
  const sessIds = new Set(sessions.map((s) => s.id));
  const overrides = p.overrides || p.draft || {};
  const docs = (p.attendance || p.attendanceDocs || []).filter((r) => r && r.uid === uid && r.status && (!cid || r.courseId === cid) && (!sessIds.size || sessIds.has(r.sessionId)));
  const bySess = new Map();
  docs.forEach((r) => {
    if (!r.sessionId) return;
    if (!bySess.has(r.sessionId)) bySess.set(r.sessionId, r);
  });
  Object.keys(overrides).forEach((sid) => {
    const st = typeof overrides[sid] === "string" ? overrides[sid] : overrides[sid]?.status;
    if (!st) return;
    if (sessIds.size && !sessIds.has(sid)) return;
    bySess.set(sid, { uid, courseId: cid, sessionId: sid, status: st });
  });
  if (p.sessionId && p.status) {
    if (!sessIds.size || sessIds.has(p.sessionId)) bySess.set(p.sessionId, { uid, courseId: cid, sessionId: p.sessionId, status: p.status });
  }
  let present = 0, late = 0, absent = 0, excused = 0;
  bySess.forEach((r) => {
    const st = recStatus(r);
    if (st === "present") present++;
    else if (st === "late") late++;
    else if (st === "absent") absent++;
    else if (st === "excused") excused++;
  });
  const marked = present + late + absent + excused;
  const den = marked - excused;
  const good = present + late;
  const pct = !den || den <= 0 ? null : round1((good / den) * 100);
  const tip = !marked ? "No marked sessions" : (den <= 0 ? "All marked sessions are excused" : ("Present " + present + " + Late " + late + " = " + good + " of " + den + (excused ? " (" + excused + " excused not counted)" : "") + " = " + fmt1(pct) + "%"));
  return { pct, present, late, absent, excused, marked, den, good, tip, display: pct == null ? "—" : fmt1(pct) };
}
export function attendanceAuto(uid, attendanceDocs, courseId) {
  const r = attendancePct(courseId || "", uid, { attendance: attendanceDocs });
  return r.pct;
}

export function publishedHomework(assignments, courseId) {
  return (assignments || []).filter((a) => a.status === "Published" && (!courseId || a.courseId === courseId));
}

export function homeworkBestN(scheme, publishedCount) {
  const total = Number(publishedCount) || 0;
  if (total <= 0) return 0;
  const n = Number(scheme?.homeworkBest);
  if (!Number.isFinite(n) || n < 1) return total;
  return Math.min(Math.max(1, Math.floor(n)), total);
}

function studentUid(student) {
  if (student == null) return "";
  if (typeof student === "string") return student;
  return student.uid || student.id || "";
}

function homeworkPct(a, sub) {
  const cap = Number(a?.maxPoints) || 0;
  if (sub && sub.status === "graded" && cap > 0) {
    return Math.max(0, Math.min(100, ((Number(sub.grade) || 0) / cap) * 100));
  }
  return 0;
}

/** Final homework % = average of the student's N highest homework percentages. Missing/ungraded = 0. */
export function homeworkFinal(course, student) {
  const uid = studentUid(student);
  const courseId = course?.id || course?.courseId || "";
  const assigns = publishedHomework(course?.assignments || student?.assignments || [], courseId);
  const subs = course?.submissions || student?.submissions || [];
  const scheme = course?.scheme || course;
  const n = homeworkBestN(scheme, assigns.length);
  if (!n) return null;
  const pcts = assigns.map((a) => {
    const s = (subs || []).find((x) => x.uid === uid && x.assignmentId === a.id);
    return homeworkPct(a, s);
  }).sort((a, b) => b - a);
  const take = pcts.slice(0, n);
  const avg = take.reduce((sum, v) => sum + v, 0) / n;
  return round1(avg);
}

export function homeworkAuto(uid, assignments, submissions, scheme) {
  return homeworkFinal({
    id: assignments?.[0]?.courseId,
    assignments,
    submissions,
    scheme,
    homeworkBest: scheme?.homeworkBest
  }, { uid, assignments, submissions });
}

export function publishedQuizzes(quizzes, courseId) {
  return (quizzes || []).filter((q) => q.status === "Published" && (!courseId || q.courseId === courseId));
}
export function quizBestN(scheme, publishedCount) {
  const total = Number(publishedCount) || 0;
  if (total <= 0) return 0;
  const n = Number(scheme?.quizBest);
  if (!Number.isFinite(n) || n < 1) return total;
  return Math.min(Math.max(1, Math.floor(n)), total);
}
function quizAttemptPct(q, att) {
  if (!att) return 0;
  const max = Number(att.maxScore) || Number(q?.maxScore) || Number(q?.points) || 0;
  if (max <= 0) return 0;
  if (att.status === "graded" || att.status === "partial") {
    return Math.max(0, Math.min(100, ((Number(att.score) || 0) / max) * 100));
  }
  return 0;
}
export function quizFinal(course, student) {
  const uid = studentUid(student);
  const courseId = course?.id || course?.courseId || "";
  const quizzes = publishedQuizzes(course?.quizzes || student?.quizzes || [], courseId);
  const attempts = course?.quizAttempts || student?.quizAttempts || [];
  const scheme = course?.scheme || course;
  const n = quizBestN(scheme, quizzes.length);
  if (!n) return null;
  const pcts = quizzes.map((q) => {
    const a = (attempts || []).find((x) => x.uid === uid && x.quizId === q.id);
    return quizAttemptPct(q, a);
  }).sort((a, b) => b - a);
  const avg = pcts.slice(0, n).reduce((sum, v) => sum + v, 0) / n;
  return round1(avg);
}
export function quizAuto(uid, quizzes, attempts, scheme) {
  return quizFinal({
    id: quizzes?.[0]?.courseId,
    quizzes,
    quizAttempts: attempts,
    scheme,
    quizBest: scheme?.quizBest
  }, { uid, quizzes, quizAttempts: attempts });
}

export function autoValuesForStudent(uid, pack) {
  const scheme = pack?.scheme || pack?.gradeScheme;
  return {
    attendance: attendancePct(pack.courseId || pack.id, uid, pack).pct,
    homework: homeworkAuto(uid, pack.assignments, pack.submissions, scheme),
    quiz: quizAuto(uid, pack.quizzes, pack.quizAttempts, scheme)
  };
}

export function computeAverage(scheme, valuesBySection) {
  const components = Array.isArray(scheme?.components) ? scheme.components : scheme || [];
  let sum = 0;
  for (const c of components) {
    const v = parseScore(valuesBySection?.[c.id]);
    sum += ((v == null ? 0 : v) * (Number(c.weight) || 0)) / 100;
  }
  return round1(sum);
}

export function computeStatus(scheme, valuesBySection, passMark) {
  const components = Array.isArray(scheme?.components) ? scheme.components : scheme || [];
  const blank = components.some((c) => parseScore(valuesBySection?.[c.id]) == null);
  const avg = computeAverage(scheme, valuesBySection);
  if (blank) return { label: "In progress", color: "#92400e", bg: "#fef3c7", avg };
  if (avg >= (Number(passMark) || 60)) return { label: "P", color: "#166534", bg: "#dcfce7", avg };
  return { label: "F", color: "#991b1b", bg: "#fee2e2", avg };
}

export function mergedSectionValues(components, manualScores, autoPack, uid, scheme) {
  const auto = autoValuesForStudent(uid, { ...autoPack, scheme: scheme || autoPack?.scheme });
  const out = {};
  for (const c of components || []) {
    const src = c.source === "attendance" || c.source === "homework" || c.source === "quiz" ? c.source : "manual";
    if (src === "manual") out[c.id] = parseScore(manualScores?.[c.id]);
    else out[c.id] = auto[src];
  }
  return out;
}

function packFailed(pack, src) {
  const e = pack?.errors || pack?.failed || {};
  if (e === true) return true;
  if (src === "attendance") return !!(e.attendance || e.sessions);
  if (src === "homework") return !!(e.assignments || e.submissions || e.homework);
  if (src === "quiz") return !!(e.quizzes || e.quizAttempts || e.quiz);
  return false;
}

/** One shared course grade: live auto components, stored manuals, blank manual = 0. */
export function gradeCalc(course, scheme, student) {
  const uid = studentUid(student);
  const comps = Array.isArray(scheme?.components) ? scheme.components : [];
  const pack = student?.pack || course?.pack || student || {};
  const courseId = course?.id || course?.courseId || pack.courseId || "";
  const scores = student?.scores || student?.gradeScores || pack.scores || {};
  const autoPack = {
    ...pack,
    courseId,
    scheme,
    assignments: pack.assignments || course?.assignments,
    submissions: pack.submissions || course?.submissions,
    quizzes: pack.quizzes || course?.quizzes,
    quizAttempts: pack.quizAttempts || course?.quizAttempts,
    attendance: pack.attendance || course?.attendance,
    sessions: pack.sessions || course?.sessions
  };
  for (const c of comps) {
    const src = c.source === "attendance" || c.source === "homework" || c.source === "quiz" ? c.source : "manual";
    if (src !== "manual" && packFailed(autoPack, src)) {
      return { average: null, passed: null, status: "—", values: {}, display: "—", failed: true };
    }
  }
  const values = mergedSectionValues(comps, scores, autoPack, uid, scheme);
  const average = computeAverage(scheme, values);
  const passMark = Number(scheme?.passMark);
  const mark = Number.isFinite(passMark) ? passMark : 60;
  const passed = average >= mark;
  return { average, passed, status: passed ? "Passed" : "Failed", values, display: fmt1(average), passMark: mark, failed: false };
}
