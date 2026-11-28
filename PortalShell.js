const KEY = "ghz-shell";

function readShell() {
  try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch { return {}; }
}
function writeShell(p) {
  try {
    const cur = { ...readShell(), ...p };
    localStorage.setItem(KEY, JSON.stringify(cur));
  } catch {}
}

function roleFromPath() {
  const p = (location.pathname || "").toLowerCase();
  if (p.includes("admin")) return "admin";
  if (p.includes("trainer")) return "trainer";
  return "student";
}

function sectionsFor(role) {
  if (role === "trainer") return [
    { t: "My courses", h: "#courses" },
    { t: "Homework", h: "#homework" },
    { t: "Quizzes", h: "#quizzes" },
    { t: "Grades", h: "#grades" },
    { t: "Attendance", h: "#attendance" },
    { t: "Announcements", h: "#announcements" }
  ];
  if (role === "admin") return [
    { t: "Dashboard", h: "./admin.html#dash" },
    { t: "Courses", h: "./admin.html#courses" },
    { t: "Registrations", h: "./admin.html#registrations" },
    { t: "Students", h: "./admin.html#students" },
    { t: "Trainers", h: "./admin.html#trainers" },
    { t: "Reports", h: "./admin.html#reports" },
    { t: "Balance", h: "./admin.html#balance" },
    { t: "Grades", h: "./admin-grades.html" },
    { t: "Announcements", h: "./admin-announcements.html" },
    { t: "Certificates", h: "./admin-certificates.html" },
    { t: "Messages", h: "./admin-messages.html" },
    { t: "Settings", h: "./admin.html#settings" }
  ];
  return [
    { t: "Dashboard", h: "./student.html#dash" },
    { t: "Browse courses", h: "./student.html#browse" },
    { t: "My courses", h: "./student.html#courses" },
    { t: "My registrations", h: "./student.html#regs" },
    { t: "Homework", h: "./student.html#homework" },
    { t: "Quizzes", h: "./student-quizzes.html" },
    { t: "Grades", h: "./student-grades.html" },
    { t: "Schedule", h: "./student.html#schedule" },
    { t: "Attendance", h: "./student.html#attendance" },
    { t: "Announcements", h: "./student-announcements.html" },
    { t: "Certificates", h: "./student-certificates.html" },
    { t: "Profile", h: "./student.html#profile" }
  ];
}

function goHit(h) {
  const s = String(h || "");
  if (s.startsWith("#") && typeof window.__ghzTrainerGo === "function") {
    window.__ghzTrainerGo(s);
    return;
  }
  if (s.startsWith("#")) {
    location.hash = s;
    return;
  }
  location.href = s;
}

function dashCache() {
  try {
    const raw = sessionStorage.getItem("ghz-dash-search") || localStorage.getItem("ghz-dash-search");
    if (raw) return JSON.parse(raw);
  } catch {}
  return window.__ghzDash || null;
}

