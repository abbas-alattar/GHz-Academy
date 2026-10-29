import { bound } from "./student-dash-data.js?v=stu7";

function greeting(d) {
  const h = d.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}
function fmtDate(d) {
  return d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}
function dueSoon(data) {
  const today = new Date(); today.setHours(0,0,0,0);
  const subs = new Set(data.submissions.map((s) => s.assignmentId));
  const atts = new Set(data.quizAttempts.map((a) => a.quizId));
  const items = [
    ...data.assignments.filter((a) => !subs.has(a.id)),
    ...data.quizzes.filter((q) => !atts.has(q.id))
  ];
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate()+1);
  const dueT = items.filter((x) => {
    const due = x.dueDate ? new Date(x.dueDate) : null;
    if (!due) return false;
    due.setHours(0,0,0,0);
    return due.getTime() === tomorrow.getTime();
  });
  if (dueT.length === 1) return "1 homework is due tomorrow";
  if (dueT.length > 1) return dueT.length + " items are due tomorrow";
  return "";
}
function nextLine(data) {
  const now = Date.now();
  const sess = data.sessions.filter((s) => s.status !== "Cancelled").map((s) => {
    const t = new Date(`${s.date||""}T${s.startTime||"00:00"}`);
    return { s, t: t.getTime() };
  }).filter((x) => x.t > now).sort((a,b)=>a.t-b.t)[0];
  if (sess) {
    const mins = Math.round((sess.t - now) / 60000);
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `Your next class starts in ${h}h ${m}m`;
  }
  return dueSoon(data) || "You're all caught up";
}

export function mountHero(el) {
  bound(el, (root, data) => {
    const now = new Date();
    const first = (data.name || "student").split(" ")[0];
    root.innerHTML = `<div class="sdash-hero">
      <h2>${greeting(now)}, ${first}</h2>
      <p class="sdash-date">${fmtDate(now)}</p>
      <p class="sdash-smart">${nextLine(data)}</p>
      <div class="sdash-meta">
        <button class="btn btn-sm btn-ghost" type="button" id="sdashRefresh">Refresh</button>
        <span class="sdash-updated" id="sdashUpdated"></span>
      </div>
    </div>`;
    const lab = root.querySelector("#sdashUpdated");
    const t = data.loadedAt ? new Date(data.loadedAt) : new Date();
    lab.textContent = "Last updated " + t.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    root.querySelector("#sdashRefresh").onclick = () => import("./student-dash-data.js?v=stu7").then((m) => m.loadStudentDash(true));
  });
}
