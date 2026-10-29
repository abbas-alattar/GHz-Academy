import { createElement as e, useMemo, useState, useEffect, Component } from "https://esm.sh/react@18.3.1";
import { createRoot } from "https://esm.sh/react-dom@18.3.1/client";
import { db } from "./firebase-config.js?v=auth8";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { attendancePct, homeworkAuto, gradeCalc } from "./gradeCalc.js";
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
  componentDidCatch(err) { console.error("AdminReportsV2", err); }
  render() {
    if (this.state.err) {
      return e("div", { className: "arv2-sec-err" },
        e("p", { className: "arv2-err" }, String(this.state.err?.code || this.state.err?.message || this.state.err)),
        e("button", { type: "button", className: "arv2-view", onClick: this.props.onRetry || (() => location.reload()) }, "Try again"));
    }
    return this.props.children;
  }
}
function Sec({ onRetry, children }) {
  return e(Boundary, { onRetry }, children);
}
function ico(kind, color) {
  const paths = {
    cal: ["M8 2v3M16 2v3M4 8h16M5 4h14a1 1 0 011 1v15a1 1 0 01-1 1H5a1 1 0 01-1-1V5a1 1 0 011-1z", "M9 14l2 2 4-4"],
    clip: ["M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2", "M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2", "M9 14l2 2 4-4"],
    users: ["M17 21v-2a4 4 0 00-4-4H7a4 4 0 00-4 4v2", "M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"],
    help: ["M12 21a9 9 0 110-18 9 9 0 010 18z", "M9.1 9a3 3 0 015.8 1c0 2-3 2-3 4M12 17h.01"],
    bars: ["M4 19V10M12 19V5M20 19v-7"],
    award: ["M12 21a9 9 0 110-18 9 9 0 010 18z", "M8.5 12.2l2.2 2.2 4.8-5"]
  };
  const extra = kind === "users" ? e("circle", { cx: 9, cy: 7, r: 4 }) : null;
  return e("svg", { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: color, strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true" },
    (paths[kind] || []).map((d, i) => e("path", { key: i, d })), extra);
}
function secErr(err, onRetry) {
  if (!err) return null;
  return e("div", { className: "arv2-sec-err" },
    e("p", { className: "arv2-err" }, String(err)),
    e("button", { type: "button", className: "arv2-view", onClick: onRetry }, "Try again"));
}

const EDGE = ["#2563EB", "#16A34A", "#D97706", "#7C3AED", "#0EA5E9", "#EC4899"];
const hue = (id) => { let h = 0; String(id || "").split("").forEach((c) => { h = (h * 31 + c.charCodeAt(0)) >>> 0; }); return EDGE[h % EDGE.length]; };
const initials = (n) => String(n || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
const avBg = (n) => { let h = 0; String(n || "").split("").forEach((c) => { h = (h * 17 + c.charCodeAt(0)) % 360; }); return `linear-gradient(135deg,hsl(${h},62%,42%),hsl(${(h+40)%360},70%,56%))`; };
function isActive(st) { return st === "Open" || st === "Coming soon" || st === "Closed"; }
function isDashActive(st) { return st === "Open" || st === "Closed"; }
function isDone(st) { return st === "Completed"; }
function stClass(s) { if (s === "Open") return "open"; if (s === "Coming soon") return "soon"; return "gray"; }
function band(n) {
  if (n == null || Number.isNaN(n)) return { cls: "arv2-z", color: "#94A3B8", text: "—" };
  if (n >= 80) return { cls: "arv2-g", color: "#16A34A", text: n + "%" };
  if (n >= 60) return { cls: "arv2-a", color: "#D97706", text: n + "%" };
  return { cls: "arv2-r", color: "#DC2626", text: n + "%" };
}
function pctEl(n) {
  const b = band(n);
  return e("span", { className: b.cls }, e("span", { className: "arv2-dot", style: { background: b.color } }), b.text);
}
function fbErr(err) { return err?.code || err?.message || String(err); }
function withTimeout(p, ms) {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error("deadline-exceeded"), { code: "deadline-exceeded" })), ms))]);
}
async function settledCol(col) {
  try {
    const snap = await withTimeout(getDocs(collection(db, col)), 10000);
    return { ok: true, rows: snap.docs.map((d) => ({ id: d.id, ...d.data() })), err: null };
  } catch (err) { return { ok: false, rows: [], err: fbErr(err) }; }
}
function mean(arr) {
  const n = arr.filter((x) => x != null && !Number.isNaN(x));
  if (!n.length) return null;
  return Math.round((n.reduce((a, b) => a + b, 0) / n.length) * 10) / 10;
}
function polar(cx, cy, r, deg) {
  const rad = (deg - 90) * Math.PI / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}
