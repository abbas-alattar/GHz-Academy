import { loadAnnouncementReads, markAnnouncementRead, markAllAnnouncementsRead, isRead, unreadCount, onAnnouncementReads } from "./announcementReads.js";

const esc = (s) => String(s ?? "").replace(/&/g,"&"+"amp;").replace(/</g,"&"+"lt;").replace(/"/g,"&"+"quot;");
const state = { tab: "all", course: "all", more: {}, uid: "", tick: 0 };

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
  const w = Math.floor(d / 7);
  return w + (w === 1 ? " week ago" : " weeks ago");
}
function initials(name) {
  const parts = String(name || "A").trim().split(/\s+/).filter(Boolean);
  const a = (parts[0] || "A").charAt(0);
  const b = (parts[1] || "").charAt(0);
  return (a + b).toUpperCase();
}
function isAdmin(a) {
  return String(a?.authorRole || "").toLowerCase() === "admin";
}
function isAcademy(a) {
  return String(a?.courseId || "") === "all" || !a?.courseId;
}
function prettyTitle(a) {
  const t = String(a?.title || "").trim();
  return t || "Announcement";
}
function bodyText(a) {
  return String(a?.body || a?.message || "").trim();
}
function courseLabel(a, courses) {
  if (isAcademy(a)) return "Everyone";
  const id = String(a.courseId || "");
  const map = courses || {};
  const title = map[id] || a.courseTitle || "";
  if (title && title !== id && !/^[a-z0-9-]{8,}$/.test(title)) return title;
  if (map[id]) return map[id];
  return "My course";
}
function groupOf(a) {
  const ms = millis(a.createdAt);
  const now = Date.now();
  const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
  const weekAgo = now - 7 * 86400000;
  if (ms >= startToday.getTime()) return "today";
  if (ms >= weekAgo) return "week";
  return "earlier";
}
function emptyIcon() {
  return `<svg width="36" height="36" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 6h16v12H4z" stroke="#64748B" stroke-width="2"/><path d="M4 9h16" stroke="#64748B" stroke-width="2"/></svg>`;
}

function cardHtml(a, courses, newestId) {
  const admin = isAdmin(a);
  const author = String(a.authorName || (admin ? "Admin" : "Trainer")).trim() || "Academy";
  const long = bodyText(a).length > 220;
  const open = !!state.more[a.id];
  const tip = fullWhen(a.createdAt);
  const unread = state.uid ? !isRead(state.uid, a.id) : false;
  const isNew = newestId === a.id && (Date.now() - millis(a.createdAt) < 86400000);
  return `<article class="an2-card${admin ? " admin" : ""}${unread ? " unread" : ""}" data-an2-open="${esc(a.id)}">
    <div class="an2-av">${esc(initials(author))}</div>
    <div>
      <h3 class="an2-title">${unread ? `<span class="an2-dot"></span>` : ""}${esc(prettyTitle(a))}${isNew ? `<span class="an2-new">New</span>` : ""}</h3>
      <p class="an2-meta">
        <span title="${esc(tip)}">${esc(author)}</span>
        <span class="an2-role ${admin ? "admin" : "trainer"}">${admin ? "Admin" : "Trainer"}</span>
        <span title="${esc(tip)}">${esc(relative(a.createdAt))}</span>
        <span class="an2-scope ${isAcademy(a) ? "all" : "course"}">${esc(courseLabel(a, courses))}</span>
      </p>
      <p class="an2-body${long && !open ? " clamp" : ""}">${esc(bodyText(a))}</p>
      ${long ? `<button type="button" class="an2-more" data-an2-more="${esc(a.id)}">${open ? "Show less" : "Show more"}</button>` : ""}
    </div>
  </article>`;
}

