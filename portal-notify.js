const KEY = (uid) => "ghz-bell-" + uid;

const BELL_SVG = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0F2747" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`;

function esc(s) {
  return String(s ?? "").replace(/&/g, "&" + "amp;").replace(/</g, "&" + "lt;").replace(/"/g, "&" + "quot;");
}

function itemsFor(role) {
  if (role === "admin") {
    return [
      { id: "regs", title: "New registrations to review", href: "./admin.html#registrations" },
      { id: "msg", title: "Messages from the landing form", href: "./admin-messages.html" },
      { id: "certs", title: "Certificates ready to issue", href: "./admin-certificates.html" }
    ];
  }
  if (role === "trainer") {
    return [
      { id: "hw", title: "Homework waiting to grade", href: "./trainer.html#homework" },
      { id: "att", title: "Mark attendance for upcoming sessions", href: "./trainer.html#attendance" },
      { id: "ann", title: "Post a course announcement", href: "./trainer-announcements.html" }
    ];
  }
  return [
    { id: "ann", title: "New announcements from your courses", href: "./student-announcements.html" },
    { id: "hw", title: "Homework due this week", href: "./student.html#homework" },
    { id: "qz", title: "Quizzes ready to take", href: "./student-quizzes.html" }
  ];
}

function ensureHost() {
  let host = document.querySelector(".nv2-slot");
  if (host) return host;
  const btn = document.getElementById("notifyBtn");
  if (btn && btn.parentNode) {
    host = document.createElement("div");
    host.className = "nv2-slot";
    btn.replaceWith(host);
    const panel = document.getElementById("notifyPanel");
    if (panel) panel.remove();
    return host;
  }
  const top = document.querySelector(".top");
  if (!top) return null;
  let actions = top.querySelector(".top-actions");
  if (!actions) {
    actions = document.createElement("div");
    actions.className = "top-actions";
    const who = top.querySelector(".who");
    if (who) top.insertBefore(actions, who);
    else top.appendChild(actions);
  }
  host = document.createElement("div");
  host.className = "nv2-slot";
  const who = actions.querySelector(".who");
  if (who) actions.insertBefore(host, who);
  else actions.insertBefore(host, actions.firstChild);
  return host;
}

function fallbackBell(role, uid, host) {
  if (!host) return;
  const list = itemsFor(role);
  let read = [];
  try { read = JSON.parse(localStorage.getItem(KEY(uid || "anon")) || "[]"); } catch (_) {}
  const unread = list.filter((x) => !read.includes(x.id)).length;
  host.innerHTML = `<button class="notify-btn nv2-bell" type="button" aria-label="Notifications">${BELL_SVG}${unread ? `<span class="notify-badge nv2-badge">${unread}</span>` : ""}</button>
    <div class="notify-panel" hidden><div class="notify-h">Notifications</div>${list.map((x) => `<a href="${x.href}">${esc(x.title)}</a>`).join("")}<button type="button" class="notify-clear">Mark all read</button></div>`;
  const b = host.querySelector(".notify-btn");
  const p = host.querySelector(".notify-panel");
  b.onclick = (e) => { e.preventDefault(); e.stopPropagation(); p.hidden = !p.hidden; };
  document.addEventListener("click", (ev) => {
    if (p.hidden) return;
    if (host.contains(ev.target)) return;
    p.hidden = true;
  });
  host.querySelector(".notify-clear")?.addEventListener("click", () => {
    localStorage.setItem(KEY(uid || "anon"), JSON.stringify(list.map((x) => x.id)));
    p.hidden = true;
  });
}

export async function bootNotify({ role, uid }) {
  const host = ensureHost();
  if (!host) return;
  if (!host.querySelector(".notify-btn, .nv2-bell")) fallbackBell(role, uid, host);
  if (window.__ghzNotifyV2) return;
  try {
    const { mountNotificationsV2 } = await import("./NotificationsV2.js");
    const ok = mountNotificationsV2({ role, uid, host });
    if (ok) { window.__ghzNotifyV2 = true; return; }
  } catch (e) { console.error("NotificationsV2", e); }
  fallbackBell(role, uid, host);
}

if (typeof document !== "undefined") {
  const go = () => {
    const host = ensureHost();
    if (host && !host.querySelector(".notify-btn, .nv2-bell")) fallbackBell("student", "", host);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go);
  else go();
}
