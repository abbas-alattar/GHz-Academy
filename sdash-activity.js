import { bound } from "./student-dash-data.js?v=stu7";

function dayKey(d) { return d.toISOString().slice(0,10); }

export function mountActivity(el) {
  bound(el, (root, data) => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setHours(12,0,0,0); d.setDate(d.getDate() - i);
      days.push({ key: dayKey(d), n: 0, label: d.toLocaleDateString(undefined,{ weekday:"short" }) });
    }
    const bump = (t) => {
      const k = t?.toDate ? t.toDate().toISOString().slice(0,10) : (t ? new Date(t).toISOString().slice(0,10) : "");
      const row = days.find((x) => x.key === k);
      if (row) row.n += 1;
    };
    data.submissions.forEach((s) => bump(s.submittedAt));
    data.quizAttempts.forEach((s) => bump(s.submittedAt));
    if (!days.some((d) => d.n)) { root.innerHTML = ""; return; }
    let streak = 0;
    for (let i = days.length - 1; i >= 0; i--) {
      if (days[i].n > 0) streak += 1; else if (i !== days.length - 1) break;
    }
    const max = Math.max(...days.map((d) => d.n), 1);
    root.innerHTML = `<div class="sdash-card"><h3>Weekly activity</h3>
      <div class="sdash-bars">${days.map((d)=>`<div class="sdash-bar" title="${d.label}: ${d.n}" style="height:${Math.max(8,(d.n/max)*90)}px"></div>`).join("")}</div>
      <p style="margin-top:10px;color:var(--muted)">${streak} days in a row</p>
    </div>`;
  });
}
