import { parseScore, computeAverage, computeStatus, gradeCalc } from "./gradeCalc.js";

const esc = (s) => String(s ?? "").replace(/&/g,"&"+"amp;").replace(/</g,"&"+"lt;").replace(/"/g,"&"+"quot;");
const state = { popup: "" };

function isAuto(c) {
  return c?.source === "attendance" || c?.source === "homework" || c?.source === "quiz";
}
function passMarkOf(scheme) {
  const n = Number(scheme?.passMark);
  return Number.isFinite(n) ? n : 60;
}
function courseGroup(c) {
  return String(c?.status ?? "") === "Completed" ? "completed" : "active";
}
function lockIcon() {
  return `<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" fill="none" stroke="#64748B" stroke-width="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="#64748B" stroke-width="2"/></svg>`;
}
function printIcon() {
  return `<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" d="M7 8V4h10v4M7 16H5a2 2 0 0 1-2-2v-4h18v4a2 2 0 0 1-2 2h-2"/><rect x="7" y="14" width="10" height="6" rx="1" fill="none" stroke="currentColor" stroke-width="2"/></svg>`;
}
function logoAbs() {
  try { return new URL("./logo.png", window.location.href).href; }
  catch { return "./logo.png"; }
}
function courseAvg(course) {
  if (!course?.scheme) return null;
  const pack = course.pack || {};
  const g = gradeCalc({ id: course.id, pack: { ...pack, scheme: course.scheme } }, course.scheme, { uid: course.uid, scores: course.scores || {}, pack: { ...pack, scheme: course.scheme } });
  if (!g.failed) return g.average;
  return computeAverage(course.scheme, course.vals || {});
}
function coursePassed(course) {
  const avg = courseAvg(course);
  if (avg == null) return false;
  return Number(avg) >= passMarkOf(course.scheme);
}
function completedAt(c) {
  const v = c?.completedAt || c?.completedOn || c?.updatedAt || 0;
  const n = typeof v === "number" ? v : Date.parse(v) || 0;
  return n;
}

function courseCard(course) {
  const done = courseGroup(course) === "completed";
  const scheme = course.scheme;
  const printBtn = `<button class="g2-ico" type="button" data-g2-print-one="${esc(course.id)}">${printIcon()} Print</button>`;
  const statusPill = done
    ? `<span class="g2-pill navy">Completed</span>`
    : `<span class="g2-pill amber">In progress</span>`;
  if (!scheme) {
    return `<article class="g2-card">
      <div class="g2-ch">
        <h3>${esc(course.title || "Course")} ${statusPill}</h3>
        <div class="g2-ch-r">${printBtn}</div>
      </div>
      <p class="g2-nodist">Grade distribution not set yet</p>
    </article>`;
  }
  const comps = Array.isArray(scheme.components) ? scheme.components : [];
  const pass = passMarkOf(scheme);
  const avg = done ? courseAvg(course) : null;
  const passed = done && avg != null && Number(avg) >= pass;
  const resultPill = done
    ? `<span class="g2-pill ${passed ? "ok" : "no"}">${passed ? "Passed" : "Failed"}</span>`
    : "";
  const heads = comps.map((c) => `<th>${esc(c.title || "Section")}<span class="w">${Number(c.weight) || 0}%</span></th>`).join("");
  const cells = comps.map((c) => {
    if (!done) return `<td><span class="g2-lock">${lockIcon()} —</span></td>`;
    const v = parseScore((course.vals || {})[c.id]);
    if (v == null) return `<td>—</td>`;
    const low = Number(v) < pass;
    const auto = isAuto(c) ? `<span class="g2-auto">Auto</span>` : "";
    return `<td class="${low ? "low" : ""}">${v}${auto}</td>`;
  }).join("");
  const avgCell = done && avg != null ? `<td class="avg">${avg.toFixed(1)}</td>` : `<td>—</td>`;
  const resultCell = done
    ? `<td><span class="g2-pill ${passed ? "ok" : "no"}">${passed ? "Passed" : "Failed"}</span></td>`
    : `<td><span class="g2-lock" title="Visible after completion">${lockIcon()} Locked</span><span class="g2-auto">Visible after completion</span></td>`;
  return `<article class="g2-card">
    <div class="g2-ch">
      <h3>${esc(course.title || "Course")} ${statusPill}</h3>
      <div class="g2-ch-r">${resultPill}${printBtn}</div>
    </div>
    <table class="g2-tx">
      <thead><tr>${heads}<th>Average /100</th><th>Pass mark</th><th>Result</th></tr></thead>
      <tbody><tr>${cells}${avgCell}<td>${pass}</td>${resultCell}</tr></tbody>
    </table>
  </article>`;
}

function printDate() {
  try { return new Date().toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }); }
  catch { return new Date().toISOString(); }
}