function arcPath(cx, cy, r, start, sweep) {
  const a0 = polar(cx, cy, r, start);
  const a1 = polar(cx, cy, r, start + sweep);
  const large = sweep > 180 ? 1 : 0;
  return `M ${a0.x} ${a0.y} A ${r} ${r} 0 ${large} 1 ${a1.x} ${a1.y}`;
}
function RingGauge({ value, gid, from, to, tick, empty }) {
  const pct = value == null || Number.isNaN(value) ? 0 : Math.max(0, Math.min(100, Number(value)));
  const sweep = 270 * (empty ? 0 : pct / 100);
  const tickA = tick != null ? 135 + 270 * (Math.max(0, Math.min(100, tick)) / 100) : null;
  const t = tickA != null ? polar(60, 60, 42, tickA) : null;
  const lab = empty || value == null ? "—" : (Number.isInteger(value) ? String(value) : String(value));
  return e("div", { className: "rp5-ringwrap" },
    e("svg", { className: "rp5-svg", viewBox: "0 0 120 120", width: 140, height: 140 },
      e("defs", null, e("linearGradient", { id: gid, x1: "0%", y1: "0%", x2: "100%", y2: "100%" },
        e("stop", { offset: "0%", stopColor: from }), e("stop", { offset: "100%", stopColor: to }))),
      e("path", { d: arcPath(60, 60, 42, 135, 270), fill: "none", stroke: "#E2E8F0", strokeWidth: 10, strokeLinecap: "round" }),
      e("path", { className: empty ? "rp5-empty" : "rp5-arc", d: arcPath(60, 60, 42, 135, Math.max(0.01, sweep)), fill: "none", stroke: empty ? "#CBD5E1" : "url(#" + gid + ")", strokeWidth: 10, strokeLinecap: "round" }),
      t ? e("circle", { cx: t.x, cy: t.y, r: 3.5, fill: "#0F2747" }) : null
    ),
    e("div", { className: "rp5-center" }, empty ? e("span", { className: "rp5-nodata" }, "No data yet") : e("strong", null, lab, e("small", null, "%")))
  );
}
function Donut({ passed, failed, pct }) {
  const p = passed || 0, f = failed || 0, tot = p + f;
  const empty = !tot || pct == null;
  const r = 42, c = 2 * Math.PI * r;
  const gap = c * (4 / 360);
  const usable = Math.max(0, c - gap * 2);
  const pLen = empty ? 0 : (p / tot) * usable;
  const fLen = empty ? 0 : (f / tot) * usable;
  return e("div", { className: "rp5-ringwrap" },
    e("svg", { className: "rp5-svg", viewBox: "0 0 120 120", width: 140, height: 140 },
      e("defs", null, e("linearGradient", { id: "rp5passg", x1: "0%", y1: "0%", x2: "100%", y2: "0%" },
        e("stop", { offset: "0%", stopColor: "#16A34A" }), e("stop", { offset: "100%", stopColor: "#22C55E" }))),
      e("circle", { cx: 60, cy: 60, r, fill: "none", stroke: "#E2E8F0", strokeWidth: 12 }),
      empty ? null : e("circle", { className: "rp5-donut", cx: 60, cy: 60, r, fill: "none", stroke: "url(#rp5passg)", strokeWidth: 12, strokeLinecap: "round", strokeDasharray: pLen + " " + (c - pLen), transform: "rotate(-90 60 60)" }),
      empty ? null : e("circle", { className: "rp5-donut", cx: 60, cy: 60, r, fill: "none", stroke: "#F87171", strokeWidth: 12, strokeLinecap: "round", strokeDasharray: fLen + " " + (c - fLen), strokeDashoffset: -(pLen + gap), transform: "rotate(-90 60 60)" })
    ),
    e("div", { className: "rp5-center" }, empty ? e("span", { className: "rp5-nodata" }, "No data yet") : e("strong", null, String(pct), e("small", null, "%")))
  );
}
function CourseBars({ rows, gid, from, to }) {
  const [all, setAll] = useState(false);
  const sorted = (rows || []).slice().sort((a, b) => (b.v || 0) - (a.v || 0));
  const show = all ? sorted : sorted.slice(0, 4);
  const max = Math.max(100, ...sorted.map((x) => x.v || 0));
  return e("div", { className: "rp5-by" },
    e("p", { className: "rp5-bylab" }, "By course"),
    show.map((row) => e("div", { className: "rp5-barrow", key: row.id, title: row.title + ": " + (row.v == null ? "—" : row.v + "%") },
      e("span", { className: "rp5-bt" }, row.title),
      e("div", { className: "rp5-btrack" }, e("div", { className: "rp5-bfill", style: { width: (row.v == null ? 0 : (row.v / max) * 100) + "%", background: "linear-gradient(90deg," + from + "," + to + ")" } })),
      e("span", { className: "rp5-bv" }, row.v == null ? "—" : row.v + "%")
    )),
    sorted.length > 4 ? e("button", { type: "button", className: "rp5-more", onClick: () => setAll((v) => !v) }, all ? "Show less" : "Show all") : null
  );
}
function GaugeCard({ iconBg, iconCol, iconKind, title, note, children }) {
  return e("div", { className: "rp5-card" },
    e("div", { className: "rp5-head" },
      e("div", { className: "arv2-ic", style: { background: iconBg, color: iconCol } }, ico(iconKind, iconCol)),
      e("div", null, e("p", { className: "rp5-title" }, title), e("p", { className: "rp5-note" }, note))
    ),
    children
  );
}

