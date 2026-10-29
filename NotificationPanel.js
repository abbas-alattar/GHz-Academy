import { h } from "./nv2-h.js";

const TABS = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "Courses", label: "Courses" },
  { id: "Homework", label: "Homework" },
  { id: "Quizzes", label: "Quizzes" },
  { id: "Grades", label: "Grades" },
  { id: "Announcements", label: "News" }
];

function svg(d, stroke, size) {
  return h("svg", { viewBox: "0 0 24 24", fill: "none", stroke: stroke || "#fff", "stroke-width": "1.8", width: size || "16", height: size || "16" },
    h("path", { d, "stroke-linecap": "round", "stroke-linejoin": "round" })
  );
}

const TYPE_TONE = {
  hwPosted: { bg: "#DCFCE7", fg: "#16A34A", d: "M4 19V5h10l6 6v8H4z M14 5v6h6" },
  hwGraded: { bg: "#FEF3C7", fg: "#D97706", d: "M8 21h8 M12 17v4 M7 4h10v5a5 5 0 01-10 0V4z" },
  quizPosted: { bg: "#EDE9FE", fg: "#7C3AED", d: "M12 17h.01 M9.1 9a3 3 0 115.8 1c0 2-3 2-3 4 M12 21a9 9 0 110-18 9 9 0 010 18z" },
  quizGraded: { bg: "#EDE9FE", fg: "#7C3AED", d: "M9 12l2 2 4-4 M12 21a9 9 0 110-18 9 9 0 010 18z" },
  finalGrade: { bg: "#FEF3C7", fg: "#D97706", d: "M8 21h8 M12 17v4 M7 4h10v5a5 5 0 01-10 0V4z" },
  courseGrade: { bg: "#FEF3C7", fg: "#D97706", d: "M8 21h8 M12 17v4 M7 4h10v5a5 5 0 01-10 0V4z" },
  ann: { bg: "#DBEAFE", fg: "#2563EB", d: "M3 11v2h2l8 5V6L5 11H3z M18 8a4 4 0 010 8" },
  hwSub: { bg: "#DCFCE7", fg: "#16A34A", d: "M12 3v12 M8 7l4-4 4 4 M5 21h14" },
  quizSub: { bg: "#EDE9FE", fg: "#7C3AED", d: "M12 3v12 M8 7l4-4 4 4 M5 21h14" },
  regReceived: { bg: "#CCFBF1", fg: "#0D9488", d: "M4 4h16v16H4z M8 8h8 M8 12h8 M8 16h5" },
  payReview: { bg: "#CCFBF1", fg: "#0D9488", d: "M12 3v18 M8 8h8a3 3 0 010 6H8a3 3 0 000 6h8" },
  enrolled: { bg: "#DCFCE7", fg: "#16A34A", d: "M9 12l2 2 4-4 M12 21a9 9 0 110-18 9 9 0 010 18z" },
  regRejected: { bg: "#FEE2E2", fg: "#DC2626", d: "M6 6l12 12 M18 6L6 18" },
  courseDone: { bg: "#FEF3C7", fg: "#D97706", d: "M8 21h8 M12 17v4 M7 4h10v5a5 5 0 01-10 0V4z" },
  course_completed: { bg: "#FEF3C7", fg: "#B45309", d: "M8 21h8 M12 17v4 M7 4h10v5a5 5 0 01-10 0V4z" },
  assigned: { bg: "#CCFBF1", fg: "#0D9488", d: "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2 M23 21v-2a4 4 0 00-3-3.87 M16 3.13a4 4 0 010 7.75" },
  course_assigned: { bg: "#CCFBF1", fg: "#0D9488", d: "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2 M23 21v-2a4 4 0 00-3-3.87 M16 3.13a4 4 0 010 7.75" },
  course_reopened: { bg: "#DBEAFE", fg: "#2563EB", d: "M1 4v6h6 M3.5 9a9 9 0 101.4-5.5" },
  gradeDist: { bg: "#FEF3C7", fg: "#D97706", d: "M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01" },
  coursePass: { bg: "#DCFCE7", fg: "#16A34A", d: "M9 12l2 2 4-4 M12 21a9 9 0 110-18 9 9 0 010 18z" },
  courseFail: { bg: "#FEE2E2", fg: "#DC2626", d: "M6 6l12 12 M18 6L6 18" },
  certIssued: { bg: "#FEF3C7", fg: "#D97706", d: "M8 21h8 M12 17v4 M7 4h10v5a5 5 0 01-10 0V4z" },
  certRevoked: { bg: "#FEE2E2", fg: "#DC2626", d: "M6 6l12 12 M18 6L6 18" }
};

