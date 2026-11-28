export const ROUTE_ALIAS = {
  dash: "dash", dashboard: "dash",
  quizzes: "quizzes", quiz: "quizzes", quizv2: "quizzes", quiztake: "quizzes",
  homework: "homework", homeworkv2: "homework",
  attendance: "attendance", attendancev2: "attendance",
  schedule: "schedule", schedulev2: "schedule",
  browse: "browse", browsev2: "browse",
  courses: "courses", coursesv2: "courses", course: "courses", coursecontent: "courses",
  regs: "regs", regsv2: "regs",
  grades: "grades", gradesv2: "grades",
  certificates: "certificates",
  announcements: "announcements",
  profile: "profile", profilev2: "profile",
  notifications: "notifications"
};
export function canonicalNavKey(hashOrName) {
  const raw = String(hashOrName || "").replace(/^#/, "").split("/")[0] || "dash";
  const base = raw.replace(/v2$/, "") || "dash";
  return ROUTE_ALIAS[raw] || ROUTE_ALIAS[base] || base;
}
function revealActiveNavItem(nav) {
  if (!nav) return;
  const on = nav.querySelector("a.on");
  if (!on || typeof on.scrollIntoView !== "function") return;
  const nr = nav.getBoundingClientRect();
  const ir = on.getBoundingClientRect();
  if (ir.top < nr.top || ir.bottom > nr.bottom) on.scrollIntoView({ block: "nearest" });
}
export function highlightStudentNav(name) {
  const key = canonicalNavKey(name || (typeof location !== "undefined" ? location.hash : "dash"));
  document.querySelectorAll(".side nav a[data-view]").forEach((a) => {
    a.classList.toggle("on", canonicalNavKey(a.dataset.view) === key);
  });
  revealActiveNavItem(document.querySelector(".side nav"));
}

const ITEMS = [
  { href: "./student.html#dash", label: "Dashboard", key: "dash" },
  { href: "./student.html#browse", label: "Browse courses", key: "browse" },
  { href: "./student.html#courses", label: "My courses", key: "courses" },
  { href: "./student.html#regs", label: "My registrations", key: "regs" },
  { href: "./student.html#homework", label: "Homework", key: "homework" },
  { href: "./student.html#quizzes", label: "Quizzes", key: "quizzes" },
  { href: "./student.html#grades", label: "Grades", key: "grades" },
  { href: "./student.html#schedule", label: "Schedule", key: "schedule" },
  { href: "./student.html#attendance", label: "Attendance", key: "attendance" },
  { href: "./student.html#announcements", label: "Announcements", key: "announcements" },
  { href: "./student.html#certificates", label: "Certificates", key: "certificates" },
  { href: "./student.html#profile", label: "Profile", key: "profile" }
];

export function studentNavHtml(active) {
  return ITEMS.map((it) => {
    const on = it.key === active ? " on" : "";
    const extra = it.key === "browse" ? " id=\"navBrowse\"" : "";
    const same = typeof location !== "undefined" && /student\.html/i.test(location.pathname || "");
    const dv = same && ["dash","browse","courses","regs","homework","quizzes","grades","schedule","attendance","announcements","certificates","profile"].includes(it.key)
      ? ` data-view="${it.key}"` : "";
    const href = same && dv ? it.href.replace("./student.html", "") : it.href;
    const badge = it.key === "announcements" ? ` <span id="annBadge" class="ann-side-badge" hidden></span>` : "";
    return `<a class="${on.trim()}" href="${href}"${extra}${dv}>${it.label}${badge}</a>`;
  }).join("");
}

export function mountStudentNav(active) {
  const key = canonicalNavKey(active);
  document.querySelectorAll("[data-student-nav]").forEach((nav) => {
    if (!nav.querySelector("a[data-view]")) nav.innerHTML = studentNavHtml(key);
  });
  highlightStudentNav(key);
}

export function bootStudentNav(active) {
  const run = () => {
    mountStudentNav(active);
    import("./PortalShell.js?v=r2").then((m) => { try { m.bootPortalShell(); } catch (_) {} }).catch(() => {});
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run);
  else run();
}
