import { bound } from "./student-dash-data.js?v=stu7";
import { resolveGradedItems } from "./student-grade-math.js";

export function mountGrades(el) {
  bound(el, (root, data) => {
    (async () => {
      try {
        const rows = (await resolveGradedItems(data)).sort((a, b) => b.at - a.at).slice(0, 3);
        root.innerHTML = `<div class="sdash-card"><h3>Recent grades</h3>${
          rows.length ? rows.map((r) => {
            const cls = r.pct == null ? "sdash-g50" : r.pct >= 80 ? "sdash-g80" : r.pct >= 50 ? "sdash-g50" : "sdash-g0";
            return `<div class="sdash-grade"><span>${r.title}</span><span class="${cls}">${r.display}</span></div>`;
          }).join("") : "<p>No grades yet.</p>"
        }<p style="margin-top:10px"><a href="./student-grades.html">View all grades</a></p></div>`;
      } catch (e) {
        root.innerHTML = `<div class="sdash-card"><h3>Recent grades</h3><p class="sdash-fail">This section could not load<br>${e.code || e.message || e}</p></div>`;
      }
    })();
  });
}