function courseMetrics(c, pack) {
  const cid = c.id;
  const ens = (pack.enrollments || []).filter((x) => x.courseId === cid);
  const assigns = (pack.assignments || []).filter((x) => x.courseId === cid && x.status === "Published");
  const subs = (pack.submissions || []).filter((x) => x.courseId === cid);
  const quizzes = (pack.quizzes || []).filter((x) => x.courseId === cid);
  const atts = (pack.attempts || []).filter((x) => x.courseId === cid);
  const recs = (pack.attendance || []).filter((x) => x.courseId === cid);
  const scheme = pack.schemes?.[cid] || null;
  const scores = pack.scores || [];
  const enrolled = ens.length;
  const hwTot = enrolled * assigns.length;
  let hwDone = 0;
  assigns.forEach((a) => ens.forEach((en) => { if (subs.find((s) => s.uid === en.uid && s.assignmentId === a.id)) hwDone++; }));
  const hwRate = hwTot ? Math.round((hwDone / hwTot) * 100) : null;
  const autoPack = { courseId: cid, attendance: recs, sessions: pack.sessions, assignments: assigns, submissions: subs, quizzes, quizAttempts: atts };
  const avgs = [];
  const passMark = Number(scheme?.passMark != null ? scheme.passMark : 60);
  let graded = 0, passed = 0;
  const students = ens.map((en) => {
    const att = attendancePct(cid, en.uid, { attendance: recs, sessions: pack.sessions }).pct;
    const hw = homeworkAuto(en.uid, assigns, subs, scheme);
    let avg = null;
    if (scheme && Array.isArray(scheme.components) && scheme.components.length) {
      const row = scores.find((s) => s.uid === en.uid && s.courseId === cid);
      const g = gradeCalc({ id: cid, pack: { ...autoPack, scheme } }, scheme, { uid: en.uid, scores: row?.scores || {}, pack: { ...autoPack, scheme } });
      if (!g.failed && Number.isFinite(g.average)) avg = g.average;
    }
    if (avg != null) { avgs.push(avg); graded++; if (avg >= passMark) passed++; }
    return { uid: en.uid, name: en.studentName || en.uid, att, hw, avg };
  });
  const attVals = ens.map((en) => attendancePct(cid, en.uid, { attendance: recs, sessions: pack.sessions }).pct).filter((x) => x != null);
  const attPct = attVals.length ? Math.round(attVals.reduce((a, b) => a + b, 0) / attVals.length) : null;
  const qTaken = atts.length;
  const qScores = atts.filter((a) => a.status === "graded" && Number.isFinite(Number(a.score)) && Number(a.maxScore) > 0).map((a) => (Number(a.score) / Number(a.maxScore)) * 100);
  const quizAvg = qScores.length ? Math.round((qScores.reduce((a, b) => a + b, 0) / qScores.length) * 10) / 10 : null;
  const avgGrade = avgs.length ? Math.round((avgs.reduce((a, b) => a + b, 0) / avgs.length) * 10) / 10 : null;
  const passRate = isDone(c.status) && graded ? Math.round((passed / graded) * 100) : null;
  const trainerIds = c.trainerIds || (c.trainerId ? [c.trainerId] : []);
  const trainer = trainerIds.map((id) => ((pack.users || []).find((u) => u.id === id || u.uid === id) || {}).name).filter(Boolean).join(", ") || "Unassigned";
  return { enrolled, hwRate, avgGrade, attPct, qTaken, quizAvg, passRate, passed, failed: Math.max(0, graded - passed), trainer, students };
}

