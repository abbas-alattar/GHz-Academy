import { bound } from "./student-dash-data.js?v=stu7";

function badge(due) {
  if (!due) return { cls: "sdash-later", text: "—" };
  const d = new Date(due); d.setHours(0,0,0,0);
  const t = new Date(); t.setHours(0,0,0,0);
  const diff = Math.round((d - t) / 86400000);
  if (diff < 0) return { cls: "sdash-over", text: "Overdue" };
  if (diff === 0) return { cls: "sdash-today", text: "Due today" };
  if (diff === 1) return { cls: "sdash-tom", text: "Tomorrow" };
  return { cls: "sdash-later", text: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) };
}

export function mountTodo(el) {
  bound(el, (root, data) => {
    const subIds = new Set(data.submissions.map((s) => s.assignmentId));
    const attIds = new Set(data.quizAttempts.map((a) => a.quizId));
    const rows = [
      ...data.assignments.filter((a) => !subIds.has(a.id)).map((a) => ({ type: "hw", title: a.title, due: a.dueDate, href: "#homework", view: "homework" })),
      ...data.quizzes.filter((q) => !attIds.has(q.id)).map((q) => ({ type: "qz", title: q.title, due: q.dueDate, href: "./student-quizzes.html" }))
    ].sort((a,b) => String(a.due||"zzz").localeCompare(String(b.due||"zzz")));
    if (!rows.length) {
      root.innerHTML = `<div class="sdash-card"><h3>To-do</h3><p>Nothing due. Great job!</p></div>`;
      return;
    }
    root.innerHTML = `<div class="sdash-card"><h3>To-do</h3><div class="sdash-todo">${rows.map((r,i)=>{
      const b = badge(r.due);
      const icon = r.type === "hw" ? "HW" : "QZ";
      return `<a href="${r.href}" data-i="${i}" ${r.view?`data-view="${r.view}"`:""}><span class="badge badge-draft">${icon}</span><span>${r.title||"Untitled"}</span><span class="sdash-due ${b.cls}">${b.text}</span></a>`;
    }).join("")}</div></div>`;
    root.querySelectorAll("a[data-view]").forEach((a) => {
      a.onclick = (e) => { e.preventDefault(); document.querySelector(`.side a[data-view="${a.dataset.view}"]`)?.click(); };
    });
  });
}
