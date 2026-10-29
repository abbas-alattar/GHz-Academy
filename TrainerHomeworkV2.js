import { createElement as e, useEffect, useLayoutEffect, useMemo, useRef, useState, Component } from "https://esm.sh/react@18.3.1";
import { createRoot } from "https://esm.sh/react-dom@18.3.1/client";
import { createPortal } from "https://esm.sh/react-dom@18.3.1";
import { db } from "./firebase-config.js?v=auth8";
import { addDoc, collection, deleteDoc, doc, serverTimestamp, updateDoc } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { HomeworkFormV2, AssignmentFilesCards } from "./HomeworkFormV2.js";
import { getTrainerStore, loadTrainerStore, refreshTrainerStore, subscribeTrainerStore, setTrainerCourseId, resolveTrainerCourseId } from "./TrainerStore.js";
import { isCourseLocked } from "./course-lock.js";
import { showConfirmDialog } from "./ConfirmDialog.js";
import { HomeworkFilesViewer } from "./HomeworkFilesViewer.js";
import { exportAdminPdf } from "./AdminPdfExport.js";
import { RowMenu } from "./TrainerRowMenu.js";
import { courseStatusLabel, statusChipShort } from "./courseStatusLabel.js";

const HW_KEY = "ghz-trainer-hw-course";
const CHIP_KEY = "ghz-trainer-fb-chips";
const DEFAULT_CHIPS = ["Excellent work", "Please add references", "Needs more detail", "Late submission", "Well structured"];

