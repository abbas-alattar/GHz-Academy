import { createElement as e, useMemo, useState, useEffect, Component } from "https://esm.sh/react@18.3.1";
import { createRoot } from "https://esm.sh/react-dom@18.3.1/client";
import { db } from "./firebase-config.js?v=auth10";
import { collection, query, where, getDocs, getDoc, doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { parseScore, computeAverage, computeStatus, mergedSectionValues, fmt1, gradeCalc, averageTip, readPublished, publishedPayload, storedCourseResult } from "./gradeCalc.js";
import { AdminPdfButton } from "./AdminPdfExport.js";
import { csvDown } from "./grades-shell.js";
import { courseStatusLabel, statusChipShort } from "./courseStatusLabel.js";

function showSecErr(host, err, retry) {
  if (!host) return;
  const msg = String((err && (err.message || err.code)) || err || "error");
  host.innerHTML = '<div style="margin:16px;padding:16px;background:#fff;border:1px solid #E5EAF1;border-radius:14px;max-width:480px;font-family:system-ui,sans-serif"><p style="margin:0 0 8px;font-weight:650">This section could not load</p><p style="margin:0 0 12px;color:#64748B;font-size:14px"></p><button type="button" style="height:36px;padding:0 14px;border:0;border-radius:10px;background:#2563EB;color:#fff;font-weight:600;cursor:pointer">Retry</button></div>';
  const p = host.querySelector("p:nth-of-type(2)");
  if (p) p.textContent = msg;
  const b = host.querySelector("button");
  if (b) b.onclick = () => { try { retry(); } catch (e2) { showSecErr(host, e2, retry); } };
}

class Boundary extends Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err) { console.error("AdminGradesV2", err); }
  render() {
    if (this.state.err) {
      return e("div", null,
        e("p", { className: "agv2-err" }, String(this.state.err?.code || this.state.err?.message || this.state.err)),
        e("button", { type: "button", className: "agv2-csv", onClick: this.props.onRetry }, "Try again"));
    }
    return this.props.children;
  }
}

