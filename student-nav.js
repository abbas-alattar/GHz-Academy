const ITEMS = [
  { href: "./student.html#dash", label: "Dashboard", key: "dash" },
  { href: "./student.html#browse", label: "Browse courses", key: "browse" },
  { href: "./student.html#courses", label: "My courses", key: "courses" },
  { href: "./student.html#regs", label: "My registrations", key: "regs" },
  { href: "./student.html#homework", label: "Homeworks", key: "homework" },
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
  document.querySelectorAll("[data-student-nav]").forEach((nav) => {
    if (!nav.children.length) nav.innerHTML = studentNavHtml(active);
    const links = nav.getElementsByTagName("a");
    for (let i = 0; i < links.length; i++) {
      const a = links[i];
      const key = a.getAttribute("data-view") || "";
      const href = a.getAttribute("href") || "";
      const on = (key && key === active) || (!key && href.indexOf(active) >= 0);
      a.classList.toggle("on", !!on);
    }
  });
}

export function bootStudentNav(active) {
  const run = () => {
    mountStudentNav(active);
    import("./PortalShell.js").then((m) => { try { m.bootPortalShell(); } catch (_) {} }).catch(() => {});
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run);
  else run();
}