function collect(role, q) {
  const n = String(q || "").trim().toLowerCase();
  if (n.length < 1) return [];
  const out = [];
  const push = (group, t, h) => {
    if (String(t || "").toLowerCase().includes(n)) out.push({ group, t, h });
  };
  sectionsFor(role).forEach((s) => push("Sections", s.t, s.h));
  const d = dashCache() || {};
  const courses = d.courses ? Object.values(d.courses) : (d.courseList || []);
  courses.forEach((c) => push("Courses", c.title || c.name, role === "student" ? "./student.html#courses" : (role === "trainer" ? "./trainer.html#courses" : "./admin.html#courses")));
  (d.assignments || []).forEach((a) => push("Homework", a.title, role === "student" ? "./student.html#homework" : "./trainer.html#homework"));
  (d.quizzes || []).forEach((qz) => push("Quizzes", qz.title, role === "student" ? "./student-quizzes.html" : (role === "trainer" ? "#quizzes" : "./admin.html#grades")));
  (d.announcements || []).forEach((a) => push("Announcements", a.title, role === "student" ? "./student-announcements.html" : (role === "trainer" ? "#announcements" : "./admin.html#announcements")));
  (d.students || []).forEach((s) => push("Students", s.name || s.email, "./admin.html#students"));
  (d.trainers || []).forEach((s) => push("Trainers", s.name || s.email, "./admin.html#trainers"));
  const seen = new Set();
  return out.filter((x) => {
    const k = x.group + x.t + x.h;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 8);
}

function paintHits(box, hits, idx) {
  if (!hits.length) {
    box.innerHTML = '<p class="ghz-snone">No results</p>';
    return;
  }
  let html = "";
  let last = "";
  hits.forEach((h, i) => {
    if (h.group !== last) { html += `<div class="ghz-sg">${h.group}</div>`; last = h.group; }
    html += `<button type="button" class="ghz-si${i === idx ? " on" : ""}" data-i="${i}"><i></i>${h.t}</button>`;
  });
  box.innerHTML = html;
}

function ensureSideBrandRow() {
  const aside = document.querySelector(".portal > .side");
  if (!aside) return;
  const brand = aside.querySelector("a.brand");
  if (!brand) return;
  brand.classList.add("ghz-logo");
  let row = aside.querySelector(".side-brand-row");
  if (!row) {
    row = document.createElement("div");
    row.className = "side-brand-row";
    brand.parentNode.insertBefore(row, brand);
    row.appendChild(brand);
  }
  let btn = row.querySelector(".stu-collapse");
  if (!btn) {
    btn = document.createElement("button");
    btn.type = "button";
    btn.className = "stu-collapse";
    row.appendChild(btn);
  }
  const laptop = () => window.innerWidth >= 1024;
  const apply = () => {
    let want = false;
    try { want = localStorage.getItem("ghz-stu-side") === "1"; } catch {}
    if (!laptop()) {
      document.body.classList.remove("stu-collapsed");
    } else {
      const auto = window.innerWidth < 1200;
      document.body.classList.toggle("stu-collapsed", want || auto);
    }
    const on = document.body.classList.contains("stu-collapsed");
    btn.textContent = on ? "›" : "‹";
    btn.title = on ? "Expand menu" : "Collapse menu";
    btn.setAttribute("aria-label", on ? "Expand menu" : "Collapse menu");
    btn.setAttribute("aria-expanded", on ? "false" : "true");
  };
  const toggle = () => {
    if (!laptop()) return;
    const next = !document.body.classList.contains("stu-collapsed");
    document.body.classList.toggle("stu-collapsed", next);
    try { localStorage.setItem("ghz-stu-side", next ? "1" : "0"); } catch {}
    apply();
  };
  apply();
  if (!window.__ghzSideResizeBound) {
    window.__ghzSideResizeBound = true;
    window.addEventListener("resize", apply);
  }
  if (!btn.dataset.bound) {
    btn.dataset.bound = "1";
    btn.addEventListener("click", toggle);
  }
  let x = row.querySelector(".ghz-drawer-x");
  if (!x) {
    x = document.createElement("button");
    x.type = "button";
    x.className = "ghz-drawer-x phone-only";
    x.setAttribute("aria-label", "Close menu");
    x.textContent = "×";
    x.addEventListener("click", () => document.body.classList.remove("ghz-nav-open", "stu-drawer"));
    row.appendChild(x);
  }
  let foot = aside.querySelector(".ghz-drawer-foot");
  if (!foot) {
    foot = document.createElement("div");
    foot.className = "ghz-drawer-foot";
    aside.appendChild(foot);
  }
  const logout = aside.querySelector(".stu-logout-row");
  const user = aside.querySelector(".stu-usercard") || aside.querySelector(".user");
  if (logout && logout.parentNode !== foot) foot.appendChild(logout);
  if (user && user.parentNode !== foot) foot.appendChild(user);
  const nav = aside.querySelector("nav");
  const card = aside.querySelector(".stu-account-card") || aside.querySelector(".stu-theme-root");
  if (card) {
    card.classList.add("stu-account-card");
    card.style.order = "";
    if (card.parentNode !== aside) aside.appendChild(card);
  }
  [row, nav, foot].forEach((el) => { if (el) el.style.order = ""; });
  if (nav) {
    requestAnimationFrame(() => {
      try {
        console.log("[ghz-menu]", nav.clientHeight, nav.scrollHeight, window.innerHeight);
      } catch {}
      const on = nav.querySelector("a.on");
      if (on && typeof on.scrollIntoView === "function") on.scrollIntoView({ block: "nearest" });
    });
  }
  if (!window.__ghzSideToggleBound) {
    window.__ghzSideToggleBound = true;
    document.addEventListener("keydown", (e) => {
      if (e.key !== "[") return;
      const t = e.target;
      if (t && (t.closest("input, textarea, select, [contenteditable=true]"))) return;
      if (window.matchMedia("(max-width: 900px)").matches) return;
      e.preventDefault();
      toggle();
    });
  }
}

function ensureContentScroller() {
  if (!window.matchMedia("(min-width: 1024px)").matches) return;
  const main = document.querySelector(".portal > .main");
  if (!main) return;
  let pane = main.querySelector(".ghz-scroll");
  if (!pane) {
    pane = document.createElement("div");
    pane.className = "ghz-scroll";
    const kids = [...main.children].filter((el) => !el.classList.contains("top"));
    kids.forEach((el) => pane.appendChild(el));
    main.appendChild(pane);
  }
  pane.tabIndex = -1;
  const focusTop = () => {
    pane.scrollTop = 0;
    try { pane.focus({ preventScroll: true }); } catch { try { pane.focus(); } catch {} }
  };
  focusTop();
  if (!pane.dataset.routeBound) {
    pane.dataset.routeBound = "1";
    window.addEventListener("hashchange", focusTop);
    window.addEventListener("popstate", focusTop);
  }
}

export function bootPortalShell() {
  ensureSideBrandRow();
  ensureContentScroller();
  // The page you are on decides the role (a value remembered from another portal page could be stale).
  const role = roleFromPath();
  document.body.classList.remove("portal-student", "portal-trainer", "portal-admin");
  document.body.classList.add("portal-" + role);
  const name = readShell().name;
  writeShell({ role, name: name || readShell().name });
  const nameEl = document.getElementById("userName");
  const roleEl = document.getElementById("userRole");
  const shell = readShell();
  const shown = name || shell.name;
  if (nameEl && shown) nameEl.textContent = shown;
  if (roleEl) roleEl.textContent = role.charAt(0).toUpperCase() + role.slice(1);

  const top = document.querySelector(".top");
  if (top && !top.querySelector(".ghz-menu")) {
    const mb = document.createElement("button");
    mb.type = "button";
    mb.className = "ghz-menu";
    mb.setAttribute("aria-label", "Open menu");
    mb.textContent = "☰";
    mb.addEventListener("click", () => document.body.classList.toggle("stu-drawer"));
    top.insertBefore(mb, top.firstChild);
  }
  const actions = document.querySelector(".top-actions");
  const searchPh = () => {
    if (role === "admin") return "Search students, courses, registrations\u2026";
    if (role === "trainer") return "Search courses, students, homework\u2026";
    return "Search courses, homework, grades\u2026";
  };
  const fitSearchPh = (el) => {
    const inp = el?.querySelector("#ghzSearch, input");
    if (!inp || !el) return;
    inp.placeholder = el.getBoundingClientRect().width < 300 ? "Search\u2026" : searchPh();
  };
  const existing = actions?.querySelector(".ghz-search");
  if (existing) {
    fitSearchPh(existing);
    window.addEventListener("resize", () => fitSearchPh(existing));
    return;
  }
  if (!actions) return;
  const wrap = document.createElement("div");
  wrap.className = "ghz-search";
  wrap.innerHTML = `<label class="sr-only" for="ghzSearch" style="position:absolute;left:-9999px">Search</label>
    <input id="ghzSearch" type="text" placeholder="Search courses, homework, grades\u2026" autocomplete="off" />
    <kbd>Ctrl K</kbd>
    <div class="ghz-search-drop" hidden></div>`;
  requestAnimationFrame(() => fitSearchPh(wrap));
  window.addEventListener("resize", () => fitSearchPh(wrap));
  const first = actions.firstChild;
  if (first) actions.insertBefore(wrap, first);
  else actions.appendChild(wrap);
  const input = wrap.querySelector("input");
  const drop = wrap.querySelector(".ghz-search-drop");
  let hits = [];
  let idx = 0;
  const close = () => { drop.hidden = true; hits = []; };
  const open = () => {
    hits = collect(role, input.value);
    idx = 0;
    drop.hidden = false;
    paintHits(drop, hits, idx);
  };
  input.addEventListener("input", () => {
    if (String(input.value).trim().length < 1) { close(); return; }
    open();
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { input.value = ""; close(); e.preventDefault(); return; }
    if (e.key === "ArrowDown") { idx = Math.min(hits.length - 1, idx + 1); paintHits(drop, hits, idx); e.preventDefault(); }
    if (e.key === "ArrowUp") { idx = Math.max(0, idx - 1); paintHits(drop, hits, idx); e.preventDefault(); }
    if (e.key === "Enter" && hits[idx]) { goHit(hits[idx].h); }
  });
  drop.addEventListener("mousedown", (e) => {
    const b = e.target.closest(".ghz-si");
    if (!b) return;
    const i = Number(b.getAttribute("data-i"));
    if (hits[i]) goHit(hits[i].h);
  });
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === "k") {
      e.preventDefault();
      input.focus();
    }
  });
  document.addEventListener("click", (e) => {
    if (!wrap.contains(e.target)) close();
  });
}

export function rememberShell(profile) {
  if (!profile) return;
  writeShell({ role: profile.role, name: profile.name });
}

window.addEventListener("ghz-dash-data", (ev) => {
  try { sessionStorage.setItem("ghz-dash-search", JSON.stringify(ev.detail || {})); } catch {}
  window.__ghzDash = ev.detail;
});
if (typeof window !== "undefined" && !window.__ghzLayoutLogged) {
  window.__ghzLayoutLogged = true;
  requestAnimationFrame(() => {
    try {
      const out = document.querySelector(".out, #logoutBtn");
      const card = document.querySelector(".asv2-card, .atv2-card, .arv2-card, .acv2-card");
      console.log("[ghz-layout]", {
        logoutRight: out ? Math.round(out.getBoundingClientRect().right) : null,
        cardRight: card ? Math.round(card.getBoundingClientRect().right) : null,
        innerWidth: window.innerWidth
      });
    } catch {}
  });
}
