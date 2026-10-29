import { createElement as e, useEffect, useMemo, useRef, useState, Component } from "https://esm.sh/react@18.3.1";
import { createRoot } from "https://esm.sh/react-dom@18.3.1/client";
import { createPortal } from "https://esm.sh/react-dom@18.3.1";
import { db } from "./firebase-config.js?v=auth8";
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, Timestamp, updateDoc, where } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { getTrainerStore, loadTrainerStore, refreshTrainerStore, subscribeTrainerStore, setTrainerCourseId } from "./TrainerStore.js";
import { isCourseLocked } from "./course-lock.js";
import { showConfirmDialog } from "./ConfirmDialog.js";
import { exportAdminPdf } from "./AdminPdfExport.js";
import { CourseSelect, pickCreateCourseId, StatusBadge } from "./TrainerHomeworkV2.js";
import { RowMenu } from "./TrainerRowMenu.js";

const QZ_KEY = "ghz-trainer-qz-course";
function fbErr(er) { return (er?.code || "") + " " + (er?.message || er); }
function isPublished(q) { return String(q?.status || "") === "Published"; }
function isActiveCourse(c) { return c?.status === "Open" || c?.status === "Closed"; }
function initials(n) { return String(n || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0].toUpperCase()).join("") || "?"; }
function Plus() { return e("svg", { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2 }, e("path", { d: "M12 5v14M5 12h14" })); }
function Eye({ off }) {
  return e("svg", { width: 14, height: 14, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2 },
    off ? e("path", { d: "M17.94 17.94A10.94 10.94 0 0 1 12 20c-5 0-9.27-3.11-11-8 1.02-2.86 2.9-5.17 5.24-6.61M9.9 4.24A10.94 10.94 0 0 1 12 4c5 0 9.27 3.11 11 8a11.7 11.7 0 0 1-2.16 3.19M1 1l22 22M14.12 14.12A3 3 0 0 1 9.88 9.88" })
      : [e("path", { key: "a", d: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" }), e("circle", { key: "b", cx: 12, cy: 12, r: 3 })]);
}
function KpiIco({ kind }) {
  const p = {
    list: [e("rect", { key: 1, x: 8, y: 2, width: 8, height: 4, rx: 1 }), e("path", { key: 2, d: "M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" })],
    check: [e("path", { key: 1, d: "M9 11l3 3L22 4" }), e("path", { key: 2, d: "M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" })],
    chart: [e("path", { key: 1, d: "M3 3v18h18" }), e("path", { key: 2, d: "M7 14v4M12 9v9M17 11v7" })],
    users: [e("path", { key: 1, d: "M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" }), e("circle", { key: 2, cx: 9, cy: 7, r: 4 })]
  };
  return e("svg", { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8 }, p[kind]);
}
function fmtDate(v) {
  if (!v) return "—";
  const d = new Date(String(v).length > 12 ? v : v + "T00:00");
  if (isNaN(d)) return "—";
  const wd = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getDay()];
  const mo = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getMonth()];
  return wd + " " + d.getDate() + " " + mo;
}
function kindOf(q) {
  if (q.type === "mcq" && (q.options || []).join("|") === "True|False") return "tf";
  if (q.type === "text" && Number(q.points) >= 5) return "essay";
  if (q.type === "text") return "short";
  return "mcq";
}
function blankQ(kind) {
  if (kind === "tf") return { type: "mcq", text: "", options: ["True", "False"], points: 1, correct: 0, kind: "tf" };
  if (kind === "short") return { type: "text", text: "", points: 2, kind: "short" };
  if (kind === "essay") return { type: "text", text: "", points: 10, kind: "essay" };
  return { type: "mcq", text: "", options: ["", ""], points: 1, correct: 0, kind: "mcq" };
}

class Boundary extends Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err) { console.error("TrainerQuizzesV2", err); }
  render() {
    if (this.state.err) return e("div", { className: "th2" }, e("p", { className: "th2-err" }, String(this.state.err?.message || this.state.err)), e("button", { className: "th2-btn", onClick: () => this.setState({ err: null }) }, "Try again"));
    return this.props.children;
  }
}

