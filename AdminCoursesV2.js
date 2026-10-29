import { createElement as e, useEffect, useLayoutEffect, useMemo, useRef, useState, Component } from "https://esm.sh/react@18.3.1";
import { createRoot } from "https://esm.sh/react-dom@18.3.1/client";
import { createPortal } from "https://esm.sh/react-dom@18.3.1";
import { AdminPdfButton, fmtPdfDate } from "./AdminPdfExport.js";
import { ConfirmDialog } from "./ConfirmDialog.js";
import { statusLabel, statusChipKind, statusChipShort, adminCourseTabLabel, matchesAdminCourseTab, registrationOpenLabel, canRegisterForCourse } from "./courseStatusLabel.js";

function showSecErr(host, err, retry) {
  if (!host) return;
  const msg = String((err && (err.message || err.code)) || err || "error");
  host.innerHTML = '<div style="margin:16px;padding:16px;background:#fff;border:1px solid #E5EAF1;border-radius:14px;max-width:480px;font-family:system-ui,sans-serif"><p style="margin:0 0 8px;font-weight:650">This section could not load</p><p style="margin:0 0 12px;color:#64748B;font-size:14px"></p><button type="button" style="height:36px;padding:0 14px;border:0;border-radius:10px;background:#2563EB;color:#fff;font-weight:600;cursor:pointer">Retry</button></div>';
  const p = host.querySelector("p:nth-of-type(2)");
  if (p) p.textContent = msg;
  const b = host.querySelector("button");
  if (b) b.onclick = () => { try { retry(); } catch (e2) { showSecErr(host, e2, retry); } };
}

const EDGE = ["#2563EB", "#16A34A", "#D97706", "#7C3AED", "#0EA5E9", "#EC4899"];
const hue = (id) => {
  let h = 0;
  String(id || "").split("").forEach((c) => { h = (h * 31 + c.charCodeAt(0)) >>> 0; });
  return EDGE[h % EDGE.length];
};
const initials = (n) => String(n || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
const avBg = (n) => {
  let h = 0; String(n || "").split("").forEach((c) => { h = (h * 17 + c.charCodeAt(0)) % 360; });
  return `linear-gradient(135deg, hsl(${h},62%,42%), hsl(${(h + 40) % 360},70%,56%))`;
};
function stClass(s) {
  if (s === "Open") return "open";
  if (s === "Coming soon") return "soon";
  if (s === "Closed") return "closed";
  if (s === "Completed") return "completed";
  if (s === "Archived") return "archived";
  if (s === "Draft") return "draft";
  return "draft";
}
function delivery(c) {
  const days = Array.isArray(c.days) ? c.days.filter(Boolean) : [];
  const t = String(c.sessionTime || "").trim();
  const start = c.startDate ? ("Starts " + c.startDate) : "Starts —";
  const end = c.endDate ? ("Ends " + c.endDate) : "";
  const startLine = end ? (start + " · " + end) : start;
  if (!days.length) return { line: "Not set", start: startLine };
  return { line: days.join(" · ") + (t ? " · " + t : ""), start: startLine };
}
function trainerBits(c, users) {
  const ids = c.trainerIds || (c.trainerId ? [c.trainerId] : []);
  const stored = Array.isArray(c.trainerNames) ? c.trainerNames : [];
  const names = ids.map((id, i) => {
    const s = String(stored[i] || "").trim();
    if (s) return s;
    return (users.find((u) => u.id === id || u.uid === id) || {}).name || "";
  }).filter(Boolean);
  return { names, label: names.join(", ") || "Unassigned", empty: !names.length };
}

class Boundary extends Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err) { console.error("AdminCoursesV2", err); }
  render() {
    if (this.state.err) {
      const err = this.state.err;
      const msg = String(err?.message || err?.code || err || "error");
      const path = err?.path ? String(err.path) : "courses";
      return e("div", { className: "admin-courses acv2" },
        e("p", { className: "acv2-err" }, "Courses could not load"),
        e("p", { style: { color: "#94A3B8", fontSize: 12, margin: "0 0 12px" } }, msg + " · " + path),
        e("button", { type: "button", className: "acv2-ok", onClick: () => { this.setState({ err: null }); this.props.onRetry?.(); } }, "Retry")
      );
    }
    return this.props.children;
  }
}

