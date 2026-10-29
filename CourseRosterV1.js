import { createElement as e, useEffect, useMemo, useRef, useState, Component } from "https://esm.sh/react@18.3.1";
import { createRoot } from "https://esm.sh/react-dom@18.3.1/client";
import { auth, db } from "./firebase-config.js?v=auth8";
import { collection, query, where, getDocs, getDoc, doc, writeBatch } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { gradeCalc } from "./gradeCalc.js";
import { loadGradePack } from "./AdminGradesV2.js";
import { exportAdminPdf, nameWithId } from "./AdminPdfExport.js";
import { startsEndsLine, formatCourseDate } from "./courseDates.js";
import { statusBadgeHtml } from "./portal-status.js";

export const COURSE_ROSTER_V1_CACHE = "v2";

class Boundary extends Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err) { console.error("CourseRosterV1", err); }
  render() {
    if (this.state.err) {
      return e("div", { className: "cr1" },
        e("p", { className: "cr1-err" }, String(this.state.err?.code || this.state.err?.message || this.state.err)),
        e("button", { type: "button", className: "cr1-ghost", onClick: this.props.onRetry }, "Try again"));
    }
    return this.props.children;
  }
}
function fbErr(err) { return err?.code || err?.message || String(err); }
function withTimeout(p, ms = 10000) {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error("deadline-exceeded"), { code: "deadline-exceeded" })), ms))]);
}
function initials(n) {
  const p = String(n || "").trim().split(/\s+/);
  return ((p[0]?.[0] || "") + (p[1]?.[0] || "")).toUpperCase() || "?";
}
function dash(v) { return v == null || v === "" ? "—" : String(v); }
function enrolledOn(t) {
  try {
    const d = t?.toDate ? t.toDate() : t ? new Date(t) : null;
    return d && !isNaN(d) ? formatCourseDate(d.toISOString().slice(0, 10)) || d.toLocaleDateString() : "—";
  } catch { return "—"; }
}
function isAbsent(st) {
  return String(st || "").toLowerCase() === "absent";
}
function courseIsCompleted(course) {
  return String(course?.status || "").trim().toLowerCase() === "completed";
}
function passFail(avg, passMark) {
  const n = Number(avg);
  const mark = Number(passMark);
  if (!Number.isFinite(n) || !Number.isFinite(mark)) return "Failed";
  return n >= mark ? "Passed" : "Failed";
}
/** One status for table, tiles, filter, PDF, CSV. Matches AdminGradesV2 statusInfo. */
export function studentRosterStatus(course, pack, uid) {
  const completed = courseIsCompleted(course);
  const passMark = Number.isFinite(Number(pack?.passMark)) ? Number(pack.passMark) : 60;
  const row = (pack?.rows || []).find((r) => r.uid === uid);
  const scheme = pack?.scheme || { components: pack?.components, passMark };
  const g = gradeCalc(course, scheme, { uid, scores: row?.vals || row?.scores || {}, pack });
  const avg = g.failed ? null : g.average;
  if (completed) return { status: g.failed ? "—" : passFail(avg, passMark), avg, passMark, completed: true };
  return { status: "IP", avg, passMark, completed: false };
}