function toLocalParts(ts, fallbackTime) {
  if (!ts) return { date: "", time: fallbackTime || "" };
  try {
    const d = ts.toDate ? ts.toDate() : (typeof ts === "string" ? new Date(ts.length <= 10 ? ts + "T" + (fallbackTime || "00:00") : ts) : new Date(ts));
    if (isNaN(d)) return { date: "", time: fallbackTime || "" };
    const pad = (n) => String(n).padStart(2, "0");
    return { date: d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()), time: pad(d.getHours()) + ":" + pad(d.getMinutes()) };
  } catch { return { date: "", time: fallbackTime || "" }; }
}
function stampFrom(date, time) {
  if (!date) return null;
  const d = new Date(date + "T" + (time || "00:00") + ":00");
  if (isNaN(d)) return null;
  return Timestamp.fromDate(d);
}
function fmtOpenLine(date, time) {
  if (!date) return "";
  try {
    const d = new Date(date + "T" + (time || "00:00"));
    if (isNaN(d)) return "";
    return d.toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch { return date; }
}
function QuizForm({ form, courses, uid, onClose, onSaved }) {
  const start0 = toLocalParts(form.startAt || form.availableFrom, "00:00");
  const end0 = toLocalParts(form.endAt || (form.dueDate ? form.dueDate : null), form.dueTime || "23:59");
  const [f, setF] = useState({
    id: form.id, title: form.title || "", instructions: form.instructions || "",
    courseId: form.courseId && isActiveCourse(courses.find((c) => c.id === form.courseId)) ? form.courseId : pickCreateCourseId(courses, form.courseId),
    timeLimitMinutes: form.timeLimitMinutes ?? "",
    startDate: start0.date, startTime: start0.time || "00:00",
    endDate: end0.date || form.dueDate || "", endTime: end0.time || "23:59",
    status: form.status || "Published", questions: form.questions || [blankQ("mcq")]
  });
  const [err, setErr] = useState({});
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const titleRef = useRef(null);
  const course = courses.find((c) => c.id === f.courseId);
  const locked = isCourseLocked(course);
  const noActive = !courses.some(isActiveCourse);
  const tot = (f.questions || []).reduce((n, q) => n + Number(q.points || 0), 0);
  const qBody = useRef(null);
  useEffect(() => { requestAnimationFrame(() => titleRef.current?.focus()); }, []);
  const close = () => onClose();
  const startMs = f.startDate ? new Date(f.startDate + "T" + (f.startTime || "00:00")).getTime() : 0;
  const endMs = f.endDate ? new Date(f.endDate + "T" + (f.endTime || "23:59")).getTime() : 0;
  const save = async () => {
    if (locked || noActive) return;
    const eobj = {};
    if (!f.courseId) eobj.courseId = "Choose a course";
    if (!String(f.title).trim()) eobj.title = "Title is required";
    if (!(f.questions || []).length) eobj.q = "Add at least one question";
    if (f.startDate && f.endDate && endMs <= startMs) eobj.sched = "End must be after start";
    (f.questions || []).forEach((q, i) => {
      if (!String(q.text || "").trim()) eobj["q" + i] = "Question text is required";
      if (!Number(q.points)) eobj["qp" + i] = "Points required";
      if (q.type === "mcq" && (q.correct == null || q.correct === "")) eobj["qc" + i] = "Pick a correct option";
    });
    setErr(eobj);
    if (Object.keys(eobj).length) {
      requestAnimationFrame(() => qBody.current?.querySelector(".th2-ferr")?.scrollIntoView({ block: "center" }));
      return;
    }
    setBusy(true);
    const startAt = stampFrom(f.startDate, f.startTime || "00:00");
    const endAt = stampFrom(f.endDate, f.endTime || "23:59");
    const payload = {
      courseId: f.courseId,
      title: f.title.trim(),
      instructions: String(f.instructions || "").trim(),
      timeLimitMinutes: f.timeLimitMinutes === "" || f.timeLimitMinutes == null ? null : Number(f.timeLimitMinutes),
      dueDate: f.endDate || "",
      startAt, endAt,
      status: f.status || "Draft",
      createdBy: uid
    };
    try {
      let qid = f.id;
      if (qid) await updateDoc(doc(db, "quizzes", qid), payload);
      else {
        const ref = await addDoc(collection(db, "quizzes"), { ...payload, createdAt: serverTimestamp() });
        qid = ref.id;
      }
      const old = await getDocs(query(collection(db, "quizQuestions"), where("courseId", "==", f.courseId), where("quizId", "==", qid)));
      for (const d of old.docs) await deleteDoc(d.ref);
      const answers = {};
      for (let i = 0; i < f.questions.length; i++) {
        const q = f.questions[i];
        const body = { quizId: qid, courseId: f.courseId, order: i, type: q.type, text: q.text, points: Number(q.points || 1) };
        if (q.type === "mcq") body.options = (q.options || []).slice(0, 8);
        if (q.type === "text" && q.accepted) body.accepted = String(q.accepted);
        if (q.type === "text" && q.model) body.model = String(q.model);
        const ref = await addDoc(collection(db, "quizQuestions"), body);
        if (q.type === "mcq") answers[ref.id] = Number(q.correct || 0);
      }
      await setDoc(doc(db, "quizKeys", qid), { courseId: f.courseId, answers });
      setSaved(true);
      onSaved?.();
      setTimeout(() => onClose(), 800);
    } catch (er) { setErr({ form: fbErr(er) }); }
    setBusy(false);
  };
  const setQ = (i, patch) => { const n = f.questions.slice(); n[i] = { ...n[i], ...patch }; setF({ ...f, questions: n }); };
  const addQ = (k) => {
    setF({ ...f, questions: [...f.questions, blankQ(k)] });
    requestAnimationFrame(() => {
      const els = qBody.current?.querySelectorAll(".th2-qbuild");
      const last = els?.[els.length - 1];
      last?.scrollIntoView({ block: "center" });
      last?.querySelector("textarea, input")?.focus();
    });
  };
  const preview = [f.startDate ? "Opens " + fmtOpenLine(f.startDate, f.startTime) : "", f.endDate ? "closes " + fmtOpenLine(f.endDate, f.endTime) : "", Number(f.timeLimitMinutes) > 0 ? f.timeLimitMinutes + " min per attempt" : "No time limit"].filter(Boolean).join(" · ");
  const letters = "ABCDEFGH";
  const body = e("div", { className: "th2-dlg-scrim", onClick: (ev) => { if (ev.target === ev.currentTarget) close(); } },
    saved ? e("div", { className: "th2-savedbox" }, "Saved") : null,
    e("div", { className: "th2-dlg", role: "dialog", "aria-labelledby": "qzFormTitle" },
      e("div", { className: "th2-dlg-h" }, e("div", { className: "th2-dlg-ico", "aria-hidden": true }, "?"), e("div", null, e("h3", { id: "qzFormTitle" }, f.id ? "Edit quiz" : "Create quiz"), e("p", null, course?.title || "Choose a course")), e("button", { className: "th2-dlg-x", onClick: close, "aria-label": "Close" }, "×")),
      e("div", { className: "th2-dlg-b", ref: qBody },
        locked ? e("div", { className: "th2-lockban" }, "This course is completed — quizzes can't be added") : null,
        e("div", { className: "th2-sec" }, e("h4", null, "Basics"),
          e("div", { className: "th2-dlg-f" }, e("label", null, "Course"), e(CourseSelect, { courses, cid: f.courseId, hideAll: true, disableLocked: true, onPick: (id) => setF({ ...f, courseId: id }) }), noActive ? e("p", { className: "th2-ferr" }, "No active course available") : null, err.courseId ? e("span", { className: "th2-ferr" }, err.courseId) : null),
          e("div", { className: "th2-dlg-f" }, e("label", null, "Title"), e("input", { ref: titleRef, value: f.title, onChange: (ev) => setF({ ...f, title: ev.target.value }) }), err.title ? e("span", { className: "th2-ferr" }, err.title) : null),
          e("div", { className: "th2-dlg-f" }, e("label", null, "Instructions"), e("textarea", { rows: 4, maxLength: 2000, value: f.instructions, onChange: (ev) => setF({ ...f, instructions: ev.target.value }) }), e("span", { className: "th2-count" + (String(f.instructions).length > 1900 ? " th2-count-warn" : "") }, String(f.instructions || "").length + " / 2000"))
        ),
        e("div", { className: "th2-sec" }, e("h4", null, "Schedule"),
          e("div", { className: "th2-2col" },
            e("div", { className: "th2-dlg-f" }, e("label", null, "Start date"), e("input", { type: "date", value: f.startDate, onChange: (ev) => setF({ ...f, startDate: ev.target.value }) })),
            e("div", { className: "th2-dlg-f" }, e("label", null, "Start time"), e("input", { type: "time", value: f.startTime, onChange: (ev) => setF({ ...f, startTime: ev.target.value }) })),
            e("div", { className: "th2-dlg-f" }, e("label", null, "End date"), e("input", { type: "date", value: f.endDate, onChange: (ev) => setF({ ...f, endDate: ev.target.value }) })),
            e("div", { className: "th2-dlg-f" }, e("label", null, "End time"), e("input", { type: "time", value: f.endTime, onChange: (ev) => setF({ ...f, endTime: ev.target.value }) }))
          ),
          e("div", { className: "th2-dlg-f" }, e("label", null, "Time limit (minutes)"), e("input", { type: "number", min: 0, value: f.timeLimitMinutes, onChange: (ev) => setF({ ...f, timeLimitMinutes: ev.target.value }) }), e("p", { className: "th2-hint" }, "No limit if empty")),
          err.sched ? e("p", { className: "th2-ferr" }, err.sched) : null,
          e("p", { className: "th2-hint" }, preview || "Set a start and end so students know when this quiz is open")
        ),
        e("div", { className: "th2-sec" }, e("h4", null, "Visibility"),
          e("div", { className: "th2-seg" },
            e("button", { type: "button", className: f.status === "Published" ? "on" : "", onClick: () => setF({ ...f, status: "Published" }) }, "Published"),
            e("button", { type: "button", className: f.status === "Draft" ? "on" : "", onClick: () => setF({ ...f, status: "Draft" }) }, "Draft")),
          e("p", { className: "th2-hint" }, "Draft quizzes are hidden from students until you publish")
        ),
        e("div", { className: "th2-sec" }, e("h4", null, "Questions · " + (f.questions || []).length + " · " + tot + " points total"),
        (f.questions || []).map((q, i) => e("div", { key: i, className: "th2-qbuild k-" + kindOf(q) },
          e("div", { className: "th2-qbuild-h" },
            e("span", { className: "th2-drag", "aria-hidden": true }, "⋮⋮"),
            e("div", { className: "th2-kindpills" },
              [["mcq", "Multiple choice"], ["tf", "True / False"], ["short", "Short answer"], ["essay", "Essay"]].map(([k, l]) =>
                e("button", { type: "button", key: k, className: kindOf(q) === k ? "on" : "", onClick: () => { const nq = blankQ(k); nq.text = q.text; nq.points = q.points; setQ(i, nq); } }, l))),
            e("textarea", { placeholder: "Question", value: q.text, onChange: (ev) => setQ(i, { text: ev.target.value }) }),
            e("span", { className: "th2-pts" }, e("input", { type: "number", min: 1, value: q.points, onChange: (ev) => setQ(i, { points: Number(ev.target.value) }) }), " pts")
          ),
          err["q" + i] ? e("span", { className: "th2-ferr" }, err["q" + i]) : null,
          err["qc" + i] ? e("span", { className: "th2-ferr" }, err["qc" + i]) : null,
          kindOf(q) === "tf" ? e("div", { className: "th2-tf2" }, (q.options || ["True", "False"]).map((o, oi) => e("button", { type: "button", key: oi, className: Number(q.correct) === oi ? "on" : "", onClick: () => setQ(i, { correct: oi }) }, o))) : null,
          kindOf(q) === "mcq" ? e("div", { className: "th2-opts" },
            (q.options || []).map((o, oi) => e("div", { key: oi, className: "th2-optrow" },
              e("span", { className: "th2-let" }, letters[oi] || oi),
              e("input", { value: o, onChange: (ev) => { const op = (q.options || []).slice(); op[oi] = ev.target.value; setQ(i, { options: op }); } }),
              e("button", { type: "button", className: "th2-oktog" + (Number(q.correct) === oi ? " on" : ""), onClick: () => setQ(i, { correct: oi }), "aria-label": "Correct" }, "✓"),
              (q.options || []).length > 2 ? e("button", { type: "button", className: "th2-btn", onClick: () => { const op = (q.options || []).filter((_, n) => n !== oi); setQ(i, { options: op, correct: Math.min(Number(q.correct) || 0, op.length - 1) }); } }, "×") : null
            )),
            (q.options || []).length < 8 ? e("button", { type: "button", className: "th2-btn", onClick: () => setQ(i, { options: [...(q.options || []), ""] }) }, "+ Add option") : null
          ) : null,
          kindOf(q) === "short" ? e("div", { className: "th2-dlg-f" }, e("label", null, "Accepted answer (optional)"), e("input", { value: q.accepted || "", onChange: (ev) => setQ(i, { accepted: ev.target.value }) }), e("p", { className: "th2-hint" }, "Leave empty for manual grading")) : null,
          kindOf(q) === "essay" ? e("div", { className: "th2-dlg-f" }, e("label", null, "Model answer (trainer only)"), e("textarea", { rows: 3, value: q.model || "", onChange: (ev) => setQ(i, { model: ev.target.value }) }), e("p", { className: "th2-hint" }, "Manual grading")) : null,
          e("div", { className: "th2-qfoot" },
            e("button", { type: "button", className: "th2-btn", onClick: () => { const n = f.questions.slice(); if (i) { const t = n[i - 1]; n[i - 1] = n[i]; n[i] = t; setF({ ...f, questions: n }); } } }, "↑"),
            e("button", { type: "button", className: "th2-btn", onClick: () => { const n = f.questions.slice(); if (i < n.length - 1) { const t = n[i + 1]; n[i + 1] = n[i]; n[i] = t; setF({ ...f, questions: n }); } } }, "↓"),
            e("button", { type: "button", className: "th2-btn", onClick: () => { const n = f.questions.slice(); n.splice(i, 0, { ...q, options: (q.options || []).slice() }); setF({ ...f, questions: n }); } }, "Duplicate"),
            e("button", { type: "button", className: "th2-btn", onClick: async () => {
              if (String(q.text || "").trim()) {
                const ok = await showConfirmDialog({ title: "Delete question?", message: q.text, tone: "danger", confirmLabel: "Delete" });
                if (!ok) return;
              }
              setF({ ...f, questions: f.questions.filter((_, n) => n !== i) });
            } }, "Delete")
          )
        )),
        e("div", { className: "th2-addbar" }, [["mcq", "Multiple choice"], ["tf", "True / False"], ["short", "Short answer"], ["essay", "Essay"]].map(([k, l]) => e("button", { type: "button", key: k, className: "th2-addtile", onClick: () => addQ(k) }, l))),
        err.q ? e("p", { className: "th2-ferr" }, err.q) : null,
        err.form ? e("p", { className: "th2-ferr" }, err.form) : null
        )
      ),
      e("div", { className: "th2-dlg-ft" },
        e("span", { className: "th2-hint", style: { marginRight: "auto" } }, (f.questions || []).length + " questions · " + tot + " points"),
        e("button", { className: "th2-btn", onClick: close }, "Cancel"),
        e("button", { className: "th2-btn pri", disabled: locked || busy || noActive, onClick: save }, busy ? "Saving…" : "Save quiz"))
    )
  );
  return createPortal(body, document.body);
}

function id7(en) {
  const s = String(en?.studentId || en?.id7 || "").replace(/\D/g, "");
  return s ? s.padStart(7, "0").slice(-7) : "—";
}
function qTypeLabel(qq) {
  const k = kindOf(qq);
  return k === "tf" ? "True/False" : k === "essay" ? "Essay" : k === "short" ? "Short answer" : "Multiple choice";
}
function fmtWhen(v) {
  if (!v) return "";
  try {
    const d = v.toDate ? v.toDate() : new Date(v);
    if (isNaN(d)) return "";
    return d.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}
function timeTaken(at) {
  const sec = Number(at?.timeTakenSec ?? at?.durationSec ?? at?.elapsedSec);
  if (Number.isFinite(sec) && sec > 0) {
    const m = Math.floor(sec / 60), s = Math.round(sec % 60);
    return m ? m + "m " + s + "s" : s + "s";
  }
  return "";
}
function Review({ pack, quiz, uid, go }) {
  const course = (pack.courses || []).find((c) => c.id === quiz.courseId) || {};
  useEffect(() => { if (quiz.courseId) setTrainerCourseId("quizzes", quiz.courseId); }, [quiz.courseId]);
  const locked = isCourseLocked(course);
  const ens = (pack.enrollments || []).filter((en) => en.courseId === quiz.courseId && String(en.status || "").toLowerCase() !== "cancelled");
  const atts = (pack.quizAttempts || []).filter((a) => a.quizId === quiz.id);
  const questions = (pack.quizQuestions || []).filter((q) => q.quizId === quiz.id).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  const maxAll = questions.reduce((s, q) => s + Number(q.points || 0), 0) || Number(atts[0]?.maxScore) || 0;
  const [sel, setSel] = useState(ens[0]?.uid || "");
  const [filter, setFilter] = useState("All");
  const [q, setQ] = useState("");
  const [scores, setScores] = useState({});
  const [notes, setNotes] = useState({});
  const [key, setKey] = useState({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    getDoc(doc(db, "quizKeys", quiz.id)).then((s) => setKey(s.exists() ? (s.data().answers || {}) : {})).catch((er) => setErr(fbErr(er)));
  }, [quiz.id]);
  const rowKind = (at) => !at ? "missing" : at.status === "graded" ? "graded" : at.status === "partial" ? "partial" : "submitted";
  const rows = ens.map((en) => ({ en, at: atts.find((a) => a.uid === en.uid), kind: rowKind(atts.find((a) => a.uid === en.uid)) }));
  const vis = rows.filter((r) => {
    const hay = ((r.en.studentName || "") + " " + id7(r.en)).toLowerCase();
    if (q && !hay.includes(q.toLowerCase())) return false;
    if (filter === "To grade") return r.kind === "submitted" || r.kind === "partial";
    if (filter === "Graded") return r.kind === "graded";
    if (filter === "Missing") return r.kind === "missing";
    return true;
  });
  const cur = vis.find((r) => r.en.uid === sel) || vis[0];
  useEffect(() => { if (cur?.at) setScores({ ...(cur.at.questionScores || {}) }); }, [cur?.at?.id]);
  const graded = atts.filter((a) => a.status === "graded");
  const avgPts = graded.length ? graded.reduce((n, a) => n + Number(a.score || 0), 0) / graded.length : 0;
  const avgPct = maxAll ? Math.round(avgPts / maxAll * 100) : 0;
  const hi = graded.length ? Math.max(...graded.map((a) => Number(a.score || 0))) : 0;
  const buckets = [0, 0, 0, 0, 0];
  const bands = [[0, 49], [50, 59], [60, 69], [70, 79], [80, 100]];
  graded.forEach((a) => {
    const p = maxAll ? Math.round(Number(a.score || 0) / maxAll * 100) : 0;
    const i = p < 50 ? 0 : p < 60 ? 1 : p < 70 ? 2 : p < 80 ? 3 : 4;
    buckets[i]++;
  });
  const liveScore = () => {
    if (!cur?.at) return 0;
    let s = 0;
    questions.forEach((qq) => {
      if (qq.type === "mcq") {
        const chosen = (cur.at.answers || {})[qq.id];
        s += Number(chosen) === Number(key[qq.id]) ? Number(qq.points || 0) : 0;
      } else s += Number(scores[qq.id] || 0);
    });
    return s;
  };
  const save = async (next) => {
    if (!cur?.at || locked) return;
    setBusy(true); setErr("");
    const questionScores = { ...scores };
    questions.forEach((qq) => {
      if (qq.type === "mcq") {
        const chosen = (cur.at.answers || {})[qq.id];
        questionScores[qq.id] = Number(chosen) === Number(key[qq.id]) ? Number(qq.points || 0) : 0;
      }
    });
    const score = questions.reduce((s, qq) => s + Number(questionScores[qq.id] || 0), 0);
    const all = questions.every((qq) => questionScores[qq.id] != null);
    try {
      await updateDoc(doc(db, "quizAttempts", cur.at.id), {
        questionScores, score: Number(score), maxScore: Number(maxAll),
        gradedBy: uid, gradedAt: serverTimestamp(),
        status: all ? "graded" : "partial"
      });
      setSaved(true);
      try { window.__ghzBumpActive?.(); } catch (_) {}
      refreshTrainerStore(uid);
      setTimeout(() => setSaved(false), 900);
      if (next) {
        const i = vis.findIndex((r) => r.en.uid === cur.en.uid);
        const n = vis[i + 1] || vis[0];
        if (n) setSel(n.en.uid);
      }
    } catch (er) { setErr(fbErr(er)); }
    setBusy(false);
  };
  useEffect(() => {
    const onKey = (ev) => {
      if (ev.key === "ArrowDown") { ev.preventDefault(); const i = vis.findIndex((r) => r.en.uid === cur?.en.uid); if (vis[i + 1]) setSel(vis[i + 1].en.uid); }
      if (ev.key === "ArrowUp") { ev.preventDefault(); const i = vis.findIndex((r) => r.en.uid === cur?.en.uid); if (vis[i - 1]) setSel(vis[i - 1].en.uid); }
      if ((ev.ctrlKey || ev.metaKey) && ev.key === "Enter") { ev.preventDefault(); save(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  const csv = () => {
    const lines = [["Student", "ID", "Status", "Score", "Percent"].join(",")].concat(rows.map((r) => {
      const sc = r.at?.score; const pct = maxAll ? Math.round(Number(sc || 0) / maxAll * 100) : "";
      return [JSON.stringify(r.en.studentName || ""), id7(r.en), r.kind, sc ?? "", pct].join(",");
    }));
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "quiz-results.csv"; a.click();
  };
  const pdf = () => exportAdminPdf({
    page: quiz.title + " results",
    columns: [{ key: "n", label: "Student" }, { key: "id", label: "ID" }, { key: "st", label: "Status" }, { key: "sc", label: "Score" }, { key: "p", label: "Percent" }],
    rows: rows.map((r) => ({ n: r.en.studentName || "", id: id7(r.en), st: r.kind, sc: r.at?.score ?? "—", p: maxAll && r.at ? Math.round(Number(r.at.score || 0) / maxAll * 100) + "%" : "—" }))
  });
  const pts = questions.reduce((n, x) => n + Number(x.points || 0), 0);
  const live = liveScore();
  const livePct = maxAll ? Math.round(live / maxAll * 100) : 0;
  const bump = (qid, max, d) => {
    const curV = Number(scores[qid] || 0);
    const next = Math.max(0, Math.min(max, curV + d));
    setScores({ ...scores, [qid]: next });
  };
  return e("div", { className: "th2 th2-qrev" },
    saved ? e("div", { className: "th2-savedbox" }, "Saved") : null,
    e("div", { className: "th2-hero th2-qrev-head" },
      e("div", { className: "th2-qrev-top" },
        e("div", { style: { minWidth: 0 } },
          e("button", { type: "button", className: "th2-backpill", "data-nav": course?.id ? ("quizzes?course=" + course.id) : "quizzes", "aria-label": "Back to Quizzes" }, "← Quizzes"),
          e("h2", { style: { margin: "10px 0 6px" } }, quiz.title),
          e("div", { className: "th2-optrow" }, e("span", { className: "th2-sub" }, course.title || ""), e(StatusBadge, { course })),
          e("div", { className: "th2-qrev-chips" },
            e("span", { className: "th2-chip" }, "Due " + fmtDate(quiz.dueDate)),
            e("span", { className: "th2-chip" }, (Number(quiz.timeLimitMinutes) > 0 ? quiz.timeLimitMinutes + " min" : "No limit")),
            e("span", { className: "th2-chip" }, questions.length + " questions"),
            e("span", { className: "th2-chip" }, pts + " pts")
          )
        ),
        e("div", { className: "th2-avg-acts" },
          e("button", { type: "button", className: "th2-btn", onClick: csv }, "Export CSV"),
          e("button", { type: "button", className: "th2-btn", onClick: pdf }, "View PDF"))
      ),
      locked ? e("div", { className: "th2-lockban" }, "This course is completed — grades are locked") : null,
      e("div", { className: "th2-stats" },
        [["Attempts", atts.length, "users"], ["Graded", graded.length, "check"], ["Average score", (graded.length ? avgPct + "% · " + Math.round(avgPts * 10) / 10 + " / " + maxAll : "—"), "chart"], ["Highest", hi + " / " + maxAll, "list"]].map(([l, v, k]) =>
          e("div", { className: "th2-tile th2-kpi", key: l }, e("span", { className: "th2-kpiico" }, e(KpiIco, { kind: k })), e("div", null, e("b", null, String(v)), e("span", null, l))))
      ),
      e("div", { className: "th2-dist" },
        e("h3", null, "Score distribution"),
        e("div", { className: "th2-distbars" }, bands.map((b, i) => {
          const n = buckets[i]; const h = Math.max(4, Math.round((n / Math.max(1, ...buckets)) * 90));
          return e("div", { key: i, className: "th2-distcol" },
            e("span", { className: "th2-distn" }, String(n)),
            e("i", { style: { height: h + "px" } }),
            e("small", null, b[0] + "–" + b[1]));
        }))
      )
    ),
    e("div", { className: "th2-split" },
      e("div", { className: "th2-list th2-qrev-list" },
        e("div", { className: "th2-qrev-prog" }, graded.length + " of " + ens.length + " graded"),
        e("input", { placeholder: "Search students", value: q, onChange: (ev) => setQ(ev.target.value) }),
        e("div", { className: "th2-fchips" }, ["All", "To grade", "Graded", "Missing"].map((x) => e("button", { type: "button", key: x, className: "th2-fchip" + (filter === x ? " on" : ""), onClick: () => setFilter(x) }, x))),
        e("div", { className: "th2-qrev-scroll" }, vis.map((r) => {
          const sc = r.at?.score; const mx = r.at?.maxScore || maxAll; const pct = mx ? Math.round(Number(sc || 0) / mx * 100) : 0;
          return e("button", { type: "button", key: r.en.uid, className: "th2-stu" + (cur?.en.uid === r.en.uid ? " on" : ""), onClick: () => setSel(r.en.uid) },
            e("span", { className: "th2-av" }, initials(r.en.studentName)),
            e("div", { style: { minWidth: 0, flex: 1 } }, e("strong", { className: "th2-ell" }, r.en.studentName || "Student"), e("small", null, id7(r.en))),
            e("span", { className: "th2-pill " + r.kind }, r.kind === "missing" ? "Missing" : r.kind === "graded" ? "Graded" : r.kind === "partial" ? "Partial" : "To grade"),
            r.at && sc != null ? e("div", { className: "th2-scmini" }, e("span", null, sc + " / " + mx), e("i", null, e("b", { style: { width: pct + "%", background: pct >= 70 ? "#16a34a" : pct >= 50 ? "#d97706" : "#dc2626" } }))) : null
          );
        }))
      ),
      e("div", { className: "th2-panel th2-qrev-panel" },
        !cur ? e("p", null, "Select a student") : !cur.at ? e("div", { className: "th2-empty" }, e("div", { style: { fontSize: 28 } }, "⏱"), e("p", null, "No attempt yet")) : e("div", { className: "th2-qrev-body" },
          e("div", { className: "th2-qrev-stuhead" },
            e("div", null,
              e("h3", { style: { margin: 0 } }, cur.en.studentName || "Student"),
              e("p", { className: "th2-sub" }, id7(cur.en) + (fmtWhen(cur.at.submittedAt) ? " · " + fmtWhen(cur.at.submittedAt) : "") + (timeTaken(cur.at) ? " · Time taken " + timeTaken(cur.at) : ""))
            ),
            e("div", { className: "th2-scorebig " + (livePct >= 70 ? "pass" : "fail") }, live + " / " + maxAll + " · " + livePct + "%")
          ),
          questions.map((qq, qi) => {
            const ans = (cur.at.answers || {})[qq.id];
            const auto = qq.type === "mcq";
            const ok = auto && Number(ans) === Number(key[qq.id]);
            const chosen = auto ? (qq.options?.[Number(ans)] ?? ans) : ans;
            const correct = auto ? (qq.options?.[Number(key[qq.id])] ?? key[qq.id]) : null;
            const maxP = Number(qq.points || 0);
            return e("article", { key: qq.id, className: "th2-qcard" },
              e("div", { className: "th2-qcard-top" },
                e("span", { className: "th2-qno" }, String(qi + 1)),
                e("strong", { style: { flex: 1 } }, qq.text || "Question"),
                e("span", { className: "th2-chip" }, qTypeLabel(qq)),
                e("span", { className: "th2-chip" }, maxP + " pts")
              ),
              e("div", { className: "th2-ans " + (auto ? (ok ? "ok" : "bad") : "") },
                e("span", { className: "th2-ansl" }, "Student answer", auto ? (ok ? " ✓" : " ✗") : ""),
                e("div", null, String(chosen ?? "—"))
              ),
              auto ? e("div", { className: "th2-ans ok" }, e("span", { className: "th2-ansl" }, "Correct answer"), e("div", null, String(correct ?? "—"))) : null,
              auto ? e("span", { className: "th2-chip" }, (ok ? maxP : 0) + " / " + maxP)
                : e("div", { className: "th2-man" },
                    e("div", { className: "th2-step" },
                      e("button", { type: "button", className: "th2-btn", disabled: locked, onClick: () => bump(qq.id, maxP, -1) }, "−"),
                      e("input", { type: "number", min: 0, max: maxP, disabled: locked, value: scores[qq.id] ?? "", onChange: (ev) => {
                        const n = ev.target.value === "" ? null : Number(ev.target.value);
                        if (n != null && (!Number.isFinite(n) || n < 0 || n > maxP)) return;
                        setScores({ ...scores, [qq.id]: n });
                      } }),
                      e("span", null, "/ " + maxP),
                      e("button", { type: "button", className: "th2-btn", disabled: locked, onClick: () => bump(qq.id, maxP, 1) }, "+")
                    ),
                    e("textarea", { placeholder: "Optional comment", value: notes[qq.id] || "", onChange: (ev) => setNotes({ ...notes, [qq.id]: ev.target.value }) })
                  )
            );
          }),
          err ? e("p", { className: "th2-err" }, err) : null,
          e("div", { className: "th2-qrev-foot" },
            e("strong", null, live + " / " + maxAll),
            e("button", { type: "button", className: "th2-btn", disabled: !vis.length, onClick: () => { const i = vis.findIndex((r) => r.en.uid === cur.en.uid); if (vis[i - 1]) setSel(vis[i - 1].en.uid); } }, "Prev"),
            e("button", { type: "button", className: "th2-btn", disabled: !vis.length, onClick: () => { const i = vis.findIndex((r) => r.en.uid === cur.en.uid); if (vis[i + 1]) setSel(vis[i + 1].en.uid); } }, "Next"),
            e("button", { type: "button", className: "th2-btn pri", disabled: locked || busy || !cur.at, onClick: () => save(false) }, busy ? "Saving…" : "Save grade"),
            e("button", { type: "button", className: "th2-btn", disabled: locked || busy || !cur.at, onClick: () => save(true) }, "Save & next student"),
            e("small", { className: "th2-sub" }, "↑ ↓ · Ctrl+Enter")
          )
        )
      )
    )
  );
}

function Page({ uid, go, quizId, courseId }) {
  const [pack, setPack] = useState(getTrainerStore());
  const [cid, setCid] = useState(() => { try { return sessionStorage.getItem(QZ_KEY) || ""; } catch { return ""; } });
  useEffect(() => { if (courseId) { setCid(courseId); setTrainerCourseId("quizzes", courseId); try { sessionStorage.setItem(QZ_KEY, courseId); } catch {} } }, [courseId]);
  const [form, setForm] = useState(null);
  const [visFilter, setVisFilter] = useState("All");
  const [menu, setMenu] = useState("");
  useEffect(() => subscribeTrainerStore(setPack), []);
  useEffect(() => { if (uid) loadTrainerStore(uid); }, [uid]);
  const pick = (id) => { setCid(id); setTrainerCourseId("quizzes", id); try { sessionStorage.setItem(QZ_KEY, id); } catch {}; go(id ? ("quizzes?course=" + id) : "quizzes"); };
  const courses = pack?.courses || [];
  const quizzes = pack?.quizzes || [];
  const atts = pack?.quizAttempts || [];
  const qqs = pack?.quizQuestions || [];
  const ens = pack?.enrollments || [];
  const course = (id) => courses.find((c) => c.id === id);
  const createDisabled = !!cid && isCourseLocked(course(cid));
  const counts = useMemo(() => {
    const o = {};
    courses.forEach((c) => {
      o[c.id] = {
        items: quizzes.filter((x) => x.courseId === c.id).length,
        students: ens.filter((en) => en.courseId === c.id && String(en.status || "").toLowerCase() !== "cancelled").length
      };
    });
    return o;
  }, [courses, quizzes, ens]);
  let list = quizzes.filter((q) => !cid || q.courseId === cid);
  if (visFilter === "Published") list = list.filter(isPublished);
  if (visFilter === "Draft") list = list.filter((q) => !isPublished(q));
  const awaiting = (q) => atts.filter((a) => a.quizId === q.id && a.status !== "graded").length;
  if (visFilter === "To grade") list = list.filter((q) => awaiting(q) > 0);
  const totalAwait = quizzes.filter((q) => !cid || q.courseId === cid).reduce((n, q) => n + awaiting(q), 0);
  const graded = atts.filter((a) => a.status === "graded" && quizzes.some((q) => q.id === a.quizId && (!cid || q.courseId === cid)));
  const avg = graded.length ? Math.round(graded.reduce((n, a) => n + Number(a.score || 0), 0) / graded.length) : "—";
  const partN = atts.filter((a) => quizzes.some((q) => q.id === a.quizId && (!cid || q.courseId === cid))).length;
  const stuN = ens.filter((en) => (!cid || en.courseId === cid) && String(en.status || "").toLowerCase() !== "cancelled").length;
  const part = stuN ? Math.round(partN / Math.max(1, list.length || 1) / stuN * 100) : "—";

  const openForm = async (quiz) => {
    if (!quiz) { setForm({ courseId: pickCreateCourseId(courses, cid), status: "Published", questions: [blankQ("mcq")] }); return; }
    const qs = qqs.filter((x) => x.quizId === quiz.id).sort((a, b) => (a.order || 0) - (b.order || 0));
    let answers = {};
    try { const kd = await getDoc(doc(db, "quizKeys", quiz.id)); answers = kd.exists() ? (kd.data().answers || {}) : {}; } catch {}
    setForm({ ...quiz, questions: qs.length ? qs.map((x) => ({ ...x, correct: answers[x.id] || 0, kind: kindOf(x) })) : [blankQ("mcq")] });
  };
  const dup = async (q) => {
    if (isCourseLocked(course(q.courseId))) return;
    await addDoc(collection(db, "quizzes"), { courseId: q.courseId, title: (q.title || "Quiz") + " (copy)", instructions: q.instructions || "", timeLimitMinutes: q.timeLimitMinutes ?? null, dueDate: q.dueDate || "", status: "Draft", createdBy: uid, createdAt: serverTimestamp() });
    refreshTrainerStore(uid);
  };
  const del = async (q) => {
    const ok = await showConfirmDialog({ title: "Delete quiz?", message: q.title, tone: "danger", confirmLabel: "Delete" });
    if (!ok) return;
    await deleteDoc(doc(db, "quizzes", q.id));
    refreshTrainerStore(uid);
  };
  const togglePub = async (q) => {
    if (isCourseLocked(course(q.courseId))) return;
    if (isPublished(q)) {
      const has = atts.some((a) => a.quizId === q.id);
      if (has) {
        const ok = await showConfirmDialog({ title: "Unpublish quiz?", message: "Students with attempts will no longer see this quiz until you publish it again.", tone: "danger", confirmLabel: "Unpublish" });
        if (!ok) return;
      }
      await updateDoc(doc(db, "quizzes", q.id), { status: "Draft" });
    } else await updateDoc(doc(db, "quizzes", q.id), { status: "Published" });
    refreshTrainerStore(uid);
  };

  if (quizId) {
    if (!pack) return e("div", { className: "th2" }, e("div", { className: "th2-skline" }));
    const quiz = quizzes.find((x) => x.id === quizId);
    if (!quiz) return e("div", { className: "th2" }, e("button", { type: "button", className: "th2-back", "data-nav": "quizzes", "aria-label": "Back to Quizzes" }, "← Quizzes"), e("p", null, "Quiz not found."));
    if (quiz.courseId) setTrainerCourseId("quizzes", quiz.courseId);
    return e(Review, { pack, quiz, uid, go });
  }

  const table = () => {
    if (pack?.quizErr && pack?.extrasReady) return e("div", { className: "th2-err" }, pack.quizErr, " ", e("button", { className: "th2-btn", onClick: () => refreshTrainerStore(uid) }, "Try again"));
    const cols = e("colgroup", null, ["c-main","c-det","c-due","c-att","c-vis","c-act"].map((c) => e("col", { key: c, className: c })));
    const heads = ["Quiz","Details","Available","Attempts","Visibility",""];
    if (!pack || !pack.extrasReady) return e("table", { className: "th2-table th2-qtable" }, cols, e("thead", null, e("tr", null, heads.map((h, i) => e("th", { key: h, className: i === 5 ? "th2-act" : "" }, h)))), e("tbody", null, [1,2,3].map((i) => e("tr", { key: i, className: "th2-sk" }, e("td", { colSpan: 6 }, e("b"))))));
    if (!list.length) return e("div", { className: "th2-empty" }, e("p", null, "No quizzes yet"), e("button", { className: "th2-create", disabled: createDisabled, title: createDisabled ? "Course is completed" : "", onClick: () => openForm() }, e(Plus), " Create quiz"));
    return e("table", { className: "th2-table th2-qtable" }, cols,
      e("thead", null, e("tr", null, heads.map((h, i) => e("th", { key: h, className: i === 5 ? "th2-act" : "" }, h)))),
      e("tbody", null, list.map((qz) => {
        const c = course(qz.courseId);
        const qs = qqs.filter((x) => x.quizId === qz.id);
        const total = ens.filter((en) => en.courseId === qz.courseId && String(en.status || "").toLowerCase() !== "cancelled").length;
        const attN = atts.filter((a) => a.quizId === qz.id).length;
        const grN = atts.filter((a) => a.quizId === qz.id && a.status === "graded").length;
        const pct = total ? Math.round(attN / total * 100) : 0;
        const pub = isPublished(qz);
        const lockedC = isCourseLocked(c);
        return e("tr", { key: qz.id },
          e("td", { title: (qz.title || "Quiz") + " · " + (c?.title || "") }, e("button", { className: "th2-back th2-ell", title: qz.title, onClick: () => go("quiz/" + qz.id) }, qz.title || "Quiz"), e("span", { className: "th2-sub" }, c?.title || qz.courseId, " ", e(StatusBadge, { course: c }))),
          e("td", { title: (qs.length || 0) + " qs · " + (qz.timeLimitMinutes ? qz.timeLimitMinutes + " min" : "no limit") }, (qs.length || 0) + " qs", e("span", { className: "th2-sub" }, qz.timeLimitMinutes ? qz.timeLimitMinutes + " min" : "No limit")),
          e("td", { title: (qz.startAt ? "Opens" : "") + " " + fmtDate(qz.dueDate) }, e("span", null, qz.startAt ? "Opens " + fmtWhen(qz.startAt) : "—"), e("span", { className: "th2-sub" }, "Closes " + (fmtWhen(qz.endAt) || fmtDate(qz.dueDate)))),
          e("td", { title: attN + " / " + total + " · graded " + grN }, e("span", { className: "th2-bar" }, attN + " / " + total, e("i", null, e("b", { style: { width: pct + "%" } }))), e("span", { className: "th2-sub" }, grN + " graded")),
          e("td", { title: pub ? "Visible to students" : "Hidden from students" }, e("span", { className: "th2-vis " + (pub ? "pub" : "draft") }, e(Eye, { off: !pub }), e("span", { className: "th2-vislab" }, pub ? "Published" : "Draft"))),
          e("td", { className: "th2-menurow th2-act" },
            e("div", { className: "th2-actsrow" },
              e("button", { className: "th2-review", onClick: () => go("quiz/" + qz.id) }, "Review"),
              e(RowMenu, { locked: lockedC, items: [
                { label: "Review", icon: "review", onClick: () => go("quiz/" + qz.id) },
                { label: "Edit", icon: "edit", lockWhenDone: true, onClick: () => openForm(qz) },
                { label: pub ? "Unpublish" : "Publish", icon: pub ? "unpublish" : "publish", lockWhenDone: true, onClick: () => togglePub(qz) },
                { label: "Duplicate", icon: "dup", lockWhenDone: true, onClick: () => dup(qz) },
                { label: "Delete", icon: "del", danger: true, lockWhenDone: true, onClick: () => del(qz) }
              ] })
            )
          )
        );
      }))
    );
  };

  return e("div", { className: "th2" },
    e("div", { className: "th2-head" },
      e("div", null, e("h2", null, "Quizzes"), e("p", null, "Quizzes for your courses"),
        e("div", { style: { marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" } },
          e(CourseSelect, { courses, cid, counts, countNoun: "quiz", onPick: pick }),
          e("div", { className: "th2-fchips" }, ["All", "Published", "Draft", "To grade"].map((x) => e("button", { key: x, className: "th2-fchip" + (visFilter === x ? " on" : ""), onClick: () => setVisFilter(x) }, x === "To grade" && totalAwait ? x + " · " + totalAwait : x)))
        )),
      e("div", { className: "th2-head-acts" },
        e("button", { type: "button", className: "th2-btn th2-avgbtn", onClick: () => { if (cid) go("quiz-averages/" + cid); else go("quiz-averages"); } }, e(KpiIco, { kind: "chart" }), " Quiz averages"),
        e("button", { className: "th2-create", disabled: createDisabled, title: createDisabled ? "Course is completed" : "", onClick: () => { if (!createDisabled) openForm(); } }, e(Plus), " Create quiz")
      )
    ),
    e("div", { className: "th2-kpis" },
      [["Total quizzes", quizzes.filter((q) => !cid || q.courseId === cid).length, "blue", "list"], ["Awaiting grading", totalAwait, "violet", "check"], ["Average score", avg, "teal", "chart"], ["Participation", part === "—" ? "—" : part + "%", "amber", "users"]].map(([l, v, k, ic]) =>
        e("div", { className: "th2-kpi " + k, key: l }, e("span", { className: "ico" }, e(KpiIco, { kind: ic })), e("div", null, e("span", null, l), e("strong", null, String(v)))))
    ),
    e("div", { className: "th2-card" }, table()),
    form ? e(QuizForm, { form, courses, uid, onClose: () => setForm(null), onSaved: () => refreshTrainerStore(uid) }) : null
  );
}

let root;
export function renderTrainerQuizzesV2(host, props) {
  if (!host) return false;
  try {
    if (!root) root = createRoot(host);
    root.render(e(Boundary, null, e(Page, props)));
    return true;
  } catch (err) {
    host.innerHTML = `<p class="th2-err">${String(err?.message || err)} <button type="button" class="th2-btn" id="tq2r">Try again</button></p>`;
    host.querySelector("#tq2r")?.addEventListener("click", () => renderTrainerQuizzesV2(host, props));
    return false;
  }
}