function icoPlus() {
  return e("svg", { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "#FFFFFF", strokeWidth: "2" },
    e("path", { d: "M12 5v14M5 12h14", strokeLinecap: "round" }));
}

function Row({ c, users, n, actions, hi }) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const moreRef = useRef(null);
  const menuRef = useRef(null);
  const placeMenu = () => {
    const btn = moreRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const menuW = 200;
    const menuH = (menuRef.current && menuRef.current.offsetHeight) || 220;
    const pad = 8;
    let top = r.bottom + 4;
    let left = r.right - menuW;
    if (top + menuH > window.innerHeight - pad) top = r.top - menuH - 4;
    if (top < pad) top = pad;
    if (left < pad) left = pad;
    if (left + menuW > window.innerWidth - pad) left = Math.max(pad, window.innerWidth - menuW - pad);
    setMenuPos({ top, left });
  };
  useLayoutEffect(() => { if (open) placeMenu(); }, [open]);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onKey = (ev) => { if (ev.key === "Escape") close(); };
    const onDown = (ev) => {
      const t = ev.target;
      if (moreRef.current && moreRef.current.contains(t)) return;
      if (menuRef.current && menuRef.current.contains(t)) return;
      close();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", close, true);
    window.addEventListener("hashchange", close);
    window.addEventListener("popstate", close);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("hashchange", close);
      window.removeEventListener("popstate", close);
    };
  }, [open]);
  const tr = trainerBits(c, users);
  const del = delivery(c);
  const st = c.status || "";
  let main = null;
  if (st === "Completed") main = { label: "Reopen", ghost: true, fn: () => actions.reopen(c) };
  else if (st === "Open" || st === "Closed") main = { label: "Complete", ghost: false, fn: () => actions.complete(c) };
  else if (st === "Coming soon") main = { label: "Publish", ghost: false, fn: () => actions.publish(c) };
  else if (st === "Archived") main = { label: "Restore", ghost: true, fn: () => actions.restore(c) };
  return e("div", { className: "acv2-row" + (hi ? " acv2-hi" : "") },
    e("div", { className: "acv2-edge", style: { background: hue(c.id) } }),
    e("div", { className: "acv2-cell" },
      e("p", { className: "acv2-title", title: c.title || "Untitled" }, c.title || "Untitled"),
      e("p", { className: "acv2-sub", title: [c.level || "Level", c.duration || "Duration"].join(" · ") }, [c.level || "Level", c.duration || "Duration"].join(" · "))
    ),
    e("div", { className: "acv2-tr" },
      tr.empty
        ? e("div", { className: "acv2-av empty" })
        : e("div", { className: "acv2-av", style: { background: avBg(tr.names[0]) } }, initials(tr.names[0])),
      e("span", { className: tr.empty ? "acv2-un" : "", title: tr.label }, tr.label)
    ),
    e("div", null,
      e("span", { className: "acv2-st " + statusChipKind(c), title: statusLabel(c) }, statusChipShort(c)),
      registrationOpenLabel(c) ? e("p", { className: "acv2-regtag" + (canRegisterForCourse(c) ? " open" : " shut") }, registrationOpenLabel(c)) : null
    ),
    e("div", { className: "acv2-del" }, e("div", null, del.line), e("p", { className: "acv2-sub" }, del.start)),
    e("div", { className: "acv2-n" }, st === "Draft" ? "—" : String(n == null ? 0 : n)),
    e("div", { className: "acv2-acts", onClick: (ev) => ev.stopPropagation() },
      main ? e("button", { type: "button", className: "acv2-main" + (main.ghost ? " ghost" : ""), onClick: main.fn }, main.label) : null,
      e("button", { type: "button", className: "acv2-edit", title: "Roster", "aria-label": "Roster", onClick: () => actions.roster(c) },
        e("svg", { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2 }, e("path", { d: "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" }), e("circle", { cx: 9, cy: 7, r: 4 }))),
      e("button", { type: "button", className: "acv2-edit", onClick: () => actions.edit(c) }, "Edit"),
      e("button", { type: "button", className: "acv2-more", ref: moreRef, "aria-expanded": open, "aria-haspopup": "menu", onClick: (ev) => { ev.stopPropagation(); setOpen((o) => !o); } }, "⋯"),
      open ? createPortal(e("div", {
        className: "acv2-menu acv2-menu-portal", role: "menu", ref: menuRef,
        style: { position: "fixed", top: menuPos.top, left: menuPos.left, zIndex: 10050 },
        onClick: (ev) => ev.stopPropagation()
      },
        e("button", { type: "button", role: "menuitem", onClick: () => { setOpen(false); actions.roster(c); } }, "Roster"),
        e("button", { type: "button", role: "menuitem", onClick: () => { setOpen(false); actions.content(c); } }, "Course content"),
        e("button", { type: "button", role: "menuitem", onClick: () => { setOpen(false); actions.gd(c); } }, "Grade distribution"),
        (st === "Open" || st === "Closed") ? e("button", { type: "button", role: "menuitem", onClick: () => { setOpen(false); actions.setReg?.(c, st === "Open" ? "Closed" : "Open"); } }, "Registration: " + (st === "Open" ? "Closed" : "Open")) : null,
        st === "Coming soon" ? e("button", { type: "button", role: "menuitem", disabled: true, title: "Scheduled courses stay Coming soon" }, "Registration: Open") : null,
        e("button", { type: "button", role: "menuitem", className: "amber", onClick: () => { setOpen(false); actions.askArchive(c); } }, "Archive"),
        e("button", { type: "button", role: "menuitem", className: "red", onClick: () => { setOpen(false); actions.askDel(c); } }, "Delete")
      ), document.body) : null
    )
  );
}

