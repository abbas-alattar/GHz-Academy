const ICO = {
  dash: '<svg class="nav-ico icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>',
  courses: '<svg class="nav-ico icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M4 4.5A2.5 2.5 0 0 1 6.5 7H20v13H6.5A2.5 2.5 0 0 1 4 17.5z"/></svg>',
  regs: '<svg class="nav-ico icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>',
  students: '<svg class="nav-ico icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>',
  trainers: '<svg class="nav-ico icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  reports: '<svg class="nav-ico icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 3v18h18"/><path d="M7 14l4-4 4 4 5-6"/></svg>',
  balance: '<svg class="nav-ico icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M2 10h20"/><circle cx="16" cy="14" r="1.4"/></svg>',
  grades: '<svg class="nav-ico icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 19h16"/><path d="M8 17V7h8v10"/></svg>',
  ann: '<svg class="nav-ico icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 11v2h2l8 5V6L5 11H3z"/><path d="M19 8a5 5 0 0 1 0 8"/></svg>',
  cert: '<svg class="nav-ico icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="6"/><path d="M8.5 13.5L7 22l5-2 5 2-1.5-8.5"/></svg>',
  msg: '<svg class="nav-ico icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
  set: '<svg class="nav-ico icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9c.3.6.9 1 1.5 1.1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>'
};

export function adminNavHtml(active) {
  const on = (k) => active === k ? " class=\"on\"" : "";
  return `<a class="brand" href="./index.html" aria-label="GHz Academy"><svg viewBox="0 0 40 22" fill="none" aria-hidden="true"><path d="M2 11c3-8 7-8 10 0s7 8 10 0 7-8 10 0 4 6 6 0" stroke="#2EC8FF" stroke-width="2.6" stroke-linecap="round"/></svg><span class="ghz">GHz</span> <span class="acad">Academy</span></a>
      <nav>
        <a${on("dash")} href="./admin.html#dash">${ICO.dash}Dashboard</a>
        <a${on("courses")} href="./admin.html#courses">${ICO.courses}Courses</a>
        <a${on("regs")} href="./admin.html#registrations">${ICO.regs}Registrations</a>
        <a${on("students")} href="./admin.html#students">${ICO.students}Students</a>
        <a${on("trainers")} href="./admin.html#trainers">${ICO.trainers}Trainers</a>
        <a${on("reports")} href="./admin.html#reports">${ICO.reports}Reports</a>
        <a${on("balance")} href="./admin.html#balance" data-view="balance">${ICO.balance}Balance</a>
        <a${on("grades")} href="./admin.html#grades">${ICO.grades}Grades</a>
        <a${on("ann")} href="./admin.html#announcements">${ICO.ann}Announcements</a>
        <a${on("cert")} href="./admin.html#certificates">${ICO.cert}Certificates</a>
        <a${on("msg")} href="./admin.html#messages">${ICO.msg}Messages <span id="msgBadge" class="ann-side-badge" hidden></span></a>
        <a${on("settings")} href="./admin.html#settings">${ICO.set}Settings</a>
      </nav>`;
}

export function paintCachedAdminWho() {
  let cached = {};
  try { cached = JSON.parse(localStorage.getItem("ghz-shell") || "{}") || {}; } catch (_) {}
  const nameEl = document.getElementById("userName");
  const roleEl = document.getElementById("userRole");
  const name = String(cached.name || "").trim() || "Abbas Alattar";
  const role = String(cached.role || "admin").toLowerCase();
  const roleLabel = role === "trainer" ? "Trainer" : role === "admin" ? "Admin" : "Student";
  if (nameEl) nameEl.textContent = name;
  if (roleEl) roleEl.textContent = roleLabel;
}

export function bootAdminSide(active) {
  const side = document.querySelector("aside.side");
  if (!side) return;
  const nav = side.querySelector("nav");
  const empty = !nav || !nav.querySelector("a");
  if (empty) side.innerHTML = adminNavHtml(active);
  else {
    nav.querySelectorAll("a").forEach((a) => {
      const href = a.getAttribute("href") || "";
      const isOn = active === "reports" ? href.includes("admin-reports") :
        active === "grades" ? href.includes("admin-grades") :
        active === "ann" ? href.includes("admin-announcements") :
        active === "cert" ? href.includes("admin-certificates") :
        active === "msg" ? href.includes("admin-messages") :
        a.getAttribute("data-view") === active || href.includes("#" + active);
      a.classList.toggle("on", !!isOn);
    });
  }
  paintCachedAdminWho();
}
