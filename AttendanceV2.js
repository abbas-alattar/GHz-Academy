import { attendancePct } from "./gradeCalc.js";

const esc = (s) => String(s ?? "").replace(/&/g,"&"+"amp;").replace(/</g,"&"+"lt;").replace(/"/g,"&"+"quot;");
const state = { open: {}, popup: "", scope: "active" };

function printIcon() {
  return `<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" d="M7 8V4h10v4M7 16H5a2 2 0 0 1-2-2v-4h18v4a2 2 0 0 1-2 2h-2"/><rect x="7" y="14" width="10" height="6" rx="1" fill="none" stroke="currentColor" stroke-width="2"/></svg>`;
}
function logoAbs() {
  try { return new URL("./logo.png", window.location.href).href; }
  catch { return "./logo.png"; }
}
function classTitle(s) {
  const t = String(s?.title ?? s?.topic ?? s?.name ?? "").trim();
  if (!t || /^session$/i.test(t) || t === "—") return "Class session";
  return t;
}
function validDate(s) {
  const d = String(s?.date ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const dt = new Date(d + "T12:00:00");
  return !Number.isNaN(dt.getTime());
}
function dateLabel(s) {
  if (!validDate(s)) return "Date not set";
  try {
    const dt = new Date(s.date + "T12:00:00");
    const wd = dt.toLocaleDateString("en-GB", { weekday: "short" });
    const day = dt.getDate();
    const mo = dt.toLocaleDateString("en-GB", { month: "short" });
    return wd + " " + day + " " + mo + " " + dt.getFullYear();
  } catch { return "Date not set"; }
}
function markLabel(mark) {
  if (mark === "present") return "Present";
  if (mark === "late") return "Late";
  if (mark === "absent") return "Absent";
  if (mark === "excused") return "Excused";
  return "Not marked";
}
function chevron(open) {
  return open
    ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 15l6-6 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`
    : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
}
function timeLabel(s) {
  const a = String(s?.startTime ?? s?.time ?? "").trim();
  const b = String(s?.endTime ?? "").trim();
  if (a && b) return a + " – " + b;
  if (a) return a;
  return "Time TBA";
}
function recFor(session, recs) {
  return (recs || []).find((a) => String(a?.sessionId ?? "") === String(session?.id ?? "")) || null;
}
function markOf(rec) {
  return String(rec?.status ?? rec?.mark ?? "").toLowerCase();
}
function counts(recs) {
  const list = recs || [];
  return {
    present: list.filter((r) => markOf(r) === "present").length,
    late: list.filter((r) => markOf(r) === "late").length,
    absent: list.filter((r) => markOf(r) === "absent").length,
    excused: list.filter((r) => markOf(r) === "excused").length
  };
}
function pctColor(n) {
  if (n == null) return "#64748B";
  if (n >= 80) return "#16A34A";
  if (n >= 60) return "#D97706";
  return "#DC2626";
}
function sqColor(mark) {
  if (mark === "present") return "#16A34A";
  if (mark === "late") return "#D97706";
  if (mark === "absent") return "#DC2626";
  if (mark === "excused") return "#64748B";
  return "#E5EAF1";
}
function pill(mark) {
  if (mark === "present") return `<span class="av2-pill ok">Present</span>`;
  if (mark === "late") return `<span class="av2-pill late">Late</span>`;
  if (mark === "absent") return `<span class="av2-pill abs">Absent</span>`;
  if (mark === "excused") return `<span class="av2-pill ex">Excused</span>`;
  return `<span class="av2-pill nm">Not marked</span>`;
}
function printDate() {
  try { return new Date().toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }); }
  catch { return String(new Date()); }
}

function rowsForCourse(course) {
  const sessions = Array.isArray(course.sessions) ? course.sessions.slice() : [];
  const dated = sessions.filter(validDate).sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.startTime||"").localeCompare(String(a.startTime||"")));
  const nodate = sessions.filter((s) => !validDate(s));
  return { dated, nodate };
}

function tableRows(list, recs, extraHead) {
  const head = extraHead ? `<tr><td colspan="5" class="av2-nodate">Date not set</td></tr>` : "";
  return head + list.map((s) => {
    const rec = recFor(s, recs);
    const mark = markOf(rec);
    const note = String(rec?.note ?? "").trim();
    return `<tr>
      <td data-label="Date">${esc(dateLabel(s))}</td>
      <td data-label="Time">${esc(timeLabel(s))}</td>
      <td data-label="Class">${esc(classTitle(s))}</td>
      <td data-label="Status">${pill(mark)}</td>
      <td data-label="Note" class="av2-note">${esc(note)}</td>
    </tr>`;
  }).join("");
}

function courseCard(course, uid) {
  const recs = course.recs || [];
  const sessions = Array.isArray(course.sessions) ? course.sessions : [];
  const pct = attendancePct(course.id, uid, { attendance: recs, sessions }).pct;
  const c = counts(recs);
  const col = pctColor(pct);
  const done = String(course.status) === "Completed";
  const key = course.id;
  const empty = !sessions.length || !recs.length;
  const open = empty ? false : (state.open[key] != null ? state.open[key] : !done);
  const { dated, nodate } = rowsForCourse(course);
  const chronological = sessions.filter(validDate).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const strip = chronological.map((s) => {
    const mark = markOf(recFor(s, recs));
    const tip = dateLabel(s) + " · " + markLabel(mark);
    return `<span class="av2-sq" title="${esc(tip)}" style="background:${sqColor(mark)}"></span>`;
  }).join("");
  const statusPill = done ? `<span class="av2-navy">Completed</span>` : `<span class="av2-amber">In progress</span>`;
  const need = !empty && pct != null && pct < 75 ? `<span class="av2-need">Needs attention</span>` : "";
  const pctHtml = empty
    ? `<div class="av2-pct muted">No sessions yet</div>`
    : `<div class="av2-pct" style="color:${col}">${pct == null ? "—" : Math.round(pct) + "%"}</div>`;
  return `<article class="av2-card" style="border-left-color:${col}">
    <div class="av2-ch">
      <h3>${esc(course.title || "Course")} ${statusPill}${need}</h3>
      ${pctHtml}
    </div>
    <div class="av2-bar"><span style="width:${empty || pct == null ? 0 : pct}%;background:${col}"></span></div>
    ${empty ? `<p class="av2-wait">Attendance will appear here once classes are held.</p>` : `
    <div class="av2-chips">
      <span class="av2-chip">Present ${c.present}</span>
      <span class="av2-chip">Late ${c.late}</span>
      <span class="av2-chip">Absent ${c.absent}</span>
      <span class="av2-chip">Excused ${c.excused}</span>
      <button type="button" class="av2-tbl-btn" data-av2-tog="${esc(key)}" aria-label="${open ? "Hide sessions" : "Show sessions"}">${chevron(open)}</button>
    </div>
    <div class="av2-strip">${strip}</div>
    ${open ? `<table class="av2-table"><thead><tr><th>Date</th><th>Time</th><th>Class</th><th>Status</th><th>Note</th></tr></thead><tbody>${tableRows(dated, recs, false)}${nodate.length ? tableRows(nodate, recs, true) : ""}</tbody></table>` : ""}`}
  </article>`;
}

function recsOf(list) {
  return (list || []).flatMap((c) => c.recs || []);
}
function packStats(uid, list) {
  const recs = recsOf(list);
  const tot = counts(recs);
  const overall = attendancePct("", uid, { attendance: recs }).pct;
  return { tot, overall, recs };
}
function printBlocks(courses, uid) {
  return courses.map((course) => {
    const recs = course.recs || [];
    const pct = attendancePct(course.id, uid, { attendance: recs, sessions: course.sessions }).pct;
    const { dated, nodate } = rowsForCourse(course);
    const all = dated.concat(nodate);
    const rows = all.map((s) => {
      const rec = recFor(s, recs);
      return `<tr><td>${esc(dateLabel(s))}</td><td>${esc(timeLabel(s))}</td><td>${esc(classTitle(s))}</td><td>${esc(markOf(rec) || "not marked")}</td><td>${esc(String(rec?.note ?? ""))}</td></tr>`;
    }).join("");
    return `<section class="blk"><h2>${esc(course.title || "Course")} <span>${pct == null ? "" : Math.round(pct) + "%"}</span></h2>
      <table><thead><tr><th>Date</th><th>Time</th><th>Class</th><th>Status</th><th>Note</th></tr></thead><tbody>${rows || `<tr><td colspan="5">No sessions.</td></tr>`}</tbody></table></section>`;
  }).join("");
}
function printTotals(label, uid, list) {
  const s = packStats(uid, list);
  const pct = s.overall == null ? "–" : Math.round(s.overall) + "%";
  return `<p class="tot"><strong>${esc(label)}</strong> · ${pct} · Present ${s.tot.present} · Late ${s.tot.late} · Absent ${s.tot.absent} · Excused ${s.tot.excused}</p>`;
}
function printDoc(opts) {
  const student = opts.student || {};
  const when = printDate();
  const uid = opts.uid;
  const courses = Array.isArray(opts.courses) ? opts.courses : [];
  const active = courses.filter((c) => String(c.status) !== "Completed");
  const done = courses.filter((c) => String(c.status) === "Completed");
  const logo = logoAbs();
  const blocks = `
    <h2 class="part">Active courses</h2>
    ${printTotals("Active courses", uid, active)}
    ${printBlocks(active, uid) || "<p>No active courses.</p>"}
    <h2 class="part">Completed courses</h2>
    ${printTotals("Completed courses", uid, done)}
    ${printBlocks(done, uid) || "<p>No completed courses.</p>"}`;

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Student Attendance Report</title>
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
  .part { margin: 22px 0 6px; font-size: 14pt; }
  .tot { color: #64748B; font-size: 10pt; margin: 0 0 10px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #CBD5E1; padding: 6px 8px; }
  th { background: #F1F5F9; text-align: left; font-weight: 600; color: #0F2747; }
</style></head><body>
  <div class="top">
    <div class="brand">
      <img id="av2logo" src="${esc(logo)}" alt="GHz Academy logo" />
      <div><strong>GHz Academy</strong><p class="tag">Telecom Engineering Academy</p></div>
    </div>
    <div class="right"><strong>Student Attendance Report</strong><p class="tag">${esc(when)}</p></div>
  </div>
  <div class="box">
    <div>Name<br><strong>${esc(student.name || "Student")}</strong></div>
    <div>Email<br><strong>${esc(student.email || "")}</strong><br>Date printed<br><strong>${esc(when)}</strong></div>
  </div>
  ${blocks || "<p>No attendance records yet.</p>"}
  <footer style="margin-top:24px;font-size:9pt;color:#64748B">GHz Academy · Generated on ${esc(when)} · This report is for information purposes</footer>
  <script>
    function go(){ try { window.print(); } catch(e) {} }
    function wait(){
      var img = document.getElementById("av2logo");
      var fonts = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
      var pic = (!img || img.complete) ? Promise.resolve() : new Promise(function(r){ img.onload = r; img.onerror = r; });
      Promise.all([fonts, pic]).then(function(){ setTimeout(go, 50); });
    }
    window.onload = wait;
  <\/script>
</body></html>`;
}

function openPrint(opts) {
  const html = printDoc(opts);
  const w = window.open("", "_blank");
  if (!w) {
    state.popup = "Allow popups to print your attendance";
    renderAttendanceV2(opts);
    return;
  }
  state.popup = "";
  w.document.open();
  w.document.write(html);
  w.document.close();
}

export function renderAttendanceV2(opts) {
  const host = opts?.host;
  if (!host) return false;
  try {
    if (opts.loading) {
      const wrap = document.createElement("div");
      wrap.className = "av2-wrap";
      wrap.innerHTML = `<div class="av2-skel"></div><div class="av2-skel"></div>`;
      host.replaceChildren(wrap);
      return true;
    }
    const uid = opts.uid;
    const courses = Array.isArray(opts.courses) ? opts.courses : [];
    const active = courses.filter((c) => String(c.status) !== "Completed").sort((a, b) => String(a.title||"").localeCompare(String(b.title||"")));
    const done = courses.filter((c) => String(c.status) === "Completed").sort((a, b) => String(a.title||"").localeCompare(String(b.title||"")));
    const allTime = state.scope === "all";
    const sumSrc = allTime ? courses : active;
    const top = packStats(uid, sumSrc);
    const doneStats = packStats(uid, done);
    const noActive = !active.length || top.overall == null;
    const wrap = document.createElement("div");
    wrap.className = "av2-wrap";
    const empty = !courses.length;
    const pctTxt = (n) => (n == null ? "–" : Math.round(n) + "%");
    wrap.innerHTML = `
      <div class="av2-head">
        <div><h2>Attendance</h2><p class="av2-sub">Your presence in every class</p></div>
        <button type="button" class="av2-print" data-av2-print>${printIcon()} Print</button>
      </div>
      ${state.popup ? `<p class="av2-popup">${esc(state.popup)}</p>` : ""}
      ${empty ? `<div class="av2-empty"><p>No attendance records yet. They appear after classes are marked.</p></div>` : `
      <div class="av2-sumwrap">
        <div class="av2-sumtop">
          <div>
            <div class="av2-sumtitle">Overall attendance</div>
            <p class="av2-sumlab">${allTime ? "All courses" : "Active courses"}</p>
          </div>
          <div class="av2-tog" role="group" aria-label="Attendance scope">
            <button type="button" class="${allTime ? "" : "on"}" data-av2-scope="active">Active</button>
            <button type="button" class="${allTime ? "on" : ""}" data-av2-scope="all">All time</button>
          </div>
        </div>
        <div class="av2-sum">
          <div class="av2-stat"><div class="k">Overall attendance</div><div class="v" style="color:${pctColor(top.overall)}">${noActive && !allTime ? "–" : pctTxt(top.overall)}</div>${noActive && !allTime ? `<p class="av2-hint">No active classes yet</p>` : ""}</div>
          <div class="av2-stat"><div class="k"><span class="av2-dot" style="background:#16A34A"></span>Present</div><div class="v">${noActive && !allTime ? "–" : top.tot.present}</div></div>
          <div class="av2-stat"><div class="k"><span class="av2-dot" style="background:#D97706"></span>Late</div><div class="v">${noActive && !allTime ? "–" : top.tot.late}</div></div>
          <div class="av2-stat"><div class="k"><span class="av2-dot" style="background:#DC2626"></span>Absent</div><div class="v">${noActive && !allTime ? "–" : top.tot.absent}</div></div>
          <div class="av2-stat"><div class="k"><span class="av2-dot" style="background:#64748B"></span>Excused</div><div class="v">${noActive && !allTime ? "–" : top.tot.excused}</div></div>
        </div>
      </div>
      <h3 class="av2-sec">In progress (${active.length})</h3>
      ${active.length ? active.map((c) => courseCard(c, uid)).join("") : `<p class="av2-empty-line">No courses in progress.</p>`}
      <h3 class="av2-sec">Completed courses (${done.length})</h3>
      ${done.length ? `<div class="av2-slim">
        <div class="av2-slimh">Completed courses attendance</div>
        <div class="av2-slimrow">
          <strong style="color:${pctColor(doneStats.overall)}">${pctTxt(doneStats.overall)}</strong>
          <span>Present ${doneStats.tot.present}</span>
          <span>Late ${doneStats.tot.late}</span>
          <span>Absent ${doneStats.tot.absent}</span>
          <span>Excused ${doneStats.tot.excused}</span>
        </div>
      </div>` + done.map((c) => courseCard(c, uid)).join("") : `<p class="av2-empty-line">No completed courses.</p>`}
      `}
    `;
    wrap.addEventListener("click", (e) => {
      const tEl = e.target;
      if (!tEl || !tEl.closest) return;
      const sc = tEl.closest("[data-av2-scope]");
      if (sc) { state.scope = sc.getAttribute("data-av2-scope") === "all" ? "all" : "active"; renderAttendanceV2(opts); return; }
      if (tEl.closest("[data-av2-print]")) { openPrint(opts); return; }
      const tog = tEl.closest("[data-av2-tog]");
      if (tog) {
        const id = tog.getAttribute("data-av2-tog");
        const course = courses.find((c) => c.id === id);
        const def = String(course?.status) !== "Completed";
        const cur = state.open[id] != null ? state.open[id] : def;
        state.open[id] = !cur;
        renderAttendanceV2(opts);
      }
    });
    host.replaceChildren(wrap);
    opts.onReady?.();
    return true;
  } catch (e) {
    const code = (e?.code || "error") + ": " + (e?.message || e);
    const box = document.createElement("div");
    box.className = "av2-fail";
    const p = document.createElement("p");
    p.textContent = "Could not load attendance (" + code + ")";
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
