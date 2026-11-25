const todayStr = () => new Date().toISOString().slice(0, 10);
const duePast = (due) => {
  if (!due) return false;
  const d = String(due).slice(0, 10);
  return d < todayStr();
};
const round1 = (n) => {
  const x = Number(n);
  if (!Number.isFinite(x)) return NaN;
  const sign = x < 0 ? -1 : 1;
  return sign * (Math.floor(Math.abs(x) * 10 + 0.5) / 10);
};
/** Display only. Does not change stored or intermediate values. At most one decimal. */
export function formatGrade(value) {
  if (value == null || value === "" || typeof value === "undefined") return "—";
  const n = Number(value);
  if (!Number.isFinite(n) || Number.isNaN(n)) return "—";
  return round1(n).toFixed(1);
}
export const fmt1 = formatGrade;
export function roundGradeInput(raw) {
  if (raw === "" || raw == null) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.min(100, Math.max(0, round1(n)));
}
export function bestNTip(pcts, n) {
  const take = (pcts || []).slice(0, Math.max(0, Number(n) || 0));
  if (!take.length) return "";
  return "(" + take.map(fmt1).join(" + ") + ") ÷ " + take.length + " = " + fmt1(take.reduce((a, b) => a + b, 0) / take.length);
}
const AUTO_KINDS = { attendance: 1, homework: 1, quiz: 1, manual: 1 };
export function kindFrom(c) {
  const s = String(c?.source ?? "").trim().toLowerCase();
  if (s) return AUTO_KINDS[s] ? s : "manual";
  const t = String(c?.title || "").toLowerCase();
  if (/attendance/.test(t)) return "attendance";
  if (/homework/.test(t)) return "homework";
  if (/quiz/.test(t)) return "quiz";
  return "manual";
}
export function isLockedAuto(c) {
  return kindFrom(c) !== "manual";
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
  const pct = !den || den <= 0 ? null : (good / den) * 100;
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
  return avg;
}