const CAT_TONE = {
  Grades: { bg: "#FEF3C7", fg: "#D97706", d: "M8 21h8 M12 17v4 M7 4h10v5a5 5 0 01-10 0V4z" },
  Homework: { bg: "#DCFCE7", fg: "#16A34A", d: "M4 19V5h10l6 6v8H4z M14 5v6h6" },
  Announcements: { bg: "#DBEAFE", fg: "#2563EB", d: "M3 11v2h2l8 5V6L5 11H3z M18 8a4 4 0 010 8" },
  Quizzes: { bg: "#EDE9FE", fg: "#7C3AED", d: "M12 17h.01 M9.1 9a3 3 0 115.8 1c0 2-3 2-3 4 M12 21a9 9 0 110-18 9 9 0 010 18z" },
  Courses: { bg: "#FEE2E2", fg: "#DC2626", d: "M12 9v4 M12 17h.01 M12 21a9 9 0 110-18 9 9 0 010 18z" }
};

export function toneFor(n) {
  return TYPE_TONE[n?.type] || CAT_TONE[n?.category] || CAT_TONE.Courses;
}

export function bucketDay(ms) {
  const d = new Date(ms);
  const today = new Date();
  const start = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const t0 = start(today);
  const t = start(d);
  if (t === t0) return "Today";
  if (t > t0 - 7 * 86400000) return "This week";
  return "Earlier";
}

function courseMap() {
  const packs = [
    window.__ghzTrainerStore,
    window.__ghzStudentStore,
    window.__ghzAdminStore,
    window.__ghzCourses
  ];
  const map = {};
  packs.forEach((p) => {
    const list = Array.isArray(p) ? p : (p?.courses || p?.state?.courses || p?.items || []);
    (list || []).forEach((c) => {
      if (!c) return;
      const id = c.id || c.courseId;
      const title = c.title || c.name || c.courseTitle;
      if (id && title) map[id] = title;
      if (c.slug && title) map[c.slug] = title;
    });
  });
  return map;
}