function App({ onOpenStudent, loadKey }) {
  const [cid, setCid] = useState("");
  const [sel, setSel] = useState(null);
  const [courses, setCourses] = useState([]);
  const [pack, setPack] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sectionErr, setSectionErr] = useState(null);
  const load = async () => {
    setLoading(true);
    setError(null);
    setSectionErr(null);
    try {
      const data = await loadReportPack();
      setCourses(data.courses || []);
      setPack(data.pack || null);
      setError(data.error || null);
      setSectionErr(data.sectionErr || null);
    } catch (err) {
      const msg = fbErr(err);
      setCourses([]);
      setPack(null);
      setError(msg);
      setSectionErr({ summary: msg, active: msg, done: msg, risk: msg });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [cid, loadKey]);
  const onRetry = load;
  const rows = useMemo(() => (courses || []).filter((c) => isActive(c.status) || isDone(c.status)).map((c) => ({ c, m: pack ? courseMetrics(c, pack) : null })), [courses, pack]);
  const filtered = cid ? rows.filter((r) => r.c.id === cid) : rows;
  const active = filtered.filter((r) => isActive(r.c.status));
  const done = filtered.filter((r) => isDone(r.c.status));
  const dashActive = filtered.filter((r) => isDashActive(r.c.status));
  const attM = mean(dashActive.map((r) => r.m?.attPct));
  const hwM = mean(dashActive.map((r) => r.m?.hwRate));
  const enSum = active.reduce((a, r) => a + (r.m?.enrolled || 0), 0);
  const qSum = active.reduce((a, r) => a + (r.m?.qTaken || 0), 0);
  const gM = mean(done.map((r) => r.m?.avgGrade));
  const passedN = done.reduce((a, r) => a + (r.m?.passed || 0), 0);
  const failedN = done.reduce((a, r) => a + (r.m?.failed || 0), 0);
  const gradedN = passedN + failedN;
  const pM = gradedN ? Math.round((passedN / gradedN) * 100) : null;
  const passMark = (() => {
    const marks = done.map((r) => Number((pack?.schemes || {})[r.c.id]?.passMark ?? 60)).filter((n) => Number.isFinite(n));
    return marks.length ? Math.round(marks.reduce((a, b) => a + b, 0) / marks.length) : 60;
  })();
  const attRows = dashActive.map((r) => ({ id: r.c.id, title: r.c.title, v: r.m?.attPct }));
  const hwRows = dashActive.map((r) => ({ id: r.c.id, title: r.c.title, v: r.m?.hwRate }));
  const gRows = done.map((r) => ({ id: r.c.id, title: r.c.title, v: r.m?.avgGrade }));
  const pRows = done.map((r) => {
    const p = r.m?.passed || 0;
    const f = r.m?.failed || 0;
    const g = p + f;
    const enrolled = r.m?.enrolled || 0;
    return { id: r.c.id, title: r.c.title, v: !enrolled && !g ? null : (g ? Math.round((p / g) * 100) : 0) };
  });
  const risk = [];
  active.forEach((r) => (r.m?.students || []).forEach((s) => {
    const pills = [];
    if (s.att != null && s.att < 70) pills.push({ t: "Attendance " + s.att + "%", k: "a" });
    if (s.hw != null && s.hw < 50) pills.push({ t: "Homework " + s.hw + "%", k: "a" });
    if (pills.length) risk.push({ ...s, course: r.c.title, pills });
  }));
  done.forEach((r) => (r.m?.students || []).forEach((s) => {
    if (s.avg != null && s.avg < 60) risk.push({ ...s, course: r.c.title, pills: [{ t: "Failed " + s.avg, k: "r" }] });
  }));
  const pdfData = () => ({
    page: "Reports",
    filters: cid ? ((courses.find((c) => c.id === cid) || {}).title || "Course") : "All courses",
    summary: "Active att " + (attM ?? "—") + "% · HW " + (hwM ?? "—") + "% · Enrolled " + enSum + " · Quizzes " + qSum + " · Completed avg " + (gM ?? "—") + " · Pass " + (pM ?? "—") + "%",
    columns: [
      { key: "group", label: "Group" }, { key: "course", label: "Course" }, { key: "trainer", label: "Trainer" },
      { key: "enrolled", label: "Enrolled" }, { key: "hw", label: "Homework rate" }, { key: "att", label: "Attendance %" },
      { key: "q", label: "Quizzes taken" }, { key: "extra", label: "Quiz avg / Grade" }, { key: "pass", label: "Pass rate" }
    ],
    rows: [
      ...active.map((r) => ({ group: "Active", course: r.c.title, trainer: r.m?.trainer, enrolled: r.m?.enrolled, hw: r.m?.hwRate, att: r.m?.attPct, q: r.m?.qTaken, extra: r.m?.quizAvg ?? "—", pass: "" })),
      { group: "Active totals", course: "", trainer: "", enrolled: enSum, hw: hwM, att: attM, q: qSum, extra: "", pass: "" },
      ...done.map((r) => ({ group: "Completed", course: r.c.title, trainer: r.m?.trainer, enrolled: r.m?.enrolled, hw: r.m?.hwRate, att: r.m?.attPct, q: r.m?.qTaken, extra: r.m?.avgGrade ?? "—", pass: r.m?.passRate ?? "—" })),
      { group: "Completed totals", course: "", trainer: "", enrolled: done.reduce((a, r) => a + (r.m?.enrolled || 0), 0), hw: mean(done.map((r) => r.m?.hwRate)), att: mean(done.map((r) => r.m?.attPct)), q: done.reduce((a, r) => a + (r.m?.qTaken || 0), 0), extra: gM ?? "—", pass: pM ?? "—" }
    ]
  });
  const exportCsv = () => {
    csvDown("reports.csv", [
      ["Group", "Course", "Trainer", "Enrolled", "Homework rate", "Attendance %", "Quizzes taken", "Quiz average", "Average grade", "Pass rate", "Passed / Failed"],
      ...active.map((r) => ["Active", r.c.title, r.m?.trainer, r.m?.enrolled, r.m?.hwRate, r.m?.attPct, r.m?.qTaken, r.m?.quizAvg ?? "", "", "", ""]),
      ["Active totals", "", "", enSum, hwM, attM, qSum, "", "", "", ""],
      ...done.map((r) => ["Completed", r.c.title, r.m?.trainer, r.m?.enrolled, r.m?.hwRate, r.m?.attPct, r.m?.qTaken, "", r.m?.avgGrade, r.m?.passRate, (r.m?.passed || 0) + " / " + (r.m?.failed || 0)]),
      ["Completed totals", "", "", done.reduce((a, r) => a + (r.m?.enrolled || 0), 0), mean(done.map((r) => r.m?.hwRate)), mean(done.map((r) => r.m?.attPct)), done.reduce((a, r) => a + (r.m?.qTaken || 0), 0), "", gM, pM, ""]
    ]);
  };
  const drawer = sel && rows.find((r) => r.c.id === sel);
  const courseCell = (r) => e("div", { className: "arv2-ct" },
    e("div", { className: "arv2-edge", style: { background: hue(r.c.id) } }),
    e("div", null, e("p", null, r.c.title), e("span", { className: "arv2-st " + stClass(r.c.status), title: courseStatusLabel(r.c) }, statusChipShort(r.c)))
  );
  return e("div", { className: "admin-reports arv2" },
    e("div", { className: "arv2-head" },
      e("div", null, e("h2", null, "Reports"), e("p", { className: "sub" }, "Course performance and students who need attention")),
      e("div", { className: "arv2-act" },
        e("button", { type: "button", className: "arv2-csv", onClick: exportCsv }, "Export CSV"),
        e(AdminPdfButton, { getData: pdfData, page: "Reports" })
      )
    ),
    e("div", { className: "arv2-act" },
      e("select", { className: "arv2-sel", value: cid, "aria-label": "Course", onChange: (ev) => setCid(ev.target.value) },
        e("option", { value: "" }, "All courses"),
        e("optgroup", { label: "Active courses" }, rows.filter((r) => isActive(r.c.status)).map((r) => e("option", { key: r.c.id, value: r.c.id }, r.c.title))),
        e("optgroup", { label: "Completed courses" }, rows.filter((r) => isDone(r.c.status)).map((r) => e("option", { key: r.c.id, value: r.c.id }, r.c.title)))
      )
    ),
    e(Sec, { onRetry },
    error ? e("p", { className: "arv2-err" }, String(error), " ", e("button", { type: "button", className: "arv2-view", onClick: onRetry }, "Try again")) : null,
    secErr(sectionErr?.summary, onRetry),
    e("div", { className: "rp5-grid" },
      e(GaugeCard, { iconBg: "#DBEAFE", iconCol: "#2563EB", iconKind: "cal", title: "Average attendance", note: "across " + dashActive.length + " active course" + (dashActive.length === 1 ? "" : "s") },
        e(RingGauge, { value: attM, gid: "rp5att", from: "#2563EB", to: "#06B6D4", empty: attM == null }),
        e(CourseBars, { rows: attRows, from: "#2563EB", to: "#06B6D4" })
      ),
      e(GaugeCard, { iconBg: "#FEF3C7", iconCol: "#D97706", iconKind: "clip", title: "Average homework rate", note: "across " + dashActive.length + " active course" + (dashActive.length === 1 ? "" : "s") },
        e(RingGauge, { value: hwM, gid: "rp5hw", from: "#F59E0B", to: "#F97316", empty: hwM == null }),
        e(CourseBars, { rows: hwRows, from: "#F59E0B", to: "#F97316" })
      ),
      e(GaugeCard, { iconBg: "#EDE9FE", iconCol: "#7C3AED", iconKind: "bars", title: "Average grade", note: "Pass mark " + passMark + "% · " + done.length + " completed courses" },
        e(RingGauge, { value: gM, gid: "rp5gr", from: "#8B5CF6", to: "#6366F1", tick: passMark, empty: gM == null }),
        e(CourseBars, { rows: gRows, from: "#8B5CF6", to: "#6366F1" })
      ),
      e(GaugeCard, { iconBg: "#DCFCE7", iconCol: "#16A34A", iconKind: "award", title: "Pass rate", note: passedN + " passed · " + failedN + " failed" },
        e(Donut, { passed: passedN, failed: failedN, pct: pM }),
        e(CourseBars, { rows: pRows, from: "#16A34A", to: "#22C55E" })
      )
    )),
    e(Sec, { onRetry }, e("div", { className: "arv2-card" },
      e("div", { className: "arv2-card-h" }, e("h3", null, "Active courses"), e("span", { className: "arv2-badge" }, String(active.length))),
      secErr(sectionErr?.active, onRetry),
      e("div", { className: "arv2-th arv2-th-a" }, e("span", null, "Course"), e("span", null, "Trainer"), e("span", null, "Enrolled"), e("span", null, "Homework"), e("span", null, "Attendance"), e("span", null, "Quizzes"), e("span", null, "Quiz average")),
      loading ? e("div", { className: "arv2-row" }, e("div", { className: "arv2-sk" })) :
        (error || sectionErr?.active ? null : (active.length ? active.map((r) => e("div", { className: "arv2-row arv2-th-a", key: r.c.id, onClick: () => setSel(r.c.id) },
          courseCell(r), e("div", null, r.m?.trainer), e("div", null, String(r.m?.enrolled ?? 0)), e("div", null, pctEl(r.m?.hwRate)), e("div", null, pctEl(r.m?.attPct)), e("div", null, String(r.m?.qTaken ?? 0)), e("div", null, r.m?.quizAvg == null ? e("span", { className: "arv2-z" }, "—") : pctEl(r.m.quizAvg))
        )).concat(e("div", { className: "arv2-row arv2-tot arv2-th-a", key: "atot" },
          e("div", null, "Totals"), e("div", null, ""), e("div", null, String(enSum)), e("div", null, pctEl(hwM)), e("div", null, pctEl(attM)), e("div", null, String(qSum)), e("div", null, "—")
        )) : e("p", { className: "arv2-empty" }, "No active courses")))
    )),
    e(Sec, { onRetry }, e("div", { className: "arv2-card" },
      e("div", { className: "arv2-card-h" }, e("h3", null, "Completed courses"), e("span", { className: "arv2-badge" }, String(done.length))),
      secErr(sectionErr?.done, onRetry),
      e("div", { className: "arv2-th arv2-th-c" }, e("span", null, "Course"), e("span", null, "Trainer"), e("span", null, "Enrolled"), e("span", null, "Homework"), e("span", null, "Attendance"), e("span", null, "Quizzes"), e("span", null, "Average grade"), e("span", null, "Pass rate"), e("span", null, "Passed / Failed")),
      loading ? e("div", { className: "arv2-row" }, e("div", { className: "arv2-sk" })) :
        (error || sectionErr?.done ? null : (done.length ? done.map((r) => e("div", { className: "arv2-row arv2-th-c", key: r.c.id, onClick: () => setSel(r.c.id) },
          courseCell(r), e("div", null, r.m?.trainer), e("div", null, String(r.m?.enrolled ?? 0)), e("div", null, pctEl(r.m?.hwRate)), e("div", null, pctEl(r.m?.attPct)), e("div", null, String(r.m?.qTaken ?? 0)),
          e("div", null, r.m?.avgGrade == null ? e("span", { className: "arv2-z" }, "—") : pctEl(r.m.avgGrade)),
          e("div", null, r.m?.passRate == null ? e("span", { className: "arv2-z" }, "—") : pctEl(r.m.passRate)),
          e("div", null, (r.m?.passed || 0) + " / " + (r.m?.failed || 0))
        )).concat(e("div", { className: "arv2-row arv2-tot arv2-th-c", key: "ctot" },
          e("div", null, "Totals"), e("div", null, ""), e("div", null, String(done.reduce((a, r) => a + (r.m?.enrolled || 0), 0))), e("div", null, pctEl(mean(done.map((r) => r.m?.hwRate)))), e("div", null, pctEl(mean(done.map((r) => r.m?.attPct)))), e("div", null, String(done.reduce((a, r) => a + (r.m?.qTaken || 0), 0))), e("div", null, pctEl(gM)), e("div", null, pctEl(pM)), e("div", null, "")
        )) : e("p", { className: "arv2-empty" }, "No completed courses")))
    )),
    e(Sec, { onRetry }, e("div", { className: "arv2-risk" },
      e("h3", null, "⚠ At risk"),
      secErr(sectionErr?.risk, onRetry),
      e("p", { className: "sub" }, "Attendance below 70%, or homework below 50%, or failing a completed course"),
      loading ? e("div", { className: "arv2-sk" }) :
        (error || sectionErr?.risk ? null : (risk.length ? risk.map((s, i) => e("div", { className: "arv2-rr", key: i },
          e("div", { className: "arv2-av", style: { background: avBg(s.name) } }, initials(s.name)),
          e("div", null, e("strong", null, s.name), e("div", { className: "arv2-note" }, s.course)),
          s.pills.map((p) => e("span", { className: "arv2-rp " + p.k, key: p.t }, p.t)),
          e("button", { type: "button", className: "arv2-view", onClick: () => (onOpenStudent ? onOpenStudent(s) : (window.__ghzOpenStudent && window.__ghzOpenStudent(s.uid, s.course))) }, "View student")
        )) : e("div", { className: "arv2-ok" }, "No students at risk")))
    )),
    drawer ? e("div", { className: "arv2-dim", onClick: () => setSel(null) },
      e("div", { className: "arv2-draw", onClick: (ev) => ev.stopPropagation() },
        e("h3", null, drawer.c.title),
        e("p", { className: "sub" }, "Enrolled is current enrollments. Homework rate is submitted homework ÷ (assignments × enrolled). Attendance is (present + late) ÷ (marked − excused)."),
        e("p", null, "Trainer ", drawer.m.trainer, " · Enrolled ", drawer.m.enrolled, " · Homework ", drawer.m.hwRate ?? "—", "% · Attendance ", drawer.m.attPct ?? "—", "%"),
        (drawer.m.students || []).map((s) => e("div", { className: "arv2-rr", key: s.uid },
          e("div", null, e("strong", null, s.name), e("div", { className: "arv2-note" }, "HW ", s.hw ?? "—", "% · Att ", s.att ?? "—", "% · Grade ", s.avg ?? "—"))
        )),
        e("button", { type: "button", className: "arv2-view", onClick: () => setSel(null) }, "Close")
      )
    ) : null,);
}

