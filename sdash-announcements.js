import { bound } from "./student-dash-data.js?v=stu7";

function rel(ms) {
  const d = Date.now() - ms;
  const m = Math.round(d / 60000);
  if (m < 1) return "just now";
  if (m < 60) return m + "m ago";
  const h = Math.round(m / 60);
  if (h < 24) return h + "h ago";
  const days = Math.round(h / 24);
  return days + "d ago";
}
function initials(name) {
  return String(name || "?").split(/\s+/).slice(0,2).map((p)=>p[0]||"").join("").toUpperCase() || "?";
}

export function mountAnnouncements(el) {
  bound(el, (root, data) => {
    if (data.errors.announcementsAll && !data.announcements.length) {
      root.innerHTML = `<div class="sdash-card"><h3>Announcements</h3><p class="sdash-fail">This section could not load<br>announcements: ${data.errors.announcementsAll.code}</p></div>`;
      return;
    }
    let read = [...(data.announcementReadIds || [])];
    let filter = "all";
    const paint = () => {
      const list = [...data.announcements].filter((a) => {
        const role = String(a.authorRole || "").toLowerCase();
        if (filter === "admin") return role === "admin";
        if (filter === "trainers") return role === "trainer";
        return true;
      }).sort((a,b) => (b.pinned?1:0) - (a.pinned?1:0) || (b.createdAt?.toMillis?.()||0) - (a.createdAt?.toMillis?.()||0));
      const unread = data.announcements.filter((a) => !read.includes(a.id)).length;
      const shown = list.slice(0, 4);
      root.innerHTML = `<div class="sdash-card sdash-ann-wrap"><div class="sdash-ann-head"><h3>Announcements</h3>${unread?`<span class="sdash-ann-count">${unread} new</span>`:""}</div>
        <div class="sdash-chips">
          <button type="button" data-f="all" class="${filter==="all"?"on":""}">All</button>
          <button type="button" data-f="trainers" class="${filter==="trainers"?"on":""}">Trainers</button>
          <button type="button" data-f="admin" class="${filter==="admin"?"on":""}">Admin</button>
          <button type="button" id="markRead" class="sdash-ann-mark">Mark all read</button>
        </div>
        <div class="sdash-ann">${shown.map((a)=>{
          const role = String(a.authorRole||"trainer");
          const isUnread = !read.includes(a.id);
          const pin = a.pinned ? "Pinned" : "";
          const ms = a.createdAt?.toMillis ? a.createdAt.toMillis() : Date.now();
          return `<article class="sdash-ann-card${isUnread?" is-unread":""}">
            <div class="sdash-av">${initials(a.authorName)}</div>
            <div>
              <p class="sdash-ann-meta">${a.authorName||""}<span class="sdash-role">${role==="admin"?"Admin":"Trainer"}</span><span class="sdash-ann-time">${rel(ms)}</span>${pin?`<span class="sdash-ann-pin">${pin}</span>`:""}</p>
              <p class="sdash-title">${a.title||""}</p>
              <p class="sdash-body" data-body>${a.body||""}</p>
              <button class="btn btn-ghost btn-sm" type="button" data-more>Read more</button>
            </div>
          </article>`;
        }).join("") || "<p class=\"sdash-ann-empty\">No announcements yet.</p>"}</div>
        <a class="sdash-ann-all" href="./student-announcements.html">See all announcements</a>
      </div>`;
      root.querySelectorAll("[data-f]").forEach((b) => b.onclick = () => { filter = b.dataset.f; paint(); });
      const mr = root.querySelector("#markRead");
      if (mr) mr.onclick = () => { read = data.announcements.map((a)=>a.id); localStorage.setItem(key, JSON.stringify(read)); paint(); };
      root.querySelectorAll("[data-more]").forEach((b) => {
        b.onclick = () => { b.previousElementSibling?.classList.toggle("open"); b.textContent = b.previousElementSibling?.classList.contains("open") ? "Show less" : "Read more"; };
      });
    };
    paint();
  });
}