export function prettyCourse(n) {
  const raw = String((n && (n.courseTitle || n.courseId)) || "").trim();
  if (!raw) return "";
  const map = courseMap();
  if (n?.courseId && map[n.courseId]) return map[n.courseId];
  if (map[raw]) return map[raw];
  if (/^[a-z0-9]+(-[a-z0-9]+)+$/i.test(raw)) {
    return raw.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return raw;
}

function groupCards(list) {
  const out = [];
  const used = new Set();
  list.forEach((n) => {
    if (used.has(n.id)) return;
    const day = bucketDay(n.time);
    const pack = list.filter((x) => !used.has(x.id) && x.type === n.type && x.courseTitle === n.courseTitle && bucketDay(x.time) === day);
    if (pack.length >= 2 && !n.celebrate) {
      pack.forEach((x) => used.add(x.id));
      const label = n.category === "Quizzes" ? "quizzes" : n.category === "Homework" ? "homeworks" : n.category === "Announcements" ? "announcements" : n.category === "Grades" ? "grades" : n.category.toLowerCase();
      const title = prettyCourse(n);
      out.push({
        kind: "group",
        id: "g_" + n.type + "_" + n.courseTitle + "_" + day,
        title: pack.length + " new " + label + (title ? " in " + title : ""),
        kids: pack,
        time: pack[0].time,
        n,
        count: pack.length,
        courseTitle: title,
        category: n.category
      });
    } else {
      used.add(n.id);
      out.push({ kind: "one", n });
    }
  });
  return out;
}

function tile(n, page) {
  const t = toneFor(n);
  return h("span", { className: page ? "nt2-ico nt2-ico-lg" : "nt2-ico", style: { background: t.bg, color: t.fg } }, svg(t.d, t.fg, page ? 18 : 16));
}

function typeLabel(cat) {
  return cat === "Announcements" ? "News" : (cat || "");
}

function row(n, unreadItem, onOpen, onRead, page) {
  const course = prettyCourse(n);
  const type = typeLabel(n.category);
  return h("div", {
    className: "nt2-row" + (unreadItem ? " nt2-unread" : "") + (page ? " nt2-row-page" : ""),
    key: n.id
  },
    h("button", { type: "button", className: "nt2-main", onClick: () => onOpen(n) },
      tile(n, page),
      h("span", { className: "nt2-body" },
        h("span", { className: "nt2-line1" },
          h("strong", null, n.title)
        ),
        n.message ? h("span", { className: "nt2-msg" }, n.message) : null,
        h("span", { className: "nt2-pills" },
          course ? h("span", { className: "nt2-chip" }, course) : null,
          page && type ? h("span", { className: "nt2-chip nt2-chip-type" }, type) : null
        )
      ),
      h("span", { className: "nt2-meta" },
        unreadItem ? h("span", { className: "nt2-udot", "aria-hidden": "true" }) : null,
        h("span", { className: "nt2-time" }, n.rel)
      )
    ),
    unreadItem ? h("button", {
      type: "button",
      className: "nt2-read",
      "aria-label": "Mark as read",
      title: "Mark as read",
      onClick: (e) => { e.stopPropagation(); onRead(n); }
    }, svg("M5 12l5 5L20 7", "#16A34A", 14)) : null
  );
}

function groupRow(g, unreadSet, onOpen, onRead, page, expanded, onExp) {
  const first = g.kids[0];
  const unread = g.kids.some((k) => unreadSet.has(k.id));
  const type = typeLabel(g.category || first.category);
  const open = !!(expanded && expanded[g.id]);
  return h("div", { className: "nt2-group", key: g.id },
    h("div", { className: "nt2-row" + (unread ? " nt2-unread" : "") + (page ? " nt2-row-page" : "") },
      h("button", { type: "button", className: "nt2-main", onClick: () => onExp(g.id) },
        tile(first, page),
        h("span", { className: "nt2-body" },
          h("span", { className: "nt2-line1" }, h("strong", null, g.title)),
          h("span", { className: "nt2-pills" },
            g.courseTitle ? h("span", { className: "nt2-chip" }, g.courseTitle) : null,
            page && type ? h("span", { className: "nt2-chip nt2-chip-type" }, type) : null
          )
        ),
        h("span", { className: "nt2-meta" },
          unread ? h("span", { className: "nt2-udot", "aria-hidden": "true" }) : null,
          h("span", { className: "nt2-count" }, String(g.kids.length)),
          h("span", { className: "nt2-time" }, first.rel)
        )
      ),
      unread ? h("button", {
        type: "button",
        className: "nt2-read",
        "aria-label": "Mark as read",
        title: "Mark as read",
        onClick: (e) => { e.stopPropagation(); g.kids.forEach(onRead); }
      }, svg("M5 12l5 5L20 7", "#16A34A", 14)) : null
    ),
    open ? h("div", { className: "nt2-kids" }, g.kids.map((n) => row(n, unreadSet.has(n.id), onOpen, onRead, page))) : null
  );
}

export function filterItems(items, tab, muted, hidden, q) {
  const hid = new Set(hidden || []);
  const mut = new Set(muted || []);
  let list = items.filter((n) => !hid.has(n.id) && !mut.has(n.category));
  if (tab === "unread") list = list.filter((n) => n._unread);
  else if (tab && tab !== "all") list = list.filter((n) => n.category === tab);
  if (q) {
    const s = q.toLowerCase();
    list = list.filter((n) => (n.title + " " + n.message + " " + prettyCourse(n)).toLowerCase().includes(s));
  }
  return list;
}

function skel() {
  return h("div", { className: "nt2-skel-wrap" },
    [0, 1, 2, 3, 4].map((i) => h("div", { className: "nt2-skel", key: i },
      h("span", { className: "nt2-skel-ico" }),
      h("span", { className: "nt2-skel-lines" }, h("i"), h("i"))
    ))
  );
}

export function NotificationPanel(p) {
  if (!p.open && !p.page) return null;
  const { items, seenAt, readIds, tab, muted, hidden, loading, query } = p;
  const page = !!p.page;
  const limit = p.limit || 30;
  const unreadSet = new Set(items.filter((n) => n.time > (seenAt || 0) && !(readIds || []).includes(n.id) && !(hidden || []).includes(n.id) && !(muted || []).includes(n.category)).map((n) => n.id));
  const tagged = items.map((n) => ({ ...n, _unread: unreadSet.has(n.id) }));
  const shown = filterItems(tagged, tab, muted, hidden, query).slice().sort((a, b) => b.time - a.time);
  const sliced = page ? shown.slice(0, limit) : shown;
  const groups = { Today: [], "This week": [], Earlier: [] };
  sliced.forEach((n) => groups[bucketDay(n.time)].push(n));
  const counts = {};
  TABS.forEach((t) => {
    const list = t.id === "all" ? tagged.filter((n) => !hidden.includes(n.id) && !muted.includes(n.category))
      : t.id === "unread" ? tagged.filter((n) => n._unread)
      : tagged.filter((n) => n.category === t.id && n._unread && !hidden.includes(n.id) && !muted.includes(n.category));
    counts[t.id] = t.id === "all" ? list.filter((n) => n._unread).length : list.length;
  });
  const cats = ["Courses", "Homework", "Quizzes", "Grades", "Announcements"];
  const empty = h("div", { className: "nt2-empty" },
    h("span", { className: "nt2-emptyico", "aria-hidden": "true" }, svg("M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 01-3.46 0", "#94A3B8", 22)),
    h("p", null, "You're all caught up")
  );
  const listInner = ["Today", "This week", "Earlier"].map((g) => {
    const cards = groupCards(groups[g]);
    return cards.length ? h("div", { key: g, className: "nt2-day" },
      h("p", { className: "nt2-g" }, g),
      cards.map((c) => c.kind === "group"
        ? groupRow(c, unreadSet, p.onOpen, p.onRead, page, p.expanded, p.onExp)
        : row(c.n, unreadSet.has(c.n.id), p.onOpen, p.onRead, page))
    ) : null;
  });
  const more = page ? (shown.length > sliced.length
    ? h("div", { className: "nt2-morewrap" },
        h("p", { className: "nt2-shown" }, "Showing " + sliced.length + " of " + shown.length),
        h("button", { type: "button", className: "nt2-more", onClick: p.onMore }, "Load more"))
    : (shown.length ? h("p", { className: "nt2-shown" }, "Showing " + shown.length + " of " + shown.length + " · No more notifications") : null)) : null;
  const body = (loading && !(items && items.length)) ? skel() :
    (!shown.length ? empty : h("div", { className: "nt2-list" }, listInner, more));

  const tabs = h("div", { className: "nt2-tabs" },
    TABS.map((t) => h("button", {
      type: "button",
      className: tab === t.id ? "on" : "",
      onClick: () => p.onTab(t.id)
    }, t.label, counts[t.id] ? h("span", { className: "nt2-tbadge" }, String(counts[t.id])) : null))
  );

  if (page) {
    return h("div", { className: "nt2-page" },
      h("div", { className: "nt2-card" },
        h("div", { className: "nt2-page-head" },
          h("div", { className: "nt2-ht" },
            h("h2", null, "Notifications"),
            counts.all ? h("span", { className: "nt2-count" }, String(counts.all)) : null
          ),
          h("div", { className: "nt2-page-tools" },
            h("button", { type: "button", className: "nt2-all", onClick: p.onMarkAll }, "Mark all as read"),
            h("input", { className: "nt2-search", placeholder: "Search", value: query || "", onInput: (e) => p.onQuery(e.target.value) })
          )
        ),
        tabs,
        body
      )
    );
  }

  return h("div", {
    className: "nt2-panel",
    role: "dialog",
    "aria-label": "Notifications",
    style: p.panelStyle || {}
  },
    h("div", { className: "nt2-h" },
      h("div", { className: "nt2-ht" },
        h("strong", null, "Notifications"),
        counts.all ? h("span", { className: "nt2-count" }, String(counts.all)) : null
      ),
      h("button", { type: "button", className: "nt2-all", onClick: p.onMarkAll }, "Mark all as read")
    ),
    tabs,
    body,
    h("div", { className: "nt2-footrow" },
      h("button", { type: "button", className: "nt2-see", onClick: p.onSeeAll }, "View all notifications"),
      h("button", { type: "button", className: "nt2-gear", "aria-label": "Settings", onClick: p.onGear }, "⚙")
    ),
    p.settings ? h("div", { className: "nt2-set" },
      h("strong", null, "Categories"),
      cats.map((c) => h("label", { className: "nt2-tog" },
        h("input", { type: "checkbox", checked: !muted.includes(c), onChange: () => p.onMute(c) }),
        h("span", null, c)
      ))
    ) : null
  );
}
