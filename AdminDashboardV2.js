import { createElement as e, useEffect, useState, Component } from "https://esm.sh/react@18.3.1";
import { createRoot } from "https://esm.sh/react-dom@18.3.1/client";
import { auth, db } from "./firebase-config.js?v=auth8";
import { collection, getDocs, query, where, limit, orderBy } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
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
  componentDidCatch(err) { console.error("AdminDashboardV2", err); }
  render() {
    if (this.state.err) {
      return e("div", { className: "adv2" },
        e("p", { className: "adv2-err" }, String(this.state.err?.code || this.state.err?.message || this.state.err)),
        e("button", { type: "button", className: "adv2-btn", onClick: () => this.setState({ err: null }) }, "Try again"),);
    }
    return this.props.children;
  }
}

const cache = {};
function errCode(e) { return (e && (e.code || e.message)) || "unknown"; }
function firstName(n) { return String(n || "Admin").trim().split(/\s+/)[0] || "Admin"; }
function fmtDate(d) {
  return d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}
function tsMs(v) {
  try {
    if (!v) return 0;
    if (v.toMillis) return v.toMillis();
    if (v.toDate) return v.toDate().getTime();
    const t = new Date(v).getTime();
    return isNaN(t) ? 0 : t;
  } catch { return 0; }
}
function ago(ms) {
  if (!ms) return "";
  const s = Math.max(0, Date.now() - ms);
  if (s < 60000) return "now";
  if (s < 3600000) return Math.round(s / 60000) + "m";
  if (s < 86400000) return Math.round(s / 3600000) + "h";
  return Math.round(s / 86400000) + "d";
}
function localYmd(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function weekRange() {
  const now = new Date();
  const day = now.getDay();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (6 - day));
  return { start: localYmd(start), end: localYmd(end) };
}
function ymdOf(raw) {
  const s = String(raw || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}
function trainerName(c, users) {
  const ids = c.trainerIds || (c.trainerId ? [c.trainerId] : []);
  const names = ids.map((id) => (users.find((u) => u.id === id || u.uid === id) || {}).name).filter(Boolean);
  return names.join(", ") || "Unassigned";
}
function statusClass(s) {
  if (s === "Open") return "open";
  if (s === "Coming soon") return "soon";
  if (s === "Closed") return "closed";
  if (s === "Completed") return "completed";
  if (s === "Archived") return "archived";
  if (s === "Draft") return "draft";
  return "draft";
}
function fmtStart(c) {
  const raw = c.startDate || c.startsAt || "";
  const s = String(raw).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(s + "T00:00:00");
    if (!isNaN(d)) return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  }
  return raw || "Date TBC";
}
function ico(d, stroke, size, extra) {
  const paths = Array.isArray(d) ? d : [d];
  return e("svg", { viewBox: "0 0 24 24", fill: "none", stroke: stroke || "#2563EB", strokeWidth: "1.75", width: size || 20, height: size || 20, overflow: "visible", style: { display: "block", overflow: "visible", flex: "none" } },
    paths.filter(Boolean).map((p, i) => e("path", { key: i, d: p, strokeLinecap: "round", strokeLinejoin: "round" })),
    extra || null
  );
}
function icoUsers(stroke, size) {
  return e("svg", { viewBox: "0 0 24 24", fill: "none", stroke: stroke || "#2563EB", strokeWidth: "1.75", width: size || 20, height: size || 20, overflow: "visible", style: { display: "block", overflow: "visible" } },
    e("path", { d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2", strokeLinecap: "round", strokeLinejoin: "round" }),
    e("circle", { cx: "9", cy: "7", r: "4" }),
    e("path", { d: "M22 21v-2a4 4 0 0 0-3-3.87", strokeLinecap: "round", strokeLinejoin: "round" }),
    e("path", { d: "M16 3.13a4 4 0 0 1 0 7.75", strokeLinecap: "round", strokeLinejoin: "round" })
  );
}
function icoPresent(stroke, size) {
  return e("svg", { viewBox: "0 0 24 24", fill: "none", stroke: stroke || "#7C3AED", strokeWidth: "1.75", width: size || 20, height: size || 20, overflow: "visible", style: { display: "block", overflow: "visible" } },
    e("rect", { x: "2", y: "3", width: "20", height: "12", rx: "1.5" }),
    e("path", { d: "M12 15v4 M8 21h8", strokeLinecap: "round", strokeLinejoin: "round" }),
    e("circle", { cx: "8", cy: "9", r: "2" }),
    e("path", { d: "M5.5 13c.4-1.2 1.4-2 2.5-2s2.1.8 2.5 2", strokeLinecap: "round" })
  );
}
function icoBook(stroke, size) {
  return ico(["M4 19.5A2.5 2.5 0 0 1 6.5 17H20", "M4 4.5A2.5 2.5 0 0 1 6.5 7H20v13H6.5A2.5 2.5 0 0 1 4 17.5z"], stroke, size);
}
function icoClip(stroke, size) {
  return e("svg", { viewBox: "0 0 24 24", fill: "none", stroke: stroke || "#D97706", strokeWidth: "1.75", width: size || 20, height: size || 20, overflow: "visible", style: { display: "block", overflow: "visible" } },
    e("rect", { x: "8", y: "2", width: "8", height: "4", rx: "1" }),
    e("path", { d: "M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2", strokeLinecap: "round", strokeLinejoin: "round" }),
    e("path", { d: "M9 12h6 M9 16h6", strokeLinecap: "round" })
  );
}
function icoChat(stroke, size) {
  return ico(["M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"], stroke, size);
}
function icoAward(stroke, size) {
  return e("svg", { viewBox: "0 0 24 24", fill: "none", stroke: stroke || "#B45309", strokeWidth: "1.75", width: size || 18, height: size || 18, overflow: "visible", style: { display: "block", overflow: "visible" } },
    e("circle", { cx: "12", cy: "8", r: "6" }),
    e("path", { d: "M8.2 13.4 7 22l5-3 5 3-1.2-8.6", strokeLinecap: "round", strokeLinejoin: "round" })
  );
}
function icoUserPlus(stroke, size) {
  return e("svg", { viewBox: "0 0 24 24", fill: "none", stroke: stroke || "#2563EB", strokeWidth: "1.75", width: size || 18, height: size || 18, overflow: "visible", style: { display: "block", overflow: "visible" } },
    e("path", { d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2", strokeLinecap: "round" }),
    e("circle", { cx: "9", cy: "7", r: "4" }),
    e("path", { d: "M19 8v6 M16 11h6", strokeLinecap: "round" })
  );
}
function icoCap(stroke, size) {
  return e("svg", { viewBox: "0 0 24 24", fill: "none", stroke: stroke || "#7C3AED", strokeWidth: "1.75", width: size || 18, height: size || 18, overflow: "visible", style: { display: "block", overflow: "visible" } },
    e("path", { d: "M22 10 12 5 2 10l10 5 10-5z", strokeLinejoin: "round" }),
    e("path", { d: "M6 12v5c2.5 2 9.5 2 12 0v-5", strokeLinecap: "round", strokeLinejoin: "round" }),
    e("path", { d: "M22 10v6", strokeLinecap: "round" })
  );
}
function icoDollar(stroke, size) {
  return ico(["M12 2v20", "M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"], stroke, size);
}
function titleName(n) {
  const s = String(n || "").trim();
  if (!s) return "Student";
  return s.split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}
function CountUp({ n }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { setV(n); return; }
    const start = performance.now();
    let raf;
    const tick = (t) => {
      const p = Math.min(1, (t - start) / 600);
      setV(Math.round(n * p));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [n]);
  return e("strong", null, String(v));
}

async function qAll(col) {
  if (!auth.currentUser) {
    const err = new Error("Not signed in");
    err.code = "unauthenticated";
    err.path = col;
    throw err;
  }
  const snap = await getDocs(collection(db, col));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function loadBundle() {
  const keys = ["users", "courses", "registrations", "inquiries", "enrollments", "sessions", "gradeSchemes", "certificates", "announcements", "assignments", "quizzes"];
  const settled = await Promise.allSettled(keys.map((k) => qAll(k)));
  const out = {};
  keys.forEach((k, i) => {
    const r = settled[i];
    if (r.status === "fulfilled") out[k] = { ok: true, rows: r.value };
    else out[k] = { ok: false, error: errCode(r.reason) };
  });
  return out;
}

function Sk() {
  return e("div", { className: "adv2-card" }, e("div", { className: "adv2-sk lg" }), e("div", { className: "adv2-sk", style: { marginTop: 10 } }), e("div", { className: "adv2-sk", style: { marginTop: 8, width: "70%" } }));
}
function CardErr({ code, onRetry }) {
  return e("div", { className: "adv2-err" },
    e("p", null, String(code || "error")),
    e("button", { type: "button", className: "adv2-btn", onClick: onRetry }, "Try again")
  );
}

function Dash({ displayName }) {
  const uid = window.__ghzAdminUid || "admin";
  const [bundle, setBundle] = useState(() => cache[uid] || null);
  const [loading, setLoading] = useState(!cache[uid]);
  const [slow, setSlow] = useState(false);

  const load = async (quiet) => {
    if (!quiet) setLoading(true);
    setSlow(false);
    const t = setTimeout(() => setSlow(true), 8000);
    try {
      const b = await Promise.race([
        loadBundle(),
        new Promise((_, rej) => setTimeout(() => rej(new Error("Taking longer than expected")), 8000))
      ]);
      const courseOk = b?.courses?.ok && Array.isArray(b.courses.rows) && b.courses.rows.length;
      if (courseOk) cache[uid] = b;
      else delete cache[uid];
      setBundle(b);
    } catch (e) {
      setBundle({ fatal: errCode(e) || "Taking longer than expected" });
    } finally {
      clearTimeout(t);
      setLoading(false);
    }
  };
  useEffect(() => { load(!!cache[uid]); }, []);
  useEffect(() => {
    const quiet = () => load(true);
    const id = setInterval(quiet, 90000);
    window.addEventListener("focus", quiet);
    return () => { clearInterval(id); window.removeEventListener("focus", quiet); };
  }, []);

  const go = (name) => { try { window.__ghzShowView?.(name); } catch (_) {} };
  const goRegs = (name, courseId) => {
    go("regs");
    try { window.dispatchEvent(new CustomEvent("ghz-filter-regs", { detail: { q: name || "", courseId: courseId || "" } })); } catch (_) {}
  };
  const goCourse = (id, tab) => {
    if (tab) try { sessionStorage.setItem("ghz-courses-tab", tab); } catch (_) {}
    go("courses");
    try { window.dispatchEvent(new CustomEvent("ghz-highlight-course", { detail: { id: id || "" } })); } catch (_) {}
  };
  const goCerts = (courseId, q) => {
    go("certificates");
    try { window.dispatchEvent(new CustomEvent("ghz-open-cert", { detail: { courseId: courseId || "", q: q || "" } })); } catch (_) {}
  };
  const goStudent = (uid, course) => {
    if (uid && window.__ghzOpenStudent) window.__ghzOpenStudent(uid, course || "");
    else go("students");
  };

  const users = bundle?.users?.ok ? bundle.users.rows : [];
  const courses = bundle?.courses?.ok ? bundle.courses.rows : [];
  const regs = bundle?.registrations?.ok ? bundle.registrations.rows : [];
  const inquiries = bundle?.inquiries?.ok ? bundle.inquiries.rows : [];
  const enrollments = bundle?.enrollments?.ok ? bundle.enrollments.rows : [];
  const sessions = bundle?.sessions?.ok ? bundle.sessions.rows : [];
  const schemes = bundle?.gradeSchemes?.ok ? bundle.gradeSchemes.rows : [];
  const certs = bundle?.certificates?.ok ? bundle.certificates.rows : [];
  const anns = bundle?.announcements?.ok ? bundle.announcements.rows : [];
  const hw = bundle?.assignments?.ok ? bundle.assignments.rows : [];
  const quizzes = bundle?.quizzes?.ok ? bundle.quizzes.rows : [];

  const students = users.filter((u) => u.role === "student").length;
  const trainers = users.filter((u) => u.role === "trainer").length;
  const courseCount = courses.filter((c) => c.status !== "Archived").length;
  const openN = courses.filter((c) => c.status === "Open").length;
  const soonN = courses.filter((c) => c.status === "Coming soon").length;
  const closedN = courses.filter((c) => c.status === "Closed").length;
  const completedN = courses.filter((c) => c.status === "Completed").length;
  const active = openN + closedN;
  const comingSoonList = courses.filter((c) => c.status === "Coming soon")
    .map((c) => ({ ...c, trainer: trainerName(c, users) }))
    .sort((a, b) => String(a.startDate || "~").localeCompare(String(b.startDate || "~")) || String(a.title).localeCompare(b.title))
    .slice(0, 3);
  const pending = regs.filter((r) => r.status === "payment_submitted").length;
  const newMsg = inquiries.filter((m) => m.status === "new").length;

  const statusLine = pending
    ? pending + " pending registration" + (pending === 1 ? "" : "s") + " need review"
    : newMsg
      ? newMsg + " new message" + (newMsg === 1 ? "" : "s")
      : "0 pending registrations, 0 new messages";

  const glance = (() => {
    const rank = (s) => s === "Open" ? 0 : s === "Coming soon" ? 1 : s === "Completed" ? 2 : 3;
    const withN = courses.map((c) => ({
      ...c,
      trainer: trainerName(c, users),
      n: enrollments.filter((en) => en.courseId === c.id).length
    }));
    const openUp = withN.filter((c) => c.status === "Open" || c.status === "Coming soon").sort((a, b) => rank(a.status) - rank(b.status) || String(a.title).localeCompare(b.title));
    const done = withN.filter((c) => c.status === "Completed").sort((a, b) => tsMs(b.completedAt) - tsMs(a.completedAt));
    return [...openUp, ...done].slice(0, 6);
  })();

  const health = [];
  courses.forEach((c) => {
    const hasScheme = schemes.some((s) => s.id === c.id || s.courseId === c.id);
    if (!hasScheme && c.status !== "Archived") health.push({ id: "gd-" + c.id, text: (c.title || "Course") + " has no grade distribution", sub: "Set up the scheme", action: "Set up", href: null, course: c, kind: "gd", tone: "purple", path: "M4 19h16 M8 17V7h8v10" });
    const ids = c.trainerIds || (c.trainerId ? [c.trainerId] : []);
    if (!ids.length && c.status !== "Archived") health.push({ id: "tr-" + c.id, text: (c.title || "Course") + " has no trainer assigned", sub: "Assign a trainer", action: "Open", href: null, kind: "course", tone: "amber", path: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" });
  });
  sessions.forEach((s) => {
    const d = ymdOf(s.date || s.sessionDate);
    const t = String(s.time || s.sessionTime || "").trim();
    if (!d || !t) {
      const c = courses.find((x) => x.id === s.courseId);
      health.push({ id: "se-" + s.id, text: (c?.title || "A session") + " is missing a date or time", sub: "Add date and time", action: "Fix", href: null, kind: "session", courseId: s.courseId, tone: "amber", path: "M12 8v4l3 3 M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20z" });
    }
  });
  courses.filter((c) => c.status === "Completed").forEach((c) => {
    const ens = enrollments.filter((en) => en.courseId === c.id);
    const issued = certs.filter((ct) => ct.courseId === c.id && ct.status === "issued");
    const hasGrades = schemes.some((s) => s.id === c.id || s.courseId === c.id) || c.gradesSaved;
    if (hasGrades && ens.length && issued.length < ens.length) {
      health.push({ id: "cert-" + c.id, text: (c.title || "Course") + " grades saved, certificates not issued", sub: "Issue certificates", action: "Open", href: null, kind: "cert", courseId: c.id, tone: "green", path: "M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z" });
    }
  });
  const healthShown = (() => {
    const map = new Map();
    health.forEach((h) => {
      const key = h.text + "|" + h.sub;
      const prev = map.get(key);
      if (prev) prev.n += 1;
      else map.set(key, { ...h, n: 1 });
    });
    return [...map.values()].map((h) => {
      let sub = h.sub;
      if (h.n > 1) sub = (sub ? sub + " · " : "") + "(" + h.n + " sessions)";
      return { ...h, sub };
    });
  })();

  const activity = [];
  certs.filter((c) => c.status === "issued").forEach((c) => {
    activity.push({ t: tsMs(c.issuedAt || c.createdAt), title: "Certificate issued", who: titleName(c.studentName), course: c.courseTitle || (courses.find((x) => x.id === c.courseId) || {}).title || "", tone: "gold", kind: "award", stroke: "#B45309", go: () => goCerts(c.courseId, c.studentName || "") });
  });
  courses.filter((c) => c.status === "Completed").forEach((c) => {
    activity.push({ t: tsMs(c.completedAt || c.updatedAt), title: "Course marked completed", who: titleName(c.completedByName || "Admin"), course: c.title || "", tone: "purple", kind: "cap", stroke: "#7C3AED", go: () => goCourse(c.id, "Completed") });
  });
  anns.forEach((a) => {
    activity.push({ t: tsMs(a.createdAt), title: "Announcement posted", who: a.authorName || a.authorRole || "Admin", course: a.courseTitle || (a.courseId === "all" ? "All courses" : (courses.find((x) => x.id === a.courseId) || {}).title || ""), tone: "purple", path: "M3 11v2h2l8 5V6L5 11H3z", stroke: "#7C3AED", go: () => go("announcements") });
  });
  regs.forEach((r) => {
    activity.push({ t: tsMs(r.createdAt || r.submittedAt), title: "New registration", who: titleName(r.studentName), course: r.courseTitle || (courses.find((x) => x.id === r.courseId) || {}).title || "", tone: "blue", kind: "userplus", stroke: "#2563EB", go: () => goRegs(r.studentName || "", r.courseId) });
  });
  regs.filter((r) => r.status === "enrolled" || r.paymentConfirmed).forEach((r) => {
    activity.push({ t: tsMs(r.paidAt || r.updatedAt || r.createdAt), title: "Payment confirmed", who: titleName(r.studentName), course: r.courseTitle || "", tone: "green", kind: "dollar", stroke: "#16A34A", go: () => goRegs(r.studentName || "", r.courseId) });
  });
  courses.forEach((c) => {
    if (c.gradesSavedAt || c.gradesSaved) {
      activity.push({ t: tsMs(c.gradesSavedAt || c.updatedAt), title: "Course grades saved by a trainer", who: c.gradesSavedByName || trainerName(c, users), course: c.title || "", tone: "amber", path: "M12 2l3 7h7l-5.5 4 2 7L12 16l-6.5 4 2-7L2 9h7z", stroke: "#D97706", go: () => go("grades") });
    }
  });
  users.filter((u) => u.role === "student").forEach((u) => {
    const t = tsMs(u.createdAt || u.updatedAt);
    if (t) activity.push({ t, title: u.updatedAt && tsMs(u.updatedAt) > tsMs(u.createdAt) ? "Student updated" : "Student joined", who: titleName(u.name), course: "", tone: "blue", kind: "userplus", stroke: "#2563EB", go: () => goStudent(u.id || u.uid) });
  });
  users.filter((u) => u.role === "trainer").forEach((u) => {
    const t = tsMs(u.createdAt || u.updatedAt);
    if (t) activity.push({ t, title: "Trainer", who: titleName(u.name), course: "", tone: "purple", kind: "cap", stroke: "#7C3AED", go: () => go("trainers") });
  });
  activity.sort((a, b) => b.t - a.t);
  const recent = activity.filter((a) => a.t).slice(0, 6);

  const { start, end } = weekRange();
  const inWeek = (ymd) => ymd && ymd >= start && ymd <= end;
  const sessWeek = sessions.filter((s) => inWeek(ymdOf(s.date || s.sessionDate))).length;
  const dueWeek = [...hw, ...quizzes].filter((x) => inWeek(ymdOf(x.dueDate || x.deadline))).length;

  const openCourse = (id) => go("courses");
  const openGd = (c) => {
    go("courses");
    try { window.dispatchEvent(new CustomEvent("ghz-open-gd", { detail: c })); } catch (_) {}
  };

  if (bundle?.fatal) {
    return e("div", { className: "adv2" }, e(CardErr, { code: bundle.fatal, onRetry: () => load(false) }),);
  }

  const sk = loading && !bundle && !slow;
  if (slow && !bundle) {
    return e("div", { className: "adv2" }, e(CardErr, { code: "Taking longer than expected", onRetry: () => load(false) }),);
  }

  const strokeMap = { blue: "#2563EB", purple: "#7C3AED", green: "#16A34A", amber: "#D97706", sky: "#0EA5E9" };
  return e("div", { className: "adv2" },
    e("div", { className: "adv2-hero" },
      e("div", { className: "adv2-wave", "aria-hidden": "true" }),
      e("div", null,
        e("h2", null, "Welcome back, " + firstName(displayName)),
        e("p", { className: "d" }, fmtDate(new Date())),
        e("p", { className: "st" }, bundle?.registrations?.ok === false || bundle?.inquiries?.ok === false ? "Status waiting on live data" : statusLine)
      ),
      e("div", { className: "adv2-hero-btns" },
        e("button", { type: "button", className: "adv2-wbtn", onClick: () => { go("courses"); window.__ghzOpenAddCourse?.(); } }, ico("M12 5v14 M5 12h14", "#1D4ED8", 16), "New course"),
        e("button", { type: "button", className: "adv2-wbtn", onClick: () => go("announcements") }, ico("M3 11v2h2l8 5V6L5 11H3z", "#1D4ED8", 16), "Announcement"),
        e("button", { type: "button", className: "adv2-wbtn", onClick: () => go("certificates") }, ico("M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z", "#1D4ED8", 16), "Issue certificate")
      )
    ),
    e("div", { className: "adv2-stats" },
      [
        { k: "users", n: students, label: "Students", note: "All student accounts", href: "#students", view: "students", tone: "blue", icon: "users" },
        { k: "users", n: trainers, label: "Trainers", note: "Active trainer accounts", href: "#trainers", view: "trainers", tone: "purple", icon: "trainers" },
        { k: "courses", n: active, label: "Active courses", note: "Open and closed, not completed", href: "#courses", view: "courses", tone: "green", icon: "book" },
        { k: "registrations", n: pending, label: "Pending registrations", note: "Awaiting review or payment", href: "#registrations", view: "regs", pending: true, tone: "amber", icon: "clip" },
        { k: "inquiries", n: newMsg, label: "New messages", note: "Inbox from the site", href: "#messages", view: "messages", tone: "sky", icon: "chat" }
      ].map((s) => {
        const failed = bundle && bundle[s.k] && bundle[s.k].ok === false;
        if (sk || !bundle) return e("div", { className: "adv2-stat", key: s.label }, e("div", { className: "adv2-sk lg" }), e("div", { className: "adv2-sk" }));
        if (failed) return e("div", { className: "adv2-stat", key: s.label }, e(CardErr, { code: bundle[s.k].error, onRetry: () => load(false) }));
        return e("a", {
          className: "adv2-stat" + (s.pending && pending > 0 ? " amber" : ""),
          href: s.href,
          key: s.label,
          onClick: (ev) => { if (s.view) { ev.preventDefault(); if (s.view === "courses") { try { sessionStorage.setItem("ghz-courses-tab", "Active"); } catch (_) {} window.dispatchEvent(new CustomEvent("ghz-highlight-course", { detail: { id: "" } })); } go(s.view); } }
        },
          e("div", { className: "adv2-ico " + s.tone }, s.icon === "users" ? icoUsers(strokeMap[s.tone], 20) : s.icon === "trainers" ? icoPresent(strokeMap[s.tone], 20) : s.icon === "book" ? icoBook(strokeMap[s.tone], 20) : s.icon === "clip" ? icoClip(strokeMap[s.tone], 20) : icoChat(strokeMap[s.tone], 20)),
          e(CountUp, { n: s.n }),
          e("span", null, s.label),
          s.pending ? e("small", { className: "adv2-subline" }, s.note) : e("small", null, s.note),
          s.pending && pending === 0 ? e("small", { className: "adv2-badge ok" }, "All clear") : null,
          s.pending && pending > 0 ? e("small", { className: "adv2-badge warn" }, String(pending)) : null
        );
      })
    ),
    e("div", { className: "adv2-grid" },
      e("div", { className: "adv2-col" },
        e("div", { className: "adv2-card" },
          e("div", { className: "adv2-h" }, e("h3", null, "Courses at a glance"), e("a", { href: "#courses", onClick: (ev) => { ev.preventDefault(); go("courses"); } }, "View all")),
          !bundle || loading && !bundle.courses ? e(Sk) :
          !bundle.courses.ok ? e(CardErr, { code: bundle.courses.error, onRetry: () => load(false) }) :
          glance.length ? [e("div", { className: "adv2-th", key: "th" }, e("div", null, "Course"), e("div", null, "Trainer"), e("div", null, "Students"), e("div", null, "Status")), ...glance.map((c) => e("div", { className: "adv2-row click", key: c.id, role: "button", tabIndex: 0, onClick: () => goCourse(c.id, c.status), onKeyDown: (ev) => { if (ev.key === "Enter") goCourse(c.id, c.status); } },
            e("b", null, c.title),
            e("div", { className: c.trainer === "Unassigned" ? "adv2-un" : "" }, c.trainer),
            e("div", null, String(c.n)),
            e("div", null, e("span", { className: "adv2-pill " + statusClass(c.status) }, statusChipShort(c)))
          )), e("div", { className: "adv2-break", key: "br" },
            e("span", { className: "adv2-pill open" }, openN + " Open"),
            e("span", { className: "adv2-pill soon" }, soonN + " " + courseStatusLabel("Coming soon")),
            e("span", { className: "adv2-pill closed" }, closedN + " " + courseStatusLabel("Closed")),
            e("span", { className: "adv2-pill completed" }, completedN + " Completed")
          )] : e("p", { style: { color: "#64748B" } }, "No courses yet.")
        ),
        e("div", { className: "adv2-card" },
          e("div", { className: "adv2-h" }, e("h3", null, courseStatusLabel("Coming soon")), e("a", { href: "#courses", onClick: (ev) => { ev.preventDefault(); try { sessionStorage.setItem("ghz-courses-tab", "Scheduled"); } catch (_) {} go("courses"); } }, "View all")),
          !bundle || loading && !bundle.courses ? e(Sk) :
          !bundle.courses.ok ? e(CardErr, { code: bundle.courses.error, onRetry: () => load(false) }) :
          comingSoonList.length ? comingSoonList.map((c) => e("div", { className: "adv2-soonrow click", key: c.id, role: "button", tabIndex: 0, onClick: () => goCourse(c.id, "Coming soon"), onKeyDown: (ev) => { if (ev.key === "Enter") goCourse(c.id, "Coming soon"); } },
            e("div", null, e("b", null, c.title), e("small", null, fmtStart(c) + " · " + c.trainer)),
            e("span", { className: "adv2-pill soon" }, statusChipShort(c))
          )) : e("p", { style: { color: "#64748B" } }, "No upcoming courses")
        ),
        e("div", { className: "adv2-card" },
          e("div", { className: "adv2-h" }, e("h3", null, "Course health")),
          !bundle ? e(Sk) :
          healthShown.length ? healthShown.slice(0, 6).map((h) => e("div", { className: "adv2-health click", key: h.id, role: "button", tabIndex: 0, onClick: () => {
            if (h.kind === "cert") goCerts(h.courseId || h.course?.id);
            else if (h.kind === "gd") openGd(h.course);
            else goCourse(h.course?.id || h.courseId);
          } },
            e("div", { className: "adv2-health-l" },
              e("div", { className: "adv2-ico38 adv2-ico " + (h.tone || "purple") }, ico(h.path, strokeMap[h.tone] || "#7C3AED", 18)),
              e("div", null, e("p", null, h.text), e("small", null, h.sub))
            )
          )).concat(healthShown.length > 6 ? [e("p", { className: "adv2-health-more", key: "more" }, "+" + (healthShown.length - 6) + " more")] : []) : e("p", { className: "adv2-good" }, e("div", { className: "adv2-ico38 adv2-ico green" }, ico("M5 13l4 4L19 7", "#16A34A", 18)), "Everything looks good")
        )
      ),
      e("div", { className: "adv2-col" },
        e("div", { className: "adv2-card" },
          e("div", { className: "adv2-h" }, e("h3", null, "Recent activity")),
          !bundle ? e(Sk) :
          recent.length ? recent.map((a, i) => e("div", { className: "adv2-act", key: i, role: "button", tabIndex: 0, onClick: () => a.go?.(), onKeyDown: (ev) => { if (ev.key === "Enter") a.go?.(); } },
            e("div", { className: "adv2-ico38 adv2-ico " + (a.tone || "blue") }, a.kind === "award" ? icoAward(a.stroke, 18) : a.kind === "userplus" ? icoUserPlus(a.stroke, 18) : a.kind === "dollar" ? icoDollar(a.stroke, 18) : a.kind === "cap" ? icoCap(a.stroke, 18) : ico(a.path, a.stroke || "#2563EB", 18)),
            e("div", { className: "adv2-act-body" }, e("p", null, a.title), e("span", null, [a.who, a.course, ago(a.t)].filter(Boolean).join(" · "))),
            e("svg", { className: "adv2-chev", viewBox: "0 0 24 24", fill: "none", stroke: "#94A3B8", strokeWidth: "2", width: 16, height: 16, "aria-hidden": "true" }, e("path", { d: "M9 6l6 6-6 6", strokeLinecap: "round", strokeLinejoin: "round" }))
          )) : e("p", { style: { color: "#64748B", fontSize: 13 } }, "No recent activity yet.")
        ),
        e("div", { className: "adv2-card" },
          e("div", { className: "adv2-h" }, e("h3", null, "This week")),
          !bundle ? e(Sk) :
          e("div", { className: "adv2-week" },
            e("div", null, e("b", null, String(sessWeek)), e("span", null, "sessions this week")),
            e("div", null, e("b", null, String(dueWeek)), e("span", null, "homework or quiz deadlines"))
          )
        )
      )
    ),);
}

export function bootAdminDashboardV2(host, opts = {}, displayName = "") {
  if (!host) return false;
  const name = typeof opts === "string" ? opts : (displayName || opts?.displayName || "");
  try {
    createRoot(host).render(e(Boundary, null, e(Dash, { displayName: name })));
    return true;
  } catch (err) {
    console.error("AdminDashboardV2 boot", err);
    showSecErr(host, err, () => bootAdminDashboardV2(host, opts, displayName));
    return false;
  }
}
