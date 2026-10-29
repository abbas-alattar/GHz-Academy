import { createElement as e, useEffect, useMemo, useState, Component } from "https://esm.sh/react@18.3.1";
import { createRoot } from "https://esm.sh/react-dom@18.3.1/client";
import { db } from "./firebase-config.js?v=auth8";
import { collection, query, where, getDocs, getDoc, doc } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { AdminPdfButton, fmtPdfDate, exportStudentProfilePdf } from "./AdminPdfExport.js";
import { loadGradePack } from "./AdminGradesV2.js";
import { studentRosterStatus } from "./CourseRosterV1.js";
import { ConfirmDialog } from "./ConfirmDialog.js";
import { courseStatusLabel } from "./courseStatusLabel.js";

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
  componentDidCatch(err) { console.error("AdminStudentsV2", err); }
  render() {
    if (this.state.err) {
      return e("div", { className: "admin-students asv2" }, e("p", { className: "asv2-err" }, "Students could not load"),);
    }
    return this.props.children;
  }
}

const initials = (n) => String(n || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
const avBg = (n) => { let h = 0; String(n || "").split("").forEach((c) => { h = (h * 17 + c.charCodeAt(0)) % 360; }); return `linear-gradient(135deg,hsl(${h},62%,42%),hsl(${(h+40)%360},70%,56%))`; };
function tsMs(v) { try { if (!v) return 0; if (v.toMillis) return v.toMillis(); if (v.toDate) return v.toDate().getTime(); const t = new Date(v).getTime(); return isNaN(t) ? 0 : t; } catch { return 0; } }
function fmtDate(ms) { return ms ? new Date(ms).toLocaleDateString() : "—"; }
function pickActivity(parts) {
  let best = { ms: 0, label: "" };
  (parts || []).forEach((p) => {
    if (p.ms > best.ms) best = p;
  });
  return best;
}
function activityFromUser(row) {
  return pickActivity([
    { ms: tsMs(row?.lastActiveAt), label: "Active in portal" },
    { ms: tsMs(row?.lastLoginAt), label: "Signed in" }
  ]);
}
function ago(ms) {
  if (!ms) return "Never";
  const s = Date.now() - ms;
  if (s < 45000) return "Just now";
  if (s < 3600000) return Math.max(1, Math.round(s / 60000)) + " min ago";
  if (s < 86400000) return Math.max(1, Math.round(s / 3600000)) + " h ago";
  const d = Math.round(s / 86400000);
  return d === 1 ? "1 day ago" : d + " days ago";
}
function fmtWhen(ms) {
  if (!ms) return "";
  try { return new Date(ms).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
  catch { return ""; }
}
function fmtExact(ms) {
  if (!ms) return "—";
  const d = new Date(ms);
  if (isNaN(d.getTime())) return "—";
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const pad = (n) => String(n).padStart(2, "0");
  return days[d.getDay()] + " " + d.getDate() + " " + months[d.getMonth()] + " " + d.getFullYear() + ", " + pad(d.getHours()) + ":" + pad(d.getMinutes());
}
function pickTs(row, keys) {
  for (const k of keys) { const n = tsMs(row?.[k]); if (n) return n; }
  return 0;
}
const miss = (v) => (v === 0 || v) && String(v).trim() ? String(v) : e("span", { className: "sd4-miss" }, "Not provided");

function svgIcon(kind) {
  const col = kind === "ok" ? "#16A34A" : kind === "no" ? "#D97706" : "#94A3B8";
  const inner = kind === "ok"
    ? e("path", { d: "M7.5 12.5l2.2 2.2 5-5", fill: "none", stroke: "#fff", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" })
    : kind === "no"
      ? e("path", { d: "M12 7v5M12 15.5h.01", fill: "none", stroke: "#fff", strokeWidth: "2", strokeLinecap: "round" })
      : e("path", { d: "M9.5 9a2.5 2.5 0 114 2c0 1.2-1 1.7-1.5 2.2S11.5 14 11.5 15", fill: "none", stroke: "#fff", strokeWidth: "2", strokeLinecap: "round" });
  return e("svg", { width: 18, height: 18, viewBox: "0 0 24 24", "aria-hidden": "true" },
    e("circle", { cx: 12, cy: 12, r: 11, fill: col }),
    inner
  );
}
function verPill(v) {
  const kind = v === true ? "ok" : v === false ? "no" : "unk";
  const lab = v === true ? "Verified" : v === false ? "Not verified" : "Unknown";
  return e("span", { className: "asv2-vp " + kind }, svgIcon(kind), " ", lab);
}

function isActiveStatus(st) {
  return st === "Open" || st === "Coming soon" || st === "Closed";
}
function isCompletedStatus(st) {
  return st === "Completed";
}
function courseStats(ens, courseById) {
  const activeNames = [];
  const doneNames = [];
  (ens || []).forEach((en) => {
    const c = courseById[en.courseId];
    if (!c) return;
    const title = c.title || en.courseTitle || en.courseId;
    if (isCompletedStatus(c.status)) doneNames.push(title);
    else if (isActiveStatus(c.status)) activeNames.push(title);
  });
  return { active: activeNames.length, completed: doneNames.length, total: (ens || []).length, activeNames, doneNames };
}

function CountPills({ stats, fail, loading, onOpen }) {
  if (loading) return e("div", { className: "asv2-sk asv2-sk-sm" });
  if (fail) return e("span", { title: fail }, "—");
  const zeroA = stats.active === 0;
  const zeroC = stats.completed === 0;
  return e("div", { className: "asv2-cwrap", onClick: (ev) => ev.stopPropagation() },
    e("div", { className: "asv2-pills" },
      e("button", {
        type: "button",
        className: "asv2-cpill blue" + (zeroA ? " zero" : ""),
        title: stats.activeNames.length ? stats.activeNames.join("\n") : "No active courses",
        onClick: () => onOpen && onOpen()
      }, String(stats.active) + " Active"),
      e("button", {
        type: "button",
        className: "asv2-cpill green" + (zeroC ? " zero" : ""),
        title: stats.doneNames.length ? stats.doneNames.join("\n") : "No completed courses",
        onClick: () => onOpen && onOpen()
      }, String(stats.completed) + " Completed")
    ),
    e("div", { className: "asv2-ctot" }, stats.total + " enrolled in total")
  );
}

async function settledDoc(col, id) {
  try {
    const snap = await getDoc(doc(db, col, id));
    return { ok: true, exists: snap.exists(), data: snap.exists() ? snap.data() : null, err: null };
  } catch (err) {
    return { ok: false, exists: false, data: null, err: err.code || err.message };
  }
}
async function settledQuery(col, clauses) {
  try {
    let qy = collection(db, col);
    qy = query(qy, ...clauses);
    const snap = await getDocs(qy);
    return { ok: true, rows: snap.docs.map((d) => ({ id: d.id, ...d.data() })), err: null };
  } catch (err) {
    return { ok: false, rows: [], err: err.code || err.message };
  }
}

function ConfirmSheet({ title, body, confirmLabel, danger, onYes, onNo, name }) {
  return e(ConfirmDialog, {
    open: true, title, message: body, name, tone: danger ? "danger" : "info",
    confirmLabel, onCancel: onNo, onConfirm: async () => { await onYes?.(); }
  });
}

function copyId(id) {
  try { navigator.clipboard.writeText(String(id)); } catch (_) {}
}
function IdChip({ id, onEdit }) {
  if (!id) return e("span", { className: "asv2-miss" }, "Not assigned yet");
  return e("span", { className: "asv2-idchip" },
    e("code", null, id),
    e("button", { type: "button", className: "asv2-copy", title: "Copy", onClick: (ev) => { ev.stopPropagation(); copyId(id); } }, "Copy"),
    onEdit ? e("button", { type: "button", className: "asv2-copy", onClick: (ev) => { ev.stopPropagation(); onEdit(); } }, "Edit") : null
  );
}
function trainerLine(c) {
  const names = Array.isArray(c?.trainerNames) ? c.trainerNames.filter(Boolean) : [];
  if (names.length) return names.join(", ");
  return c?.trainerName || "Trainer to be announced";
}
function resultPill(st) {
  if (st === "Passed") return e("span", { className: "sd4-rp sd4-pass" }, "Passed");
  if (st === "Failed") return e("span", { className: "sd4-rp sd4-fail" }, "Failed");
  return e("span", { className: "sd4-rp sd4-ip" }, "IP");
}
function StatusBadge({ status }) {
  const st = String(status || "—").trim();
  const k = st.toLowerCase();
  const cls = k === "open" ? "sd4-open" : k === "closed" ? "sd4-closed" : k === "completed" ? "sd4-done" : "sd4-other";
  return e("span", { className: "sd4-sb " + cls }, courseStatusLabel({ status: st }));
}
function ic(d) {
  return e("svg", { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, "aria-hidden": "true" }, e("path", { d }));
}
function GroupCard({ title, icon, rows }) {
  return e("div", { className: "sd4-gcard" },
    e("h4", null, icon, " ", title),
    rows.map(([k, v]) => e("div", { className: "sd4-kv", key: k }, e("span", { className: "sd4-kl" }, k), e("span", { className: "sd4-kvv" }, miss(v))))
  );
}
function Drawer({ s, courseById, lastMs, lastLabel, lastErr, onClose, onToggle, onEditId }) {
  const [tab, setTab] = useState(s.drawerTab || "profile");
  const [ens, setEns] = useState(s.ens || null);
  const [grades, setGrades] = useState(null);
  const [gErr, setGErr] = useState("");
  const [reloadN, setReloadN] = useState(0);
  const [file, setFile] = useState({});
  const [ask, setAsk] = useState(false);
  const [fresh, setFresh] = useState(s);
  const [freshErr, setFreshErr] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false);
  const uid = s.id || s.uid;
  useEffect(() => {
    const onKey = (ev) => { if (ev.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  useEffect(() => {
    let live = true;
    getDoc(doc(db, "users", uid)).then((snap) => {
      if (!live) return;
      if (snap.exists()) setFresh({ ...s, ...snap.data(), id: snap.id, uid: snap.id });
    }).catch((err) => { if (live) setFreshErr(err.code || err.message); });
    return () => { live = false; };
  }, [uid]);
  useEffect(() => {
    if (!Array.isArray(ens) || !ens.length) { setGrades({}); return; }
    let live = true;
    setGErr("");
    (async () => {
      const out = {};
      await Promise.all(ens.map(async (en) => {
        const cid = en.courseId;
        const c = courseById[cid] || {};
        try {
          const pack = await loadGradePack(cid);
          if (pack.err) out[cid] = { err: pack.err, status: "IP" };
          else out[cid] = studentRosterStatus(c, pack, uid);
        } catch (err) {
          out[cid] = { err: err.code || err.message, status: "IP" };
        }
      }));
      if (live) setGrades(out);
    })();
    return () => { live = false; };
  }, [ens, uid, courseById, reloadN]);
  useEffect(() => {
    if (Array.isArray(ens) || ens?.err) return;
    getDocs(query(collection(db, "enrollments"), where("uid", "==", uid)))
      .then((snap) => setEns(snap.docs.map((d) => ({ id: d.id, ...d.data() }))))
      .catch((err) => setEns({ err: err.code || err.message }));
  }, [uid, ens]);
  useEffect(() => {
    if (tab !== "documents") return;
    ["cv", "id"].forEach((kind) => { if (!file[kind]) loadFile(kind); });
  }, [tab, uid]);

  const loadFile = async (kind) => {
    const id = uid + "_" + kind;
    try {
      const snap = await getDoc(doc(db, "profileFiles", id));
      setFile((f) => ({ ...f, [kind]: snap.exists() ? { id, ...snap.data() } : { missing: true } }));
    } catch (err) { setFile((f) => ({ ...f, [kind]: { err: err.code || err.message } })); }
  };
  const openBlob = (rec) => {
    const b64 = rec.data || rec.base64 || rec.content;
    const mime = rec.mimeType || rec.type || "application/octet-stream";
    if (!b64) return;
    const bin = atob(String(b64).split(",").pop());
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([arr], { type: mime }));
    window.open(url, "_blank", "noopener,noreferrer");
  };
  const u = { ...s, ...fresh };
  const loginMs = tsMs(u.lastLoginAt);
  const activeMs = tsMs(u.lastActiveAt) || lastMs || loginMs;
  const st = courseStats(Array.isArray(ens) ? ens : [], courseById);
  const edge = (c) => {
    const k = String(c.status || "").toLowerCase();
    if (k === "open") return "#16A34A";
    if (k === "closed") return "#D97706";
    if (k === "completed") return "#0F2747";
    return "#94A3B8";
  };
  const pdfRun = async () => {
    const preview = window.open("", "_blank");
    setPdfBusy(true);
    try {
      const list = Array.isArray(ens) ? ens : [];
      const courseRows = list.map((en) => {
        const c = courseById[en.courseId] || {};
        const g = grades && grades[en.courseId];
        const status = g?.err ? "IP" : (g?.status || (String(c.status || "").toLowerCase() === "completed" ? "Failed" : "IP"));
        return {
          title: c.title || en.courseTitle || en.courseId,
          trainers: trainerLine(c),
          enrolled: fmtPdfDate(en.enrolledAt || en.createdAt),
          status
        };
      });
      await exportStudentProfilePdf({
        previewWin: preview,
        student: { name: u.name, studentId: u.studentId },
        details: [
          { k: "Student ID", v: u.studentId || "—" },
          { k: "Full name", v: u.name || "—" },
          { k: "Email", v: u.email || "—" },
          { k: "Mobile number", v: u.phone || "—" },
          { k: "Date of birth", v: u.dateOfBirth || "—" },
          { k: "Gender", v: u.gender || "—" },
          { k: "Nationality", v: u.nationality || "—" },
          { k: "Country", v: u.countryOfResidence || "—" },
          { k: "City", v: u.cityOfResidence || "—" },
          { k: "Address", v: u.address || "—" },
          { k: "Job title", v: u.jobTitle || "—" },
          { k: "Date joined the academy", v: fmtPdfDate(u.createdAt) }
        ],
        courses: courseRows
      });
    } catch (err) {
      try { if (preview && !preview.closed) preview.close(); } catch (_) {}
      alert(err?.code || err?.message || String(err));
    }
    setPdfBusy(false);
  };

  return e("aside", { className: "sd4-draw", role: "dialog", "aria-label": "Student profile" },
    e("div", { className: "sd4-band" },
      e("button", { type: "button", className: "sd4-x", "aria-label": "Close", onClick: onClose }, "×"),
      e("button", { type: "button", className: "sd4-pdf", disabled: pdfBusy, onClick: pdfRun },
        e("svg", { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2 },
          e("path", { d: "M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 0 002-2V8z" }), e("path", { d: "M14 2v6h6M8 13h8M8 17h5" })),
        pdfBusy ? "Preparing…" : "View PDF"),
      e("div", { className: "sd4-who" },
        e("div", { className: "sd4-av", style: { background: avBg(u.name) } }, initials(u.name || u.email)),
        e("div", { className: "sd4-who-txt" },
          e("h3", { className: "sd4-name" }, u.name || "Student"),
          e("div", { className: "sd4-idrow" }, e(IdChip, { id: u.studentId, onEdit: onEditId ? () => onEditId(s) : null })),
          e("div", { className: "sd4-pills" },
            e("span", { className: "sd4-vp " + (u.emailVerified === true ? "ok" : u.emailVerified === false ? "no" : "unk") }, u.emailVerified === true ? "Verified" : u.emailVerified === false ? "Not verified" : "Unknown"),
            e("span", { className: "sd4-acc " + (u.active === false ? "off" : "on") }, u.active === false ? "Deactivated" : "Active")
          ),
          e("p", { className: "sd4-mail" }, u.email || "")
        )
      )
    ),
    e("div", { className: "sd4-body" },
    freshErr ? e("p", { className: "asv2-err" }, lastErr || freshErr, " ", e("button", { type: "button", className: "asv2-view", onClick: () => location.reload() }, "Try again")) : null,
    e("div", { className: "sd4-minis" },
      e("div", { className: "sd4-mini cal" }, ic("M8 7V3m8 4V3M4 11h16M5 5h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z"), e("small", null, "Joined"), e("strong", null, fmtDate(tsMs(u.createdAt)))),
      e("div", { className: "sd4-mini book" }, ic("M4 19.5A2.5 2.5 0 016.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"), e("small", null, "Courses"), e("strong", null, Array.isArray(ens) ? String(ens.length) : "…")),
      e("div", { className: "sd4-mini aw" }, ic("M8 21h8M12 17v4M7 4h10v4a5 5 0 11-10 0V4z"), e("small", null, "Completed"), e("strong", null, String(st.completed)))
    ),
    e("div", { className: "sd4-signin" },
      ic("M12 8v4l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z"),
      e("div", null,
        e("p", null, "Last sign-in: ", e("strong", null, loginMs ? fmtExact(loginMs) : "Never")),
        e("p", { className: "sd4-rel" }, "Last active: ", activeMs ? ago(activeMs) : "Never")
      )
    ),
    e("div", { className: "sd4-tabs" }, ["profile", "documents", "courses"].map((t) => e("button", { type: "button", key: t, className: "sd4-tab" + (tab === t ? " on" : ""), onClick: () => setTab(t) }, t[0].toUpperCase() + t.slice(1))),
      e("span", { className: "sd4-ind", style: { transform: "translateX(" + (["profile", "documents", "courses"].indexOf(tab) * 100) + "%)" } })),
    e("div", { className: "sd4-fade", key: tab },
    tab === "profile" ? e("div", { className: "sd4-cols" },
      e(GroupCard, { title: "Personal", icon: ic("M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z"), rows: [["Full name", u.name], ["Date of birth", u.dateOfBirth], ["Gender", u.gender], ["Nationality", u.nationality], ["Country", u.countryOfResidence], ["City", u.cityOfResidence]] }),
      e(GroupCard, { title: "Contact", icon: ic("M4 4h16v16H4zM4 8h16"), rows: [["Email", u.email], ["Mobile", u.phone], ["Address", u.address]] }),
      e(GroupCard, { title: "Professional", icon: ic("M20 7H4v12h16V7zM8 7V5h8v2"), rows: [["Job title", u.jobTitle], ["Company", u.company], ["Education", u.education]] })
    ) : null,
    tab === "documents" ? ["cv", "id"].map((kind) => {
      const rec = file[kind];
      return e("div", { key: kind, className: "sd4-doc" },
        e("div", { className: "sd4-docic" }, ic("M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z")),
        e("div", { className: "sd4-docm" },
          e("p", { className: "sd4-docn" }, kind === "cv" ? "CV" : "ID or passport"),
          !rec ? e("button", { type: "button", className: "asv2-view", onClick: () => loadFile(kind) }, "Load") :
          rec.err ? e("p", { className: "asv2-err" }, rec.err, " ", e("button", { type: "button", className: "asv2-view", onClick: () => loadFile(kind) }, "Try again")) :
          rec.missing ? e("p", { className: "sd4-miss" }, "Not uploaded") :
          e("div", { className: "sd4-docacts" },
            e("span", null, rec.fileName || rec.name || kind),
            e("button", { type: "button", className: "asv2-view", onClick: () => openBlob(rec) }, "View"),
            e("button", { type: "button", className: "asv2-view", onClick: () => openBlob(rec) }, "Download")
          )
        )
      );
    }) : null,
    tab === "courses" ? (
      !ens ? e("div", { className: "asv2-sk" }) : ens.err ? e("p", { className: "asv2-err" }, ens.err, " ", e("button", { type: "button", className: "asv2-view", onClick: () => setEns(null) }, "Try again")) :
      (ens.length ? ens.map((en) => {
        const c = courseById[en.courseId] || {};
        const g = grades && grades[en.courseId];
        const title = c.title || en.courseTitle || en.courseId;
        return e("div", { className: "sd4-crow", key: en.id, style: { borderLeftColor: edge(c) } },
          e("div", { className: "sd4-ctitle" }, title,
            e("div", { className: "sd4-enr" }, "Enrolled " + fmtDate(tsMs(en.enrolledAt || en.createdAt))),
            e(StatusBadge, { status: c.status })
          ),
          e("div", { className: "sd4-cright" },
            !g ? e("div", { className: "asv2-sk asv2-sk-sm" }) :
            g.err ? e("button", { type: "button", className: "asv2-gpill amber", onClick: () => setReloadN((n) => n + 1) }, g.err + " · Try again") :
            resultPill(g.status)
          )
        );
      }) : e("p", { className: "sd4-miss" }, "No enrollments"))
    ) : null
    ),
    ),
    e("div", { className: "sd4-foot" },
      e("button", { type: "button", className: u.active === false ? "sd4-act" : "sd4-deact", onClick: () => setAsk(true) }, u.active === false ? "Activate account" : "Deactivate account")
    ),
    ask ? e(ConfirmSheet, {
      title: u.active === false ? "Activate this account?" : "Deactivate this account?",
      body: u.active === false ? "They will be able to sign in again." : "They will not be able to log in.",
      confirmLabel: u.active === false ? "Activate" : "Deactivate",
      danger: u.active !== false,
      onNo: () => setAsk(false),
      onYes: () => { setAsk(false); onToggle(s); }
    }) : null
  );
}

function Page({ students, courses, enrollments, enErr, loading, error, onRetry, onRefresh, onToggle, onBackfill, onEditId }) {
  students = Array.isArray(students) ? students : [];
  courses = Array.isArray(courses) ? courses : [];
  enrollments = Array.isArray(enrollments) ? enrollments : [];
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  const [cid, setCid] = useState("");
  const [open, setOpen] = useState(null);
  const [openErr, setOpenErr] = useState(null);
  const [acts, setActs] = useState({});
  const [actErr, setActErr] = useState({});
  const [bf, setBf] = useState("");
  const missingIds = students.filter((s) => !String(s.studentId || "").trim()).length;
  useEffect(() => {
    const fn = () => onRefresh?.();
    window.addEventListener("focus", fn);
    return () => window.removeEventListener("focus", fn);
  }, [onRefresh]);
  const consumeOpen = async (uid, course) => {
    if (!uid) return;
    setOpenErr(null);
    let s = students.find((x) => (x.id || x.uid) === uid);
    if (!s) {
      try {
        const snap = await getDoc(doc(db, "users", uid));
        if (!snap.exists()) {
          setOpenErr("Student not found");
          setOpen(null);
          return;
        }
        s = { id: snap.id, uid: snap.id, ...snap.data() };
      } catch (err) {
        setOpenErr("Student not found" + (err?.code ? " · " + err.code : err?.message ? " · " + err.message : ""));
        setOpen(null);
        return;
      }
    }
    setOpen({ ...s, uid: s.id || s.uid, drawerTab: course ? "courses" : "profile", highlightCourse: course || "" });
    if (location.hash.indexOf("?") >= 0) history.replaceState({ view: "students" }, "", "#students");
  };
  useEffect(() => {
    const fromHash = () => {
      const raw = (location.hash || "").replace(/^#/, "");
      const qi = raw.indexOf("?");
      if (qi < 0) return;
      const params = new URLSearchParams(raw.slice(qi + 1));
      const uid = params.get("open");
      if (uid) consumeOpen(uid, params.get("course") || "");
    };
    fromHash();
    const onEvt = (ev) => consumeOpen(ev.detail?.uid, ev.detail?.course || "");
    window.addEventListener("ghz-open-student", onEvt);
    window.addEventListener("hashchange", fromHash);
    return () => {
      window.removeEventListener("ghz-open-student", onEvt);
      window.removeEventListener("hashchange", fromHash);
    };
  }, [students]);

  const [courseById, setCourseById] = useState({});
  const [courseLoad, setCourseLoad] = useState(false);
  const [courseFail, setCourseFail] = useState(null);
  useEffect(() => {
    if (enrollments == null) return;
    const ids = [...new Set(enrollments.map((en) => en.courseId).filter(Boolean))];
    if (!ids.length) { setCourseById({}); setCourseLoad(false); setCourseFail(null); return; }
    let live = true;
    setCourseLoad(true);
    setCourseFail(null);
    Promise.allSettled(ids.map((id) => getDoc(doc(db, "courses", id)))).then((parts) => {
      if (!live) return;
      const map = {};
      let fail = null;
      parts.forEach((p, i) => {
        if (p.status === "fulfilled" && p.value.exists()) map[ids[i]] = { id: ids[i], ...p.value.data() };
        else if (p.status === "rejected") fail = p.reason?.code || p.reason?.message || "Could not load a course";
      });
      setCourseById(map);
      setCourseFail(fail);
      setCourseLoad(false);
    });
    return () => { live = false; };
  }, [enrollments]);

  useEffect(() => {
    if (!students.length) return;
    let live = true;
    students.forEach((s) => {
      const uid = s.id || s.uid;
      if (!uid) return;
      const jobs = [
        getDoc(doc(db, "users", uid)),
        getDocs(query(collection(db, "submissions"), where("uid", "==", uid))),
        getDocs(query(collection(db, "quizAttempts"), where("uid", "==", uid))),
        getDocs(query(collection(db, "attendance"), where("uid", "==", uid))),
        getDocs(query(collection(db, "enrollments"), where("uid", "==", uid)))
      ];
      Promise.allSettled(jobs).then((parts) => {
        if (!live) return;
        const cand = [];
        const userPart = parts[0];
        if (userPart.status === "fulfilled" && userPart.value.exists()) {
          const d = userPart.value.data();
          cand.push({ ms: tsMs(d.lastActiveAt), label: "Active in portal" });
          cand.push({ ms: tsMs(d.lastLoginAt), label: "Signed in" });
        } else {
          cand.push(activityFromUser(s));
          if (userPart.status === "rejected") setActErr((prev) => ({ ...prev, [uid]: userPart.reason?.code || userPart.reason?.message }));
        }
        const addSnap = (p, key, label) => {
          if (p.status !== "fulfilled") return;
          p.value.docs.forEach((d) => {
            const row = d.data();
            const ms = tsMs(row[key]) || tsMs(row.createdAt) || tsMs(row.updatedAt);
            if (ms) cand.push({ ms, label });
          });
        };
        addSnap(parts[1], "submittedAt", "Submitted homework");
        addSnap(parts[2], "submittedAt", "Took quiz");
        addSnap(parts[3], "markedAt", "Active in portal");
        addSnap(parts[4], "createdAt", "Enrolled");
        setActs((prev) => ({ ...prev, [uid]: pickActivity(cand) }));
      });
    });
    return () => { live = false; };
  }, [students]);

  const byUid = useMemo(() => {
    const m = {};
    (enrollments || []).forEach((en) => {
      const id = en.uid;
      if (!id) return;
      (m[id] = m[id] || []).push(en);
    });
    return m;
  }, [enrollments]);

  const enriched = students.map((s) => {
    const uid = s.id || s.uid;
    const ens = byUid[uid] || [];
    const stats = courseStats(ens, courseById);
    return { ...s, uid, ens, stats, activeEn: stats.active > 0, completed: stats.completed > 0 };
  });

  const courseReady = enrollments != null && !courseLoad && !enErr && !courseFail;
  const counts = {
    all: enriched.length,
    active: courseReady ? enriched.filter((s) => s.activeEn).length : null,
    done: courseReady ? enriched.filter((s) => s.completed).length : null,
    none: enrollments != null && !enErr ? enriched.filter((s) => !s.ens.length).length : null,
    unver: enriched.filter((s) => s.emailVerified === false).length,
    ver: enriched.filter((s) => s.emailVerified === true).length,
    week: enriched.filter((s) => {
      const ms = (acts[s.uid] && acts[s.uid].ms) || activityFromUser(s).ms;
      return ms && Date.now() - ms <= 7 * 86400000;
    }).length
  };
  const nlab = (n) => (n == null ? (enErr || courseFail ? "—" : "…") : String(n));

  const rows = enriched.slice().sort((a, b) => {
    const am = (acts[a.uid] && acts[a.uid].ms) || activityFromUser(a).ms;
    const bm = (acts[b.uid] && acts[b.uid].ms) || activityFromUser(b).ms;
    return bm - am;
  }).filter((s) => {
    if (tab === "active" && !s.activeEn) return false;
    if (tab === "week") {
      const ms = (acts[s.uid] && acts[s.uid].ms) || activityFromUser(s).ms;
      if (!ms || Date.now() - ms > 7 * 86400000) return false;
    }
    if (tab === "done" && !s.completed) return false;
    if (tab === "none" && s.ens.length) return false;
    if (tab === "unver" && s.emailVerified !== false) return false;
    if (cid && !s.ens.some((en) => en.courseId === cid)) return false;
    const qq = q.trim().toLowerCase();
    if (qq && ![s.name, s.email, s.phone, s.studentId].join(" ").toLowerCase().includes(qq)) return false;
    return true;
  });

  if (error) return e("div", { className: "admin-students asv2" }, e("p", { className: "asv2-err" }, String(error)), e("button", { type: "button", className: "asv2-view", onClick: onRetry }, "Try again"),);

  return e("div", { className: "admin-students asv2" },
    openErr ? e("p", { className: "asv2-err" }, openErr) : null,
    e("div", { className: "asv2-headrow" },
      e("div", null, e("h2", null, "Students"), e("p", { className: "sub" }, "Everyone enrolled in the academy")),
      e("div", { style: { display: "flex", gap: 8, flexWrap: "wrap" } },
      e(AdminPdfButton, { page: "Students", getData: () => ({
        page: "Students",
        filters: "Tab: " + tab + (cid ? " · Course filter" : " · Course: All courses") + (q ? " · Search: " + q : ""),
        summary: "Total " + counts.all + " · Verified " + counts.ver,
        columns: [
          { key: "id", label: "ID" }, { key: "name", label: "Name" }, { key: "email", label: "Email" }, { key: "verified", label: "Verified" },
          { key: "joined", label: "Joined" }, { key: "active", label: "Active courses" }, { key: "done", label: "Completed courses" }
        ],
        rows: rows.map((s) => ({
          id: s.studentId || "—", name: s.name || "Student", email: s.email || "—",
          verified: s.emailVerified === false ? "No" : "Yes",
          joined: fmtPdfDate(s.createdAt),
          active: s.stats ? String(s.stats.active ?? "—") : "—",
          done: s.stats ? String(s.stats.completed ?? "—") : "—"
        }))
      }) }),
      missingIds ? e("button", { type: "button", className: "asv2-view", onClick: async () => {
        setBf("Assigning…");
        const res = await onBackfill?.((msg) => setBf(msg));
        setBf(res ? (res.assigned + " IDs assigned") : "");
      } }, bf || ("Assign missing IDs (" + missingIds + ")")) : (bf ? e("span", { className: "asv2-ctot" }, bf) : null)
      )
    ),
    e("div", { className: "asv2-stats" },
      [
        ["Total students", counts.all, "#2563EB", "people"],
        ["Verified", counts.ver, "#16A34A", "check"],
        ["Active", nlab(counts.active), "#0EA5E9", "pulse"]
      ].map(([lab, n, col, ic]) => e("div", { className: "asv2-stat", key: lab },
        e("div", { className: "asv2-stat-ic", style: { background: col + "22", color: col } }, ic === "people" ? "👥" : ic === "check" ? "✓" : ic === "pulse" ? "●" : "⚑"),
        e("div", null, e("strong", { className: "asv2-num" }, String(n)), e("span", null, lab))
      ))
    ),
    e("div", { className: "asv2-bar" },
      [["all", "All", counts.all], ["active", "Active", nlab(counts.active)], ["week", "Active in last 7 days", counts.week], ["none", "Not enrolled", nlab(counts.none)], ["unver", "Not verified", counts.unver]].map(([k, lab, n]) => e("button", { type: "button", key: k, className: "asv2-pill" + (tab === k ? " on" : ""), onClick: () => setTab(k) }, lab + " " + n)),
      e("select", { className: "asv2-sel", value: cid, onChange: (ev) => setCid(ev.target.value) }, e("option", { value: "" }, "All courses"), courses.map((c) => e("option", { key: c.id, value: c.id }, c.title))),
      e("input", { className: "asv2-search", placeholder: "Search name, email, phone, ID", value: q, onChange: (ev) => setQ(ev.target.value) })
    ),
    e("div", { className: "asv2-card" },
      e("div", { className: "asv2-th asv2-th-id" }, e("div", null, "ID"), e("div", null, "Student"), e("div", null, "Verified"), e("div", null, "Joined"), e("div", null, "Courses"), e("div", null, "Last activity"), e("div", null, "")),
      loading ? [1, 2, 3].map((i) => e("div", { className: "asv2-row", key: i }, e("div", { className: "asv2-sk" }))) :
      !rows.length ? e("div", { className: "asv2-empty" }, e("p", null, "No students match"), e("button", { type: "button", className: "asv2-view", onClick: () => { setTab("all"); setQ(""); setCid(""); } }, "Clear filters")) :
      rows.map((s) => e("div", { className: "asv2-row asv2-th-id", key: s.uid, onClick: () => setOpen(s) },
        e("div", { onClick: (ev) => ev.stopPropagation() }, e(IdChip, { id: s.studentId })),
        e("div", { className: "asv2-stu" }, e("div", { className: "asv2-av", style: { background: avBg(s.name) } }, initials(s.name || s.email)), e("div", null, e("p", null, s.name || "Student"), e("small", null, s.email || ""))),
        e("div", null, verPill(s.emailVerified)),
        e("div", { title: ago(tsMs(s.createdAt)) }, fmtDate(tsMs(s.createdAt))),
        e(CountPills, {
          stats: s.stats,
          fail: enErr || courseFail,
          loading: (enrollments == null && !enErr) || courseLoad,
          onOpen: () => setOpen({ ...s, drawerTab: "courses" })
        }),
        e("div", null, (() => {
          if (actErr[s.uid] && acts[s.uid] == null) return e("span", { className: "asv2-err", title: actErr[s.uid] }, actErr[s.uid]);
          if (acts[s.uid] == null) return e("div", { className: "asv2-sk asv2-sk-sm" });
          const rec = acts[s.uid] || {};
          const ms = rec.ms || tsMs(s.lastActiveAt) || tsMs(s.lastLoginAt);
          return e("span", { title: ms ? fmtExact(ms) : "" }, ago(ms));
        })()),
        e("div", null, e("button", { type: "button", className: "asv2-view", onClick: (ev) => { ev.stopPropagation(); setOpen(s); } }, "View"))
      ))
    ),
    open ? e("div", { className: "sd4-dim", onClick: () => setOpen(null) }) : null,
    open ? e(Drawer, { key: (open.uid || "") + (open.drawerTab || "profile"), s: open, courseById, lastMs: acts[open.uid]?.ms, lastLabel: acts[open.uid]?.label, lastErr: actErr[open.uid], onClose: () => setOpen(null), onToggle, onEditId }) : null,);
}

let root;
export function renderAdminStudentsV2(host, opts = {}) {
  if (!host) return false;
  try {
    if (!root) root = createRoot(host);
    root.render(e(Boundary, null, e(Page, opts || {})));
    return true;
  } catch (err) {
    console.error("AdminStudentsV2", err);
    showSecErr(host, err, () => renderAdminStudentsV2(host, opts));
    return false;
  }
}
