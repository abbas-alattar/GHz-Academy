import { createElement as e, useEffect, useMemo, useState, Component } from "https://esm.sh/react@18.3.1";
import { createRoot } from "https://esm.sh/react-dom@18.3.1/client";
import { createPortal } from "https://esm.sh/react-dom@18.3.1";
import { db } from "./firebase-config.js?v=auth8";
import { addDoc, collection, deleteDoc, doc, serverTimestamp, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { getTrainerStore, loadTrainerStore, refreshTrainerStore, subscribeTrainerStore, setTrainerCourseId, resolveTrainerCourseId } from "./TrainerStore.js";
import { CourseSelect, StatusBadge } from "./TrainerHomeworkV2.js";
import { isCourseLocked } from "./course-lock.js";
import { attendancePct, fmt1 } from "./gradeCalc.js";
import { exportAttendanceSessionPdf, exportAttendanceMatrixPdf, nameWithId } from "./AdminPdfExport.js";
import { showConfirmDialog, showNoticeDialog, showLeaveGradesDialog } from "./ConfirmDialog.js";
import { RowMenu } from "./TrainerRowMenu.js";

function fbErr(er) { return String((er?.code || "") + " " + (er?.message || er)).trim(); }
function initials(n) { return String(n || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0].toUpperCase()).join("") || "?"; }
function id7(en) {
  const s = String(en?.studentId || en?.id7 || "").replace(/\D/g, "");
  return s ? s.padStart(7, "0").slice(-7) : "—";
}
function todayStr() { return new Date().toISOString().slice(0, 10); }
function sessWhen(s) {
  const d = String(s.date || "");
  const t = String(s.startTime || "00:00");
  const x = new Date(d + "T" + t);
  return isNaN(x) ? 0 : x.getTime();
}
function dayLabel(d) {
  if (!d) return "—";
  const x = new Date(d + "T12:00:00");
  if (isNaN(x)) return d;
  return ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][x.getDay()] + " " + x.getDate() + " " + ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][x.getMonth()];
}
function monthKey(d) {
  if (!d) return "No date";
  const x = new Date(d + "T12:00:00");
  if (isNaN(x)) return d;
  return ["January","February","March","April","May","June","July","August","September","October","November","December"][x.getMonth()] + " " + x.getFullYear();
}
function addDays(d, n) {
  const x = new Date(d + "T12:00:00");
  x.setDate(x.getDate() + n);
  return x.toISOString().slice(0, 10);
}

class Boundary extends Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err) { console.error("TrainerAttendanceV2", err); }
  render() {
    if (this.state.err) return e("div", { className: "th2" }, e("p", { className: "th2-err" }, String(this.state.err?.message || this.state.err)), e("button", { className: "th2-btn", onClick: () => this.setState({ err: null }) }, "Try again"));
    return this.props.children;
  }
}
function Ico({ d }) {
  return e("svg", { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8 }, Array.isArray(d) ? d.map((p, i) => e("path", { key: i, d: p })) : e("path", { d }));
}
function Plus() { return e(Ico, { d: "M12 5v14M5 12h14" }); }
function Cal() { return e(Ico, { d: ["M8 2v4M16 2v4M3 10h18", "M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z"] }); }
function Users() { return e(Ico, { d: ["M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2", "M9 11a4 4 0 100-8 4 4 0 000 8"] }); }
function Trend() { return e(Ico, { d: ["M3 17l6-6 4 4 8-8", "M14 7h7v7"] }); }
function Alarm() { return e(Ico, { d: ["M12 8v5l3 2", "M12 21a9 9 0 110-18 9 9 0 010 18z"] }); }

function sessKind(s, marked, enrolled, now = Date.now()) {
  const t = sessWhen(s);
  const end = s.endTime && s.date ? new Date(s.date + "T" + s.endTime).getTime() : t + 2 * 3600000;
  const today = todayStr();
  if (s.status === "Cancelled") return { k: "gray", l: "Cancelled" };
  if (marked >= enrolled && enrolled > 0) return { k: "graded", l: "Marked" };
  if (s.date === today) return { k: marked ? "soon" : "soon", l: marked ? "Today" : "Needs marking" };
  if (end < now && !marked) return { k: "soon", l: "Needs marking" };
  if (t > now) return { k: "submitted", l: "Scheduled" };
  if (marked) return { k: "graded", l: "Marked" };
  return { k: "soon", l: "Needs marking" };
}