function isActive(st) { return st === "Open" || st === "Coming soon" || st === "Closed"; }
function isDone(st) { return st === "Completed"; }
function stClass(s) { if (s === "Open") return "open"; if (s === "Coming soon") return "soon"; return "gray"; }
function fbErr(err) { return err?.code || err?.message || String(err); }
function withTimeout(p, ms) {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error("deadline-exceeded"), { code: "deadline-exceeded" })), ms))]);
}
function allFilled(components, vals) {
  if (!components || !components.length) return true;
  return components.every((c) => parseScore(vals?.[c.id]) != null);
}
function passFail(avg, passMark) {
  const n = Number(avg);
  const mark = Number(passMark);
  if (!Number.isFinite(n) || !Number.isFinite(mark)) return "Failed";
  return n >= mark ? "Passed" : "Failed";
}
function statusInfo(courseStatus, r) {
  if (r.unpublished || r.missing) return { csv: "Not saved yet", ip: false, result: null, unpublished: true };
  const st = String(r.status || "");
  if (st === "Passed") return { csv: "Passed", ip: false, result: "Passed" };
  if (st === "Failed") return { csv: "Failed", ip: false, result: "Failed" };
  return { csv: "In progress", ip: true, result: "In progress" };
}
function isPassWord(info) { return info?.result === "Passed"; }
function isFailWord(info) { return info?.result === "Failed"; }
function shortHead(c) {
  const t = String(c?.title || "");
  if (/attendance/i.test(t)) return "Attend.";
  if (/homework/i.test(t)) return "Home.";
  if (/quiz/i.test(t)) return "Quizzes";
  return t || "Part";
}
function fmtUpdated(ms) {
  if (!ms) return "";
  try { return new Date(ms).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric" }); } catch { return ""; }
}
function looksLikeUid(s) { return /^[A-Za-z0-9_-]{12,}$/.test(String(s || "")) && !/\s/.test(String(s || "")); }
function trainerIdsFromCourse(c) {
  if (!c) return [];
  const out = [];
  const add = (v) => {
    if (!v) return;
    if (Array.isArray(v)) { v.forEach(add); return; }
    const s = String(v).trim();
    if (s) out.push(s);
  };
  add(c.trainerIds); add(c.trainerId); add(c.instructors); add(c.instructorIds); add(c.instructorId);
  return [...new Set(out)];
}
function trainerLineFromNames(names) {
  const n = (names || []).filter(Boolean);
  if (!n.length) return "No trainer assigned";
  return (n.length === 1 ? "Trainer: " : "Trainers: ") + n.join(", ");
}
async function resolveTrainerNames(course) {
  try {
    const ids = trainerIdsFromCourse(course);
    if (!ids.length) {
      const named = course?.trainer || course?.trainerName || course?.instructor;
      if (typeof named === "string" && named.trim()) return [named.trim()];
      return [];
    }
    const settled = await Promise.allSettled(ids.map((id) => getDoc(doc(db, "users", id))));
    const names = [];
    settled.forEach((r, i) => {
      if (r.status === "fulfilled" && r.value?.exists?.()) {
        const d = r.value.data() || {};
        names.push(d.name || d.displayName || ids[i]);
      } else if (ids[i] && !looksLikeUid(ids[i])) names.push(ids[i]);
    });
    return [...new Set(names.filter(Boolean))];
  } catch {
    return [];
  }
}

function App({ courses, courseId, setCourseId, pack, loading, error, onRetry, trainers }) {
  courses = Array.isArray(courses) ? courses : [];
  trainers = Array.isArray(trainers) ? trainers : [];
  const [q, setQ] = useState("");
  const [recalc, setRecalc] = useState({ phase: "idle", rows: [], err: "" });
  const [stF, setStF] = useState("All");
  const [sort, setSort] = useState({ key: "avg", dir: -1 });
  const course = (courses || []).find((c) => c.id === courseId) || courses?.[0] || null;
  const cid = course?.id || "";
  const components = pack?.components || [];
  const passMark = pack?.passMark ?? 60;
  const active = (courses || []).filter((c) => isActive(c.status));
  const done = (courses || []).filter((c) => isDone(c.status));
  const hydrate = (r) => {
    const res = storedCourseResult(pack?.scheme || { components, passMark }, r.rec, course?.status);
    return { ...r, vals: res.values || {}, avg: res.avg, status: res.status, unpublished: res.unpublished, missing: res.missing, info: statusInfo(course?.status, { ...r, ...res }) };
  };
  const rows = useMemo(() => {
    const list = (pack?.rows || []).map(hydrate);
    const qq = q.trim().toLowerCase();
    let vis = list.filter((r) => {
      if (qq && !(r.name || "").toLowerCase().includes(qq) && !(r.studentId || "").toLowerCase().includes(qq)) return false;
      if (stF === "Passed" && !isPassWord(r.info)) return false;
      if (stF === "Failed" && !isFailWord(r.info)) return false;
      if (stF === "In progress" && r.info?.result !== "In progress" && !r.info?.unpublished) return false;
      return true;
    });
    vis.sort((a, b) => {
      const k = sort.key;
      let av = k === "name" ? a.name : k === "sid" ? a.studentId : k === "avg" ? a.avg : k === "status" ? a.info?.csv : a.vals?.[k];
      let bv = k === "name" ? b.name : k === "sid" ? b.studentId : k === "avg" ? b.avg : k === "status" ? b.info?.csv : b.vals?.[k];
      if (av == null) av = -1;
      if (bv == null) bv = -1;
      if (typeof av === "string") return String(av).localeCompare(String(bv)) * sort.dir;
      return (Number(av) - Number(bv)) * sort.dir;
    });
    return vis;
  }, [pack, q, stF, sort, course, passMark]);
  const hydratedAll = (pack?.rows || []).map(hydrate);
  const infos = hydratedAll.map((r) => r.info);
  const passed = infos.filter((i) => i.result === "Passed").length;
  const failed = infos.filter((i) => i.result === "Failed").length;
  const ipCount = infos.filter((i) => i.result === "In progress" || i.unpublished).length;
  const avgs = hydratedAll.map((r) => r.avg).filter((n) => Number.isFinite(n));
  const classAvg = avgs.length ? Number(fmt1(avgs.reduce((a, b) => a + b, 0) / avgs.length)) : null;
  const colMean = (getter) => {
    const nums = hydratedAll.map(getter).filter((n) => Number.isFinite(n));
    return nums.length ? fmt1(nums.reduce((a, b) => a + b, 0) / nums.length) : "—";
  };
  const footParts = components.map((c) => colMean((r) => parseScore(r.vals?.[c.id])));
  const footAvg = classAvg == null ? "—" : fmt1(classAvg);
  const cols = 3 + components.length;
  const grid = { gridTemplateColumns: `36px minmax(120px,1.1fr) repeat(${Math.max(components.length, 1)}, minmax(72px,1fr)) minmax(90px,90px) minmax(120px,120px)` };
  const clickSort = (key) => setSort((s) => ({ key, dir: s.key === key ? -s.dir : (key === "avg" ? -1 : 1) }));
  const trainerNames = trainers || [];
  const trainerLine = trainerLineFromNames(trainerNames);
  const trainerCsv = trainerNames.length ? trainerNames.join(", ") : "No trainer assigned";
  const classAvgLabel = classAvg == null ? "—" : fmt1(classAvg);
  const pdfData = () => ({
    page: "Grades",
    filters: (course?.title || "Course") + " · " + trainerLine + (q ? " · Search " + q : "") + (stF !== "All" ? " · " + stF : ""),
    summary: trainerLine + " · Class overall average " + classAvgLabel,
    columns: [
      { key: "n", label: "#" }, { key: "student", label: "Student" }, { key: "sid", label: "Student ID" },
      ...components.map((c) => ({ key: c.id, label: (c.title || "") + " (" + (Number(c.weight) || 0) + "%)" })),
      { key: "avg", label: "Average" }, { key: "result", label: "Status" }
    ],
    rows: [
      ...rows.map((r, i) => {
        const o = { n: i + 1, student: r.name, sid: r.studentId || "—", avg: Number.isFinite(r.avg) ? fmt1(r.avg) : "—", result: r.info?.csv || "IP" };
        components.forEach((c) => { const v = parseScore(r.vals[c.id]); o[c.id] = v == null ? "—" : fmt1(v); });
        return o;
      }),
      (() => {
        const o = { n: "", student: "Class average", sid: "", avg: footAvg, result: "" };
        components.forEach((c, i) => { o[c.id] = footParts[i]; });
        return o;
      })()
    ]
  });
  const runRecalc = async (confirm) => {
    try {
      if (!confirm) {
        setRecalc({ phase: "scan", rows: [], err: "" });
        const changes = [];
        const pending = [];
        for (const c of courses) {
          const schemeSnap = await getDoc(doc(db, "gradeSchemes", c.id));
          if (!schemeSnap.exists()) continue;
          const scheme = schemeSnap.data();
          const enSnap = await getDocs(query(collection(db, "enrollments"), where("courseId", "==", c.id)));
          const scSnap = await getDocs(query(collection(db, "gradeScores"), where("courseId", "==", c.id)));
          const byUid = {};
          scSnap.docs.forEach((d) => { const data = d.data(); byUid[data.uid] = data; });
          for (const ed of enSnap.docs) {
            const en = { id: ed.id, ...ed.data() };
            const rec = byUid[en.uid] || {};
            const g = gradeCalc({ id: c.id, pack: { scheme, storedScores: true } }, scheme, { uid: en.uid, scores: rec.scores || rec, storedScores: true, pack: { scheme, storedScores: true } });
            const pub = publishedPayload(g, scheme, { courseStatus: c.status });
            const oldSt = rec.status || (rec.finalGrade == null ? "—" : String(rec.status || "—"));
            const neuSt = pub.status;
            pending.push({ uid: en.uid, courseId: c.id, rec, pub, student: en.studentName || en.uid, course: c.title || c.id, old: oldSt + (rec.finalGrade != null ? " " + fmt1(rec.finalGrade) : ""), neu: neuSt + (pub.finalGrade != null ? " " + fmt1(pub.finalGrade) : "") });
            if (oldSt !== neuSt) changes.push(pending[pending.length - 1]);
          }
        }
        window.__ghzRecalcPending = pending;
        setRecalc({ phase: "preview", rows: changes, err: "" });
        return;
      }
      const pending = window.__ghzRecalcPending || [];
      setRecalc((p) => ({ ...p, phase: "write" }));
      const { auth } = await import("./firebase-config.js?v=auth10");
      const by = auth.currentUser?.uid || "admin";
      for (const row of pending) {
        await setDoc(doc(db, "gradeScores", row.uid + "_" + row.courseId), {
          uid: row.uid, courseId: row.courseId, scores: row.rec.scores || {}, ...row.pub, updatedAt: serverTimestamp(), updatedBy: by
        }, { merge: true });
      }
      window.__ghzRecalcPending = [];
      setRecalc({ phase: "idle", rows: [], err: "" });
      onRetry?.();
    } catch (er) {
      setRecalc({ phase: "idle", rows: [], err: fbErr(er) });
    }
  };
  const exportCsv = () => {
    csvDown("grades.csv", [
      ["#", "Student", "Student ID", ...components.map((c) => (c.title || "") + " (" + (Number(c.weight) || 0) + "%)"), "Average", "Status", "Trainer(s)"],
      ...rows.map((r, i) => [i + 1, r.name, r.studentId || "", ...components.map((c) => { const v = parseScore(r.vals[c.id]); return v == null ? "" : fmt1(v); }), Number.isFinite(r.avg) ? fmt1(r.avg) : "", r.info?.csv || "IP", trainerCsv])
    ]);
  };
  if (loading) {
    return e("div", { className: "admin-grades agv2" },
      e("div", { className: "agv2-head" }, e("div", null, e("h2", null, "Grades"), e("p", { className: "sub" }, "Scores, averages and results per course"))),
      e("div", { className: "agv2-act" }, e("select", { className: "agv2-sel", disabled: true, "aria-label": "Course" }, e("option", null, "All courses"))),
      e("div", { className: "agv2-stats" },
        ["Students", "Passed", "Failed", "Class average"].map((lab) => e("div", { className: "agv2-stat", key: lab }, e("strong", null, e("span", { className: "agv2-sk" })), e("span", null, lab)))
      ),
      e("div", { className: "agv2-card" }, e("div", { className: "agv2-row" }, e("div", { className: "agv2-sk" })))
    );
  }
  if (error && !(pack?.rows || []).length) {
    return e("div", { className: "admin-grades agv2" },
      e("div", { className: "agv2-head" }, e("div", null, e("h2", null, "Grades"), e("p", { className: "sub" }, "Scores, averages and results per course"))),
      e("p", { className: "agv2-err" }, String(error), " ", e("button", { type: "button", className: "agv2-csv", onClick: onRetry }, "Try again"))
    );
  }
  return e("div", { className: "admin-grades agv2" },
    e("div", { className: "agv2-head" },
      e("div", null, e("h2", null, "Grades"), e("p", { className: "sub" }, "Scores, averages and results per course")),
      e("div", { className: "agv2-act" },
        e("button", { type: "button", className: "agv2-csv", onClick: exportCsv }, "Export CSV"),
        e("button", { type: "button", className: "agv2-csv", disabled: recalc.phase === "scan" || recalc.phase === "write", onClick: () => runRecalc(false) }, recalc.phase === "scan" ? "Scanning…" : "Recalculate all grades"),
        e(AdminPdfButton, { getData: pdfData, page: "Grades" })
      )
    ),
    e("div", { className: "agv2-act" },
      e("select", { className: "agv2-sel", value: cid, "aria-label": "Course", onChange: (ev) => setCourseId(ev.target.value) },
        e("optgroup", { label: "Active courses" }, active.map((c) => e("option", { key: c.id, value: c.id }, c.title))),
        e("optgroup", { label: "Completed courses" }, done.map((c) => e("option", { key: c.id, value: c.id }, c.title)))
      ),
      course ? e("span", { className: "agv2-st " + stClass(course.status), title: courseStatusLabel(course) }, statusChipShort(course)) : null,
      course ? e("span", { className: "agv2-tr" }, trainerLine) : null,
      e("input", { className: "agv2-in", placeholder: "Search name or Student ID", value: q, onChange: (ev) => setQ(ev.target.value) }),
      e("select", { className: "agv2-sel", value: stF, "aria-label": "Status", onChange: (ev) => setStF(ev.target.value) },
        e("option", null, "All"), e("option", null, "Passed"), e("option", null, "Failed"), e("option", null, "In progress")
      )
    ),
    error ? e("p", { className: "agv2-err" }, String(error), " ", e("button", { type: "button", className: "agv2-csv", onClick: onRetry }, "Try again")) : null,
    recalc.phase === "preview" ? e("div", { className: "agv2-card", style: { margin: "12px 0", padding: 16 } },
      e("p", { className: "sub" }, "Pass/fail changes (nothing saved yet)"),
      (recalc.rows.length ? recalc.rows.map((r, i) => e("p", { key: i, className: "sub" }, r.student + " · " + r.course + " · old " + r.old + " → new " + r.neu)) : e("p", { className: "sub" }, "No pass/fail changes.")),
      e("button", { type: "button", className: "agv2-csv", onClick: () => runRecalc(true) }, "Confirm"),
      e("button", { type: "button", className: "agv2-csv", onClick: () => setRecalc({ phase: "idle", rows: [] }) }, "Cancel")
    ) : null,
    recalc.err ? e("p", { className: "agv2-err" }, recalc.err) : null,
    e("div", { className: "agv2-stats" },
      [["Students", loading ? null : (pack?.rows || []).length, ""],
        ["Passed", loading ? null : passed, "agv2-pass"],
        ["Failed", loading ? null : failed, "agv2-fail"],
        ["Class average", loading ? null : (classAvg == null ? "—" : classAvg), ""]].map(([lab, n, cls]) =>
        e("div", { className: "agv2-stat", key: lab },
          e("strong", { className: cls }, loading ? e("span", { className: "agv2-sk" }) : String(n ?? "—")),
          e("span", null, lab),
          lab === "Class average" ? e("div", { className: "agv2-note" }, "Pass mark " + passMark) : ((lab === "Passed" || lab === "Failed") ? e("div", { className: "agv2-note" }, "IP: " + ipCount + " students") : null)
        ))
    ),
    e(Boundary, { onRetry },
      e("div", { className: "agv2-card" },
        e("div", { className: "agv2-th", style: grid },
          e("button", { type: "button", onClick: () => clickSort("avg") }, "#"),
          e("button", { type: "button", onClick: () => clickSort("name") }, "Student"),
          components.map((c) => e("button", { type: "button", key: c.id, title: (c.title || "") + " (" + (Number(c.weight) || 0) + "%)", onClick: () => clickSort(c.id) }, shortHead(c), e("span", { className: "agv2-w" }, (Number(c.weight) || 0) + "%"))),
          !components.length ? e("span", null, "Components") : null,
          e("button", { type: "button", title: "Average", onClick: () => clickSort("avg") }, "Avg."),
          e("button", { type: "button", onClick: () => clickSort("status") }, "Status")
        ),
        loading ? e("div", { className: "agv2-row" }, e("div", { className: "agv2-sk" })) :
          (rows.length ? rows.map((r, i) => e("div", { className: "agv2-row", key: r.uid || i, style: grid },
            e("div", null, String(i + 1)),
            e("div", null, e("span", { className: "agv2-name" }, r.name), e("span", { className: "agv2-sid" }, r.studentId || "—")),
            components.map((c) => {
              if (r.unpublished) return e("div", { key: c.id, className: "agv2-z" }, "—");
              const v = parseScore(r.vals[c.id]);
              const low = v != null && v < passMark;
              return e("div", { key: c.id, className: v == null ? "agv2-z" : (low ? "agv2-low" : "") }, v == null ? "—" : fmt1(v));
            }),
            e("div", { className: "agv2-avg", title: r.unpublished || r.missing || !Number.isFinite(r.avg) ? "The trainer has not saved this part yet" : "" }, r.unpublished || r.missing || !Number.isFinite(r.avg) ? "Not saved yet" : fmt1(r.avg)),
            e("div", { className: "agv2-pills" },
              r.unpublished || r.missing || !Number.isFinite(r.avg) ? e("span", { className: "agv2-pill i", title: "The trainer has not saved this part yet" }, "Not saved yet") :
              e("span", { className: "agv2-pill " + (r.info?.result === "Passed" ? "p" : r.info?.result === "Failed" ? "f" : "i") }, r.info?.result || "In progress")
            )
          )).concat([
            e("div", { className: "agv2-row agv2-foot", key: "class-avg", style: grid },
              e("div", null, ""),
              e("div", null, e("span", { className: "agv2-name" }, "Class average"), e("span", { className: "agv2-sid" }, "\u00a0")),
              components.map((c, i) => e("div", { key: c.id }, footParts[i])),
              e("div", { className: "agv2-avg" }, footAvg),
              e("div", { className: "agv2-pills" }, "")
            )
          ]) : e("p", { className: "agv2-empty" }, "No students match.")),
        pack?.updatedAt ? e("p", { className: "agv2-note", style: { padding: "10px 16px" } }, "Updated by trainer on " + fmtUpdated(pack.updatedAt)) : e("p", { className: "agv2-note", style: { padding: "10px 16px" } }, "Updated by trainer on —")
      )
    ),);
}

function Host() {
  const [courses, setCourses] = useState([]);
  const [courseId, setCourseId] = useState("");
  const [pack, setPack] = useState(null);
  const [trainers, setTrainers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const load = async (cid, { pageLoad } = {}) => {
    if (pageLoad) setLoading(true);
    setError(null);
    const c = await loadGradeCourses();
    if (!c.ok) { setCourses([]); setError(c.err); setLoading(false); return; }
    setCourses(c.rows);
    const id = cid || courseId || (c.rows.find((x) => /5G Network Engineering/i.test(x.title || "")) || c.rows[0] || {}).id || "";
    setCourseId(id);
    const course = c.rows.find((x) => x.id === id) || null;
    const p = await loadGradePack(id);
    setPack(p);
    setError(p.err);
    setLoading(false);
    resolveTrainerNames(course).then(setTrainers).catch(() => setTrainers([]));
  };
  const switchCourse = async (id) => {
    setCourseId(id);
    setTrainers([]);
    setError(null);
    const course = courses.find((x) => x.id === id) || null;
    const p = await loadGradePack(id);
    setPack(p);
    setError(p.err);
    resolveTrainerNames(course).then(setTrainers).catch(() => setTrainers([]));
  };
  useEffect(() => { load(undefined, { pageLoad: true }); }, []);
  return e(App, {
    courses, courseId, setCourseId: switchCourse,
    pack, loading, error, onRetry: () => load(courseId, { pageLoad: true }), trainers
  });
}

const roots = new WeakMap();
export function renderAdminGradesV2(host, opts = {}) {
  if (!host) return;
  let root = roots.get(host);
  if (root) {
    try { root.unmount(); } catch (_) {}
    roots.delete(host);
  }
  host.replaceChildren();
  root = createRoot(host);
  roots.set(host, root);
  try {
    root.render(e(Host, opts || {}));
  } catch (err) {
    console.error(err);
    showSecErr(host, err, () => renderAdminGradesV2(host, opts));
  }
}

export async function loadGradeCourses() {
  try {
    const snap = await withTimeout(getDocs(collection(db, "courses")), 10000);
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((c) => isActive(c.status) || isDone(c.status));
    return { ok: true, rows, err: null };
  } catch (err) { return { ok: false, rows: [], err: fbErr(err) }; }
}

export async function loadGradePack(courseId) {
  if (!courseId) return { components: [], passMark: 60, rows: [], err: null };
  const timed = async (p) => withTimeout(p, 10000);
  try {
    const schemeSnap = await timed(getDoc(doc(db, "gradeSchemes", courseId)));
    const scheme = schemeSnap.exists() ? schemeSnap.data() : {};
    const components = Array.isArray(scheme.components) ? scheme.components : [];
    let passMark = Number(scheme.passMark);
    if (!Number.isFinite(passMark)) passMark = 60;
    const col = async (name) => {
      try {
        const snap = await timed(getDocs(query(collection(db, name), where("courseId", "==", courseId))));
        return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      } catch (err) { throw Object.assign(err, { col: name }); }
    };
    let enrolled, scores, users = [];
    try { enrolled = await col("enrollments"); }
    catch (err) { return { components, passMark, rows: [], err: fbErr(err) }; }
    try {
      const ss = await timed(getDocs(query(collection(db, "gradeScores"), where("courseId", "==", courseId))));
      scores = {};
      ss.docs.forEach((d) => { const data = d.data(); scores[data.uid] = data; });
    } catch (err) { return { components, passMark, rows: [], err: fbErr(err) }; }
    try {
      const us = await timed(getDocs(collection(db, "users")));
      users = us.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (_) { users = []; }
    const userBy = {};
    users.forEach((u) => { userBy[u.id] = u; if (u.uid) userBy[u.uid] = u; });
    let latestAt = null;
    const rows = enrolled.map((en) => {
      const rec = scores[en.uid] || null;
      const u = userBy[en.uid] || {};
      const at = rec?.updatedAt;
      const ms = at?.toMillis ? at.toMillis() : (at?.seconds ? at.seconds * 1000 : 0);
      if (ms && (!latestAt || ms > latestAt)) latestAt = ms;
      return { uid: en.uid, name: en.studentName || u.name || en.studentEmail || en.uid || "", studentId: u.studentId || en.studentId || "", rec };
    });
    return { components, passMark, scheme, rows, updatedAt: latestAt, err: null };
  } catch (err) {
    return { components: [], passMark: 60, rows: [], err: fbErr(err) };
  }
}
