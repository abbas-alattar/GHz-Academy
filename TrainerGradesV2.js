import { createElement as e, useEffect, useState, Component } from "https://esm.sh/react@18.3.1";
import { createRoot } from "https://esm.sh/react-dom@18.3.1/client";
import { db } from "./firebase-config.js?v=auth8";
import { collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { getTrainerStore, loadTrainerStore, refreshTrainerStore, subscribeTrainerStore, setTrainerCourseId, resolveTrainerCourseId } from "./TrainerStore.js";
import { CourseSelect, StatusBadge } from "./TrainerHomeworkV2.js";
import { isCourseLocked } from "./course-lock.js";
import { parseScore, homeworkFinal, quizFinal, attendancePct, fmt1, bestNTip, publishedHomework, homeworkBestN, publishedQuizzes, quizBestN, gradeCalc } from "./gradeCalc.js";
import { exportAdminPdf, nameWithId } from "./AdminPdfExport.js";
import { showConfirmDialog, showNoticeDialog, showLeaveGradesDialog } from "./ConfirmDialog.js";

function fbErr(er) { return String((er?.code || "") + " " + (er?.message || er)).trim(); }
function initials(n) { return String(n || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0].toUpperCase()).join("") || "?"; }
function id7(en) {
  const s = String(en?.studentId || en?.id7 || "").replace(/\D/g, "");
  return s ? s.padStart(7, "0").slice(-7) : "—";
}
function kindFrom(c) {
  const s = String(c?.source || "").toLowerCase();
  if (s === "attendance" || s === "homework" || s === "quiz") return s;
  const t = String(c?.title || "").toLowerCase();
  if (/\battendance\b/.test(t)) return "attendance";
  if (/homework/.test(t)) return "homework";
  if (/quiz/.test(t)) return "quiz";
  return "manual";
}
function isLockedAuto(c) {
  const s = String(c?.source || "").toLowerCase();
  return s === "attendance" || s === "homework" || s === "quiz";
}
function isProjected(c) { return !isLockedAuto(c) && kindFrom(c) !== "manual"; }
function srcOf(c) { return kindFrom(c); }
function passMarkOf(scheme) { return Number(scheme?.passMark) || 60; }
function autoPackFor(pack, courseId, scheme) {
  const p = pack || {};
  const cid = courseId || "";
  const of = (arr) => (arr || []).filter((x) => !cid || x.courseId === cid);
  return {
    courseId: cid,
    scheme,
    assignments: of(p.assignments),
    submissions: of(p.submissions),
    quizzes: of(p.quizzes),
    quizAttempts: of(p.quizAttempts),
    attendance: of(p.attendance),
    sessions: of(p.sessions)
  };
}
function statusOf(scheme, vals, completed, pack, en) {
  const g = gradeCalc({ id: pack?.courseId, pack }, scheme, { uid: en?.uid, scores: vals, pack });
  if (g.failed) return { avg: null, ip: false, result: "—", csv: "—" };
  const avg = g.average;
  const pass = !!g.passed;
  if (completed) return { avg, ip: false, result: pass ? "Passed" : "Failed", csv: pass ? "Passed" : "Failed" };
  return { avg, ip: true, result: pass ? "Passed" : "Failed", csv: "IP · " + (pass ? "Passed" : "Failed") };
}
const DOT = ["#2563EB", "#7C3AED", "#10B981", "#F59E0B", "#EF4444", "#0EA5E9", "#EC4899"];

class Boundary extends Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err) { console.error("TrainerGradesV2", err); }
  render() {
    if (this.state.err) return e("div", { className: "th2" }, e("p", { className: "th2-err" }, String(this.state.err?.message || this.state.err)), e("button", { className: "th2-btn", onClick: () => this.setState({ err: null }) }, "Try again"));
    return this.props.children;
  }
}

