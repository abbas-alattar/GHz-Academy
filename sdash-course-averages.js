import { bound } from "./student-dash-data.js?v=stu7";
import { db } from "./firebase-config.js?v=auth8";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { courseAverage, courseAttendancePct } from "./student-dash-average.js";

function color(pct) {
  if (pct == null) return { stroke: "#94a3b8", cls: "sdash-avg-gray" };
  if (pct >= 80) return { stroke: "#16a34a", cls: "sdash-avg-green" };
  if (pct >= 50) return { stroke: "#d97706", cls: "sdash-avg-amber" };
  return { stroke: "#dc2626", cls: "sdash-avg-red" };
}
function ring(pct, stroke) {
  const r = 36;
  const c = 2 * Math.PI * r;
  const p = pct == null ? 0 : Math.min(100, Math.max(0, pct));
  const dash = (p / 100) * c;
  return `<svg class="sdash-ring" viewBox="0 0 88 88" aria-hidden="true">
    <circle cx="44" cy="44" r="${r}" fill="none" stroke="#e2e8f0" stroke-width="8"/>
    <circle cx="44" cy="44" r="${r}" fill="none" stroke="${stroke}" stroke-width="8" stroke-linecap="round"
      stroke-dasharray="${dash} ${c}" transform="rotate(-90 44 44)"/>
  </svg>`;
}

export function mountCourseAverages(el) {
  bound(el, (root, data) => {
    (async () => {
      try {
        const ids = [...new Set((data.enrollments || []).map((e) => e.courseId).filter(Boolean))];
        const courses = [];
        for (const id of ids) {
          try {
            const snap = await getDoc(doc(db, "courses", id));
            if (!snap.exists()) continue;
            const c = { id: snap.id, ...snap.data() };
            if (c.status === "Completed") continue;
            courses.push(c);
          } catch (e) {
            root.innerHTML = `<div class="sdash-card"><h3>Course averages</h3><p class="sdash-fail">This section could not load<br>courses: ${e.code || e.message}</p></div>`;
            return;
          }
        }
        const cards = courses.map((c) => {
          const avg = courseAverage(c.id, data);
          const att = courseAttendancePct(c.id, data);
          const col = color(avg.pct);
          const label = avg.pct == null ? "—" : avg.pct.toFixed(1) + "%";
          const based = avg.count ? `Based on ${avg.count} graded item${avg.count === 1 ? "" : "s"}` : "No graded items yet";
          const attLine = att == null ? "Attendance —" : `Attendance ${att}%`;
          return `<a class="sdash-avg-card ${courses.length === 1 ? "sdash-avg-large" : ""}" href="./student-grades.html">
            <div>
              <p class="sdash-avg-title">${c.title || "Course"} <span class="badge badge-open">Active</span></p>
              <p class="sdash-avg-based">${based}</p>
              <p class="sdash-avg-att">${attLine}</p>
            </div>
            <div class="sdash-avg-ringwrap ${col.cls}">
              ${ring(avg.pct, col.stroke)}
              <strong>${label}</strong>
            </div>
          </a>`;
        }).join("");
        const doneLink = `<p class="sdash-avg-done"><a href="#courses" id="sdashOpenDone">Completed courses</a></p>`;
        root.innerHTML = `<div class="sdash-card"><h3>Course averages</h3>
          ${cards || "<p>No active courses.</p>"}
          ${doneLink}
        </div>`;
        const link = root.querySelector("#sdashOpenDone");
        if (link) link.onclick = (e) => {
          e.preventDefault();
          if (window.__openCompletedTab) window.__openCompletedTab();
          else {
            document.querySelector('.side a[data-view="courses"]')?.click();
            setTimeout(() => document.getElementById("tabDoneCourses")?.click(), 0);
          }
        };
      } catch (e) {
        root.innerHTML = `<div class="sdash-card"><h3>Course averages</h3><p class="sdash-fail">This section could not load<br>${e.code || e.message || e}</p></div>`;
      }
    })();
  });
}