class Boundary extends Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err) { console.error("TrainerHomeworkV2", err); }
  render() {
    if (this.state.err) {
      return e("div", { className: "th2" }, e("p", { className: "th2-err" }, String(this.state.err?.message || this.state.err)),
        e("button", { type: "button", className: "th2-btn", onClick: () => this.setState({ err: null }) }, "Try again"));
    }
    return this.props.children;
  }
}
function Plus() {
  return e("svg", { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2 }, e("path", { d: "M12 5v14M5 12h14" }));
}
function initials(n) {
  return String(n || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0].toUpperCase()).join("") || "?";
}
function badgeCls(st) {
  const s = String(st || "");
  if (s === "Completed") return "completed";
  if (s === "Closed") return "closed";
  if (s === "Coming soon") return "soon";
  if (s === "Draft" || s === "Archived") return "gray";
  return "open";
}
export function StatusBadge({ course }) {
  if (!course || !course.status) return null;
  const st = course.status;
  return e("span", { className: "th2-badge " + badgeCls(st), title: courseStatusLabel(course) }, st === "Completed" ? "🔒 " : "", statusChipShort(course));
}
function isPublished(a) { return String(a?.status || "") === "Published"; }
function Eye({ off }) {
  return e("svg", { width: 14, height: 14, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, "aria-hidden": true },
    off ? e("path", { d: "M17.94 17.94A10.94 10.94 0 0 1 12 20c-5 0-9.27-3.11-11-8 1.02-2.86 2.9-5.17 5.24-6.61M9.9 4.24A10.94 10.94 0 0 1 12 4c5 0 9.27 3.11 11 8a11.7 11.7 0 0 1-2.16 3.19M1 1l22 22M14.12 14.12A3 3 0 0 1 9.88 9.88" })
      : [e("path", { key: "a", d: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" }), e("circle", { key: "b", cx: 12, cy: 12, r: 3 })]);
}
function KpiIco({ kind }) {
  const paths = {
    list: [e("rect", { key: 1, x: 8, y: 2, width: 8, height: 4, rx: 1 }), e("path", { key: 2, d: "M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" }), e("path", { key: 3, d: "M9 12h6M9 16h6" })],
    check: [e("rect", { key: 1, x: 8, y: 2, width: 8, height: 4, rx: 1 }), e("path", { key: 2, d: "M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" }), e("path", { key: 3, d: "M9 14l2 2 4-4" })],
    alarm: [e("circle", { key: 1, cx: 12, cy: 13, r: 8 }), e("path", { key: 2, d: "M12 9v4l2 2M9 4l-3 2M15 4l3 2" })],
    chart: [e("path", { key: 1, d: "M3 3v18h18" }), e("path", { key: 2, d: "M7 14v4M12 9v9M17 11v7" })]
  };
  return e("svg", { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8 }, paths[kind]);
}
function dueKind(a) {
  const d = a.dueDate ? new Date(a.dueDate + "T23:59:59") : null;
  if (!d || isNaN(d)) return { k: "open", l: "Open", overdue: false, t: Infinity, label: "—", count: "" };
  const now = Date.now();
  const overdue = d.getTime() < now;
  const soon = !overdue && d.getTime() - now < 3 * 86400000;
  const days = Math.ceil((d.getTime() - now) / 86400000);
  const count = overdue ? "overdue" : days === 0 ? "due today" : "due in " + days + " day" + (days === 1 ? "" : "s");
  const wd = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getDay()];
  const mo = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getMonth()];
  const label = wd + " " + d.getDate() + " " + mo;
  return { k: overdue ? "closed" : soon ? "soon" : "open", l: overdue ? "Overdue" : soon ? "Due soon" : "Open", overdue, t: d.getTime(), label, count };
}
function fmtWhen(v) {
  if (!v) return "—";
  const d = v.toDate ? v.toDate() : new Date(v);
  if (isNaN(d)) return "—";
  return d.toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}
function isLate(sub, a) {
  if (!a?.dueDate || !sub?.submittedAt) return false;
  const due = new Date(a.dueDate + "T23:59:59");
  const at = sub.submittedAt.toDate ? sub.submittedAt.toDate() : new Date(sub.submittedAt);
  return at > due;
}
function lateDays(sub, a) {
  if (!isLate(sub, a)) return 0;
  const due = new Date(a.dueDate + "T23:59:59");
  const at = sub.submittedAt.toDate ? sub.submittedAt.toDate() : new Date(sub.submittedAt);
  return Math.max(1, Math.ceil((at - due) / 86400000));
}
function rowKind(s, a) {
  if (!s || s.status === "not_submitted") return "missing";
  if (s.status === "returned") return "returned";
  if (s.status === "graded") return "graded";
  if (isLate(s, a)) return "late";
  return "submitted";
}
function letter(pct) {
  if (pct >= 90) return "Excellent";
  if (pct >= 80) return "Good";
  if (pct >= 70) return "Fair";
  if (pct >= 60) return "Pass";
  return "Needs work";
}
function loadChips() {
  try { return JSON.parse(localStorage.getItem(CHIP_KEY) || "null") || DEFAULT_CHIPS.slice(); } catch { return DEFAULT_CHIPS.slice(); }
}
function fbErr(er) { return (er?.code || "") + " " + (er?.message || er); }
function paintHwBadge(n) {
  const a = document.querySelector('.side nav a[data-view="homework"]');
  if (!a) return;
  let b = a.querySelector(".th2-hwbadge");
  if (!n) { b?.remove(); return; }
  if (!b) { b = document.createElement("span"); b.className = "th2-hwbadge"; a.appendChild(b); }
  b.textContent = String(n);
}

function courseHue(title) {
  let n = 0; for (const ch of String(title || "")) n = (n + ch.charCodeAt(0)) % 360; return n;
}
function icoGrad(course) {
  const st = course?.status;
  if (st === "Open") return "linear-gradient(145deg,#22C55E,#15803D)";
  if (st === "Closed") return "linear-gradient(145deg,#FB923C,#C2410C)";
  if (st === "Completed") return "linear-gradient(145deg,#334155,#0F172A)";
  if (st === "Coming soon") return "linear-gradient(145deg,#60A5FA,#1D4ED8)";
  const hue = courseHue(course?.title);
  return "linear-gradient(145deg,hsl(" + hue + " 62% 48%),hsl(" + hue + " 62% 32%))";
}
function CourseIcon({ course, size }) {
  const s = size || 32;
  return e("span", { className: "th2-cico" + (course ? "" : " empty"), style: { width: s, height: s, background: course ? icoGrad(course) : "#E2E8F0" }, "aria-hidden": true },
    e("svg", { width: 14, height: 14, viewBox: "0 0 24 24", fill: "none", stroke: course ? "#fff" : "#94A3B8", strokeWidth: 2 },
      e("path", { d: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 4.5A2.5 2.5 0 0 1 6.5 7H20v13H6.5A2.5 2.5 0 0 1 4 17.5z" })));
}
function LayersIco() {
  return e("svg", { width: 14, height: 14, viewBox: "0 0 24 24", fill: "none", stroke: "#fff", strokeWidth: 2, "aria-hidden": true },
    e("path", { d: "M12 2l9 5-9 5-9-5 9-5zM3 12l9 5 9-5M3 17l9 5 9-5" }));
}
function Chevron({ open }) {
  return e("svg", { className: "th2-chev" + (open ? " open" : ""), width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, "aria-hidden": true },
    e("path", { d: "M6 9l6 6 6-6" }));
}
function CheckIco() {
  return e("svg", { className: "th2-check", width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "#2563EB", strokeWidth: 2.4, "aria-hidden": true }, e("path", { d: "M5 12l5 5L20 7" }));
}
function LockMini() {
  return e("svg", { width: 12, height: 12, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, "aria-hidden": true },
    e("rect", { x: 5, y: 11, width: 14, height: 10, rx: 2 }), e("path", { d: "M8 11V8a4 4 0 018 0v3" }));
}
function isActiveCourse(c) { const s = c?.status; return s === "Open" || s === "Closed"; }
export function pickCreateCourseId(courses, cid) {
  const cur = (courses || []).find((c) => c.id === cid);
  if (cur && isActiveCourse(cur)) return cur.id;
  return (courses || []).find(isActiveCourse)?.id || "";
}
function countPair(counts, id, noun) {
  const raw = counts && counts[id];
  const n = typeof raw === "object" ? Number(raw.items || 0) : Number(raw || 0);
  const stu = typeof raw === "object" && raw.students != null ? Number(raw.students || 0) : null;
  const map = { homework: ["homework", "homework"], quiz: ["quiz", "quizzes"], session: ["session", "sessions"], student: ["student", "students"] };
  const p = map[noun] || [noun || "item", (noun || "item") + "s"];
  const a = n + " " + (n === 1 ? p[0] : p[1]);
  if (stu == null) return a;
  return a + " · " + stu + " student" + (stu === 1 ? "" : "s");
}
export function CourseSelect({ courses, cid, counts, countNoun, onPick, hideAll, disableLocked }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hi, setHi] = useState(0);
  const [pos, setPos] = useState({ top: 8, left: 8, width: 400 });
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const searchRef = useRef(null);
  const cur = (courses || []).find((c) => c.id === cid);
  const noun = countNoun || "homework";
  const qn = q.trim().toLowerCase();
  const match = (c) => !qn || String(c.title || "").toLowerCase().includes(qn);
  const active = (courses || []).filter((c) => isActiveCourse(c) && match(c));
  const done = (courses || []).filter((c) => isCourseLocked(c) && match(c));
  const other = (courses || []).filter((c) => !isActiveCourse(c) && !isCourseLocked(c) && match(c));
  const showSearch = (courses || []).length > 4;
  const flat = [];
  if (!hideAll) flat.push({ id: "", kind: "all" });
  active.concat(other).concat(done).forEach((c) => flat.push({ id: c.id, kind: "c", c }));
  useEffect(() => {
    if (!open) return;
    const onDoc = (ev) => {
      const t = ev.target;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (ev) => {
      if (ev.key === "Escape") { setOpen(false); btnRef.current?.focus(); }
      if (ev.key === "ArrowDown") { ev.preventDefault(); setHi((i) => Math.min(flat.length - 1, i + 1)); }
      if (ev.key === "ArrowUp") { ev.preventDefault(); setHi((i) => Math.max(0, i - 1)); }
      if (ev.key === "Enter") {
        const it = flat[hi];
        if (!it) return;
        if (it.kind === "all") { onPick(""); setOpen(false); return; }
        const locked = isCourseLocked(it.c);
        if (disableLocked && locked) return;
        onPick(it.id); setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    requestAnimationFrame(() => searchRef.current?.focus());
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open, hi, flat.length, disableLocked, onPick, hideAll]);
  useEffect(() => { if (open) setHi(Math.max(0, flat.findIndex((x) => x.id === (cid || "")))); }, [open, cid, q]);
  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const w = 400;
    let left = r.left;
    if (left + w > window.innerWidth - 8) left = Math.max(8, window.innerWidth - w - 8);
    let top = r.bottom + 8;
    if (top + 360 > window.innerHeight - 8) top = Math.max(8, r.top - 368);
    setPos({ top, left, width: w });
  }, [open, q]);
  const pickIt = (id, locked) => {
    if (disableLocked && locked) return;
    onPick(id); setOpen(false); setQ("");
  };
  const optRow = (it, i) => {
    if (it.kind === "all") {
      return e("button", { type: "button", key: "all", className: "th2-opt" + (!cid ? " on" : "") + (hi === i ? " hi" : ""), onMouseEnter: () => setHi(i), onClick: () => pickIt("", false) },
        e("span", { className: "th2-cico layers", "aria-hidden": true }, e(LayersIco)),
        e("span", { className: "th2-optmid" }, e("span", { className: "ttl" }, "All courses"), e("span", { className: "meta" }, "Every assigned course")),
        !cid ? e(CheckIco) : null);
    }
    const c = it.c;
    const locked = isCourseLocked(c);
    const on = cid === c.id;
    return e("button", { type: "button", key: c.id, disabled: disableLocked && locked, className: "th2-opt" + (on ? " on" : "") + (locked ? " mute" : "") + (hi === i ? " hi" : ""), title: locked ? "Read only" : c.title, onMouseEnter: () => setHi(i), onClick: () => pickIt(c.id, locked) },
      e(CourseIcon, { course: c }),
      e("span", { className: "th2-optmid" }, e("span", { className: "ttl", title: c.title }, c.title), e("span", { className: "meta" }, counts ? countPair(counts, c.id, noun) : "\u00a0")),
      e("span", { className: "th2-optright" }, locked ? e("span", { className: "th2-lockchip", title: "Read only" }, e(LockMini)) : null, e(StatusBadge, { course: c }), on ? e(CheckIco) : null));
  };
  const groups = [];
  let idx = 0;
  if (!hideAll) {
    groups.push(e("div", { key: "g-all", className: "th2-og" }, e("div", { className: "th2-og-h" }, "All courses"), optRow(flat[idx], idx)));
    idx++;
  }
  if (active.length) {
    groups.push(e("div", { key: "g-a", className: "th2-og" }, e("div", { className: "th2-og-h" }, "Active"), active.map((c) => { const n = idx++; return optRow({ id: c.id, kind: "c", c }, n); })));
  }
  if (other.length) {
    groups.push(e("div", { key: "g-o", className: "th2-og" }, e("div", { className: "th2-og-h" }, "Other"), other.map((c) => { const n = idx++; return optRow({ id: c.id, kind: "c", c }, n); })));
  }
  if (done.length) {
    groups.push(e("div", { key: "g-d", className: "th2-og" }, e("div", { className: "th2-og-h" }, "Completed"), done.map((c) => { const n = idx++; return optRow({ id: c.id, kind: "c", c }, n); })));
  }
  const menu = open ? createPortal(e("div", { className: "th2-menu", ref: menuRef, role: "listbox", style: { top: pos.top + "px", left: pos.left + "px", width: pos.width + "px" } },
    showSearch ? e("div", { className: "th2-search" }, e("input", { ref: searchRef, placeholder: "Search courses", value: q, onChange: (ev) => setQ(ev.target.value), "aria-label": "Search courses" })) : null,
    e("div", { className: "th2-menu-body" }, groups.length ? groups : e("p", { className: "th2-empty" }, "No courses"))
  ), document.body) : null;
  return e("div", { className: "th2-selwrap" },
    e("button", { type: "button", ref: btnRef, className: "th2-selbtn" + (open ? " open" : ""), "aria-expanded": open, "aria-haspopup": "listbox", title: cur?.title || (hideAll ? "Choose a course" : "All courses"), onClick: () => setOpen((v) => !v) },
      cur ? e(CourseIcon, { course: cur }) : e("span", { className: "th2-cico layers", "aria-hidden": true }, e(LayersIco)),
      e("span", { className: "th2-selmid" }, e("span", { className: "ell" }, cur ? cur.title : (hideAll ? "Choose a course" : "All courses"))),
      cur && isCourseLocked(cur) ? e("span", { className: "th2-lockchip", title: "Read only" }, e(LockMini)) : null,
      e(StatusBadge, { course: cur }),
      e(Chevron, { open })),
    menu
  );
}

function ReviewPage({ pack, a, uid, go, courses }) {
  const course = (pack.courses || []).find((c) => c.id === a.courseId) || {};
  useEffect(() => { if (a.courseId) setTrainerCourseId("homework", a.courseId); }, [a.courseId]);
  const locked = isCourseLocked(course);
  const ens = (pack.enrollments || []).filter((en) => en.courseId === a.courseId && String(en.status || "").toLowerCase() !== "cancelled");
  const subs = pack.submissions || [];
  const max = Number(a.maxPoints) || 100;
  const rubric = Array.isArray(a.rubric) ? a.rubric.slice(0, 5) : [];
  const [sel, setSel] = useState(ens[0]?.uid || "");
  const [filter, setFilter] = useState("All");
  const [sort, setSort] = useState("name");
  const [q, setQ] = useState("");
  const [grade, setGrade] = useState("");
  const [fb, setFb] = useState("");
  const [rubVals, setRubVals] = useState({});
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [chips, setChips] = useState(loadChips());
  const draftKey = (id) => "ghz-hw-draft-" + a.id + "-" + id;
  const rows = ens.map((en) => {
    const s = subs.find((x) => x.uid === en.uid && x.assignmentId === a.id);
    return { en, s, kind: rowKind(s, a) };
  });
  let vis = rows.filter((r) => {
    if (filter === "To grade" && r.kind !== "submitted" && r.kind !== "late") return false;
    if (filter === "Graded" && r.kind !== "graded") return false;
    if (filter === "Missing" && r.kind !== "missing") return false;
    const hay = ((r.en.studentName || "") + " " + (r.en.studentId || "")).toLowerCase();
    return !q || hay.includes(q.toLowerCase());
  });
  vis = vis.slice().sort((x, y) => {
    if (sort === "status") return x.kind.localeCompare(y.kind);
    if (sort === "grade") return Number(y.s?.grade || 0) - Number(x.s?.grade || 0);
    if (sort === "time") {
      const tx = x.s?.submittedAt?.toMillis ? x.s.submittedAt.toMillis() : 0;
      const ty = y.s?.submittedAt?.toMillis ? y.s.submittedAt.toMillis() : 0;
      return ty - tx;
    }
    return String(x.en.studentName || "").localeCompare(String(y.en.studentName || ""));
  });
  const cur = vis.find((r) => r.en.uid === sel) || vis[0];
  useEffect(() => {
    if (!cur) return;
    setSel(cur.en.uid);
    let g = cur.s?.grade ?? "";
    let f = cur.s?.feedback || "";
    try {
      const d = JSON.parse(localStorage.getItem(draftKey(cur.en.uid)) || "null");
      if (d) { g = d.grade ?? g; f = d.fb ?? f; }
    } catch {}
    setGrade(g); setFb(f); setSaved(false); setErr("");
  }, [cur?.en?.uid]);
  useEffect(() => {
    if (!cur) return;
    try { localStorage.setItem(draftKey(cur.en.uid), JSON.stringify({ grade, fb })); } catch {}
  }, [grade, fb, cur?.en?.uid]);
  useEffect(() => {
    const onKey = (ev) => {
      if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
        const i = vis.findIndex((r) => r.en.uid === cur?.en.uid);
        const n = ev.key === "ArrowDown" ? vis[i + 1] : vis[i - 1];
        if (n) { ev.preventDefault(); setSel(n.en.uid); }
      }
      if ((ev.ctrlKey || ev.metaKey) && ev.key === "Enter") { ev.preventDefault(); save(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  const submitted = rows.filter((r) => r.kind !== "missing").length;
  const gradedN = rows.filter((r) => r.kind === "graded").length;
  const missing = rows.length - submitted;
  const avg = gradedN ? Math.round(rows.filter((r) => r.kind === "graded").reduce((n, r) => n + Number(r.s.grade || 0), 0) / gradedN) : "—";
  const buckets = [0, 0, 0, 0, 0, 0];
  rows.forEach((r) => {
    if (r.kind !== "graded") return;
    const g = Number(r.s.grade || 0);
    const i = g < 50 ? 0 : g < 60 ? 1 : g < 70 ? 2 : g < 80 ? 3 : g < 90 ? 4 : 5;
    buckets[i]++;
  });
  const maxB = Math.max(1, ...buckets);
  const setG = (v) => {
    const n = Math.max(0, Math.min(max, Number(v) || 0));
    setGrade(n);
  };
  const save = async (next) => {
    if (locked || !cur?.en?.uid) return;
    const g = Number(grade);
    if (!Number.isFinite(g) || g < 0 || g > max) { setErr("Grade must be 0–" + max); return; }
    setBusy(true); setErr("");
    try {
      const sid = a.id + "_" + cur.en.uid;
      await updateDoc(doc(db, "submissions", sid), {
        grade: g,
        feedback: String(fb || ""),
        status: "graded",
        gradedBy: uid,
        gradedAt: serverTimestamp()
      });
      setSaved(true);
      try { window.__ghzBumpActive?.(); } catch (_) {}
      try { localStorage.removeItem(draftKey(cur.en.uid)); } catch {}
      refreshTrainerStore(uid);
      if (next) {
        const i = vis.findIndex((r) => r.en.uid === cur.en.uid);
        const n = vis[i + 1] || vis[0];
        if (n) setSel(n.en.uid);
      }
      setTimeout(() => setSaved(false), 1400);
    } catch (er) { setErr(fbErr(er)); }
    setBusy(false);
  };
  const csv = () => {
    const head = "Student,ID,Submitted at,Status,Grade,Feedback\n";
    const body = rows.map((r) => [r.en.studentName, r.en.studentId, fmtWhen(r.s?.submittedAt), r.kind, r.s?.grade ?? "", (r.s?.feedback || "").replace(/,/g, ";")].join(",")).join("\n");
    const blob = new Blob([head + body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const ael = document.createElement("a"); ael.href = url; ael.download = (a.title || "grades") + ".csv"; ael.click();
  };
  const pdf = async () => {
    await exportAdminPdf({
      page: a.title + " grades",
      columns: [{ key: "n", label: "Student" }, { key: "id", label: "ID" }, { key: "at", label: "Submitted at" }, { key: "st", label: "Status" }, { key: "g", label: "Grade" }, { key: "f", label: "Feedback" }],
      rows: rows.map((r) => ({ n: r.en.studentName, id: r.en.studentId, at: fmtWhen(r.s?.submittedAt), st: r.kind, g: r.s?.grade ?? "", f: r.s?.feedback || "" }))
    });
  };
  const files = cur?.s?.files || cur?.s?.fileMeta || [];
  const pct = max ? Math.round((Number(grade || 0) / max) * 100) : 0;
  return e("div", { className: "th2" },
    saved ? e("div", { className: "th2-savedbox" }, "✓ Saved") : null,
    e("div", { className: "th2-hero" },
      e("button", { type: "button", className: "th2-back", "data-nav": course?.id ? ("homework?course=" + course.id) : "homework", "aria-label": "Back to Homework" }, "← Homework"),
      e("div", { style: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" } },
        e("h2", { style: { margin: 0 } }, a.title),
        e("span", { className: "th2-max" }, "Max " + max)
      ),
      e("p", { style: { margin: 0 } }, e(StatusBadge, { course }), " · due ", dueKind(a).label),
      a.description || a.instructions ? e("p", null, a.description || a.instructions) : null,
      e(AssignmentFilesCards, { assignmentId: a.id, files: a.files || [] }),
      locked ? e("div", { className: "th2-lockban" }, "Course completed — grades are locked") : null,
      e("div", { className: "th2-stats" },
        [["Submitted", submitted], ["Graded", gradedN], ["Missing", missing], ["Average grade", avg]].map(([l, v]) =>
          e("div", { className: "th2-tile", key: l }, e("b", null, String(v)), e("span", null, l)))
      ),
      e("div", { className: "th2-bars", title: "Grade distribution" }, buckets.map((n, i) => e("i", { key: i, style: { height: (n / maxB) * 56 + "px" }, title: ["0-49","50-59","60-69","70-79","80-89","90-100"][i] + ": " + n }))),
      e("div", { className: "th2-acts" },
        e("button", { className: "th2-btn", onClick: csv }, "Export grades CSV"),
        e("button", { className: "th2-btn", onClick: pdf }, "View PDF")
      )
    ),
    e("div", { className: "th2-split" },
      e("div", { className: "th2-list" },
        e("p", { style: { margin: "10px 12px 0", fontWeight: 700 } }, gradedN + " of " + rows.length + " graded"),
        e("input", { placeholder: "Search students", value: q, onChange: (ev) => setQ(ev.target.value) }),
        e("div", { className: "th2-fchips" }, ["All", "To grade", "Graded", "Missing"].map((f) =>
          e("button", { key: f, type: "button", className: "th2-fchip" + (filter === f ? " on" : ""), onClick: () => setFilter(f) }, f))),
        e("select", { style: { margin: "0 10px 8px", padding: 6, borderRadius: 8, border: "1px solid #E5EAF1" }, value: sort, onChange: (ev) => setSort(ev.target.value) },
          e("option", { value: "name" }, "Sort: name"), e("option", { value: "status" }, "Sort: status"), e("option", { value: "grade" }, "Sort: grade"), e("option", { value: "time" }, "Sort: submitted time")),
        vis.map((r) => e("button", { type: "button", key: r.en.uid, className: "th2-stu" + (cur?.en.uid === r.en.uid ? " on" : ""), onClick: () => setSel(r.en.uid) },
          e("span", { className: "th2-av" }, initials(r.en.studentName)),
          e("span", { style: { flex: 1 } }, e("strong", null, r.en.studentName || r.en.email), e("small", null, r.en.studentId || "")),
          e("span", { className: "th2-pill " + (r.kind === "returned" ? "soon" : r.kind) }, r.kind === "graded" ? "Graded" : r.kind === "late" ? "Late" : r.kind === "submitted" ? "Submitted" : r.kind === "returned" ? "Returned" : "Missing"),
          r.kind === "late" ? e("small", null, lateDays(r.s, a) + " day" + (lateDays(r.s, a) === 1 ? "" : "s") + " late") : null,
          r.kind === "graded" ? e("b", null, r.s.grade) : null
        ))
      ),
      e("div", { className: "th2-panel" },
        !cur ? e("p", null, "No students.") :
        cur.kind === "missing" ? e("div", { className: "th2-empty" }, e("p", null, "No submission")) :
        e("div", { style: { display: "grid", gap: 12 } },
          e("p", null, "Submitted ", fmtWhen(cur.s.submittedAt), " ", isLate(cur.s, a) ? e("span", { className: "th2-pill late" }, lateDays(cur.s, a) + " days late") : null),
          e("div", { className: "th2-answer" }, cur.s.answer || cur.s.text || cur.s.body || "—",
            e("button", { type: "button", className: "th2-copy", onClick: () => navigator.clipboard?.writeText(cur.s.answer || cur.s.text || "") }, "Copy text")),
          e(HomeworkFilesViewer, { assignmentId: a.id, uid: cur.en.uid, files, readonly: true }),
          e("div", { className: "th2-gradebox" },
            rubric.length ? rubric.map((c, i) => e("label", { key: i }, c.name || ("Criterion " + (i + 1)),
              e("input", { type: "number", max: c.max || max, disabled: locked, value: rubVals[i] ?? "", onChange: (ev) => {
                const next = { ...rubVals, [i]: Number(ev.target.value) || 0 };
                setRubVals(next);
                setG(Object.values(next).reduce((n, x) => n + Number(x || 0), 0));
              } }))) : null,
            e("div", { className: "th2-gradein" },
              e("input", { type: "number", min: 0, max, value: grade, disabled: locked, onChange: (ev) => setG(ev.target.value) }),
              e("span", null, "/ ", max),
              e("span", { className: "th2-letter" }, pct + "% · " + letter(pct))
            ),
            e("input", { type: "range", min: 0, max, value: Number(grade || 0), disabled: locked, onChange: (ev) => setG(ev.target.value) }),
            e("textarea", { className: "th2-fb", value: fb, disabled: locked, maxLength: 2000, placeholder: "Feedback", onChange: (ev) => setFb(ev.target.value) }),
            e("div", { className: "th2-count" }, String(fb || "").length + " / 2000"),
            e("div", { className: "th2-chipsrow" }, chips.map((c) => e("button", { type: "button", key: c, className: "th2-qchip", disabled: locked, onClick: () => setFb((fb ? fb + " " : "") + c) }, c)),
              e("button", { type: "button", className: "th2-qchip", onClick: () => {
                const t = String(fb || "").trim(); if (!t) return;
                const next = Array.from(new Set([...chips, t])).slice(0, 12);
                setChips(next); try { localStorage.setItem(CHIP_KEY, JSON.stringify(next)); } catch {}
              } }, "Save as my template")),
            err ? e("p", { className: "th2-err" }, err) : null,
            e("div", { className: "th2-acts" },
              e("button", { type: "button", className: "th2-btn pri", disabled: locked || busy || !cur.s, onClick: () => save(false) }, "Save grade"),
              e("button", { type: "button", className: "th2-btn", disabled: locked || busy || !cur.s, onClick: () => save(true) }, "Save & next student")
            ),
            e("p", { className: "th2-hint" }, "↑/↓ change student · Ctrl+Enter save and next")
          )
        )
      )
    )
  );
}

function Page({ uid, go, assignmentId, courseId }) {
  const [pack, setPack] = useState(getTrainerStore());
  const [cid, setCid] = useState(() => { try { return sessionStorage.getItem(HW_KEY) || ""; } catch { return ""; } });
  useEffect(() => { if (courseId) { setCid(courseId); setTrainerCourseId("homework", courseId); try { sessionStorage.setItem(HW_KEY, courseId); } catch {} } }, [courseId]);
  const [form, setForm] = useState(null);
  const [visFilter, setVisFilter] = useState("All");
  const [menu, setMenu] = useState("");
  useEffect(() => subscribeTrainerStore(setPack), []);
  useEffect(() => { if (uid) loadTrainerStore(uid); }, [uid]);
  const pick = (id) => { setCid(id); setTrainerCourseId("homework", id); try { sessionStorage.setItem(HW_KEY, id); } catch {}; go(id ? ("homework?course=" + id) : "homework"); };
  const courses = pack?.courses || [];
  const assignsAll = pack?.assignments || [];
  const subs = pack?.submissions || [];
  const ens = pack?.enrollments || [];
  const course = (id) => courses.find((c) => c.id === id);
  const awaiting = (a) => subs.filter((s) => s.assignmentId === a.id && (s.status === "submitted")).length;
  let assigns = assignsAll.filter((a) => !cid || a.courseId === cid).slice().sort((a, b) => dueKind(a).t - dueKind(b).t);
  if (visFilter === "Published") assigns = assigns.filter(isPublished);
  if (visFilter === "Draft") assigns = assigns.filter((a) => !isPublished(a));
  if (visFilter === "To grade") assigns = assigns.filter((a) => awaiting(a) > 0);
  const createDisabled = !!cid && isCourseLocked(course(cid));
  const counts = useMemo(() => {
    const o = {};
    courses.forEach((c) => {
      o[c.id] = {
        items: assignsAll.filter((x) => x.courseId === c.id).length,
        students: ens.filter((en) => en.courseId === c.id && String(en.status || "").toLowerCase() !== "cancelled").length
      };
    });
    return o;
  }, [courses, assignsAll, ens]);
  const totalAwait = assignsAll.filter((a) => !cid || a.courseId === cid).reduce((n, a) => n + awaiting(a), 0);
  useEffect(() => { paintHwBadge(assignsAll.reduce((n, a) => n + awaiting(a), 0)); }, [assignsAll, subs]);
  const overdueMiss = assigns.filter((a) => dueKind(a).overdue && ens.some((en) => en.courseId === a.courseId && !subs.find((s) => s.assignmentId === a.id && s.uid === en.uid && s.status !== "not_submitted"))).length;
  const gradedSubs = subs.filter((s) => s.status === "graded" && assignsAll.some((a) => a.id === s.assignmentId && (!cid || a.courseId === cid)));
  const avgAll = gradedSubs.length ? Math.round(gradedSubs.reduce((n, s) => n + Number(s.grade || 0), 0) / gradedSubs.length) : "—";

  if (assignmentId) {
    if (!pack) return e("div", { className: "th2" }, e("div", { className: "th2-skline" }));
    const a = assignsAll.find((x) => x.id === assignmentId);
    if (!a) return e("div", { className: "th2" }, e("button", { type: "button", className: "th2-back", "data-nav": "homework", "aria-label": "Back to Homework" }, "← Homework"), e("p", null, "Assignment not found."));
    if (a.courseId) setTrainerCourseId("homework", a.courseId);
    return e(ReviewPage, { pack, a, uid, go, courses });
  }


  const dup = async (a) => {
    if (isCourseLocked(course(a.courseId))) return;
    await addDoc(collection(db, "assignments"), { title: a.title + " (copy)", dueDate: a.dueDate, maxPoints: a.maxPoints || 100, status: "Draft", courseId: a.courseId, description: a.description || "", rubric: a.rubric || [], createdAt: serverTimestamp(), createdBy: uid });
    refreshTrainerStore(uid);
  };
  const del = async (a) => {
    if (isCourseLocked(course(a.courseId))) return;
    const ok = await showConfirmDialog({ title: "Delete homework?", message: a.title, tone: "danger", confirmLabel: "Delete" });
    if (!ok) return;
    await deleteDoc(doc(db, "assignments", a.id));
    refreshTrainerStore(uid);
  };
  const togglePub = async (a) => {
    if (isCourseLocked(course(a.courseId))) return;
    if (isPublished(a)) {
      const has = subs.some((s) => s.assignmentId === a.id && s.status !== "not_submitted");
      if (has) {
        const ok = await showConfirmDialog({ title: "Unpublish homework?", message: "Students with submissions will no longer see this assignment until you publish it again.", tone: "danger", confirmLabel: "Unpublish" });
        if (!ok) return;
      }
      await updateDoc(doc(db, "assignments", a.id), { status: "Draft" });
    } else {
      await updateDoc(doc(db, "assignments", a.id), { status: "Published" });
    }
    refreshTrainerStore(uid);
  };

  const tableBody = () => {
    if (pack?.hwErr && pack?.extrasReady) {
      return e("div", { className: "th2-err" }, pack.hwErr, " ", e("button", { className: "th2-btn", onClick: () => refreshTrainerStore(uid) }, "Try again"));
    }
    if (!pack || !pack.extrasReady) {
      return e("table", { className: "th2-table th2-htable" }, e("colgroup", null, ["c-main","c-due","c-att","c-vis","c-st","c-act"].map((c) => e("col", { key: c, className: c }))), e("thead", null, e("tr", null, ["Homework","Due","Attempts","Visibility","Status",""].map((h, i) => e("th", { key: h, className: i === 5 ? "th2-act" : "" }, h)))),
        e("tbody", null, [1,2,3,4].map((i) => e("tr", { key: i, className: "th2-sk" }, e("td", { colSpan: 6 }, e("b", null))))));
    }
    if (!assigns.length) {
      return e("div", { className: "th2-empty" }, e("p", null, "No homework yet"),
        e("button", { type: "button", className: "th2-create", disabled: createDisabled, title: createDisabled ? "Course is completed" : "", onClick: () => setForm({ courseId: pickCreateCourseId(courses, cid), title: "", dueDate: "", maxPoints: 100, status: "Published", description: "", rubric: [] }) }, e(Plus), " Create homework"));
    }
    return e("table", { className: "th2-table th2-htable" },
      e("colgroup", null, ["c-main","c-due","c-att","c-vis","c-st","c-act"].map((c) => e("col", { key: c, className: c }))),
      e("thead", null, e("tr", null, ["Homework","Due","Attempts","Visibility","Status",""].map((h, i) => e("th", { key: h, className: i === 5 ? "th2-act" : "" }, h)))),
      e("tbody", null, assigns.map((a) => {
        const total = ens.filter((en) => en.courseId === a.courseId && String(en.status || "").toLowerCase() !== "cancelled").length;
        const subN = subs.filter((s) => s.assignmentId === a.id && s.status !== "not_submitted").length;
        const grN = subs.filter((s) => s.assignmentId === a.id && s.status === "graded").length;
        const need = awaiting(a);
        const pct = total ? Math.round((subN / total) * 100) : 0;
        const st = dueKind(a);
        const c = course(a.courseId);
        const pub = isPublished(a);
        return e("tr", { key: a.id },
          e("td", { title: a.title }, e("button", { type: "button", className: "th2-back th2-ell", title: a.title, onClick: () => go("homework/" + a.id) }, a.title), e("span", { className: "th2-sub" }, c?.title || a.courseId, " ", e(StatusBadge, { course: c })), need ? e("span", { className: "th2-tograde" }, need + " to grade") : null),
          e("td", { className: st.overdue ? "th2-overdue" : "", title: st.label }, st.label),
          e("td", { title: subN + " / " + total }, e("span", { className: "th2-bar" }, subN + " / " + total, e("i", null, e("b", { style: { width: pct + "%" } }))), e("span", { className: "th2-sub" }, grN + " graded")),
          e("td", { title: pub ? "Visible to students" : "Hidden from students" }, e("span", { className: "th2-vis " + (pub ? "pub" : "draft") }, e(Eye, { off: !pub }), e("span", { className: "th2-vislab" }, pub ? "Published" : "Draft"))),
          e("td", null, e("span", { className: "th2-pill " + st.k }, st.l)),
          e("td", { className: "th2-menurow th2-act" },
            e("div", { className: "th2-actsrow" },
              e("button", { type: "button", className: "th2-review", onClick: () => go("homework/" + a.id) }, "Review"),
              e(RowMenu, { locked: isCourseLocked(c), items: [
                { label: "Review submissions", icon: "review", onClick: () => go("homework/" + a.id) },
                { label: "Edit", icon: "edit", lockWhenDone: true, onClick: () => setForm({ ...a, rubric: a.rubric || [] }) },
                { label: pub ? "Unpublish" : "Publish", icon: pub ? "unpublish" : "publish", lockWhenDone: true, onClick: () => togglePub(a) },
                { label: "Duplicate", icon: "dup", lockWhenDone: true, onClick: () => dup(a) },
                { label: "Delete", icon: "del", danger: true, lockWhenDone: true, onClick: () => del(a) }
              ] })
            )
          )
        );
      }))
    );
  };

  return e("div", { className: "th2" },
    e("div", { className: "th2-head" },
      e("div", null, e("h2", null, "Homework"), e("p", null, "Assignments for your courses"),
        e("div", { style: { marginTop: 12, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" } },
          e(CourseSelect, { courses, cid, counts, countNoun: "homework", onPick: pick }),
          e("div", { className: "th2-fchips" }, ["All","Published","Draft","To grade"].map((x) => e("button", { type: "button", key: x, className: "th2-fchip" + (visFilter === x ? " on" : ""), onClick: () => setVisFilter(x) }, x === "To grade" && totalAwait ? x + " · " + totalAwait : x)))
        )),
      e("div", { className: "th2-head-acts" },
        e("button", { type: "button", className: "th2-btn th2-avgbtn", onClick: () => {
          if (cid) go("homework-averages/" + cid);
          else go("homework-averages");
        } }, e(KpiIco, { kind: "chart" }), " Homework averages"),
        e("button", { type: "button", className: "th2-create", disabled: createDisabled, title: createDisabled ? "Course is completed" : "",
          onClick: () => { if (!createDisabled) setForm({ courseId: pickCreateCourseId(courses, cid), title: "", dueDate: "", maxPoints: 100, status: "Published", description: "", rubric: [] }); } }, e(Plus), " Create homework")
      )
    ),
    e("div", { className: "th2-kpis" },
      [["Total homework", assignsAll.filter((a) => !cid || a.courseId === cid).length, "blue", "list"], ["Awaiting grading", totalAwait, "violet", "check"], ["Overdue missing", overdueMiss, "amber", "alarm"], ["Average grade", avgAll, "teal", "chart"]].map(([l, v, k, ic]) =>
        e("div", { className: "th2-kpi " + k, key: l }, e("span", { className: "ico" }, e(KpiIco, { kind: ic })), e("div", null, e("span", null, l), e("strong", null, String(v)))))
    ),
    e("div", { className: "th2-card" }, tableBody()),
    form ? e(HomeworkFormV2, { form, courses, uid, CourseSelect, onClose: () => setForm(null), onSaved: () => refreshTrainerStore(uid) }) : null
  );
}

let root;
export function renderTrainerHomeworkV2(host, props) {
  if (!host) return false;
  try {
    if (!root) root = createRoot(host);
    root.render(e(Boundary, null, e(Page, props)));
    return true;
  } catch (err) {
    host.innerHTML = `<p class="th2-err">${String(err?.message || err)} <button type="button" class="th2-btn" id="th2r">Try again</button></p>`;
    host.querySelector("#th2r")?.addEventListener("click", () => renderTrainerHomeworkV2(host, props));
    return false;
  }
}
