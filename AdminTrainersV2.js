import { createElement as e, useEffect, useMemo, useState, Component } from "https://esm.sh/react@18.3.1";
import { createRoot } from "https://esm.sh/react-dom@18.3.1/client";
import { db } from "./firebase-config.js?v=auth8";
import { collection, getDocs, getDoc, doc, query, where } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { AdminPdfButton } from "./AdminPdfExport.js";
import { ConfirmDialog } from "./ConfirmDialog.js";
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
  componentDidCatch(err) { console.error("AdminTrainersV2", err); }
  render() {
    if (this.state.err) {
      return e("div", { className: "admin-trainers atv2" },
        e("p", { className: "atv2-err" }, "Trainers could not load"),);
    }
    return this.props.children;
  }
}

const initials = (n) => String(n || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
const avBg = (n) => { let h = 0; String(n || "").split("").forEach((c) => { h = (h * 17 + c.charCodeAt(0)) % 360; }); return `linear-gradient(135deg,hsl(${h},62%,42%),hsl(${(h + 40) % 360},70%,56%))`; };
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
  try {
    return new Date(ms).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}
function fmtDate(ms) {
  if (!ms) return "—";
  try { return new Date(ms).toLocaleDateString(); } catch { return "—"; }
}
function fbErr(err) { return err?.code || err?.message || String(err); }
function isCompleted(st) { return st === "Completed"; }
function isActiveCourse(st) { return st === "Open" || st === "Coming soon" || st === "Closed"; }
function courseForTrainer(c, tid) {
  const ids = c.trainerIds || (c.trainerId ? [c.trainerId] : []);
  return ids.includes(tid);
}

async function settledCol(col) {
  try {
    const snap = await getDocs(collection(db, col));
    return { ok: true, rows: snap.docs.map((d) => ({ id: d.id, ...d.data() })), err: null, col };
  } catch (err) {
    return { ok: false, rows: [], err: fbErr(err), col, shape: "list all (no where, no orderBy)" };
  }
}
async function settledWhere(col, field, val) {
  try {
    const snap = await getDocs(query(collection(db, col), where(field, "==", val)));
    return { ok: true, rows: snap.docs.map((d) => ({ id: d.id, ...d.data() })), err: null, col };
  } catch (err) {
    return { ok: false, rows: [], err: fbErr(err), col, shape: "where " + field + " == " + val + " (no orderBy)" };
  }
}

function icoPlus() {
  return e("svg", { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "#FFFFFF", strokeWidth: "2" },
    e("path", { d: "M12 5v14M5 12h14", strokeLinecap: "round" }));
}

function Menu({ t, onEdit, onResend, onWelcome, onToggle, close }) {
  const off = t.active === false;
  return e("div", { className: "atv2-menu", role: "menu", onClick: (ev) => ev.stopPropagation() },
    e("button", { type: "button", onClick: () => { close(); onResend(t); } }, "Resend password email"),
    e("button", { type: "button", onClick: () => { close(); onWelcome(t); } }, "Show welcome message"),
    e("button", { type: "button", className: off ? "ok" : "danger", onClick: () => { close(); onToggle(t); } },
      off ? "Activate" : "Deactivate")
  );
}

function Actions({ t, onEdit, onResend, onWelcome, onToggle }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (ev) => { if (ev.key === "Escape") setOpen(false); };
    const onDown = () => setOpen(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("click", onDown);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("click", onDown); };
  }, [open]);
  return e("div", { className: "atv2-act atv2-wrap", onClick: (ev) => ev.stopPropagation() },
    e("button", { type: "button", className: "atv2-edit", onClick: () => onEdit(t) }, "Edit"),
    e("button", { type: "button", className: "atv2-dots", "aria-label": "More actions", "aria-expanded": open, onClick: (ev) => { ev.stopPropagation(); setOpen((v) => !v); } }, "⋯"),
    open ? e(Menu, { t, onEdit, onResend, onWelcome, onToggle, close: () => setOpen(false) }) : null
  );
}