function timeMins(t) {
  const p = String(t || "").split(":");
  const h = Number(p[0]), m = Number(p[1]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}
function durChip(start, end) {
  const a = timeMins(start), b = timeMins(end);
  if (a == null || b == null || b <= a) return "";
  const m = b - a;
  const h = Math.floor(m / 60), r = m % 60;
  if (h && r) return h + " h " + r + " m";
  if (h) return h + " h";
  return r + " m";
}
function fmtClock(t) {
  if (!t) return "";
  const p = String(t).split(":");
  return (p[0] || "00").padStart(2, "0") + ":" + (p[1] || "00").padStart(2, "0");
}
function CalPlus() {
  return e("svg", { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8 },
    e("path", { d: "M8 2v4M16 2v4M3 10h18" }),
    e("path", { d: "M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z" }),
    e("path", { d: "M12 14v4M10 16h4" }));
}
function LinkIco() {
  return e("svg", { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8 },
    e("path", { d: "M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" }),
    e("path", { d: "M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" }));
}

function SessionForm({ courses, uid, go, onClose, edit }) {
  const openC = (courses || []).filter((c) => !isCourseLocked(c));
  const startCid = (() => {
    const cur = (courses || []).find((c) => c.id === edit?.courseId);
    if (cur && !isCourseLocked(cur)) return cur.id;
    return openC[0]?.id || "";
  })();
  const [cid, setCid] = useState(startCid);
  const [title, setTitle] = useState(edit?.title || "");
  const [date, setDate] = useState(edit?.date || todayStr());
  const [start, setStart] = useState(edit?.startTime || "18:00");
  const [end, setEnd] = useState(edit?.endTime || "20:00");
  const [notes, setNotes] = useState(edit?.notes || "");
  const [link, setLink] = useState(edit?.meetingLink || "");
  const [rep, setRep] = useState(false);
  const [weeks, setWeeks] = useState(4);
  const [ferr, setFerr] = useState({});
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const refs = { title: null, date: null, start: null, end: null };
  const course = courses.find((c) => c.id === cid);
  const locked = isCourseLocked(course);
  const nWeeks = Math.max(1, Math.min(20, Number(weeks) || 1));
  const preview = [];
  if (rep && !edit?.id && date) {
    for (let i = 0; i < nWeeks; i++) preview.push(addDays(date, i * 7));
  }
  const dur = durChip(start, end);
  const whenLine = date ? (dayLabel(date) + " · " + fmtClock(start) + " – " + fmtClock(end)) : "";
  const saveLabel = (!edit?.id && preview.length > 1) ? ("Save " + preview.length + " sessions") : "Save session";
  const save = async () => {
    const fe = {};
    if (!cid) fe.course = "Pick a course.";
    if (locked) fe.course = "This course is completed — sessions can't be added";
    if (!title.trim()) fe.title = "Title is required.";
    if (!date) fe.date = "Date is required.";
    if (!start) fe.start = "Start time is required.";
    if (!end) fe.end = "End time is required.";
    const a = timeMins(start), b = timeMins(end);
    if (a != null && b != null && b <= a) fe.end = "End must be after start.";
    setFerr(fe); setErr("");
    const order = ["title", "date", "start", "end"];
    const first = order.find((k) => fe[k]);
    if (first && refs[first]) refs[first].focus();
    if (Object.keys(fe).length) return;
    setBusy(true);
    const base = { courseId: cid, title: title.trim(), date, startTime: start, endTime: end, meetingLink: link.trim(), notes: notes.trim() };
    try {
      if (edit?.id) {
        await updateDoc(doc(db, "sessions", edit.id), { ...base, status: edit.status || "Scheduled", createdBy: uid });
      } else if (preview.length) {
        for (const d of preview) {
          await addDoc(collection(db, "sessions"), { ...base, date: d, status: "Scheduled", createdBy: uid, createdAt: serverTimestamp() });
        }
      } else {
        await addDoc(collection(db, "sessions"), { ...base, status: "Scheduled", createdBy: uid, createdAt: serverTimestamp() });
      }
      setSaved(true);
      refreshTrainerStore(uid);
      setTimeout(() => onClose(), 900);
    } catch (er) { setErr(fbErr(er)); }
    setBusy(false);
  };
  const fld = (lab, kids) => e("div", { className: "th2-dlg-f" }, e("label", null, lab), kids);
  return createPortal(e("div", { className: "th2-dlg-scrim", onClick: (ev) => { if (ev.target === ev.currentTarget) onClose(); } },
    e("div", { className: "th2-dlg th2-sessdlg", role: "dialog", "aria-modal": "true", "aria-labelledby": "th2-sess-title" },
      e("div", { className: "th2-dlg-h" },
        e("span", { className: "th2-dlg-ico", "aria-hidden": true }, e(CalPlus)),
        e("div", null,
          e("h3", { id: "th2-sess-title" }, edit?.id ? "Edit session" : "Add session"),
          e("p", null, course?.title || "Choose a course")
        ),
        e("button", { type: "button", className: "th2-dlg-x", onClick: onClose, "aria-label": "Close" }, "×")
      ),
      e("div", { className: "th2-dlg-b" },
        fld("Course", e(CourseSelect, { courses, cid, onPick: setCid, hideAll: true, disableLocked: true })),
        locked ? e("p", { className: "th2-lockban" }, "This course is completed — sessions can't be added") : null,
        ferr.course ? e("span", { className: "th2-ferr" }, ferr.course) : null,
        fld("Title", e("input", { ref: (n) => { refs.title = n; }, value: title, placeholder: "e.g. Session 3 – Antenna basics", onChange: (ev) => setTitle(ev.target.value) })),
        ferr.title ? e("span", { className: "th2-ferr" }, ferr.title) : null,
        e("div", { className: "th2-3col" },
          fld("Date", e("input", { ref: (n) => { refs.date = n; }, type: "date", value: date, onChange: (ev) => setDate(ev.target.value) })),
          fld("Start time", e("input", { ref: (n) => { refs.start = n; }, type: "time", value: start, onChange: (ev) => setStart(ev.target.value) })),
          fld("End time", [e("input", { key: "e", ref: (n) => { refs.end = n; }, type: "time", value: end, onChange: (ev) => setEnd(ev.target.value) }), dur ? e("span", { key: "d", className: "th2-durchip" }, dur) : null])
        ),
        ferr.date || ferr.start || ferr.end ? e("span", { className: "th2-ferr" }, ferr.date || ferr.start || ferr.end) : null,
        whenLine ? e("p", { className: "th2-whenprev" }, whenLine) : null,
        fld("Notes", e("textarea", { rows: 3, value: notes, onChange: (ev) => setNotes(ev.target.value) })),
        fld("Online link", e("div", { className: "th2-dlg-wrap" }, e("span", { className: "ic" }, e(LinkIco)), e("input", { value: link, placeholder: "https://…", onChange: (ev) => setLink(ev.target.value) }))),
        !edit?.id ? e("div", { className: "th2-swcard" },
          e("div", { className: "th2-swrow" },
            e("button", { type: "button", className: "th2-sw" + (rep ? " on" : ""), role: "switch", "aria-checked": rep, onClick: () => setRep(!rep) }, e("span")),
            e("span", { className: "th2-swlab" }, "Repeat weekly"),
            rep ? e("span", { className: "th2-step" },
              e("span", null, "for"),
              e("button", { type: "button", onClick: () => setWeeks(Math.max(1, nWeeks - 1)), "aria-label": "Fewer weeks" }, "−"),
              e("input", { type: "number", min: 1, max: 20, value: nWeeks, onChange: (ev) => setWeeks(ev.target.value) }),
              e("button", { type: "button", onClick: () => setWeeks(Math.min(20, nWeeks + 1)), "aria-label": "More weeks" }, "+"),
              e("span", null, "weeks")
            ) : null
          ),
          rep && preview.length ? e("p", { className: "th2-prevdates" }, preview.map((d) => dayLabel(d)).join(", ")) : null
        ) : null,
        err ? e("p", { className: "th2-err" }, err) : null
      ),
      e("div", { className: "th2-dlg-ft" },
        e("button", { type: "button", className: "th2-btn", onClick: onClose }, "Cancel"),
        e("button", { type: "button", className: "th2-btn pri", disabled: busy || locked, onClick: save }, busy ? "Saving…" : saveLabel)
      ),
      saved ? e("div", { className: "th2-savedbox" }, "Saved") : null
    )
  ), document.body);
}

function attListHash(courseId) {
  return courseId ? ("attendance?course=" + courseId) : "attendance";
}
function MarkPage({ pack, uid, go, sessionId }) {
  const sess = (pack.sessions || []).find((s) => s.id === sessionId);
  const course = (pack.courses || []).find((c) => c.id === sess?.courseId);
  const locked = isCourseLocked(course);
  const ens = (pack.enrollments || []).filter((en) => en.courseId === sess?.courseId && String(en.status || "").toLowerCase() !== "cancelled");
  useEffect(() => { if (sess?.courseId) setTrainerCourseId("attendance", sess.courseId); }, [sess?.courseId]);
  const savedMarks = {};
  (pack.attendance || []).filter((a) => a.sessionId === sessionId).forEach((a) => { savedMarks[a.uid] = { status: a.status || "", note: a.note || "" }; });
  const [base, setBase] = useState(savedMarks);
  const [draft, setDraft] = useState(savedMarks);
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedBox, setSavedBox] = useState(false);
  const [localAtt, setLocalAtt] = useState({});
  useEffect(() => {
    setBase(savedMarks);
    setDraft((d) => {
      const dirty = ens.some((en) => (d[en.uid]?.status || "") !== (base[en.uid]?.status || "") || (d[en.uid]?.note || "") !== (base[en.uid]?.note || ""));
      return dirty ? d : savedMarks;
    });
  }, [sessionId]);
  const vis = ens.filter((en) => ((en.studentName || "") + " " + id7(en)).toLowerCase().includes(q.toLowerCase()));
  const dirtyN = ens.filter((en) => (draft[en.uid]?.status || "") !== (base[en.uid]?.status || "") || (draft[en.uid]?.note || "") !== (base[en.uid]?.note || "")).length;
  const setSt = (id, st) => setDraft((p) => ({ ...p, [id]: { ...(p[id] || {}), status: (p[id]?.status === st ? "" : st) } }));
  const n = (st) => ens.filter((en) => draft[en.uid]?.status === st).length;
  const back = () => go(attListHash(sess?.courseId));
  const save = async (uids, { stay } = {}) => {
    if (locked) return false;
    setSaving(true);
    const list = uids || ens.filter((en) => (draft[en.uid]?.status || "") !== (base[en.uid]?.status || "") || (draft[en.uid]?.note || "") !== (base[en.uid]?.note || "")).map((en) => en.uid);
    const jobs = list.map((id) => {
      const en = ens.find((x) => x.uid === id);
      const m = draft[id] || {};
      if (!m.status) return Promise.resolve({ id, ok: true, skip: true });
      return setDoc(doc(db, "attendance", sessionId + "_" + id), {
        sessionId, courseId: sess.courseId, uid: id, studentName: en?.studentName || "",
        status: m.status, note: m.note || "", markedBy: uid, markedAt: serverTimestamp()
      }).then(() => ({ id, ok: true })).catch((er) => ({ id, ok: false, er }));
    });
    const settled = await Promise.allSettled(jobs);
    const results = settled.map((r, i) => r.status === "fulfilled" ? r.value : { id: list[i], ok: false, er: r.reason });
    const bad = results.filter((r) => !r.ok);
    setSaving(false);
    if (!bad.length) {
      const next = { ...draft };
      setBase(next);
      setLocalAtt((p) => {
        const o = { ...p };
        ens.forEach((en) => { if (next[en.uid]?.status) o[en.uid] = next[en.uid].status; });
        return o;
      });
      setSavedBox(true);
      try { window.__ghzBumpActive?.(); } catch (_) {}
      if (sess?.courseId) setTrainerCourseId("attendance", sess.courseId);
      refreshTrainerStore(uid);
      if (!stay) { /* stay on page */ }
      return true;
    }
    const lines = bad.map((r) => (ens.find((x) => x.uid === r.id)?.studentName || r.id) + ": " + fbErr(r.er)).join("\n");
    await showNoticeDialog({ tone: "danger", title: "Could not save", message: lines, retry: true, onRetry: () => save(bad.map((r) => r.id), { stay: true }) });
    return false;
  };
  const leave = async (next) => {
    if (!dirtyN) { next?.(); return true; }
    const a = await showLeaveGradesDialog();
    if (a === "stay") return false;
    if (a === "discard") { setDraft(base); next?.(); return true; }
    const ok = await save(undefined, { stay: true });
    if (ok) next?.();
    return !!ok;
  };
  useEffect(() => {
    window.__ghzTrainerLeave = () => leave(() => {});
    return () => { window.__ghzTrainerLeave = null; };
  }, [dirtyN, draft, base]);
  useEffect(() => {
    const onK = (ev) => {
      if (["INPUT", "TEXTAREA"].includes(ev.target.tagName)) return;
      const map = { p: "present", l: "late", a: "absent", e: "excused" };
      const st = map[ev.key?.toLowerCase()];
      if (!st || !vis[0]) return;
      setSt(vis[0].uid, st);
    };
    window.addEventListener("keydown", onK);
    return () => window.removeEventListener("keydown", onK);
  });
  useEffect(() => {
    const onB = (ev) => { if (dirtyN) { ev.preventDefault(); ev.returnValue = ""; } };
    window.addEventListener("beforeunload", onB);
    return () => window.removeEventListener("beforeunload", onB);
  }, [dirtyN]);
  if (!sess) return e("div", { className: "th2" }, e("p", { className: "th2-err" }, "Session not found"), e("button", { type: "button", className: "th2-backpill", "data-nav": attListHash(resolveTrainerCourseId("attendance", { courses: pack.courses })), "aria-label": "Back to Attendance" }, "← Attendance"));
  const segs = [["present", "Present", "ok"], ["late", "Late", "warn"], ["absent", "Absent", "bad"], ["excused", "Excused", "info"]];
  return e("div", { className: "th2 th2-att" },
    e("button", { type: "button", className: "th2-backpill", "data-nav": attListHash(sess.courseId), "aria-label": "Back to Attendance" }, "← Attendance"),
    locked ? e("div", { className: "th2-lockban" }, "Course completed — attendance is locked") : null,
    e("div", { className: "th2-hero" },
      e("h2", { style: { margin: 0 } }, sess.title || "Session"),
      e("div", { className: "th2-optrow" }, e(StatusBadge, { course }), e("span", { className: "th2-sub" }, dayLabel(sess.date) + " · " + (sess.startTime || "") + " – " + (sess.endTime || "")))
    ),
    e("div", { className: "th2-kpis" },
      [["Present", n("present"), "teal"], ["Late", n("late"), "amber"], ["Absent", n("absent"), "violet"], ["Excused", n("excused"), "blue"], ["Not marked", ens.length - n("present") - n("late") - n("absent") - n("excused"), "blue"]].slice(0, 4).map(([l, v, k]) => e("div", { className: "th2-kpi " + k, key: l }, e("span", { className: "ico" }, e(Users)), e("div", null, e("span", null, l), e("strong", null, String(v)))))
    ),
    e("div", { className: "th2-grd-toolbar" },
      e("input", { type: "search", placeholder: "Search students", value: q, onChange: (ev) => setQ(ev.target.value) }),
      !locked ? e("button", { className: "th2-btn nowrap", onClick: async () => { const ok = await showConfirmDialog({ title: "Mark all present?", message: "Every student will be marked present.", confirmLabel: "Mark all" }); if (ok && ok.ok !== false) setDraft((p) => { const n = { ...p }; ens.forEach((en) => { n[en.uid] = { ...(n[en.uid] || {}), status: "present" }; }); return n; }); } }, "Mark all present") : null,
      !locked ? e("button", { className: "th2-btn nowrap", onClick: () => setDraft(base) }, "Reset") : null,
      !locked ? e("button", { className: "th2-btn pri nowrap", disabled: saving || !dirtyN, onClick: () => save(undefined, { stay: true }) }, saving ? "Saving…" : "Save attendance") : null,
      e("button", { className: "th2-btn nowrap", onClick: () => {
        const sorted = vis.slice().sort((a, b) => String(a.studentName || "").localeCompare(String(b.studentName || "")));
        const fullDate = (() => { try { return new Date(sess.date + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }); } catch { return sess.date; } })();
        const timeLine = (sess.startTime || "") + " – " + (sess.endTime || "") + " (Beirut time)";
        const dur = durChip(sess.startTime, sess.endTime);
        const who = document.getElementById("userName")?.textContent?.trim() || "";
        const rows = sorted.map((en) => {
          const st = draft[en.uid]?.status || "";
          const info = attendancePct(sess.courseId, en.uid, { ...pack, sessionId, status: st });
          const lab = st === "present" ? "Present" : st === "late" ? "Late" : st === "absent" ? "Absent" : st === "excused" ? "Excused" : "Not marked";
          return { name: en.studentName, id: id7(en), email: en.email || en.studentEmail || "", status: st, statusLabel: lab, pct: info.display, absences: info.absent };
        });
        const marked = n("present") + n("late") + n("absent");
        const rate = marked ? fmt1(((n("present") + n("late")) / marked) * 100) + "%" : "—";
        exportAttendanceSessionPdf({ session: { ...sess, fullDate, timeLine }, course, trainerName: who, rows, counts: { present: n("present"), late: n("late"), absent: n("absent"), excused: n("excused") }, rate, duration: dur });
      } }, "View PDF"),
      e("button", { className: "th2-btn nowrap", onClick: () => {
        const sorted = vis.slice().sort((a, b) => String(a.studentName || "").localeCompare(String(b.studentName || "")));
        const head = ["#", "Name (ID)", "Student ID", "Email", "Status", "Attendance in course %", "Absences"];
        const lines = [head.join(",")].concat(sorted.map((en, i) => {
          const st = draft[en.uid]?.status || "not marked";
          const info = attendancePct(sess.courseId, en.uid, { ...pack, sessionId, status: draft[en.uid]?.status });
          const lab = st === "present" ? "Present" : st === "late" ? "Late" : st === "absent" ? "Absent" : st === "excused" ? "Excused" : "Not marked";
          const ni = nameWithId(en.studentName, id7(en));
          return [i + 1, ni.label, ni.id, en.email || en.studentEmail || "", lab, info.display, info.absent].map((x) => '"' + String(x).replace(/"/g, '""') + '"').join(",");
        }));
        const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" })); a.download = "attendance.csv"; a.click();
      } }, "Export CSV")
    ),
    e("div", { className: "th2-card" },
      e("table", { className: "th2-table" },
        e("thead", null, e("tr", null, e("th", null, "#"), e("th", null, "Student"), e("th", null, "Mark"), e("th", null, "In course"))),
        e("tbody", null, vis.map((en, i) => {
          const m = draft[en.uid] || {};
          const info = attendancePct(sess.courseId, en.uid, { ...pack, sessionId, status: m.status });
          return e("tr", { key: en.uid },
            e("td", null, String(i + 1)),
            e("td", null, e("div", { className: "ha1-stu" }, e("span", { className: "ha1-av" }, initials(en.studentName)), e("span", { className: "ha1-stun" }, e("b", null, en.studentName || "Student"), e("span", { className: "ha1-id" }, id7(en))))),
            e("td", null, e("div", { className: "th2-seg" }, segs.map(([st, lab, cls]) => e("button", { key: st, type: "button", className: "th2-segb " + cls + (m.status === st ? " on" : ""), disabled: locked, onClick: () => setSt(en.uid, st) }, lab)))),
            e("td", { title: info.tip }, info.pct == null ? "—" : info.display + "%")
          );
        }))
      ),
      dirtyN && !locked ? e("div", { className: "th2-unsaved" }, e("span", null, dirtyN + " unsaved change" + (dirtyN === 1 ? "" : "s")), e("button", { className: "th2-btn", onClick: () => setDraft(base) }, "Discard"), e("button", { className: "th2-btn pri", disabled: saving, onClick: () => save(undefined, { stay: true }) }, saving ? "Saving…" : "Save")) : null
    ),
    savedBox ? e("div", { className: "th2-savedbox" }, e("div", null, "Saved"), e("div", { className: "th2-savedacts" }, e("button", { className: "th2-btn", onClick: () => setSavedBox(false) }, "Stay"), e("button", { className: "th2-btn pri", onClick: back }, "Back to sessions"))) : null
  );
}

function ListPage({ pack, uid, go, courseId }) {
  const courses = pack.courses || [];
  const [cid, setCid] = useState(() => resolveTrainerCourseId("attendance", { hashId: courseId, courses }));
  const [chip, setChip] = useState("All");
  const [form, setForm] = useState(null);
  const [byStu, setByStu] = useState(false);
  useEffect(() => {
    const next = resolveTrainerCourseId("attendance", { hashId: courseId, courses });
    if (next && next !== cid) setCid(next);
  }, [courseId, courses]);
  const pick = (id) => {
    setCid(id);
    setTrainerCourseId("attendance", id);
    go(attListHash(id));
  };
  const course = courses.find((c) => c.id === cid);
  const locked = isCourseLocked(course);
  const sessAll = (pack.sessions || []).filter((s) => (!cid || s.courseId === cid) && s.status !== "Cancelled");
  const ens = (pack.enrollments || []).filter((en) => (!cid || en.courseId === cid) && String(en.status || "").toLowerCase() !== "cancelled");
  const atts = pack.attendance || [];
  const now = Date.now();
  const today = todayStr();
  const rows = sessAll.map((s) => {
    const marked = atts.filter((a) => a.sessionId === s.id && a.status).length;
    const kind = sessKind(s, marked, ens.length, now);
    return { s, marked, kind };
  }).filter((r) => {
    if (chip === "Upcoming") return sessWhen(r.s) > now;
    if (chip === "Today") return r.s.date === today;
    if (chip === "Past") return sessWhen(r.s) < now && r.s.date !== today;
    if (chip === "To mark") return r.kind.l === "Needs marking";
    return true;
  }).sort((a, b) => sessWhen(a.s) - sessWhen(b.s));
  const sessSorted = sessAll.slice().sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")) || String(a.startTime || "").localeCompare(String(b.startTime || "")));
  const shortSess = (s) => {
    try {
      const d = new Date(s.date + "T12:00:00");
      if (!isNaN(d)) return d.getDate() + " " + ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getMonth()];
    } catch {}
    return s.date || "—";
  };
  const stuInfos = ens.map((en) => attendancePct(cid, en.uid, pack));
  const rowPcts = stuInfos.map((x) => x.pct).filter((n) => n != null);
  const avg = rowPcts.length ? fmt1(rowPcts.reduce((a, b) => a + b, 0) / rowPcts.length) : "—";
  const toMark = sessAll.filter((s) => sessKind(s, atts.filter((a) => a.sessionId === s.id && a.status).length, ens.length).l === "Needs marking").length;
  const next = sessAll.filter((s) => sessWhen(s) >= now).sort((a, b) => sessWhen(a) - sessWhen(b))[0];
  let lastM = "";
  const pdfMatrix = () => {
    const who = document.getElementById("userName")?.textContent?.trim() || "";
    const sessions = sessSorted.map((s) => ({ id: s.id, title: s.title || "", date: s.date, shortDate: shortSess(s) }));
    const rows = ens.slice().sort((a, b) => String(a.studentName || "").localeCompare(String(b.studentName || ""))).map((en) => {
      const info = attendancePct(cid, en.uid, pack);
      const marks = {};
      sessSorted.forEach((s) => { marks[s.id] = (atts.find((a) => a.sessionId === s.id && a.uid === en.uid) || {}).status || ""; });
      return { name: en.studentName, id: id7(en), marks, pct: info.display, absences: info.absent };
    });
    exportAttendanceMatrixPdf({ course, trainerName: who, sessions, rows });
  };
  return e("div", { className: "th2 th2-att" },
    pack.sessErr ? e("p", { className: "th2-err" }, pack.sessErr, " ", e("button", { className: "th2-btn", onClick: () => refreshTrainerStore(uid) }, "Try again")) : null,
    e("div", { className: "th2-head" },
      e("div", null, e("h2", null, "Attendance"), e("p", null, "Sessions and marks for your classes")),
      e("div", { className: "th2-head-acts" },
        e(CourseSelect, { courses, cid, counts: Object.fromEntries(courses.map((c) => [c.id, { items: (pack.sessions || []).filter((s) => s.courseId === c.id && s.status !== "Cancelled").length, students: (pack.enrollments || []).filter((en) => en.courseId === c.id && String(en.status || "").toLowerCase() !== "cancelled").length }])), countNoun: "session", onPick: pick }),
        e("button", { className: "th2-create", disabled: locked, onClick: () => setForm({}) }, e(Plus), " Add session")
      )
    ),
    locked ? e("div", { className: "th2-lockban" }, "This course is completed and read-only.") : null,
    e("div", { className: "th2-kpis" },
      e("div", { className: "th2-kpi blue" }, e("span", { className: "ico" }, e(Cal)), e("div", null, e("span", null, "Sessions"), e("strong", null, String(sessAll.length)))),
      e("div", { className: "th2-kpi teal" }, e("span", { className: "ico" }, e(Trend)), e("div", null, e("span", null, "Average attendance"), e("strong", null, String(avg)))),
      e("div", { className: "th2-kpi amber" }, e("span", { className: "ico" }, e(Alarm)), e("div", null, e("span", null, "Sessions to mark"), e("strong", null, String(toMark)))),
      e("div", { className: "th2-kpi violet" }, e("span", { className: "ico" }, e(Cal)), e("div", null, e("span", null, "Next session"), e("strong", null, next ? dayLabel(next.date) : "—")))
    ),
    e("div", { className: "th2-fchips" },
      ["All", "Upcoming", "Today", "Past", "To mark"].map((c) => e("button", { key: c, className: "th2-fchip" + (chip === c ? " on" : ""), onClick: () => setChip(c) }, c)),
      e("button", { className: "th2-tog" + (byStu ? " on" : ""), onClick: () => setByStu((v) => !v) }, "By student"),
      e("button", { className: "th2-btn", onClick: pdfMatrix }, "View PDF"),
      e("button", { className: "th2-btn", onClick: () => {
        const head = ["Name (ID)", "Student ID", ...sessSorted.map((s) => shortSess(s)), "Attendance %", "Absences"];
        const lines = [head.join(",")].concat(ens.map((en) => {
          const info = attendancePct(cid, en.uid, pack);
          const ni = nameWithId(en.studentName, id7(en));
          const cells = sessSorted.map((s) => {
            const st = (atts.find((a) => a.sessionId === s.id && a.uid === en.uid) || {}).status || "";
            return st === "present" ? "P" : st === "late" ? "L" : st === "absent" ? "A" : st === "excused" ? "E" : "";
          });
          return [ni.label, ni.id, ...cells, info.display, info.absent].map((x) => '"' + String(x).replace(/"/g, '""') + '"').join(",");
        }));
        const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" })); a.download = "attendance-matrix.csv"; a.click();
      } }, "Export CSV")
    ),
    byStu ? e("div", { className: "th2-card th2-grd-wrap" },
      e("table", { className: "th2-table" },
        e("thead", null, e("tr", null, e("th", null, "Student"), sessSorted.map((s) => e("th", { key: s.id }, shortSess(s))), e("th", null, "%"))),
        e("tbody", null, ens.map((en) => {
          const info = attendancePct(cid, en.uid, pack);
          return e("tr", { key: en.uid },
          e("td", null, en.studentName),
          sessSorted.map((s) => {
            const st = (atts.find((a) => a.sessionId === s.id && a.uid === en.uid) || {}).status;
            const lab = st === "present" ? "Present" : st === "late" ? "Late" : st === "absent" ? "Absent" : st === "excused" ? "Excused" : "Not marked";
            return e("td", { key: s.id }, e("i", { className: "th2-dot " + (st || "none"), title: lab + " · " + shortSess(s) }));
          }),
          e("td", { title: info.tip }, info.pct == null ? "—" : info.display + "%")
          );
        }))
      ),
      e("div", { className: "th2-legend" },
        [["present", "Present"], ["late", "Late"], ["absent", "Absent"], ["excused", "Excused"], ["none", "Not marked"]].map(([k, l]) => e("span", { key: k }, e("i", { className: "th2-dot " + k }), l))
      )
    ) : e("div", { className: "th2-card" },
      !rows.length ? e("div", { className: "th2-empty" }, e(Cal), e("p", null, "No sessions yet")) :
      e("table", { className: "th2-table" },
        e("thead", null, e("tr", null, e("th", null, "Session"), e("th", null, "Date and time"), e("th", null, "Attendance"), e("th", null, "Status"), e("th", null, ""))),
        e("tbody", null, rows.flatMap((r) => {
          const mk = monthKey(r.s.date);
          const head = mk !== lastM ? [(lastM = mk, e("tr", { key: "m" + mk, className: "th2-month" }, e("td", { colSpan: 5 }, mk)))] : [];
          const courseS = courses.find((c) => c.id === r.s.courseId);
          const pct = ens.length ? Math.round((r.marked / ens.length) * 100) : 0;
          const present = atts.filter((a) => a.sessionId === r.s.id && (a.status === "present" || a.status === "late")).length;
          const pPct = r.marked ? Math.round((present / r.marked) * 100) : 0;
          return head.concat([e("tr", { key: r.s.id },
            e("td", null, e("b", { className: "th2-cname", title: r.s.title }, r.s.title || "Session"), e("div", { className: "th2-sub" }, (courseS?.title || ""), " ", e(StatusBadge, { course: courseS }))),
            e("td", null, e("div", null, dayLabel(r.s.date)), e("div", { className: "th2-sub" }, (r.s.startTime || "") + " – " + (r.s.endTime || ""))),
            e("td", null, e("div", { className: "th2-bar" }, e("span", null, r.marked + " / " + ens.length), e("i", null, e("b", { style: { width: pct + "%" } })), e("span", { className: "th2-sub" }, pPct + "% present"))),
            e("td", null, e("span", { className: "th2-pill " + r.kind.k }, r.kind.l)),
            e("td", { className: "th2-act" },
              e("button", { className: "th2-open", onClick: () => { setTrainerCourseId("attendance", r.s.courseId); go("attendance/" + r.s.id); } }, "Mark attendance"),
              e(RowMenu, { locked: isCourseLocked(courseS), items: [
                { label: "Edit", icon: "edit", lockWhenDone: true, onClick: () => setForm(r.s) },
                { label: "Duplicate", icon: "dup", lockWhenDone: true, onClick: async () => { try { await addDoc(collection(db, "sessions"), { courseId: r.s.courseId, title: r.s.title, date: r.s.date, startTime: r.s.startTime, endTime: r.s.endTime, meetingLink: r.s.meetingLink || "", notes: r.s.notes || "", status: "Scheduled", createdBy: uid, createdAt: serverTimestamp() }); refreshTrainerStore(uid); } catch (er) { await showNoticeDialog({ tone: "danger", title: "Could not duplicate", message: fbErr(er) }); } } },
                { label: "Delete", icon: "del", danger: true, lockWhenDone: true, onClick: async () => { const ok = await showConfirmDialog({ title: "Delete session?", message: "This cannot be undone.", tone: "danger", confirmLabel: "Delete" }); if (!ok || ok.ok === false) return; try { await deleteDoc(doc(db, "sessions", r.s.id)); refreshTrainerStore(uid); } catch (er) { await showNoticeDialog({ tone: "danger", title: "Could not delete", message: fbErr(er) }); } } }
              ] })
            )
          )]);
        }))
      )
    ),
    form ? e(SessionForm, { courses, uid, go, edit: form.id ? form : { courseId: cid }, onClose: () => setForm(null) }) : null
  );
}

function Page({ uid, go, sessionId, courseId }) {
  const [pack, setPack] = useState(getTrainerStore());
  useEffect(() => subscribeTrainerStore(setPack), []);
  useEffect(() => { if (uid) loadTrainerStore(uid); }, [uid]);
  if (!pack || !pack.extrasReady) return e("div", { className: "th2" }, e("div", { className: "th2-hero" }, e("h2", { style: { margin: 0 } }, "Attendance"), e("div", { className: "th2-skline", style: { height: 140 } })));
  if (sessionId) return e(MarkPage, { pack, uid, go, sessionId });
  return e(ListPage, { pack, uid, go, courseId });
}

let root;
export function renderTrainerAttendanceV2(host, props) {
  if (!host) return false;
  try {
    if (!root) root = createRoot(host);
    root.render(e(Boundary, null, e(Page, props)));
    return true;
  } catch (er) {
    host.innerHTML = `<p class="th2-err">${er.message || er} <button class="th2-btn" type="button" id="tav2r">Try again</button></p>`;
    host.querySelector("#tav2r")?.addEventListener("click", () => renderTrainerAttendanceV2(host, props));
    return false;
  }
}
