import { bound } from "./student-dash-data.js?v=stu7";

function animate(el, target) {
  if (target === "—" || target == null) { el.textContent = "—"; return; }
  const n = Number(target);
  if (!Number.isFinite(n)) { el.textContent = String(target); return; }
  const start = performance.now();
  const tick = (now) => {
    const p = Math.min(1, (now - start) / 700);
    el.textContent = String(Math.round(n * p));
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

export function mountStats(el) {
  bound(el, (root, data) => {
    const err = data.errors.assignments || data.errors.submissions || data.errors.quizzes || data.errors.quizAttempts || data.errors.attendance || data.errors.announcementsAll;
    if (err && !data.assignments.length && !data.quizzes.length) {
      root.innerHTML = `<p class="sdash-fail">This section could not load<br>${err.step}: ${err.code}</p>`;
      return;
    }
    const subIds = new Set(data.submissions.map((s) => s.assignmentId));
    const attIds = new Set(data.quizAttempts.map((a) => a.quizId));
    const hwDue = data.assignments.filter((a) => !subIds.has(a.id)).length;
    const qz = data.quizzes.filter((q) => !attIds.has(q.id)).length;
    const recs = data.attendance.filter((a) => a.status);
    const den = recs.filter((r) => r.status !== "excused").length;
    const good = recs.filter((r) => r.status === "present" || r.status === "late").length;
    const attPct = den ? Math.round((good / den) * 100) : "—";
    const read = new Set(data.announcementReadIds || []);
    const unread = data.announcements.filter((a) => a && a.id && !read.has(String(a.id))).length;
    const tiles = [
      { label: "Homework due", val: hwDue, href: "#homework", view: "homework" },
      { label: "Quizzes to take", val: qz, href: "./student-quizzes.html" },
      { label: "Attendance %", val: attPct, href: "#attendance", view: "attendance" },
      { label: "Unread announcements", val: unread, href: "./student-announcements.html" }
    ];
    root.innerHTML = `<div class="sdash-stats">${tiles.map((t,i)=>`<a class="sdash-tile" data-i="${i}" href="${t.href}" ${t.view?`data-view="${t.view}"`:""}><span>${t.label}</span><strong>—</strong></a>`).join("")}</div>`;
    root.querySelectorAll(".sdash-tile").forEach((a, i) => {
      animate(a.querySelector("strong"), tiles[i].val);
      if (tiles[i].view) a.onclick = (e) => { e.preventDefault(); document.querySelector(`.side a[data-view="${tiles[i].view}"]`)?.click(); };
    });
  });
}
