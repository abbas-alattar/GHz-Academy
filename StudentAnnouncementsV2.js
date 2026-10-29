import { createElement as e, useMemo, useState, useEffect, Component } from "https://esm.sh/react@18.3.1";
import { createRoot } from "https://esm.sh/react-dom@18.3.1/client";
import { db, auth } from "./firebase-config.js?v=auth8";
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { AnnouncementCard } from "./AnnouncementCard.js";
import { loadAnnouncementReads, markAnnouncementRead, markAllAnnouncementsRead, isRead, unreadCount, onAnnouncementReads } from "./announcementReads.js?v=stu7";
import { getStudentStore, whenStudentStore } from "./student-dash-data.js?v=stu7";

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
  componentDidCatch(err) { console.error("StudentAnnouncementsV2", err); }
  render() {
    if (this.state.err) {
      return e("div", null,
        e("p", { className: "aanv2-err" }, String(this.state.err?.code || this.state.err?.message || this.state.err)),
        e("button", { type: "button", className: "aanv2-ghost", onClick: this.props.onRetry }, "Try again"));
    }
    return this.props.children;
  }
}
function fbErr(err) { return err?.code || err?.message || String(err); }
function withTimeout(p, ms) {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error("deadline-exceeded"), { code: "deadline-exceeded" })), ms))]);
}

function App({ courses, rows, loading, error, onRetry, uid, tick }) {
  const [q, setQ] = useState("");
  const [tgt, setTgt] = useState("");
  const [chip, setChip] = useState("All");
  const unreadN = unreadCount(uid, rows);
  const pinN = rows.filter((r) => r.pinned).length;
  const vis = useMemo(() => {
    let list = rows.slice();
    if (tgt === "all") list = list.filter((r) => !r.courseId || r.courseId === "all");
    else if (tgt) list = list.filter((r) => r.courseId === tgt);
    if (chip === "Unread") list = list.filter((r) => uid && !isRead(uid, r.id));
    if (chip === "Pinned") list = list.filter((r) => r.pinned);
    const qq = q.trim().toLowerCase();
    if (qq) list = list.filter((r) => (r.title || "").toLowerCase().includes(qq) || (r.body || "").toLowerCase().includes(qq));
    list.sort((a, b) => {
      const pa = a.pinned ? 1 : 0, pb = b.pinned ? 1 : 0;
      if (pb !== pa) return pb - pa;
      const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return tb - ta;
    });
    return list;
  }, [rows, q, tgt, chip, uid, tick]);
  const bar = e("div", { className: "aanv2-bar" },
    e("select", { className: "aanv2-sel", value: tgt, disabled: loading, "aria-label": "Course", onChange: (ev) => setTgt(ev.target.value) },
      e("option", { value: "" }, "All"),
      e("option", { value: "all" }, "Everyone"),
      courses.map((c) => e("option", { key: c.id, value: c.id }, c.title))
    ),
    e("input", { className: "aanv2-in", placeholder: "Search", value: q, disabled: loading, onChange: (ev) => setQ(ev.target.value) }),
    e("div", { className: "aanv2-chips" },
      [{ id: "All", n: rows.length }, { id: "Unread", n: unreadN }, { id: "Pinned", n: pinN }].map((c) =>
        e("button", { key: c.id, type: "button", className: "aanv2-chip" + (chip === c.id ? " on" : ""), onClick: () => setChip(c.id) }, c.id + " (" + c.n + ")"))
    )
  );
  const markAll = () => { if (uid) markAllAnnouncementsRead(uid, vis); };
  if (loading) {
    return e("div", { className: "aanv2" },
      e("div", { className: "aanv2-head" }, e("div", null, e("h2", null, "Announcements"), e("p", { className: "sub" }, "News from your courses and the academy"))),
      bar,
      [1, 2, 3].map((i) => e("div", { key: i, className: "aanv2-sk" }))
    );
  }
  if (error) {
    return e("div", { className: "aanv2" },
      e("div", { className: "aanv2-head" }, e("div", null, e("h2", null, "Announcements"), e("p", { className: "sub" }, "News from your courses and the academy"))),
      e("p", { className: "aanv2-err" }, String(error), " ", e("button", { type: "button", className: "aanv2-ghost", onClick: onRetry }, "Try again"))
    );
  }
  return e("div", { className: "aanv2" },
    e("div", { className: "aanv2-head" },
      e("div", null, e("h2", null, "Announcements"), e("p", { className: "sub" }, "News from your courses and the academy")),
      unreadN ? e("button", { type: "button", className: "aanv2-classic", onClick: markAll }, "Mark all as read") : null
    ),
    bar,
    e(Boundary, { onRetry },
      vis.length ? vis.map((a) => e(AnnouncementCard, {
        key: a.id, a, courses, unread: uid && !isRead(uid, a.id), controls: false,
        onOpen: () => { if (uid) markAnnouncementRead(uid, a.id); }
      }))
        : e("div", { className: "aanv2-empty" }, e("p", null, "No announcements yet"))
    ),);
}

function Host() {
  const [courses, setCourses] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tick, setTick] = useState(0);
  const uid = auth.currentUser?.uid || "";
  const load = async () => {
    setLoading(true); setError(null);
    try {
      await whenStudentStore().catch(() => {});
      const store = getStudentStore() || {};
      const ens = store.enrollments || [];
      const cs = ens.map((en) => ({ id: en.courseId, title: en.courseTitle || store.courses?.[en.courseId]?.title || en.courseId }));
      setCourses(cs);
      const jobs = [withTimeout(getDocs(query(collection(db, "announcements"), where("courseId", "==", "all"))), 10000)];
      cs.forEach((c) => jobs.push(withTimeout(getDocs(query(collection(db, "announcements"), where("courseId", "==", c.id))), 10000)));
      const settled = await Promise.allSettled(jobs);
      const list = [];
      const seen = new Set();
      settled.forEach((r) => {
        if (r.status !== "fulfilled") return;
        (r.value.docs || []).forEach((d) => {
          if (seen.has(d.id)) return;
          seen.add(d.id);
          list.push({ id: d.id, ...d.data() });
        });
      });
      const failed = settled.find((r) => r.status === "rejected");
      if (!list.length && failed) { setError(fbErr(failed.reason)); setLoading(false); return; }
      setRows(list);
      try { window.__ghzDash = { ...(window.__ghzDash || {}), announcements: list }; } catch (_) {}
      if (uid) loadAnnouncementReads(uid).catch(() => {});
      setLoading(false);
    } catch (err) {
      setRows([]); setError(fbErr(err)); setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);
  useEffect(() => onAnnouncementReads(() => setTick((n) => n + 1)), []);
  return e(App, { courses, rows, loading, error, onRetry: load, uid, tick });
}

const roots = new WeakMap();
export function renderStudentAnnouncementsV2(host, opts = {}) {
  if (!host) return;
  let root = roots.get(host);
  if (root) { try { root.unmount(); } catch (_) {} roots.delete(host); }
  host.replaceChildren();
  root = createRoot(host);
  roots.set(host, root);
  try {
    root.render(e(Host, opts || {}));
  } catch (err) {
    console.error(err);
    showSecErr(host, err, () => renderStudentAnnouncementsV2(host, opts));
  }
}