const roots = new WeakMap();
export function renderAdminReportsV2(host, opts = {}) {
  if (!host) return;
  let root = roots.get(host);
  if (!root) { root = createRoot(host); roots.set(host, root); }
  try {
    root.render(e(Boundary, null, e(App, { ...(opts || {}), loadKey: Date.now() })));
  } catch (err) {
    console.error(err);
    showSecErr(host, err, () => renderAdminReportsV2(host, opts));
  }
}

export async function loadReportPack() {
  const names = ["courses", "enrollments", "assignments", "submissions", "quizzes", "quizAttempts", "attendance", "gradeSchemes", "gradeScores", "users"];
  const settled = await Promise.allSettled(names.map((n) => settledCol(n)));
  const pick = (i) => {
    const r = settled[i];
    if (r.status === "fulfilled") return r.value;
    return { ok: false, rows: [], err: fbErr(r.reason) };
  };
  const courses = pick(0), enrollments = pick(1), assignments = pick(2), submissions = pick(3);
  const quizzes = pick(4), attempts = pick(5), attendance = pick(6), schemes = pick(7), scores = pick(8), users = pick(9);
  const schemeMap = {};
  (schemes.rows || []).forEach((s) => { schemeMap[s.id] = s; });
  const coreFail = [enrollments, assignments, submissions, attendance, scores].find((x) => !x.ok);
  return {
    courses: courses.ok ? courses.rows : [],
    courseErr: courses.ok ? null : courses.err,
    pack: {
      enrollments: enrollments.rows, assignments: assignments.rows, submissions: submissions.rows,
      quizzes: quizzes.ok ? quizzes.rows : [], attempts: attempts.ok ? attempts.rows : [],
      attendance: attendance.rows, schemes: schemeMap, scores: scores.rows, users: users.ok ? users.rows : [],
      fail: coreFail ? coreFail.err : null
    },
    error: courses.ok ? null : courses.err,
    sectionErr: {
      summary: coreFail ? coreFail.err : null,
      active: coreFail ? coreFail.err : null,
      done: coreFail ? coreFail.err : null,
      risk: coreFail ? coreFail.err : null
    }
  };
}