function printCourseBlock(course) {
  const scheme = course.scheme;
  if (!scheme) {
    return `<section class="blk"><h2>${esc(course.title || "Course")}</h2><p>Grade distribution not set yet.</p></section>`;
  }
  const components = Array.isArray(scheme.components) ? scheme.components : [];
  const pass = passMarkOf(scheme);
  const vals = course.vals || {};
  const avg = computeAverage(scheme, vals);
  const st = computeStatus(scheme, vals, pass);
  const passed = st.label === "P" || avg >= pass;
  const rows = components.map((c) => {
    const w = Number(c.weight) || 0;
    const v = parseScore(vals[c.id]);
    const score = v == null ? 0 : v;
    const pts = ((v == null ? 0 : v) * w) / 100;
    return `<tr><td>${esc(c.title || "")}</td><td class="num">${w}%</td><td class="num">${v == null ? "—" : score + " / 100"}</td><td class="num">${pts.toFixed(1)}</td></tr>`;
  }).join("");
  return `<section class="blk">
    <h2>${esc(course.title || "Course")} <span class="pill ${passed ? "ok" : "no"}">${passed ? "PASSED" : "FAILED"}</span></h2>
    <table>
      <thead><tr><th>Section</th><th class="num">Weight</th><th class="num">Score (/100)</th><th class="num">Weighted points</th></tr></thead>
      <tbody>
        ${rows}
        <tr class="final"><td>Final average</td><td></td><td></td><td class="num">${avg.toFixed(1)}</td></tr>
        <tr><td>Pass mark</td><td></td><td></td><td class="num">${pass}</td></tr>
        <tr><td>Result</td><td colspan="3"><strong class="${passed ? "ok" : "no"}">${passed ? "PASSED" : "FAILED"}</strong></td></tr>
      </tbody>
    </table>
  </section>`;
}

