import { protect } from "./auth-guard.js?v=auth8";
import { db } from "./firebase-config.js?v=auth8";
import { collection, query, where, getDocs, getDoc, doc } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { parseScore, computeAverage, computeStatus, gradeCalc } from "./gradeCalc.js";
import { mountPdfButton } from "./AdminPdfExport.js";
import { courseStatusLabel } from "./courseStatusLabel.js";

const root = document.getElementById("root");
const esc = (s) => String(s ?? "").replace(/&/g,"&"+"amp;").replace(/</g,"&"+"lt;").replace(/"/g,"&"+"quot;");
const fail = (step, e) => {
  const code = (e && (e.code || e.message)) || e;
  if (root) root.innerHTML = `<p class="banner">This page could not load<br>${esc(step)}: ${esc(code)}</p>`;
};

try {
  await protect("admin");
  let courses = [];
  try {
    const snap = await getDocs(collection(db, "courses"));
    courses = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((c) => c.status === "Open" || c.status === "Closed" || c.status === "Completed");
  } catch (e) {
    fail("courses", e);
    throw e;
  }

  const activeCourses = courses.filter((c) => c.status === "Open" || c.status === "Closed");
  const doneCourses = courses.filter((c) => c.status === "Completed");
  const optLabel = (c) => `${c.title || c.id} (${courseStatusLabel(c)})`;
  const courseOpts = `
    ${activeCourses.length ? `<optgroup label="Active">${activeCourses.map((c,i)=>`<option value="${esc(c.id)}" ${i===0?"selected":""}>${esc(optLabel(c))}</option>`).join("")}</optgroup>` : ""}
    ${doneCourses.length ? `<optgroup label="Completed">${doneCourses.map((c,i)=>`<option value="${esc(c.id)}" ${!activeCourses.length && i===0?"selected":""}>${esc(optLabel(c))}</option>`).join("")}</optgroup>` : ""}`;

  root.innerHTML = `
    <div class="toolbar" style="align-items:center;gap:10px">
      <select id="agCourse">${courseOpts || `<option value="">No courses</option>`}</select>
      <span id="agCourseBadge"></span>
    </div>
    <div id="agBody">${courses.length ? "Loading…" : "No courses (Open, Closed, or Completed)."}</div>`;

  const body = document.getElementById("agBody");
  const sel = document.getElementById("agCourse");
  const courseBadge = document.getElementById("agCourseBadge");
  const courseById = Object.fromEntries(courses.map((c) => [c.id, c]));
  const statusBadge = (st) => {
    const map = { Open: "badge-open", Closed: "badge-closed", Completed: "badge-done" };
    return `<span class="badge ${map[st] || ""}">${esc(courseStatusLabel({ status: st }))}</span>`;
  };
  const paintCourseBadge = () => {
    const c = courseById[sel?.value];
    if (courseBadge) courseBadge.innerHTML = c ? statusBadge(c.status) : "";
  };
  let rows = [];
  let components = [];
  let passMark = 60;
  let q = "";
  let stFilter = "";

  const badge = (st) => `<span class="badge" style="background:${st.bg};color:${st.color}">${esc(st.label)}</span>`;

  const visible = () => rows.filter((r) => {
    const name = (r.name || "").toLowerCase();
    if (q && !name.includes(q)) return false;
    if (stFilter && r.st.label !== stFilter) return false;
    return true;
  });

  const paintTable = () => {
    const table = document.getElementById("agTableWrap");
    if (!table) return;
    const heads = components.map((c) => `<th>${esc(c.title || "")} (${Number(c.weight) || 0}%)</th>`).join("");
    const vis = visible();
    table.innerHTML = `<div class="table-wrap"><table class="data"><thead><tr>
      <th>Student</th>${heads}<th>Average</th><th>Status</th>
    </tr></thead><tbody>${vis.length ? vis.map((r) => {
      const cells = components.map((c) => {
        const v = parseScore(r.vals[c.id]);
        return `<td>${v == null ? "—" : v}</td>`;
      }).join("");
      return `<tr><td>${esc(r.name)}</td>${cells}<td style="font-weight:700">${r.avg.toFixed(1)}/100</td><td>${badge(r.st)}</td></tr>`;
    }).join("") : `<tr><td colspan="${3 + components.length}">No students match.</td></tr>`}</tbody></table></div>`;
  };

  const exportCsv = () => {
    const vis = visible();
    const head = ["Student", ...components.map((c) => `${c.title || ""} (${Number(c.weight)||0}%)`), "Average", "Status"];
    const lines = [head.join(",")].concat(vis.map((r) => {
      const cells = components.map((c) => {
        const v = parseScore(r.vals[c.id]);
        return v == null ? "" : v;
      });
      return [JSON.stringify(r.name), ...cells, r.avg.toFixed(1), r.st.label].join(",");
    }));
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "grades.csv";
    a.click();
  };

  const load = async () => {
    const courseId = sel?.value;
    paintCourseBadge();
    if (!courseId) { body.innerHTML = "<p>No courses (Open, Closed, or Completed).</p>"; return; }
    body.textContent = "Loading…";
    let schemeSnap;
    try {
      schemeSnap = await getDoc(doc(db, "gradeSchemes", courseId));
    } catch (e) {
      body.innerHTML = `<p class="banner">gradeSchemes: ${esc((e && (e.code || e.message)) || e)}</p>`;
      return;
    }
    if (!schemeSnap.exists()) {
      body.innerHTML = `<p>No grade distribution set for this course.</p>`;
      return;
    }
    const scheme = schemeSnap.data() || {};
    components = Array.isArray(scheme.components) ? scheme.components : [];
    passMark = Number(scheme.passMark);
    if (!Number.isFinite(passMark)) passMark = 60;

    let enrolled = [];
    try {
      const ens = await getDocs(query(collection(db, "enrollments"), where("courseId", "==", courseId)));
      enrolled = ens.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (e) {
      body.innerHTML = `<p class="banner">enrollments: ${esc((e && (e.code || e.message)) || e)}</p>`;
      return;
    }

    let scoreMap = {};
    try {
      const ss = await getDocs(query(collection(db, "gradeScores"), where("courseId", "==", courseId)));
      ss.docs.forEach((d) => { const data = d.data(); scoreMap[data.uid] = data.scores || {}; });
    } catch (e) {
      body.innerHTML = `<p class="banner">gradeScores: ${esc((e && (e.code || e.message)) || e)}</p>`;
      return;
    }

    const loadCol = async (name) => {
      try {
        return (await getDocs(query(collection(db, name), where("courseId", "==", courseId)))).docs.map((d) => ({ id: d.id, ...d.data() }));
      } catch (e) {
        body.innerHTML = `<p class="banner">${name}: ${esc((e && (e.code || e.message)) || e)}</p>`;
        throw e;
      }
    };
    let autoPack;
    try {
      autoPack = {
        assignments: await loadCol("assignments"),
        quizzes: await loadCol("quizzes"),
        attendance: await loadCol("attendance"),
        submissions: await loadCol("submissions"),
        quizAttempts: await loadCol("quizAttempts")
      };
    } catch { return; }

    rows = enrolled.map((en) => {
      const manual = { ...(scoreMap[en.uid] || {}) };
      const g = gradeCalc({ id: courseId, pack: { ...autoPack, scheme } }, scheme, { uid: en.uid, scores: manual, pack: { ...autoPack, scheme } });
      const vals = g.values || {};
      const avg = g.average;
      const st = computeStatus({ components }, vals, passMark);
      return { uid: en.uid, name: en.studentName || en.studentEmail || en.uid || "", vals, avg, st };
    });
    const passed = rows.filter((r) => r.st.label === "P").length;
    const failed = rows.filter((r) => r.st.label === "F").length;
    q = "";
    stFilter = "";
    body.innerHTML = `
      <div class="kpis" style="grid-template-columns:repeat(4,1fr);margin:8px 0 16px">
        <div class="kpi"><span>Students</span><strong>${rows.length}</strong></div>
        <div class="kpi"><span>Passed</span><strong style="color:#166534">${passed}</strong></div>
        <div class="kpi"><span>Failed</span><strong style="color:#991b1b">${failed}</strong></div>
        <div class="kpi"><span>Pass mark</span><strong>${passMark}/100</strong></div>
      </div>
      <div class="toolbar">
        <input id="agSearch" placeholder="Search students" />
        <select id="agStatus"><option value="">All</option><option>P</option><option>F</option><option>In progress</option></select>
        <button class="btn btn-sm btn-ghost" type="button" id="agCsv">Export CSV</button>
        <span id="agPdf"></span>
      </div>
      <div id="agTableWrap"></div>`;
    paintTable();
    document.getElementById("agSearch").oninput = (e) => { q = (e.target.value || "").toLowerCase(); paintTable(); };
    document.getElementById("agStatus").onchange = (e) => { stFilter = e.target.value; paintTable(); };
    document.getElementById("agCsv").onclick = exportCsv;
    const ctitle = courses.find((c) => c.id === sel?.value)?.title || "Course";
    mountPdfButton(document.getElementById("agPdf"), () => ({
      page: "Grades",
      filters: "Course: " + ctitle + (q ? " · Search: " + q : "") + (stFilter ? " · Status: " + stFilter : ""),
      columns: [{ key: "student", label: "Student" }, { key: "course", label: "Course" }, { key: "avg", label: "Final average" }, { key: "result", label: "Result" }],
      rows: visible().map((r) => ({ student: r.name, course: ctitle, avg: r.avg.toFixed(1), result: r.st.label === "P" ? "Passed" : r.st.label === "F" ? "Failed" : r.st.label }))
    }), "Grades");
  };

  if (sel) sel.onchange = load;
  if (courses.length) await load();
} catch (e) {
  fail("grades page", e);
}