function isActiveStatus(st) { return st === "Open" || st === "Closed"; }
const COURSE_TABS = ["Active", "All", "Scheduled", "On going", "Completed", "Archived"];
function readCourseTab() {
  try {
    let t = sessionStorage.getItem("ghz-courses-tab");
    if (t === "Open" || t === "Closed") t = "On going";
    if (t === "Coming soon") t = "Scheduled";
    if (COURSE_TABS.includes(t)) return t;
  } catch (_) {}
  return "Active";
}
function Page({ courses, users, counts, error, loading, onRetry, onAdd, actions }) {
  courses = Array.isArray(courses) ? courses : [];
  users = Array.isArray(users) ? users : [];
  counts = counts && typeof counts === "object" ? counts : {};
  actions = actions && typeof actions === "object" ? actions : {};
  const [tab, setTab] = useState(readCourseTab);
  const [q, setQ] = useState("");
  const [hi, setHi] = useState("");
  const [dlg, setDlg] = useState(null);
  const pickTab = (t) => {
    setTab(t);
    try { sessionStorage.setItem("ghz-courses-tab", t); } catch (_) {}
  };
  useEffect(() => {
    const onHi = (ev) => {
      const id = String(ev.detail?.id || "");
      setHi(id);
      setTab(readCourseTab());
    };
    window.addEventListener("ghz-highlight-course", onHi);
    return () => window.removeEventListener("ghz-highlight-course", onHi);
  }, []);
  const wrapped = {
    ...actions,
    askArchive: (c) => setDlg({
      title: "Archive this course?",
      message: "It will move to Archived and stay out of the live catalogue.",
      name: c.title,
      tone: "caution",
      confirmLabel: "Archive",
      onConfirm: async () => { await actions.archive(c); setDlg(null); }
    }),
    askDel: (c) => setDlg({
      title: "Delete this course?",
      message: "This cannot be undone.",
      name: c.title,
      tone: "danger",
      confirmLabel: "Delete",
      onConfirm: async () => { await actions.del(c); setDlg(null); }
    })
  };
  const tabs = COURSE_TABS;
  const nOf = (t) => {
    if (t === "All") return courses.length;
    return courses.filter((c) => matchesAdminCourseTab(c, t)).length;
  };
  const rows = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return courses.filter((c) => {
      if (!matchesAdminCourseTab(c, tab)) return false;
      if (!qq) return true;
      const tr = trainerBits(c, users).label.toLowerCase();
      return String(c.title || "").toLowerCase().includes(qq) || tr.includes(qq);
    });
  }, [courses, users, tab, q]);

  if (error) {
    return e("div", { className: "admin-courses acv2" },
      e("p", { className: "acv2-err" }, String(error)),
      e("button", { type: "button", className: "acv2-add", onClick: onRetry }, "Try again"),);
  }

  return e("div", { className: "admin-courses acv2" },
    e("div", { className: "acv2-head" },
      e("div", null, e("h2", null, "Courses"), e("p", null, "Manage courses, trainers, schedules and grade distributions")),
      e("div", { style: { display: "flex", gap: 8, alignItems: "center" } },
        e(AdminPdfButton, { page: "Courses", getData: () => ({
          page: "Courses",
          filters: "Status: " + tab + (q ? " · Search: " + q : ""),
          summary: "Total " + rows.length,
          columns: [
            { key: "title", label: "Title" }, { key: "trainer", label: "Trainer" }, { key: "level", label: "Level" },
            { key: "status", label: "Status" }, { key: "start", label: "Start date" }, { key: "delivery", label: "Delivery" }, { key: "students", label: "Students" }
          ],
          rows: rows.map((c) => {
            const t = trainerBits(c, users);
            const d = delivery(c);
            return { title: c.title, trainer: t.label, level: c.level || "—", status: statusLabel(c), start: fmtPdfDate(c.startDate) === "—" ? (c.startDate || "—") : c.startDate, delivery: d.line, students: String(counts[c.id] ?? "—") };
          })
        }) }),
        e("button", { type: "button", className: "acv2-add", onClick: onAdd }, icoPlus(), "Add course")
      )
    ),
    e("div", { className: "acv2-bar" },
      e("div", { className: "acv2-pills" }, tabs.map((t) => e("button", {
        type: "button", key: t, className: "acv2-pill" + (tab === t ? " on" : ""), onClick: () => pickTab(t)
      }, adminCourseTabLabel(t) + " " + nOf(t)))),
      e("input", { className: "acv2-search", placeholder: "Search title or trainer", value: q, onChange: (ev) => setQ(ev.target.value) })
    ),
    e("div", { className: "acv2-card" },
      e("div", { className: "acv2-th" },
        e("div", null, "Course"), e("div", null, "Trainer"), e("div", null, "Status"),
        e("div", null, "Delivery"), e("div", null, "Students"), e("div", null, "Actions")
      ),
      !courses.length && loading ? [1, 2, 3, 4].map((i) => e("div", { className: "acv2-row", key: i }, e("div", { className: "acv2-sk" }), e("div", { className: "acv2-sk" }), e("div", { className: "acv2-sk" }), e("div", { className: "acv2-sk" }), e("div", { className: "acv2-sk" }), e("div", { className: "acv2-sk" }))) :
      rows.length ? rows.map((c) => e(Row, { key: c.id, c, users, n: counts[c.id], actions: wrapped, hi: hi === c.id })) :
      e("div", { className: "acv2-empty" },
        e("p", null, tab === "Active" && !q.trim() ? "No active courses" : "No courses match your search"),
        e("button", { type: "button", className: "acv2-edit", onClick: () => { pickTab("All"); setQ(""); } }, tab === "Active" && !q.trim() ? "View all courses" : "Clear filters")
      )
    ),
    e(ConfirmDialog, {
      open: !!dlg, title: dlg?.title, message: dlg?.message, name: dlg?.name, tone: dlg?.tone,
      confirmLabel: dlg?.confirmLabel, onCancel: () => setDlg(null), onConfirm: dlg?.onConfirm
    })
  );
}

let root;
export function bootAdminCoursesV2(host, opts = {}) {
  if (!host) return false;
  try {
    if (!root) root = createRoot(host);
    root.render(e(Boundary, { onRetry: () => bootAdminCoursesV2(host, opts) }, e(Page, opts || {})));
    return true;
  } catch (err) { console.error("AdminCoursesV2 boot", err); showSecErr(host, err, () => bootAdminCoursesV2(host, opts)); return false; }
}
export function renderAdminCoursesV2(host, opts = {}) {
  return bootAdminCoursesV2(host, opts || {});
}