function printDoc(opts, onlyId) {
  const student = opts.student || {};
  const when = printDate();
  const courses = Array.isArray(opts.courses) ? opts.courses : [];
  const doneAll = courses.filter((c) => courseGroup(c) === "completed");
  const done = doneAll.filter((c) => !onlyId || c.id === onlyId);
  const active = onlyId ? [] : courses.filter((c) => courseGroup(c) !== "completed");
  const logo = logoAbs();
  const summary = onlyId ? "" : `<section class="blk">
    <h2>Summary</h2>
    <table><thead><tr><th>Course</th><th class="num">Average</th><th>Result</th></tr></thead><tbody>
      ${doneAll.map((c) => {
        const avg = courseAvg(c);
        const ok = coursePassed(c);
        return `<tr><td>${esc(c.title || "")}</td><td class="num">${avg == null ? "—" : avg.toFixed(1)}</td><td>${ok ? "PASSED" : "FAILED"}</td></tr>`;
      }).join("") || `<tr><td colspan="3">No completed courses.</td></tr>`}
    </tbody></table>
  </section>`;
  const blocks = done.map(printCourseBlock).join("") || "<p>No completed courses.</p>";
  const inProg = active.length
    ? `<section class="blk"><h2>In progress</h2><p>Grades available after course completion</p><ul>${active.map((c) => `<li>${esc(c.title || "")}</li>`).join("")}</ul></section>`
    : "";
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Student Grade Report</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
<style>
  @page { size: A4 portrait; margin: 18mm; @bottom-center { content: "GHz Academy · Generated on ${esc(when)} · This report is for information purposes  ·  " counter(page); } }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: Inter, "Segoe UI", Arial, sans-serif; font-size: 11pt; color: #1E293B; background: #fff; }
  h1,h2 { font-weight: 600; color: #0F2747; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; }
  .brand { display: flex; gap: 10px; align-items: center; }
  .brand img { width: 40px; height: 40px; object-fit: contain; }
  .tag { font-size: 10pt; color: #64748B; margin: 0; }
  .right { text-align: right; color: #0F2747; }
  .box { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid #CBD5E1; padding: 10px 12px; margin: 12px 0 18px; }
  .blk { border: 1px solid #CBD5E1; padding: 12px; margin: 16px 0; page-break-inside: avoid; }
  table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
  th, td { border: 1px solid #CBD5E1; padding: 6px 8px; }
  th { background: #F1F5F9; text-align: left; font-weight: 600; color: #0F2747; }
  .num { text-align: right; }
  .final td { font-weight: 700; }
  .pill { font-size: 9pt; padding: 2px 8px; border-radius: 999px; }
  .ok { color: #16A34A; }
  .no { color: #DC2626; }
  footer { margin-top: 24px; font-size: 9pt; color: #64748B; }
</style></head><body>
  <div class="top">
    <div class="brand">
      <img id="g2logo" src="${esc(logo)}" alt="GHz Academy logo" />
      <div><strong>GHz Academy</strong><p class="tag">Telecom Engineering Academy</p></div>
    </div>
    <div class="right"><strong>Student Grade Report</strong><p class="tag">${esc(when)}</p></div>
  </div>
  <div class="box">
    <div>Name<br><strong>${esc(student.name || "Student")}</strong></div>
    <div>Email<br><strong>${esc(student.email || "")}</strong><br>Date printed<br><strong>${esc(when)}</strong></div>
  </div>
  ${summary}
  ${blocks}
  ${inProg}
  <footer>GHz Academy · Generated on ${esc(when)} · This report is for information purposes</footer>
  <script>
    function go(){ try { window.print(); } catch(e) {} }
    function wait(){
      var img = document.getElementById("g2logo");
      var fonts = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
      var pic = (!img || img.complete) ? Promise.resolve() : new Promise(function(r){ img.onload = r; img.onerror = r; });
      Promise.all([fonts, pic]).then(function(){ setTimeout(go, 50); });
    }
    window.onload = wait;
  <\/script>
</body></html>`;
}

function openPrint(opts, onlyId) {
  const html = printDoc(opts, onlyId);
  const w = window.open("", "_blank");
  if (!w) {
    state.popup = "Allow popups to print your grades";
    renderGradesV2(opts);
    return;
  }
  state.popup = "";
  w.document.open();
  w.document.write(html);
  w.document.close();
}

export function renderGradesV2(opts) {
  const host = opts?.host;
  if (!host) return false;
  try {
    if (opts.loading) {
      const wrap = document.createElement("div");
      wrap.className = "g2-wrap";
      wrap.innerHTML = typeof window.waveLoader === "function"
        ? window.waveLoader("page")
        : `<div class="wl wl-page" role="status" aria-label="Loading"><svg class="wl-wave" viewBox="0 0 56 24" fill="none" aria-hidden="true"><path class="wl-path" d="M2 12c4-9 8-9 12 0s8 9 12 0 8-9 12 0 8 9 12 0" stroke="#2EC8FF" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg><p class="wl-cap">Loading…</p></div>`;
      host.replaceChildren(wrap);
      return true;
    }
    const courses = Array.isArray(opts.courses) ? opts.courses : [];
    const done = courses.filter((c) => courseGroup(c) === "completed")
      .sort((a, b) => completedAt(b) - completedAt(a) || String(a.title || "").localeCompare(String(b.title || "")));
    const active = courses.filter((c) => courseGroup(c) === "active")
      .sort((a, b) => String(a.title || "").localeCompare(String(b.title || "")));
    let passed = 0, failed = 0, avgSum = 0, avgN = 0;
    for (const c of done) {
      const pass = passMarkOf(c.scheme);
      if (!c.scheme) { failed++; continue; }
      const avg = computeAverage(c.scheme, c.vals || {});
      if (Number(avg) >= pass) passed++; else failed++;
      avgSum += avg;
      avgN++;
    }
    const overall = avgN ? (Math.round((avgSum / avgN) * 10) / 10).toFixed(1) : "—";
    const notes = Array.isArray(opts.notes) ? opts.notes : [];
    const wrap = document.createElement("div");
    wrap.className = "g2-wrap";
    wrap.innerHTML = `
      ${notes.map((n) => `<p class="g2-notes">${esc(n)}</p>`).join("")}
      ${state.popup ? `<p class="g2-popup">${esc(state.popup)}</p>` : ""}
      <div class="g2-head">
        <div>
          <h2>My grades</h2>
          <p class="g2-sub">Your results by course</p>
        </div>
        <button class="g2-print" type="button" data-g2-print-all>Print grades</button>
      </div>
      <div class="g2-sum">
        <div class="g2-stat"><div class="n">${overall}</div><div class="l">Overall average</div></div>
        <div class="g2-stat"><div class="n">${done.length}</div><div class="l">Completed</div></div>
        <div class="g2-stat"><div class="n">${passed}</div><div class="l"><span class="g2-dot" style="background:#16A34A"></span>Passed</div></div>
        <div class="g2-stat"><div class="n">${failed}</div><div class="l"><span class="g2-dot" style="background:#DC2626"></span>Failed</div></div>
      </div>
      <section class="g2-sec">
        <h3 class="g2-sec-h">In progress (${active.length})</h3>
        ${active.length ? active.map(courseCard).join("") : `<p class="g2-empty">No courses in progress.</p>`}
      </section>
      <section class="g2-sec">
        <h3 class="g2-sec-h">Completed (${done.length})</h3>
        ${done.length ? done.map(courseCard).join("") : `<p class="g2-empty">No completed courses.</p>`}
      </section>
    `;
    wrap.addEventListener("click", (e) => {
      const t = e.target;
      if (!t) return;
      const all = t.closest ? t.closest("[data-g2-print-all]") : null;
      const one = t.closest ? t.closest("[data-g2-print-one]") : null;
      if (all) { openPrint(opts, null); return; }
      if (one) { openPrint(opts, one.getAttribute("data-g2-print-one")); return; }
    });
    host.replaceChildren(wrap);
    opts.onReady?.();
    return true;
  } catch (e) {
    const code = (e?.code || "error") + ": " + (e?.message || e);
    const box = document.createElement("div");
    box.className = "g2-fail";
    const p = document.createElement("p");
    p.textContent = "Could not load grades (" + code + ")";
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