export function renderAnnouncementsV2(opts) {
  const host = opts?.host;
  if (!host) return false;
  try {
    if (opts.loading) {
      const wrap = document.createElement("div");
      wrap.className = "an2-wrap";
      wrap.innerHTML = `<div class="an2-skel"></div><div class="an2-skel"></div>`;
      host.replaceChildren(wrap);
      return true;
    }
    const items = Array.isArray(opts.items) ? opts.items.slice() : [];
    const courses = opts.courses || {};
    state.uid = opts.uid || state.uid || "";
    if (state.uid && !state._readsHook) {
      state._readsHook = true;
      loadAnnouncementReads(state.uid).then(() => renderAnnouncementsV2(opts));
      onAnnouncementReads(() => { state.tick++; renderAnnouncementsV2(opts); });
    }
    items.sort((a, b) => {
      const pa = (a.pinned || a.important) ? 1 : 0, pb = (b.pinned || b.important) ? 1 : 0;
      if (pb !== pa) return pb - pa;
      return millis(b.createdAt) - millis(a.createdAt);
    });
    const newestId = items[0]?.id;
    const courseIds = Object.keys(courses);
    let list = items;
    if (state.tab === "academy") list = list.filter(isAcademy);
    if (state.tab === "courses") list = list.filter((a) => !isAcademy(a));
    if (state.course !== "all") list = list.filter((a) => String(a.courseId) === state.course);
    const today = list.filter((a) => groupOf(a) === "today");
    const week = list.filter((a) => groupOf(a) === "week");
    const earlier = list.filter((a) => groupOf(a) === "earlier");
    const wrap = document.createElement("div");
    wrap.className = "an2-wrap";
    const n = items.length;
    const unreadN = unreadCount(state.uid, list);
    const countLabel = n === 1 ? "1 announcement" : n + " announcements";
    const section = (title, rows) => rows.length
      ? `<h3 class="an2-sec">${title}</h3>${rows.map((a) => cardHtml(a, courses, newestId)).join("")}`
      : "";
    wrap.innerHTML = `
      <div class="an2-head">
        <div><h2>Announcements</h2><p class="an2-sub">News from your trainers and the academy</p></div>
        <div class="an2-head-r">
          <span class="an2-count">${esc(countLabel)}</span>
          ${unreadN ? `<span class="an2-count unread">${unreadN} unread</span>` : ""}
          ${unreadN ? `<button type="button" class="an2-markall" data-an2-all>Mark all as read</button>` : ""}
        </div>
      </div>
      <div class="an2-filters">
        <div class="an2-pills">
          <button type="button" class="${state.tab==="all"?"on":""}" data-an2-tab="all">All</button>
          <button type="button" class="${state.tab==="academy"?"on":""}" data-an2-tab="academy">Academy-wide</button>
          <button type="button" class="${state.tab==="courses"?"on":""}" data-an2-tab="courses">My courses</button>
        </div>
        <select data-an2-course>
          <option value="all">All courses</option>
          ${courseIds.map((id) => `<option value="${esc(id)}"${state.course===id?" selected":""}>${esc(courses[id] || id)}</option>`).join("")}
        </select>
      </div>
      ${list.length ? (section("Today", today) + section("This week", week) + section("Earlier", earlier)) : `<div class="an2-empty">${emptyIcon()}<p>No announcements yet</p></div>`}
    `;
    wrap.addEventListener("click", (e) => {
      const tEl = e.target;
      if (!tEl || !tEl.closest) return;
      const tab = tEl.closest("[data-an2-tab]");
      const more = tEl.closest("[data-an2-more]");
      const all = tEl.closest("[data-an2-all]");
      const open = tEl.closest("[data-an2-open]");
      if (tab) { state.tab = tab.getAttribute("data-an2-tab") || "all"; renderAnnouncementsV2(opts); return; }
      if (all) {
        markAllAnnouncementsRead(state.uid, list);
        renderAnnouncementsV2(opts);
        return;
      }
      if (more) {
        const id = more.getAttribute("data-an2-more");
        state.more[id] = !state.more[id];
        markAnnouncementRead(state.uid, id);
        renderAnnouncementsV2(opts);
        return;
      }
      if (open) {
        const id = open.getAttribute("data-an2-open");
        state.more[id] = true;
        markAnnouncementRead(state.uid, id);
        renderAnnouncementsV2(opts);
      }
    });
    wrap.addEventListener("change", (e) => {
      const sel = e.target && e.target.closest ? e.target.closest("[data-an2-course]") : null;
      if (sel) { state.course = sel.value || "all"; renderAnnouncementsV2(opts); }
    });
    host.replaceChildren(wrap);
    opts.onReady?.();
    return true;
  } catch (e) {
    const code = (e?.code || "error") + ": " + (e?.message || e);
    const box = document.createElement("div");
    box.className = "an2-fail";
    const p = document.createElement("p");
    p.textContent = "Could not load announcements (" + code + ")";
    const b = document.createElement("button");
    b.className = "btn btn-sm";
    b.type = "button";
    b.textContent = "Use classic view";
    b.addEventListener("click", () => opts.onClassic?.());
    box.append(p, b);
    host.replaceChildren(box);
    return false;
  }
}