function CourseCounts({ total, activeN, doneN, titles }) {
  const tip = titles.length ? titles.join("\n") : "No courses";
  return e("div", { className: "atv2-cc", title: tip },
    e("strong", { title: tip }, String(total)),
    e("span", { className: "atv2-cpill blue" + (activeN === 0 ? " zero" : ""), title: tip }, activeN + " Active"),
    e("span", { className: "atv2-cpill green" + (doneN === 0 ? " zero" : ""), title: tip }, doneN + " Completed")
  );
}

function App(props) {
  const { trainers = [], courses = [], enrollments = [], enErr, extra, extraLoading, error, onRetry, onAdd, onEdit, onResend, onWelcome, onToggle, onRetryActivity } = props;
  const trainerList = Array.isArray(trainers) ? trainers : [];
  const courseList = Array.isArray(courses) ? courses : [];
  const enrollList = Array.isArray(enrollments) ? enrollments : [];
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(null);
  const [dtab, setDtab] = useState("profile");
  const [dlg, setDlg] = useState(null);
  const askToggle = (t) => {
    const off = t.active === false;
    setDlg({
      title: off ? "Activate this trainer?" : "Deactivate this trainer?",
      message: off ? "They will be able to sign in again." : "They will not be able to log in.",
      name: t.name,
      tone: off ? "info" : "danger",
      confirmLabel: off ? "Activate" : "Deactivate",
      onConfirm: async () => { await onToggle(t); setDlg(null); }
    });
  };

  const rows = useMemo(() => {
    return trainerList.map((t) => {
      const tid = t.id || t.uid;
      const mine = courseList.filter((c) => courseForTrainer(c, tid));
      const names = mine.map((c) => c.title || c.id);
      const activeCourses = mine.filter((c) => isActiveCourse(c.status));
      const activeN = activeCourses.length;
      const doneN = mine.filter((c) => isCompleted(c.status)).length;
      let students = null;
      {
        const activeIds = new Set(activeCourses.map((c) => c.id));
        students = enrollList.filter((en) => activeIds.has(en.courseId)).length;
      }
      const ev = extra && extra[tid];
      return {
        t, tid, mine, names, activeN, doneN, students,
        last: ev?.last || 0,
        lastLabel: ev?.lastLabel || "",
        lastCourse: ev?.lastCourse || "",
        events: ev?.events || [],
        actErr: ev?.err || null
      };
    });
  }, [trainerList, courseList, enrollList, extra]);

  const taughtCourses = useMemo(() => courseList.filter((c) => (c.trainerIds && c.trainerIds.length) || c.trainerId).length, [courseList]);
  const activeTrainers = trainerList.filter((t) => t.active !== false).length;
  const deactN = trainerList.filter((t) => t.active === false).length;

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (tab === "active" && r.t.active === false) return false;
      if (tab === "off" && r.t.active !== false) return false;
      if (tab === "none" && r.mine.length) return false;
      if (!s) return true;
      return [r.t.name, r.t.email, r.t.specialty].some((v) => String(v || "").toLowerCase().includes(s));
    }).sort((a, b) => (b.last || 0) - (a.last || 0));
  }, [rows, tab, q]);

  const without = rows.filter((r) => !r.mine.length).length;
  const pill = (id, lab, n) => e("button", { type: "button", className: "atv2-pill" + (tab === id ? " on" : ""), onClick: () => setTab(id) }, lab + " (" + n + ")");

  const pdfData = () => ({
    page: "Trainers",
    filters: [tab === "all" ? "All" : tab === "off" ? "Deactivated" : tab === "none" ? "Without courses" : "Active", q ? "Search: " + q : ""].filter(Boolean).join(" · ") || "All trainers",
    summary: "Total " + filtered.length,
    columns: [
      { key: "name", label: "Name" },
      { key: "email", label: "Email" },
      { key: "specialty", label: "Specialty" },
      { key: "courses", label: "Courses" },
      { key: "active", label: "Active" },
      { key: "completed", label: "Completed" },
      { key: "students", label: "Students" },
      { key: "status", label: "Status" }
    ],
    rows: filtered.map((r) => ({
      name: r.t.name || "Trainer",
      email: r.t.email || "—",
      specialty: r.t.specialty || "Not set",
      courses: String(r.mine.length),
      active: String(r.activeN),
      completed: String(r.doneN),
      students: r.students == null ? "—" : String(r.students),
      status: r.t.active === false ? "Deactivated" : "Active"
    }))
  });

  const drawer = sel && rows.find((r) => r.tid === sel);

  return e("div", { className: "admin-trainers atv2" },
    e("div", { className: "atv2-headrow" },
      e("div", null,
        e("h2", null, "Trainers"),
        e("p", { className: "sub" }, "Manage your teaching team")
      ),
      e("div", { className: "atv2-head-act" },
        e(AdminPdfButton, { getData: pdfData, page: "Trainers" }),
        e("button", { type: "button", className: "atv2-add", onClick: onAdd }, icoPlus(), " Add trainer")
      )
    ),
    e("div", { className: "atv2-stats" },
      [
        ["#DBEAFE", "👥", trainers.length, "Total trainers"],
        ["#DCFCE7", "✓", activeTrainers, "Active"],
        ["#FEF3C7", "⏸", deactN, "Deactivated"],
        ["#EDE9FE", "📚", taughtCourses, "Courses being taught"]
      ].map(([bg, ic, n, lab]) => e("div", { className: "atv2-stat", key: lab },
        e("div", { className: "atv2-stat-ic", style: { background: bg } }, ic),
        e("div", null, e("strong", null, String(n)), e("span", null, lab))
      ))
    ),
    e("div", { className: "atv2-bar" },
      pill("all", "All", trainers.length),
      pill("active", "Active", activeTrainers),
      pill("off", "Deactivated", deactN),
      pill("none", "Without courses", without),
      e("input", { className: "atv2-search", value: q, placeholder: "Search name, email, specialty", "aria-label": "Search trainers", onChange: (ev) => setQ(ev.target.value) })
    ),
    error ? e("div", { className: "atv2-err" }, String(error), " ", e("button", { type: "button", className: "atv2-edit", onClick: onRetry }, "Try again")) : null,
    e("div", { className: "atv2-card" },
      e("div", { className: "atv2-th" },
        e("span", null, "Trainer"), e("span", null, "Specialty"), e("span", null, "Courses"),
        e("span", null, "Students"), e("span", null, "Status"), e("span", null, "Last activity"), e("span", null, "Actions")
      ),
      filtered.length ? filtered.map((r) => {
        const lastTip = r.last ? ((r.lastLabel || "Activity") + " · " + fmtWhen(r.last) + (r.lastCourse ? " · " + r.lastCourse : "")) : "Never";
        return e("div", { className: "atv2-row", key: r.tid, onClick: () => { setSel(r.tid); setDtab("profile"); } },
          e("div", { className: "atv2-person" },
            e("div", { className: "atv2-av", style: { background: avBg(r.t.name) } }, initials(r.t.name)),
            e("div", null, e("p", null, r.t.name || "Trainer"), e("small", null, r.t.email || ""))
          ),
          e("div", null, e("span", { className: "atv2-spec" + (r.t.specialty ? "" : " miss") }, r.t.specialty || "Not set")),
          e(CourseCounts, { total: r.mine.length, activeN: r.activeN, doneN: r.doneN, titles: r.names }),
          e("div", { className: "atv2-stu" },
            enErr ? e("span", { title: enErr }, "—") : (r.students == null ? e("div", { className: "atv2-sk" }) : e("strong", null, String(r.students))),
            e("span", { className: "atv2-cmeta" }, "active enrollments")
          ),
          e("div", null, e("span", { className: "atv2-st " + (r.t.active === false ? "off" : "on") }, r.t.active === false ? "Deactivated" : "Active")),
          e("div", { className: "atv2-last" },
            extraLoading && !r.actErr && !r.last ? e("div", { className: "atv2-sk" }) :
              (r.actErr && !r.last
                ? e("span", { className: "atv2-miss", title: r.actErr }, "Couldn't load ",
                    e("button", { type: "button", className: "atv2-retry", onClick: (ev) => { ev.stopPropagation(); onRetryActivity && onRetryActivity(r.tid); } }, "Retry"))
                : e("span", { className: r.last ? "" : "atv2-miss", title: lastTip }, r.last ? (ago(r.last) + (r.lastLabel ? " · " + r.lastLabel : "")) : "Never"))
          ),
          e(Actions, { t: r.t, onEdit, onResend, onWelcome, onToggle: askToggle })
        );
      }) : e("div", { className: "atv2-empty" }, "No trainers match ", e("button", { type: "button", className: "atv2-edit", onClick: () => { setTab("all"); setQ(""); } }, "Clear filters"))
    ),
    drawer ? e("div", { className: "atv2-dim", onClick: () => setSel(null) },
      e("div", { className: "atv2-draw", onClick: (ev) => ev.stopPropagation() },
        e("div", { className: "atv2-headrow" },
          e("div", { className: "atv2-person" },
            e("div", { className: "atv2-av", style: { background: avBg(drawer.t.name) } }, initials(drawer.t.name)),
            e("div", null, e("p", null, drawer.t.name || "Trainer"), e("small", null, drawer.t.email || ""))
          ),
          e(Actions, { t: drawer.t, onEdit, onResend, onWelcome, onToggle: askToggle })
        ),
        e("div", { className: "atv2-tabs" },
          ["profile", "courses", "activity"].map((k) => e("button", { key: k, type: "button", className: "atv2-pill" + (dtab === k ? " on" : ""), onClick: () => setDtab(k) }, k[0].toUpperCase() + k.slice(1)))
        ),
        dtab === "profile" ? e("div", null,
          [["Name", drawer.t.name || "—"], ["Email", drawer.t.email || "—"], ["Specialty", drawer.t.specialty || "Not set"], ["Phone", drawer.t.phone || "—"], ["Joined", fmtDate(tsMs(drawer.t.createdAt))]].map(([k, v]) => e("div", { className: "atv2-kv", key: k }, e("span", null, k), e("strong", null, v))),
          e("div", { className: "atv2-kv" }, e("span", null, "Students"), e("strong", null, drawer.students == null ? "—" : String(drawer.students) + " active enrollments"))
        ) : null,
        dtab === "courses" ? e("div", null,
          e(CourseCounts, { total: drawer.mine.length, activeN: drawer.activeN, doneN: drawer.doneN, titles: drawer.names }),
          drawer.mine.length ? drawer.mine.map((c) => e("div", { className: "atv2-crow", key: c.id },
            e("div", null, e("strong", null, c.title || c.id), e("div", { className: "atv2-cmeta" }, "Assigned " + fmtDate(tsMs((c.trainerAssigned || {})[drawer.tid])))),
            e("div", null,
              e("span", { className: "atv2-st " + (isCompleted(c.status) ? "off" : "on"), title: courseStatusLabel(c) }, statusChipShort(c)),
              e("div", { className: "atv2-cmeta" }, (enrollments ? enrollments.filter((en) => en.courseId === c.id).length : "—") + " enrollments")
            )
          )) : e("p", { className: "atv2-empty" }, "No courses assigned")
        ) : null,
        dtab === "activity" ? e("div", null,
          extraLoading && !drawer.events.length ? e("div", { className: "atv2-sk" }) :
            (drawer.events.length ? drawer.events.slice(0, 10).map((ev, i) => e("div", { className: "atv2-actrow", key: i },
              e("span", { className: "atv2-act-ic", "aria-hidden": "true" }, ev.icon || "•"),
              e("div", null, e("p", null, ev.label), e("small", null, ago(ev.at) + (ev.course ? " · " + ev.course : ""), " · ", fmtWhen(ev.at)))
            )) : e("p", { className: "atv2-miss" }, "Never"))
        ) : null,
        e("button", { type: "button", className: "atv2-edit", style: { marginTop: 16 }, onClick: () => setSel(null) }, "Close")
      )
    ) : null,
    e(ConfirmDialog, {
      open: !!dlg, title: dlg?.title, message: dlg?.message, name: dlg?.name, tone: dlg?.tone,
      confirmLabel: dlg?.confirmLabel, onCancel: () => setDlg(null), onConfirm: dlg?.onConfirm
    })
  );
}