function App({ opts }) {
  const courseId = opts.courseId;
  const role = opts.role || "admin";
  const uid = opts.uid || auth.currentUser?.uid;
  const back = opts.backHref || "#courses";
  const [course, setCourse] = useState(null);
  const [denied, setDenied] = useState(false);
  const [headErr, setHeadErr] = useState("");
  const [ens, setEns] = useState([]);
  const [enErr, setEnErr] = useState("");
  const [enLoad, setEnLoad] = useState(true);
  const [att, setAtt] = useState(null);
  const [attErr, setAttErr] = useState("");
  const [gradePack, setGradePack] = useState({ components: [], passMark: 60, rows: [] });
  const [q, setQ] = useState("");
  const [st, setSt] = useState("all");
  const [busy, setBusy] = useState("");
  const [syncMsg, setSyncMsg] = useState("");
  const synced = useRef(false);

  const loadHead = async () => {
    setHeadErr(""); setDenied(false);
    try {
      const snap = await withTimeout(getDoc(doc(db, "courses", courseId)));
      if (!snap.exists()) throw Object.assign(new Error("not-found"), { code: "not-found" });
      const c = { id: snap.id, ...snap.data() };
      if (role === "trainer") {
        const ids = c.trainerIds || [];
        if (!ids.includes(uid)) { setDenied(true); return; }
      }
      setCourse(c);
    } catch (ex) { setHeadErr(fbErr(ex)); }
  };
  const loadEns = async () => {
    setEnLoad(true); setEnErr("");
    try {
      const snap = await withTimeout(getDocs(query(collection(db, "enrollments"), where("courseId", "==", courseId))));
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => String(a.studentName || "").localeCompare(String(b.studentName || "")));
      setEns(list);
      return list;
    } catch (ex) { setEnErr(fbErr(ex)); return []; }
    finally { setEnLoad(false); }
  };
  const loadAtt = async () => {
    setAttErr("");
    try {
      const snap = await withTimeout(getDocs(query(collection(db, "attendance"), where("courseId", "==", courseId))));
      setAtt(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (ex) { setAtt(null); setAttErr(fbErr(ex)); }
  };
  const loadGrades = async () => {
    try {
      const pack = await loadGradePack(courseId);
      setGradePack(pack && !pack.err ? pack : { components: [], passMark: 60, rows: [] });
    } catch { setGradePack({ components: [], passMark: 60, rows: [] }); }
  };
  const sync = async (list) => {
    const rows = list || ens;
    setBusy("sync"); setSyncMsg("");
    let filled = 0, miss = 0;
    try {
      const users = {};
      const regs = {};
      const us = await getDocs(collection(db, "users"));
      us.docs.forEach((d) => { users[d.id] = d.data(); });
      const rs = await getDocs(collection(db, "registrations"));
      rs.docs.forEach((d) => { const x = d.data(); regs[(x.uid || "") + "_" + (x.courseId || "")] = x; });
      const batch = writeBatch(db);
      rows.forEach((en) => {
        const u = users[en.uid] || {};
        const r = regs[(en.uid || "") + "_" + courseId] || {};
        const patch = {};
        if (!en.studentEmail) patch.studentEmail = u.email || r.studentEmail || "";
        if (!en.studentId) patch.studentId = u.studentId || r.studentId || "";
        if (!en.studentName) patch.studentName = u.name || r.studentName || "";
        if (Object.keys(patch).length) { batch.update(doc(db, "enrollments", en.id), patch); filled++; }
        if (!(patch.studentEmail || en.studentEmail) || !(patch.studentId || en.studentId)) miss++;
      });
      if (filled) await batch.commit();
      setSyncMsg("Updated " + filled + " enrollments" + (miss ? " · " + miss + " still missing a field" : ""));
      await loadEns();
    } catch (ex) { setSyncMsg(fbErr(ex)); }
    setBusy("");
  };

  useEffect(() => {
    synced.current = false;
    loadHead();
    loadAtt();
    loadGrades();
    loadEns().then((list) => {
      if (role === "admin" && list.some((r) => !r.studentId) && !synced.current) {
        synced.current = true;
        sync(list);
      }
    });
  }, [courseId, role, uid]);

  const rows = useMemo(() => ens.map((en) => {
    const abs = att == null ? null : att.filter((r) => r.uid === en.uid && isAbsent(r.status)).length;
    const rec = studentRosterStatus(course, gradePack, en.uid);
    return { ...en, abs, status: rec.status, avg: rec.avg, passMark: rec.passMark, email: en.studentEmail || "—", sid: en.studentId || "—" };
  }), [ens, att, course, gradePack]);

  const vis = rows.filter((r) => {
    if (st !== "all" && r.status !== st) return false;
    const qq = q.trim().toLowerCase();
    if (!qq) return true;
    return [r.studentName, r.sid, r.email].join(" ").toLowerCase().includes(qq);
  });
  const nPass = vis.filter((r) => r.status === "Passed").length;
  const nFail = vis.filter((r) => r.status === "Failed").length;
  const nIp = vis.filter((r) => r.status === "IP").length;
  const absLabel = (n) => n == null ? "—" : (n + " absence" + (n === 1 ? "" : "s"));
  const studentCell = (r) => (r.studentName || "—") + (r.abs ? " (" + absLabel(r.abs) + ")" : "");

  const pdf = async () => {
    const preview = window.open("", "_blank");
    setBusy("pdf");
    try {
      await exportAdminPdf({
        page: "Course roster",
        filters: (course?.title || "") + " · " + (Array.isArray(course?.trainerNames) ? course.trainerNames.join(", ") : "") + " · " + (startsEndsLine(course) || "") + " · " + vis.length + " students",
        summary: "Passed " + nPass + " · Failed " + nFail + " · IP " + nIp,
        columns: [
          { key: "n", label: "#" }, { key: "student", label: "Student" },
          { key: "email", label: "Email" }, { key: "enr", label: "Enrolled on" }, { key: "status", label: "Status" }
        ],
        previewWin: preview,
        rows: vis.map((r, i) => ({
          n: String(i + 1), student: nameWithId(r.studentName, r.sid).label, email: r.email, enr: enrolledOn(r.enrolledAt), status: r.status
        }))
      });
    } catch (ex) { alert(fbErr(ex)); }
    setBusy("");
  };
  const csv = () => {
    const cols = ["#", "Name (ID)", "Student ID", "Email", "Enrolled on", "Status"];
    const lines = [cols.join(",")].concat(vis.map((r, i) => { const ni = nameWithId(r.studentName, r.sid); return [i + 1, JSON.stringify(ni.label), ni.id, r.email, enrolledOn(r.enrolledAt), r.status].join(","); }));
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "roster.csv"; a.click();
  };

  if (denied) return e("div", { className: "cr1" }, e("a", { className: "cr1-back", href: back }, "← Back to courses"), e("p", { className: "cr1-err" }, "You do not have access to this course"));
  const trainers = Array.isArray(course?.trainerNames) ? course.trainerNames.filter(Boolean).join(", ") : "";
  const pill = (status) => e("span", {
    className: "cr1-pill " + (status === "Passed" ? "cr1-ok" : status === "Failed" ? "cr1-bad" : "cr1-ip"),
    title: status === "IP" ? "In progress" : status
  }, status);

  return e("div", { className: "cr1" },
    e("a", { className: "cr1-back", href: back, onClick: (ev) => { ev.preventDefault(); (window.__ghzShowView || ((n) => { location.hash = n; }))("courses"); } }, "← Back to courses"),
    e("div", { className: "cr1-hero" },
      e("h2", null, course?.title || "Roster"),
      course ? e("span", { dangerouslySetInnerHTML: { __html: statusBadgeHtml(course) } }) : null,
      e("p", { className: "cr1-meta" }, [trainers, startsEndsLine(course)].filter(Boolean).join(" · ")),
      e("div", { className: "cr1-stats" },
        e("div", { className: "cr1-stat" }, e("span", null, "Enrolled"), e("strong", null, enLoad ? "—" : String(ens.length))),
        e("div", { className: "cr1-stat" }, e("span", null, "Passed"), e("strong", null, enLoad ? "—" : String(nPass))),
        e("div", { className: "cr1-stat" }, e("span", null, "Failed"), e("strong", null, enLoad ? "—" : String(nFail))),
        e("div", { className: "cr1-stat" }, e("span", null, "In progress (IP)"), e("strong", null, enLoad ? "—" : String(nIp)))
      )
    ),
    headErr ? e("p", { className: "cr1-err" }, headErr, " ", e("button", { type: "button", className: "cr1-ghost", onClick: loadHead }, "Try again")) : null,
    attErr ? e("p", { className: "cr1-err" }, attErr, " ", e("button", { type: "button", className: "cr1-ghost", onClick: loadAtt }, "Try again")) : null,
    e("div", { className: "cr1-bar" },
      e("input", { placeholder: "Search name, Student ID, email", value: q, onChange: (ev) => setQ(ev.target.value) }),
      e("select", { value: st, onChange: (ev) => setSt(ev.target.value) },
        e("option", { value: "all" }, "All"),
        e("option", { value: "IP" }, "IP"),
        e("option", { value: "Passed" }, "Passed"),
        e("option", { value: "Failed" }, "Failed")
      ),
      e("button", { type: "button", className: "cr1-pdf", disabled: busy === "pdf", onClick: pdf }, busy === "pdf" ? "Preparing…" : "View PDF"),
      e("button", { type: "button", className: "cr1-ghost", onClick: csv }, "Export CSV"),
      role === "admin" ? e("button", { type: "button", className: "cr1-ghost", disabled: busy === "sync", onClick: () => sync() }, "Sync roster details") : null
    ),
    syncMsg ? e("p", { className: "cr1-meta" }, syncMsg) : null,
    e("div", { className: "cr1-table" },
      enLoad ? [1, 2, 3].map((i) => e("div", { key: i, className: "cr1-sk" })) :
      enErr ? e("p", { className: "cr1-err" }, enErr, " ", e("button", { type: "button", className: "cr1-ghost", onClick: loadEns }, "Try again")) :
      vis.length ? e("table", null,
        e("thead", null, e("tr", null, ["#", "Student", "Student ID", "Email", "Enrolled on", "Status"].map((h) => e("th", { key: h }, h)))),
        e("tbody", null, vis.map((r, i) => e("tr", { key: r.id },
          e("td", null, String(i + 1)),
          e("td", null, e("div", { className: "cr1-stu" },
            e("span", { className: "cr1-av" }, initials(r.studentName)),
            e("div", null,
              e("strong", null, dash(r.studentName), " ",
                e("span", { className: "cr1-abs" + (r.abs ? "" : " zero") }, att == null ? "—" : absLabel(r.abs == null ? 0 : r.abs))
              )
            )
          )),
          e("td", null, dash(r.sid === "—" ? "" : r.sid)),
          e("td", null, dash(r.email === "—" ? "" : r.email)),
          e("td", null, enrolledOn(r.enrolledAt)),
          e("td", null, pill(r.status))
        )))
      ) : e("div", { className: "cr1-empty" }, e("p", null, "No students enrolled yet"))
    ),
    !enLoad && !enErr ? e("p", { className: "cr1-count" }, vis.length + " student" + (vis.length === 1 ? "" : "s")) : null
  );
}

const roots = new WeakMap();
export function renderCourseRosterV1(opts) {
  const host = opts?.host;
  if (!host) return false;
  if (!document.getElementById("cr1-css")) {
    const l = document.createElement("link"); l.id = "cr1-css"; l.rel = "stylesheet"; l.href = "./CourseRosterV1.css?v=2"; document.head.appendChild(l);
  }
  let root = roots.get(host);
  if (!root) { root = createRoot(host); roots.set(host, root); }
  if (opts.loading || !opts.courseId) {
    root.render(e("div", { className: "cr1" }, e("a", { className: "cr1-back", href: "#courses" }, "← Back to courses"), e("div", { className: "cr1-hero" }, e("h2", null, "Roster")), e("div", { className: "cr1-sk" }), e("div", { className: "cr1-sk" })));
    return true;
  }
  root.render(e(Boundary, { onRetry: () => renderCourseRosterV1(opts) }, e(App, { opts })));
  return true;
}