function Ico({ d }) {
  return e("svg", { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round", strokeLinejoin: "round" },
    Array.isArray(d) ? d.map((p, i) => e("path", { key: i, d: p })) : e("path", { d }));
}
function Wand() { return e(Ico, { d: ["M15 4V2", "M15 16v-2", "M8 9h2", "M20 9h2", "M17.8 11.8 19 13", "M15 9h.01", "M17.8 6.2 19 5", "M3 21l9-9", "M12.2 6.2 11 5"] }); }
function FileIco() { return e(Ico, { d: ["M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z", "M14 2v6h6", "M16 13H8", "M16 17H8", "M10 9H8"] }); }
function Dl() { return e(Ico, { d: ["M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4", "M7 10l5 5 5-5", "M12 15V3"] }); }
function Users() { return e(Ico, { d: ["M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2", "M9 11a4 4 0 100-8 4 4 0 000 8", "M22 21v-2a4 4 0 00-3-3.87", "M16 3.13a4 4 0 010 7.75"] }); }
function Trend() { return e(Ico, { d: ["M3 17l6-6 4 4 8-8", "M14 7h7v7"] }); }
function Award() { return e(Ico, { d: ["M12 15a7 7 0 100-14 7 7 0 000 14z", "M8.21 13.89L7 23l5-3 5 3-1.21-9.12"] }); }
function Hour() { return e(Ico, { d: ["M5 22h14", "M5 2h14", "M17 22v-4.17a2 2 0 00-.59-1.42L12 12 7.59 16.41A2 2 0 007 17.83V22", "M7 2v4.17a2 2 0 00.59 1.42L12 12l4.41-4.41A2 2 0 0017 6.17V2"] }); }

function LockIco() {
  return e("svg", { width: 11, height: 11, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.2 }, e("rect", { x: 3, y: 11, width: 18, height: 11, rx: 2 }), e("path", { d: "M7 11V7a5 5 0 0110 0v4" }));
}
function EyeIco() {
  return e("svg", { width: 12, height: 12, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2 }, e("path", { d: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" }), e("circle", { cx: 12, cy: 12, r: 3 }));
}
function TinyTarget() {
  return e("svg", { width: 11, height: 11, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.2 },
    e("circle", { cx: 12, cy: 12, r: 8 }), e("circle", { cx: 12, cy: 12, r: 3 }),
    e("path", { d: "M12 2v3M12 19v3M2 12h3M19 12h3" }));
}
function viewHash(kind, courseId) {
  if (kind === "attendance") return "attendance";
  if (kind === "homework") return "homework-averages/" + courseId;
  if (kind === "quiz") return "quiz-averages/" + courseId;
  return "grades";
}
function calcTip(kind, pack, scheme, courseId, en, autoV) {
  if (kind === "attendance") return "Attendance %: (present + late) ÷ (marked − excused) = " + (autoV == null ? "—" : fmt1(autoV));
  if (kind === "homework") {
    const assigns = publishedHomework(pack.assignments, courseId);
    const n = homeworkBestN(scheme, assigns.length);
    const pcts = assigns.map((a) => {
      const s = (pack.submissions || []).find((x) => x.uid === en.uid && x.assignmentId === a.id);
      const cap = Number(a.maxPoints) || 0;
      if (s && s.status === "graded" && cap > 0) return Math.max(0, Math.min(100, ((Number(s.grade) || 0) / cap) * 100));
      return 0;
    }).sort((a, b) => b - a);
    return "Average of the best " + n + " of " + assigns.length + " homework: " + (bestNTip(pcts, n) || fmt1(autoV));
  }
  if (kind === "quiz") {
    const quizzes = publishedQuizzes(pack.quizzes, courseId);
    const n = quizBestN(scheme, quizzes.length);
    const pcts = quizzes.map((q) => {
      const a = (pack.quizAttempts || []).find((x) => x.uid === en.uid && x.quizId === q.id);
      const max = Number(a?.maxScore) || Number(q?.maxScore) || Number(q?.points) || 0;
      if (a && (a.status === "graded" || a.status === "partial") && max > 0) return Math.max(0, Math.min(100, ((Number(a.score) || 0) / max) * 100));
      return 0;
    }).sort((a, b) => b - a);
    return "Average of the best " + n + " of " + quizzes.length + " quizzes: " + (bestNTip(pcts, n) || fmt1(autoV));
  }
  return autoV == null ? "" : String(fmt1(autoV));
}

function sameVal(a, b) { return parseScore(a) === parseScore(b); }
function CheckIco() {
  return e("svg", { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.2 }, e("path", { d: "M20 6L9 17l-5-5" }));
}

function CourseSheet({ pack, course, uid, go }) {
  const courseId = course.id;
  useEffect(() => { if (courseId) setTrainerCourseId("grades", courseId); }, [courseId]);
  const locked = isCourseLocked(course);
  const [scheme, setScheme] = useState(null);
  const [schemeOk, setSchemeOk] = useState(false);
  const [saved, setSaved] = useState({});
  const [draft, setDraft] = useState({});
  const [loadErr, setLoadErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(false);
  const [invalid, setInvalid] = useState({});

  const ens = (pack.enrollments || []).filter((en) => en.courseId === courseId && String(en.status || "").toLowerCase() !== "cancelled");
  const comps = Array.isArray(scheme?.components) ? scheme.components : [];
  const projComps = comps.filter(isProjected);

  const autoFor = (en) => ({
    homework: homeworkFinal({ id: courseId, assignments: pack.assignments, submissions: pack.submissions, scheme }, en),
    quiz: quizFinal({ id: courseId, quizzes: pack.quizzes, quizAttempts: pack.quizAttempts, scheme }, en),
    attendance: attendancePct(courseId, en.uid, { ...pack, courseId }).pct
  });

  const load = async () => {
    setLoading(true); setLoadErr("");
    try {
      const sch = await getDoc(doc(db, "gradeSchemes", courseId));
      setSchemeOk(sch.exists());
      const schemeData = sch.exists() ? sch.data() : null;
      setScheme(schemeData);
      const snap = await getDocs(query(collection(db, "gradeScores"), where("courseId", "==", courseId)));
      const map = {};
      snap.docs.forEach((d) => { const x = d.data(); map[x.uid] = { ...(x.scores || {}) }; });
      setSaved(map);
      setDraft(map);
      setInvalid({});
    } catch (er) { setLoadErr("gradeScores: " + fbErr(er)); }
    setLoading(false);
  };
  useEffect(() => { load(); }, [courseId]);

  const gradePack = {
    courseId, scheme,
    assignments: pack.assignments, submissions: pack.submissions,
    quizzes: pack.quizzes, quizAttempts: pack.quizAttempts,
    attendance: pack.attendance, sessions: pack.sessions
  };
  const mergedFor = (en) => {
    const g = gradeCalc({ id: courseId, pack: gradePack }, scheme, { uid: en.uid, scores: draft[en.uid] || {}, pack: gradePack });
    return g.values || {};
  };

  const setCell = (uidS, cid, raw) => {
    const t = String(raw ?? "").trim();
    setDraft((prev) => ({ ...prev, [uidS]: { ...(prev[uidS] || {}), [cid]: t === "" ? null : t } }));
    if (t === "") { setInvalid((p) => ({ ...p, [uidS + "_" + cid]: false })); return; }
    const n = Number(t);
    const bad = !Number.isFinite(n) || n < 0 || n > 100;
    setInvalid((p) => ({ ...p, [uidS + "_" + cid]: bad }));
  };

  const vis = ens.filter((en) => ((en.studentName || "") + " " + id7(en)).toLowerCase().includes(q.toLowerCase()));
  const dirtyUids = ens.filter((en) => {
    const m = mergedFor(en);
    const s = saved[en.uid] || {};
    return comps.some((c) => !sameVal(m[c.id], s[c.id]));
  }).map((en) => en.uid);
  const changeN = ens.reduce((n, en) => {
    const m = mergedFor(en);
    const s = saved[en.uid] || {};
    return n + comps.filter((c) => !sameVal(m[c.id], s[c.id])).length;
  }, 0);
  const dirty = changeN > 0;
  const rows = vis.map((en) => {
    const vals = mergedFor(en);
    const info = statusOf(scheme, vals, locked, gradePack, en);
    return { en, vals, info, auto: autoFor(en) };
  });
  const avgs = rows.map((r) => r.info.avg).filter((n) => n != null);
  const classAvg = avgs.length ? fmt1(avgs.reduce((a, b) => a + b, 0) / avgs.length) : "—";
  const filledFor = (r) => comps.length > 0 && comps.every((c) => isLockedAuto(c) || parseScore(r.vals[c.id]) != null);
  const fullyN = rows.filter(filledFor).length;
  const pendingN = rows.filter((r) => !filledFor(r)).length;
  const passingN = rows.filter((r) => r.info.result === "Passed").length;
  const failedN = rows.filter((r) => r.info.result === "Failed").length;
  const foot = comps.map((c) => {
    const nums = rows.map((r) => parseScore(r.vals[c.id])).filter((n) => n != null);
    return nums.length ? fmt1(nums.reduce((a, b) => a + b, 0) / nums.length) : "—";
  });
  const passM = passMarkOf(scheme);

  const applyAllProjected = async () => {
    const names = projComps.map((c) => c.title || "Section").join(", ");
    const ok = await showConfirmDialog({ title: "Apply all projected?", message: "This copies projected values into: " + names + ".", confirmLabel: "Apply" });
    if (!ok || ok.ok === false) return;
    setDraft((prev) => {
      const next = { ...prev };
      ens.forEach((en) => {
        const auto = autoFor(en);
        const cur = { ...(next[en.uid] || {}) };
        projComps.forEach((c) => {
          const nv = auto[kindFrom(c)];
          if (nv != null) cur[c.id] = nv;
        });
        next[en.uid] = cur;
      });
      return next;
    });
  };

  const writeStudents = async (uids) => {
    setSaving(true);
    const jobs = uids.map((id) => {
      const en = ens.find((x) => x.uid === id);
      const scoresMap = mergedFor(en);
      return setDoc(doc(db, "gradeScores", id + "_" + courseId), {
        uid: id, courseId, scores: scoresMap, updatedAt: serverTimestamp(), updatedBy: uid
      }).then(() => ({ id, ok: true, scoresMap })).catch((er) => ({ id, ok: false, er, scoresMap }));
    });
    const settled = await Promise.allSettled(jobs);
    const results = settled.map((r, i) => r.status === "fulfilled" ? r.value : { id: uids[i], ok: false, er: r.reason });
    const okOnes = results.filter((r) => r.ok);
    const bad = results.filter((r) => !r.ok);
    setSaved((prev) => {
      const n = { ...prev };
      okOnes.forEach((r) => { n[r.id] = r.scoresMap; });
      return n;
    });
    setSaving(false);
    if (!bad.length) {
      try { window.__ghzBumpActive?.(); } catch (_) {}
      await showNoticeDialog({ tone: "ok", title: "Saved", message: "Grades updated for " + okOnes.length + " student" + (okOnes.length === 1 ? "" : "s"), autoCloseMs: 1500 });
      return true;
    }
    const lines = bad.map((r) => (ens.find((x) => x.uid === r.id)?.studentName || r.id) + ": " + fbErr(r.er)).join("\n");
    await showNoticeDialog({ tone: "danger", title: "Could not save", message: lines, retry: true, onRetry: () => writeStudents(bad.map((r) => r.id)) });
    return false;
  };

  const saveGrades = async () => {
    if (locked || saving || !dirty) return false;
    const badCells = Object.keys(invalid).filter((k) => invalid[k]);
    if (badCells.length) {
      await showNoticeDialog({ tone: "danger", title: "Check the numbers", message: "Scores must be between 0 and 100." });
      return false;
    }
    return writeStudents(dirtyUids);
  };

  const discard = () => { setDraft(saved); setInvalid({}); };

  const leaveGuard = async (next) => {
    if (!dirty) { next(); return true; }
    const a = await showLeaveGradesDialog();
    if (a === "stay") return false;
    if (a === "discard") { discard(); next(); return true; }
    const ok = await saveGrades();
    if (ok) next();
    return !!ok;
  };
  useEffect(() => {
    window.__ghzTrainerLeave = () => leaveGuard(() => {});
    return () => { if (window.__ghzTrainerLeave) window.__ghzTrainerLeave = null; };
  }, [dirty, saved, draft]);

  useEffect(() => {
    const onBefore = (ev) => {
      if (!dirty) return;
      ev.preventDefault();
      ev.returnValue = "";
    };
    window.addEventListener("beforeunload", onBefore);
    return () => window.removeEventListener("beforeunload", onBefore);
  }, [dirty]);

  const csv = () => {
    const head = ["Name (ID)", "ID", ...comps.map((c) => (c.title || "") + " (" + (c.weight || 0) + "%)"), "Average", "Status"];
    const body = rows.map((r) => [nameWithId(r.en.studentName, id7(r.en)).label, id7(r.en), ...comps.map((c) => parseScore(r.vals[c.id]) ?? ""), r.info.avg == null ? "" : fmt1(r.info.avg), r.info.csv]);
    const blob = new Blob([[head, ...body].map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "grades.csv"; a.click();
  };
  const pdf = () => exportAdminPdf({
    page: (course.title || "Course") + " · Grades",
    filters: (Array.isArray(course.trainerNames) ? course.trainerNames.join(", ") : course.trainerName || ""),
    columns: [{ key: "n", label: "Student" }, ...comps.map((c) => ({ key: c.id, label: c.title })), { key: "avg", label: "Average" }, { key: "st", label: "Status" }],
    rows: rows.map((r) => { const o = { n: nameWithId(r.en.studentName, id7(r.en)).label, avg: r.info.avg == null ? "—" : fmt1(r.info.avg), st: r.info.csv }; comps.forEach((c) => { o[c.id] = parseScore(r.vals[c.id]) == null ? "—" : fmt1(r.vals[c.id]); }); return o; })
  });

  const statusCell = (info) => {
    if (!info.ip && info.result) return e("span", { className: "th2-pill " + (info.result === "Passed" ? "graded" : "missing") }, info.result);
    if (info.ip && info.result) return e("span", { className: "th2-pill soon", title: "Course in progress. Final result after the course is completed." }, "IP · " + info.result);
    if (info.ip) return e("span", { className: "th2-pill soon" }, "IP");
    return null;
  };

  const saveBtn = !locked && e("button", { type: "button", className: "th2-btn pri nowrap", disabled: saving || !dirty || !schemeOk, onClick: saveGrades }, e(CheckIco), saving ? " Saving…" : " Save grades");

  return e("div", { className: "th2 th2-grd th2-jak" },
    e("button", { type: "button", className: "th2-backpill", "data-nav": "grades?course=" + (courseId || ""), "aria-label": "Back to Grades" }, "← Grades"),
    locked ? e("div", { className: "th2-lockban" }, "Course completed — grades are locked") : null,
    e("div", { className: "th2-hero" },
      e("h2", { style: { margin: 0 } }, course.title || "Course"),
      e("div", { className: "th2-optrow" }, e(StatusBadge, { course }), e("span", { className: "th2-sub" }, Array.isArray(course.trainerNames) ? course.trainerNames.join(", ") : (course.trainerName || ""))),
      schemeOk ? e("div", { className: "th2-schips" },
        comps.map((c, i) => e("span", { key: c.id, className: "th2-schip" }, e("i", { style: { background: DOT[i % DOT.length] } }), (c.title || "Section") + " " + (c.weight || 0) + "%")),
        e("span", { className: "th2-schip pass" }, "Pass mark " + passM + "%")
      ) : e("p", { className: "th2-err" }, "The admin has not set up the grade scheme for this course yet")
    ),
    loadErr ? e("p", { className: "th2-err" }, loadErr, " ", e("button", { className: "th2-btn", onClick: load }, "Try again")) : null,
    e("div", { className: "th2-grd-toolbar" },
      e("input", { type: "search", placeholder: "Search students", value: q, onChange: (ev) => setQ(ev.target.value) }),
      projComps.length && !locked ? e("button", { type: "button", className: "th2-btn nowrap", disabled: !schemeOk, onClick: applyAllProjected }, e(Wand), " Apply all projected") : null,
      e("button", { type: "button", className: "th2-btn nowrap", onClick: pdf }, e(FileIco), " View PDF"),
      e("button", { type: "button", className: "th2-btn nowrap", onClick: csv }, e(Dl), " Export CSV"),
      saveBtn
    ),
    e("div", { className: "th2-kpis" },
      e("div", { className: "th2-kpi blue" }, e("span", { className: "ico" }, e(Users)), e("div", null, e("span", null, "Students"), e("strong", null, String(ens.length)))),
      e("div", { className: "th2-kpi violet" }, e("span", { className: "ico" }, e(Trend)), e("div", null, e("span", null, "Class average"), e("strong", null, String(classAvg)))),
      e("div", { className: "th2-kpi teal" }, e("span", { className: "ico" }, e(Award)), e("div", null, e("span", null, locked ? "Passed" : "Passing (provisional)"), e("strong", null, String(passingN)))),
      e("div", { className: "th2-kpi violet" }, e("span", { className: "ico" }, e(CheckIco)), e("div", null, e("span", null, "Fully graded"), e("strong", null, fullyN + " / " + ens.length))),
      e("div", { className: "th2-kpi amber" }, e("span", { className: "ico" }, e(Hour)), e("div", null, e("span", null, "Pending"), e("strong", null, String(pendingN)))),
      locked ? e("div", { className: "th2-kpi rose" }, e("span", { className: "ico" }, e(Hour)), e("div", null, e("span", null, "Failed/Below pass mark"), e("strong", null, String(failedN)))) : null
    ),
    loading ? e("div", { className: "th2-skline", style: { height: 160, marginTop: 12 } }) :
    e("div", { className: "th2-card th2-grd-card" },
      e("div", { className: "th2-grd-wrap" },
        e("table", { className: "th2-table th2-grd-table" },
          e("thead", null, e("tr", null,
            e("th", { className: "th2-stul" }, "Student"),
            comps.map((c) => e("th", { key: c.id, className: "th2-numh" }, e("span", { className: "th2-2line" }, c.title || "Section"), e("span", { className: "th2-sub" }, (c.weight || 0) + "%"))),
            e("th", { className: "th2-avgl" }, "Average"),
            e("th", { className: "th2-stath" }, "Status")
          )),
          e("tbody", null, rows.map((r) => e("tr", { key: r.en.uid },
            e("td", { className: "th2-stul" },
              e("div", { className: "ha1-stu" },
                e("span", { className: "ha1-av" }, initials(r.en.studentName)),
                e("span", { className: "ha1-stun" }, e("b", null, r.en.studentName || "Student"), e("span", { className: "ha1-id" }, id7(r.en)))
              )
            ),
            comps.map((c) => {
              const kind = kindFrom(c);
              const autoV = r.auto[kind];
              const v = isLockedAuto(c) ? autoV : r.vals[c.id];
              const tip = calcTip(kind, pack, scheme, courseId, r.en, autoV);
              const dirtyCell = !sameVal(r.vals[c.id], (saved[r.en.uid] || {})[c.id]);
              if (isLockedAuto(c)) {
                const autoTip = "Auto · " + (tip || "");
                return e("td", { key: c.id, className: "th2-numh" + (dirtyCell ? " th2-dirty" : "") },
                  e("div", { className: "th2-gbox th2-gauto", title: autoTip },
                    e("span", { className: "th2-abadge", "aria-hidden": true }, "A"),
                    e("span", { className: "th2-alock", "aria-hidden": true }, e(LockIco)),
                    e("span", { className: "th2-gnum" }, autoV == null ? "—" : fmt1(autoV)),
                    e("button", { type: "button", className: "th2-eye", "aria-label": "View source", onClick: (ev) => { ev.stopPropagation(); leaveGuard(() => go(viewHash(kind, courseId))); } }, e(EyeIco))
                  )
                );
              }
              const bad = invalid[r.en.uid + "_" + c.id];
              return e("td", { key: c.id, className: "th2-numh" },
                e("div", { className: "th2-gline" },
                  e("input", { type: "number", min: 0, max: 100, className: "th2-gin " + (bad ? "th2-badin " : "") + (dirtyCell ? "th2-dirtyin" : ""), disabled: locked || !schemeOk, value: v == null ? "" : v, onChange: (ev) => setCell(r.en.uid, c.id, ev.target.value) }),
                  isProjected(c) ? e("button", { type: "button", className: "th2-approx", title: "Projected from saved attendance / homework / quiz grades. Click to apply.", disabled: locked || autoV == null, onClick: () => setCell(r.en.uid, c.id, autoV) }, e(TinyTarget), autoV == null ? "—" : fmt1(autoV)) : null
                ),
                bad ? e("div", { className: "th2-badmsg" }, "0–100") : null
              );
            }),
            e("td", { className: "th2-avgl" },
              e("div", { className: "th2-avgstack" },
                e("strong", { className: (r.info.avg || 0) >= passM ? "ok" : "bad" }, r.info.avg == null ? "—" : fmt1(r.info.avg)),
                e("i", { className: "th2-minibar" }, e("b", { className: (r.info.avg || 0) >= passM ? "ok" : "bad", style: { width: Math.min(100, r.info.avg || 0) + "%" } }))
              )
            ),
            e("td", { className: "th2-stath" }, statusCell(r.info))
          )),
          e("tr", { className: "th2-foot" },
            e("td", { className: "th2-stul" }, e("strong", null, "Class average")),
            comps.map((c, i) => e("td", { key: c.id, className: "th2-numh" }, foot[i])),
            e("td", { className: "th2-avgl" }, e("strong", null, classAvg)),
            e("td", { className: "th2-stath" }, "")
          ))
        )
      ),
      dirty && !locked ? e("div", { className: "th2-unsaved" },
        e("span", null, changeN + " unsaved change" + (changeN === 1 ? "" : "s")),
        e("button", { type: "button", className: "th2-btn", onClick: discard, disabled: saving }, "Discard"),
        e("button", { type: "button", className: "th2-btn pri", disabled: saving || !schemeOk, onClick: saveGrades }, saving ? "Saving…" : "Save grades")
      ) : null
    )
  );
}

function CapIco() {
  return e("svg", { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8 }, e("path", { d: "M22 10l-10-5L2 10l10 5 10-5z" }), e("path", { d: "M6 12v5c3 2 9 2 12 0v-5" }));
}
function ArrowIco() {
  return e("svg", { width: 14, height: 14, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.2 }, e("path", { d: "M5 12h14M13 6l6 6-6 6" }));
}
function barTone(avg, pass) {
  if (avg == null) return "gray";
  if (avg >= pass) return "ok";
  if (avg >= pass - 10) return "warn";
  return "bad";
}
function rankStatus(st) { return st === "Completed" ? 1 : 0; }

function ListPage({ pack, uid, go, pick }) {
  const courses = pack?.courses || [];
  const [meta, setMeta] = useState({});
  const [sort, setSort] = useState({ key: "status", dir: 1 });
  useEffect(() => {
    let live = true;
    (async () => {
      const out = {};
      await Promise.all(courses.map(async (c) => {
        try {
          const [sch, sc] = await Promise.all([
            getDoc(doc(db, "gradeSchemes", c.id)),
            getDocs(query(collection(db, "gradeScores"), where("courseId", "==", c.id)))
          ]);
          const scheme = sch.exists() ? sch.data() : null;
          const scores = {};
          sc.docs.forEach((d) => { const x = d.data(); scores[x.uid] = { ...(x.scores || {}) }; });
          const ens = (pack.enrollments || []).filter((en) => en.courseId === c.id && String(en.status || "").toLowerCase() !== "cancelled");
          const gPack = autoPackFor(pack, c.id, scheme);
          const infos = ens.map((en) => statusOf(scheme, scores[en.uid] || {}, isCourseLocked(c), gPack, en));
          const debug = ens.map((en) => {
            const inf = statusOf(scheme, scores[en.uid] || {}, true, gPack, en);
            return { name: en.studentName || en.uid, avg: inf.avg, status: inf.result };
          });
          const avgs = infos.map((i) => i.avg).filter((n) => n != null);
          out[c.id] = {
            n: ens.length,
            avg: avgs.length ? avgs.reduce((a, b) => a + b, 0) / avgs.length : null,
            passed: infos.filter((i) => i.result === "Passed" && !i.ip).length,
            failed: infos.filter((i) => i.result === "Failed" && !i.ip).length,
            ip: infos.filter((i) => i.ip).length,
            pass: passMarkOf(scheme),
            debug
          };
        } catch {
          out[c.id] = { n: (pack.enrollments || []).filter((en) => en.courseId === c.id).length, avg: null, passed: 0, failed: 0, ip: 0 };
        }
      }));
      if (live) setMeta(out);
    })();
    return () => { live = false; };
  }, [courses, pack.enrollments, pack.assignments, pack.submissions, pack.quizzes, pack.quizAttempts, pack.attendance, pack.sessions]);

  const rows = courses.map((c) => {
    const m = meta[c.id] || { n: (pack.enrollments || []).filter((en) => en.courseId === c.id && String(en.status || "").toLowerCase() !== "cancelled").length, avg: null, passed: 0, failed: 0, ip: 0 };
    return { c, m };
  }).sort((a, b) => {
    const rs = rankStatus(a.c.status) - rankStatus(b.c.status);
    if (sort.key === "name") return String(a.c.title || "").localeCompare(String(b.c.title || "")) * sort.dir || rs;
    if (sort.key === "students") return ((a.m.n || 0) - (b.m.n || 0)) * sort.dir || rs;
    if (sort.key === "avg") return ((a.m.avg || -1) - (b.m.avg || -1)) * sort.dir || rs;
    return rs || String(a.c.title || "").localeCompare(String(b.c.title || ""));
  });
  const totStu = rows.reduce((n, r) => n + (Number(r.m.n) || 0), 0);
  const avgs = rows.map((r) => r.m.avg).filter((n) => n != null);
  const classAvg = avgs.length ? avgs.reduce((a, b) => a + b, 0) / avgs.length : null;
  const totPass = rows.reduce((n, r) => n + (Number(r.m.passed) || 0), 0);
  const clickSort = (key) => setSort((s) => ({ key, dir: s.key === key ? -s.dir : (key === "name" ? 1 : -1) }));
  const chip = (n, cls) => e("span", { className: "th2-cnt " + ((Number(n) || 0) === 0 ? "zero" : cls) }, String(n ?? 0));
  const debugOn = /(?:\?|&)debug=1\b/.test(location.hash) || /[?&]debug=1\b/.test(location.search);

  return e("div", { className: "th2 th2-grd th2-jak" },
    e("div", { className: "th2-head" },
      e("div", null, e("h2", null, "Grades"), e("p", null, "Course results for your classes")),
      e(CourseSelect, { courses, cid: pick, counts: Object.fromEntries(courses.map((c) => [c.id, { items: (pack.enrollments || []).filter((en) => en.courseId === c.id && String(en.status || "").toLowerCase() !== "cancelled").length }])), countNoun: "student", onPick: (id) => go(id ? "grades/" + id : "grades") })
    ),
    e("div", { className: "th2-kpis" },
      e("div", { className: "th2-kpi blue" }, e("span", { className: "ico" }, e(CapIco)), e("div", null, e("span", null, "Courses"), e("strong", null, String(courses.length)))),
      e("div", { className: "th2-kpi violet" }, e("span", { className: "ico" }, e(Users)), e("div", null, e("span", null, "Students"), e("strong", null, String(totStu)))),
      e("div", { className: "th2-kpi teal" }, e("span", { className: "ico" }, e(Trend)), e("div", null, e("span", null, "Class average"), e("strong", null, classAvg == null ? "—" : fmt1(classAvg)))),
      e("div", { className: "th2-kpi amber" }, e("span", { className: "ico" }, e(Award)), e("div", null, e("span", null, "Passed"), e("strong", null, String(totPass))))
    ),
    !courses.length ? e("div", { className: "th2-empty" }, e(CapIco), e("p", null, "No courses assigned yet")) :
    e("div", { className: "th2-card" },
      e("table", { className: "th2-table th2-glist" },
        e("thead", null, e("tr", null,
          e("th", { className: "th2-sort", onClick: () => clickSort("name") }, "Course"),
          e("th", null, "Status"),
          e("th", { className: "th2-sort", onClick: () => clickSort("students") }, "Students"),
          e("th", { className: "th2-sort", onClick: () => clickSort("avg") }, "Class average"),
          e("th", null, "Passed"), e("th", null, "Failed"), e("th", null, "In progress"), e("th", null, "")
        )),
        e("tbody", null, rows.map(({ c, m }) => {
          const pass = m.pass || 60;
          const tone = barTone(m.avg, pass);
          return e("tr", { key: c.id, className: "th2-clickrow", onClick: () => go("grades/" + c.id) },
            e("td", null, e("span", { className: "th2-cname", title: c.title || "Course" }, c.title || "Course")),
            e("td", null, e(StatusBadge, { course: c })),
            e("td", { className: "th2-num" }, String(m.n)),
            e("td", null, e("div", { className: "th2-avgbar " + tone }, e("span", { className: "th2-num" }, m.avg == null ? "—" : fmt1(m.avg)), e("i", null, e("b", { style: { width: Math.min(100, m.avg || 0) + "%" } })), e("em", null, m.avg == null ? "" : Math.round(m.avg) + "%"))),
            e("td", null, chip(m.passed, "ok")),
            e("td", null, chip(m.failed, "bad")),
            e("td", null, chip(m.ip, "warn")),
            e("td", { onClick: (ev) => ev.stopPropagation() }, e("button", { className: "th2-open", onClick: () => go("grades/" + c.id) }, "Open grades", e(ArrowIco)))
          );
        }))
      ),
      debugOn ? e("div", { className: "th2-card", style: { marginTop: 16, overflow: "auto" } },
        e("h3", { style: { fontSize: 14, margin: "0 0 8px" } }, "Grade check (list vs live gradeCalc)"),
        e("table", { className: "th2-table" },
          e("thead", null, e("tr", null, e("th", null, "Course"), e("th", null, "Student"), e("th", null, "List avg"), e("th", null, "List status"))),
          e("tbody", null, rows.flatMap(({ c, m }) => (m.debug || []).map((d, i) => e("tr", { key: c.id + i },
            e("td", null, c.title), e("td", null, d.name), e("td", null, d.avg == null ? "—" : fmt1(d.avg)), e("td", null, d.status)
          ))))
        )
      ) : null
    )
  );
}

function Page({ uid, go, courseId, listCourse }) {
  const [pack, setPack] = useState(getTrainerStore());
  useEffect(() => subscribeTrainerStore(setPack), []);
  useEffect(() => { if (uid) loadTrainerStore(uid); }, [uid]);
  const courses = pack?.courses || [];
  const pick = resolveTrainerCourseId("grades", { hashId: listCourse || courseId, courses });
  if (!pack || !pack.extrasReady) return e("div", { className: "th2" }, e("div", { className: "th2-hero" }, e("h2", { style: { margin: 0 } }, "Grades"), e("div", { className: "th2-skline", style: { height: 120 } })));
  if (pack.enrollErr) return e("div", { className: "th2" }, e("p", { className: "th2-err" }, pack.enrollErr, " ", e("button", { className: "th2-btn", onClick: () => refreshTrainerStore(uid) }, "Try again")));
  const sheetCourse = courses.find((c) => c.id === courseId);
  if (courseId && sheetCourse) return e(CourseSheet, { pack, course: sheetCourse, uid, go });
  return e(ListPage, { pack, uid, go, pick });
}

let root;
export function renderTrainerGradesV2(host, props) {
  if (!host) return false;
  try {
    if (!root) root = createRoot(host);
    root.render(e(Boundary, null, e(Page, props)));
    return true;
  } catch (er) {
    host.innerHTML = `<p class="th2-err">${er.message || er} <button class="th2-btn" type="button" id="tgv2r">Try again</button></p>`;
    host.querySelector("#tgv2r")?.addEventListener("click", () => renderTrainerGradesV2(host, props));
    return false;
  }
}