export function homeworkAuto(uid, assignments, submissions, scheme, courseId) {
  return homeworkFinal({
    id: courseId || assignments?.[0]?.courseId,
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
  return avg;
}
export function quizAuto(uid, quizzes, attempts, scheme, courseId) {
  return quizFinal({
    id: courseId || quizzes?.[0]?.courseId,
    quizzes,
    quizAttempts: attempts,
    scheme,
    quizBest: scheme?.quizBest
  }, { uid, quizzes, quizAttempts: attempts });
}

export function autoValuesForStudent(uid, pack) {
  const scheme = pack?.scheme || pack?.gradeScheme;
  const courseId = pack.courseId || pack.id || "";
  return {
    attendance: attendancePct(courseId, uid, pack).pct,
    homework: homeworkAuto(uid, pack.assignments, pack.submissions, scheme, courseId),
    quiz: quizAuto(uid, pack.quizzes, pack.quizAttempts, scheme, courseId)
  };
}

export function gradeCoverage(scheme, valuesBySection) {
  const components = Array.isArray(scheme?.components) ? scheme.components : scheme || [];
  let used = 0, total = 0;
  for (const c of components) {
    const w = Number(c.weight) || 0;
    total += w;
    if (parseScore(valuesBySection?.[c.id]) != null) used += w;
  }
  const note = used > 0 && used < total ? ("based on " + fmt1(used) + "% of the grade") : "";
  return { used, total, note, allMissing: used <= 0 };
}
export function computeAverage(scheme, valuesBySection) {
  const components = Array.isArray(scheme?.components) ? scheme.components : scheme || [];
  let sum = 0;
  for (const c of components) {
    const v = parseScore(valuesBySection?.[c.id]);
    sum += ((v == null ? 0 : v) * (Number(c.weight) || 0)) / 100;
  }
  return sum;
}
export function averageTip(scheme, valuesBySection) {
  const components = Array.isArray(scheme?.components) ? scheme.components : scheme || [];
  if (!components.length) return "";
  const parts = components.map((c) => {
    const v = parseScore(valuesBySection?.[c.id]);
    const w = Number(c.weight) || 0;
    return fmt1(v == null ? 0 : v) + " × " + w + "/100";
  });
  return "(" + parts.join(") + (") + ") = " + fmt1(computeAverage(scheme, valuesBySection));
}

export function computeStatus(scheme, valuesBySection, passMark) {
  const avg = computeAverage(scheme, valuesBySection);
  const mark = Number(passMark) || 60;
  if (avg >= mark) return { label: "P", color: "#166534", bg: "#dcfce7", avg, passed: true };
  return { label: "F", color: "#991b1b", bg: "#fee2e2", avg, passed: false };
}
export function scoresFromDoc(docData) {
  const raw = docData && typeof docData === "object" ? (docData.scores && typeof docData.scores === "object" ? docData.scores : docData) : {};
  const out = {};
  Object.keys(raw || {}).forEach((k) => {
    if (k === "uid" || k === "courseId" || k === "updatedAt" || k === "updatedBy" || k === "parts" || k === "finalGrade" || k === "status" || k === "basedOnPercent" || k === "coverageNote" || k === "passMark") return;
    const n = Number(raw[k]);
    if (Number.isFinite(n)) out[k] = n;
  });
  return out;
}
export function numericScores(map) {
  const out = {};
  Object.keys(map || {}).forEach((k) => {
    const n = Number(map[k]);
    if (Number.isFinite(n)) out[k] = n;
  });
  return out;
}

export function mergedSectionValues(components, manualScores, autoPack, uid, scheme) {
  const auto = autoValuesForStudent(uid, { ...autoPack, scheme: scheme || autoPack?.scheme });
  const out = {};
  for (const c of components || []) {
    const src = kindFrom(c);
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
    const src = kindFrom(c);
    if (src !== "manual" && packFailed(autoPack, src)) {
      return { average: null, passed: null, status: "—", values: {}, display: "—", failed: true };
    }
  }
  const storedOnly = student?.storedScores === true || pack.storedScores === true;
  const values = storedOnly ? scoresFromDoc(scores) : mergedSectionValues(comps, scoresFromDoc(scores), autoPack, uid, scheme);
  const passMark = Number(scheme?.passMark);
  const mark = Number.isFinite(passMark) ? passMark : 60;
  const st = computeStatus(scheme, values, mark);
  const average = st.avg;
  const passed = st.passed;
  const status = passed ? "Passed" : "Failed";
  return { average, passed, status, values, display: fmt1(average), passMark: mark, failed: false, tip: averageTip(scheme, values) };
}

export function publishedPayload(g, scheme, extra) {
  const comps = Array.isArray(scheme?.components) ? scheme.components : [];
  const parts = {};
  comps.forEach((c) => {
    parts[c.id] = { title: c.title || c.id, weight: Number(c.weight) || 0, value: parseScore(g.values?.[c.id]) };
  });
  const cov = g.coverage || gradeCoverage(scheme, g.values || {});
  const courseDone = extra && extra.courseStatus === "Completed";
  let status = "In progress";
  if (g.average == null) status = "In progress";
  else if (courseDone) status = g.passed ? "Passed" : "Failed";
  else status = "In progress";
  return {
    finalGrade: g.average == null ? null : Number(fmt1(g.average)),
    status,
    basedOnPercent: cov.used || 0,
    parts,
    passMark: g.passMark,
    coverageNote: g.coverageNote || cov.note || ""
  };
}
export function resultFromStored(scheme, rec, courseStatus) {
  const comps = Array.isArray(scheme?.components) ? scheme.components : [];
  const passN = Number(scheme?.passMark);
  const pass = Number.isFinite(passN) ? passN : 60;
  const done = String(courseStatus || "").trim().toLowerCase() === "completed";
  const empty = { avg: null, passed: null, status: done ? "No grade" : "In progress", unpublished: true, missing: true, values: {}, pass, badge: done ? "No grade" : "In progress", display: done ? "No grade" : "In progress" };
  if (!rec || typeof rec !== "object") return empty;
  const scores = scoresFromDoc(rec.scores != null ? rec.scores : rec);
  const hasAny = Object.keys(scores).length > 0 || rec.average != null || rec.averageRaw != null;
  if (!hasAny) return { ...empty, values: scores };
  let avg = rec.average != null ? Number(rec.average) : (rec.averageRaw != null ? Number(rec.averageRaw) : null);
  if (!Number.isFinite(avg) && comps.length) {
    const g = gradeCalc({ pack: { scheme, storedScores: true } }, scheme, { scores, storedScores: true, pack: { scheme, storedScores: true } });
    avg = g.average;
  }
  if (!Number.isFinite(avg)) return { ...empty, values: scores };
  let status = "In progress";
  let passed = null;
  if (done) {
    passed = avg >= pass;
    status = passed ? "Passed" : "Failed";
  }
  const badge = status;
  const display = done ? (status + " · " + formatGrade(avg)) : "In progress";
  return { avg, passed, status, unpublished: false, missing: false, values: scores, pass, badge, display };
}
/** One admin/student result from stored gradeScores only. */
export function storedCourseResult(scheme, rec, courseStatus) {
  return resultFromStored(scheme, rec, courseStatus);
}
export function readPublished(docData) {
  if (!docData) return null;
  if (docData.finalGrade == null && docData.status == null) return null;
  if (docData.finalGrade == null && !docData.status) return null;
  const has = docData.finalGrade != null || docData.status === "Passed" || docData.status === "Failed" || docData.status === "In progress";
  if (!has) return null;
  return {
    finalGrade: docData.finalGrade == null ? null : Number(docData.finalGrade),
    status: docData.status || "In progress",
    basedOnPercent: docData.basedOnPercent,
    parts: docData.parts || {},
    passMark: docData.passMark,
    coverageNote: docData.coverageNote || (docData.basedOnPercent != null && docData.basedOnPercent < 100 ? ("based on " + fmt1(docData.basedOnPercent) + "% of the grade") : ""),
    updatedAt: docData.updatedAt,
    updatedBy: docData.updatedBy || ""
  };
}