const roots = new WeakMap();
export function renderAdminTrainersV2(host, opts = {}) {
  if (!host) return;
  try {
    let root = roots.get(host);
    if (!root) { root = createRoot(host); roots.set(host, root); }
    root.render(e(Boundary, null, e(App, opts || {})));
  } catch (err) {
    console.error(err);
    showSecErr(host, err, () => renderAdminTrainersV2(host, opts));
  }
}

function emptyBucket() { return { last: 0, lastLabel: "", lastCourse: "", events: [], err: null }; }

export async function loadTrainerExtras(trainers, courses) {
  const extra = {};
  trainers.forEach((t) => { extra[t.id || t.uid] = emptyBucket(); });
  const ids = new Set(trainers.map((t) => t.id || t.uid));
  const title = (cid) => (courses.find((c) => c.id === cid) || {}).title || "";
  const courseOf = (tid) => new Set((courses || []).filter((c) => courseForTrainer(c, tid)).map((c) => c.id));

  const push = (tid, at, label, course, icon) => {
    if (!tid || !extra[tid]) return;
    const n = tsMs(at);
    if (!n) return;
    extra[tid].events.push({ at: n, label, course, icon });
    if (n > extra[tid].last) {
      extra[tid].last = n;
      extra[tid].lastLabel = label;
      extra[tid].lastCourse = course || "";
    }
  };

  const [sess, att, scores, subs, anns, quizzes, users] = await Promise.all([
    settledCol("sessions"),
    settledCol("attendance"),
    settledCol("gradeScores"),
    settledCol("submissions"),
    settledCol("announcements"),
    settledCol("quizAttempts"),
    Promise.all((trainers || []).map(async (t) => {
      const tid = t.id || t.uid;
      try {
        const snap = await getDoc(doc(db, "users", tid));
        return { tid, ok: true, data: snap.exists() ? snap.data() : {} };
      } catch (err) {
        return { tid, ok: false, err: fbErr(err) };
      }
    }))
  ]);
  users.forEach((u) => {
    if (!u.ok) {
      if (extra[u.tid] && !extra[u.tid].last) extra[u.tid].err = "users: " + u.err;
      return;
    }
    push(u.tid, u.data.lastActiveAt, "Active in portal", "", "●");
    push(u.tid, u.data.lastLoginAt, "Signed in", "", "→");
  });

  const noteFail = (res) => {
    if (res.ok) return;
    trainers.forEach((t) => {
      const tid = t.id || t.uid;
      if (!extra[tid].last && !extra[tid].events.length) {
        extra[tid].err = (res.col || "") + " " + (res.shape || "list") + ": " + res.err;
      }
    });
  };

  if (sess.ok) {
    sess.rows.forEach((r) => {
      const cid = r.courseId;
      trainers.forEach((t) => {
        const tid = t.id || t.uid;
        if (courseOf(tid).has(cid)) push(tid, r.createdAt || r.date, "Session created", title(cid), "📅");
      });
    });
  } else noteFail(sess);

  if (att.ok) {
    att.rows.forEach((r) => {
      const tid = r.markedBy;
      if (ids.has(tid)) push(tid, r.markedAt || r.updatedAt || r.createdAt, "Marked attendance", title(r.courseId), "✓");
    });
  } else noteFail(att);

  if (scores.ok) {
    scores.rows.forEach((r) => {
      const tid = r.updatedBy;
      if (ids.has(tid) && courseOf(tid).has(r.courseId)) push(tid, r.updatedAt || r.createdAt, "Saved grades", title(r.courseId), "★");
    });
  } else noteFail(scores);

  if (subs.ok) {
    subs.rows.forEach((r) => {
      const tid = r.gradedBy;
      if (ids.has(tid) && courseOf(tid).has(r.courseId)) push(tid, r.gradedAt || r.updatedAt, "Graded homework", title(r.courseId), "✎");
    });
  } else noteFail(subs);

  if (anns.ok) {
    anns.rows.forEach((r) => {
      const tid = r.createdBy || r.authorId;
      if (ids.has(tid)) push(tid, r.createdAt, "Posted announcement", title(r.courseId), "📣");
    });
  } else noteFail(anns);
  if (quizzes.ok) {
    quizzes.rows.forEach((r) => {
      const tid = r.gradedBy;
      if (ids.has(tid) && courseOf(tid).has(r.courseId)) push(tid, r.gradedAt || r.updatedAt, "Graded quiz", title(r.courseId), "✎");
    });
  } else noteFail(quizzes);

  Object.values(extra).forEach((x) => {
    x.events.sort((a, b) => b.at - a.at);
    x.events = x.events.slice(0, 10);
    if (x.last) x.err = null;
  });
  return { extra, extraErr: null };
}
