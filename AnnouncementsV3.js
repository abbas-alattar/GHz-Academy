import { createElement as e, useEffect, useMemo, useRef, useState, Component } from "https://esm.sh/react@18.3.1";
import { createRoot } from "https://esm.sh/react-dom@18.3.1/client";
import { getStudentStore, onDashData } from "./student-dash-data.js?v=stu7";
import { loadAnnouncementReads, markAnnouncementRead, markAllAnnouncementsRead, isRead, unreadCount, onAnnouncementReads } from "./announcementReads.js";

const roots = new WeakMap();
const COLORS = ["#D97706", "#2563EB", "#7C3AED", "#16A34A", "#0EA5E9"];

class Boundary extends Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err) { console.error("AnnouncementsV3", err); }
  render() {
    if (this.state.err) {
      return e("div", null,
        e("p", { className: "banner" }, "Announcements could not load"),);
    }
    return this.props.children;
  }
}

function millis(t) {
  try {
    if (t && typeof t.toMillis === "function") return t.toMillis();
    if (t && typeof t.toDate === "function") return t.toDate().getTime();
    const n = t ? new Date(t).getTime() : 0;
    return Number.isFinite(n) ? n : 0;
  } catch { return 0; }
}
function fullWhen(t) {
  try {
    const d = t && t.toDate ? t.toDate() : t ? new Date(t) : null;
    if (!d || Number.isNaN(d.getTime())) return "";
    return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch { return ""; }
}
function relative(t) {
  const ms = Date.now() - millis(t);
  if (!Number.isFinite(ms) || ms < 0) return "Just now";
  const m = Math.floor(ms / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return m + " min ago";
  const h = Math.floor(m / 60);
  if (h < 24) return h + (h === 1 ? " hour ago" : " hours ago");
  const d = Math.floor(h / 24);
  if (d < 7) return d + (d === 1 ? " day ago" : " days ago");
  return Math.floor(d / 7) + " weeks ago";
}
function initials(name) {
  const parts = String(name || "A").trim().split(/\s+/).filter(Boolean);
  return ((parts[0] || "A").charAt(0) + (parts[1] || "").charAt(0)).toUpperCase();
}
function isAdmin(a) { return String(a?.authorRole || "").toLowerCase() === "admin"; }
function isAcademy(a) { return String(a?.courseId || "") === "all" || !a?.courseId; }
function courseTitle(a, map, store) {
  if (isAcademy(a)) return "Everyone";
  const id = String(a.courseId || "");
  const fromStore = store?.courses?.[id]?.title;
  const t = fromStore || map[id] || a.courseTitle || "";
  if (t && t !== id && !/^[a-z0-9-]{8,}$/.test(t)) return t;
  return fromStore || "My course";
}
function colorFor(id, ids) {
  const i = Math.max(0, ids.indexOf(id));
  return COLORS[i % COLORS.length];
}
function groupOf(a) {
  const ms = millis(a.createdAt);
  const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
  if (ms >= startToday.getTime()) return "Today";
  if (ms >= Date.now() - 7 * 86400000) return "This week";
  return "Earlier";
}

function Skeleton() {
  return e("div", { className: "an3", style: { opacity: 1 } }, e("div", { className: "an3-skel" }), e("div", { className: "an3-skel" }), e("div", { className: "an3-skel" }));
}

function App({ opts }) {
  const items = Array.isArray(opts.items) ? opts.items : [];
  const map = opts.courses || {};
  const [store, setStore] = useState(() => getStudentStore());
  const [tab, setTab] = useState("all");
  const [course, setCourse] = useState("all");
  const [q, setQ] = useState("");
  const [openSel, setOpenSel] = useState(false);
  const [more, setMore] = useState({});
  const [readTick, setReadTick] = useState(0);
  void readTick;
  const uid = store?.user?.uid || opts.uid;

  useEffect(() => onDashData((d) => setStore(d)), []);
  useEffect(() => {
    if (!uid) return;
    loadAnnouncementReads(uid).then(() => setReadTick((n) => n + 1));
    return onAnnouncementReads(() => setReadTick((n) => n + 1));
  }, [uid]);

  const ids = useMemo(() => [...new Set(items.map((a) => a.courseId).filter((id) => id && id !== "all"))], [items]);
  const courseOpts = [{ id: "all", title: "All courses" }, ...ids.map((id) => ({ id, title: store?.courses?.[id]?.title || map[id] || "Course" }))];

  const filtered = items.filter((a) => {
    if (tab === "academy" && !isAcademy(a)) return false;
    if (tab === "mine" && isAcademy(a)) return false;
    if (course !== "all" && a.courseId !== course) return false;
    if (q) {
      const hay = (a.title + " " + (a.body || a.message || "")).toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  }).sort((a, b) => {
    const pa = (a.pinned || a.important) ? 1 : 0, pb = (b.pinned || b.important) ? 1 : 0;
    if (pb !== pa) return pb - pa;
    return millis(b.createdAt) - millis(a.createdAt);
  });

  const unread = unreadCount(uid, filtered);

  function markRead(id) {
    markAnnouncementRead(uid, id);
    setReadTick((n) => n + 1);
  }

  const groups = { Today: [], "This week": [], Earlier: [] };
  filtered.forEach((a) => groups[groupOf(a)].push(a));

  function card(a) {
    const admin = isAdmin(a);
    const unreadCard = uid ? !isRead(uid, a.id) : false;
    const body = String(a.body || a.message || "");
    const long = body.length > 180;
    const open = !!more[a.id];
    const col = isAcademy(a) ? null : colorFor(a.courseId, ids);
    return e("article", {
      key: a.id, className: "an3-card" + (unreadCard ? " unread" : ""), "data-aid": a.id,
      onClick: () => markRead(a.id)
    },
      e("div", { className: "an3-top" },
        e("div", { className: "an3-av " + (admin ? "admin" : "trainer") }, initials(a.authorName || (admin ? "Admin" : "Trainer"))),
        e("div", { style: { flex: 1, minWidth: 0 } },
          e("div", { className: "an3-who" },
            e("span", { className: "an3-name" }, a.authorName || (admin ? "Admin" : "Trainer")),
            e("span", { className: "an3-rp " + (admin ? "admin" : "trainer") }, admin ? "Admin" : "Trainer"),
            (a.pinned || a.important) ? e("span", { title: "Pinned" }, "📌") : null,
            unreadCard ? e("span", { className: "an3-dot" }) : null,
            e("span", { className: "an3-ago", title: fullWhen(a.createdAt) }, relative(a.createdAt))
          ),
          e("div", { className: "an3-title" }, a.title || "Announcement"),
          e("div", { className: "an3-body" + (long && !open ? " clamp" : "") }, body),
          long ? e("button", { type: "button", className: "an3-more", onClick: (ev) => { ev.stopPropagation(); setMore({ ...more, [a.id]: !open }); markRead(a.id); } }, open ? "Show less" : "Read more") : null,
          e("div", { className: "an3-pills" },
            e("span", { className: "an3-cp" + (isAcademy(a) ? " all" : ""), style: isAcademy(a) ? {} : { background: col + "22", color: col } }, courseTitle(a, map, store))
          )
        )
      )
    );
  }

  if (opts.loading) return e(Skeleton);

  return e("div", { className: "an3" },
    e("div", { className: "an3-head" },
      e("div", null,
        e("h2", null, "Announcements"),
        e("div", { className: "an3-meta" },
          e("span", null, filtered.length + " announcement" + (filtered.length === 1 ? "" : "s")),
          unread ? e("span", { className: "an3-new" }, unread + " unread") : null,
          unread ? e("button", { type: "button", className: "an3-markall", onClick: () => { markAllAnnouncementsRead(uid, filtered); setReadTick((n) => n + 1); } }, "Mark all as read") : null
        )
      ),),
    e("div", { className: "an3-tools" },
      e("div", { className: "an3-sw" },
        [["all", "All"], ["academy", "Academy-wide"], ["mine", "My courses"]].map(([k, l]) =>
          e("button", { key: k, type: "button", className: tab === k ? "on" : "", onClick: () => setTab(k) }, l))
      ),
      e("div", { className: "an3-sel" },
        e("button", { type: "button", className: "an3-selb", onClick: () => setOpenSel(!openSel) }, (courseOpts.find((c) => c.id === course) || {}).title || "All courses"),
        openSel ? e("div", { className: "an3-selm" }, courseOpts.map((c) => e("button", { key: c.id, type: "button", onClick: () => { setCourse(c.id); setOpenSel(false); } }, c.title))) : null
      ),
      e("input", { className: "an3-search", placeholder: "Search", value: q, onChange: (ev) => setQ(ev.target.value) })
    ),
    !filtered.length ? e("div", { className: "an3-empty" },
      e("svg", { width: "48", height: "48", viewBox: "0 0 24 24", fill: "none" }, e("path", { d: "M4 6h16v12H4z", stroke: "#94A3B8", "stroke-width": "1.8" }), e("path", { d: "M4 9h16M8 13h8", stroke: "#94A3B8", "stroke-width": "1.8" })),
      e("p", { style: { fontWeight: 700, color: "#0F2747" } }, "No announcements yet"),
      e("p", null, "When your academy posts an update, it will show up here.")
    ) : ["Today", "This week", "Earlier"].map((g) => groups[g].length ? e("div", { key: g }, e("div", { className: "an3-gh" }, g), groups[g].map(card)) : null)
  );
}

export function renderAnnouncementsV3(opts) {
  const host = opts?.host;
  if (!host) return false;
  try {
    let root = roots.get(host);
    if (!root) { root = createRoot(host); roots.set(host, root); }
    if (opts.loading) { root.render(e(Boundary, { onClassic: opts.onClassic }, e(Skeleton))); return true; }
    root.render(e(Boundary, { onClassic: opts.onClassic }, e(App, { opts })));
    opts.onReady?.();
    return true;
  } catch (err) {
    opts.onClassic?.();
    return false;
  }
}
