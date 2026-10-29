import { deliveryDaysHtml } from "./DeliveryDays.js";
import { portalStatus, completedOn } from "./portal-status.js";
import { startsEndsLine, formatCourseDate } from "./courseDates.js";

const esc = (s) => String(s ?? "").replace(/&/g,"&"+"amp;").replace(/</g,"&"+"lt;").replace(/"/g,"&"+"quot;");

const state = { tab: "active" };

function initials(title) {
  const t = String(title ?? "").trim();
  const parts = t.split(/\s+/).filter(Boolean);
  if (!parts.length) return "C";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function startLine(c) {
  const line = startsEndsLine(c);
  if (!line) return "";
  const today = new Date().toISOString().slice(0, 10);
  const raw = String(c?.startDate ?? "").trim();
  if (raw && raw < today) return `<p class="mc2-start">Started ${esc(formatCourseDate(raw) || raw)}${c.endDate ? " · Ends " + esc(formatCourseDate(c.endDate)) : ""}</p>`;
  return `<p class="mc2-start">${esc(line)}</p>`;
}

function nextSessionLine(c, sessions) {
  try {
    const list = Array.isArray(sessions) ? sessions : [];
    const today = new Date().toISOString().slice(0, 10);
    const next = list
      .filter((s) => (s?.courseId ?? "") === (c?.id ?? "") && (s?.status ?? "") !== "Cancelled" && String(s?.date ?? "") >= today)
      .sort((a, b) => String(a?.date ?? "").localeCompare(String(b?.date ?? "")))[0];
    if (!next) return "";
    const time = String(next?.time ?? c?.sessionTime ?? "").trim();
    return `<p class="mc2-next">Next session: ${esc(next.date)}${time ? ", " + esc(time) : ""}</p>`;
  } catch {
    return "";
  }
}

function homeworkStrip(c, assigns, subs) {
  try {
    const all = Array.isArray(assigns) ? assigns.filter((a) => (a?.courseId ?? "") === (c?.id ?? "")) : [];
    if (!all.length) return "";
    const map = subs && typeof subs === "object" ? subs : {};
    const done = all.filter((a) => map[a.id]).length;
    return `<p class="mc2-hw">Homework ${done} of ${all.length} submitted</p>`;
  } catch {
    return "";
  }
}

function attendanceStrip(c, attendance, sessions) {
  try {
    const sess = Array.isArray(sessions) ? sessions.filter((s) => (s?.courseId ?? "") === (c?.id ?? "")) : [];
    const att = Array.isArray(attendance) ? attendance.filter((a) => (a?.courseId ?? "") === (c?.id ?? "")) : [];
    if (!sess.length || !att.length) return "";
    const present = att.filter((a) => /present|late/i.test(String(a?.status ?? a?.mark ?? ""))).length;
    const pct = Math.round((present / sess.length) * 100);
    const w = Math.max(0, Math.min(100, pct));
    return `<div class="mc2-att"><span>Attendance ${w}%</span><div class="mc2-bar"><i style="width:${w}%"></i></div></div>`;
  } catch {
    return "";
  }
}

function passInfo(c, results) {
  const r = results && c?.id ? results[c.id] : null;
  if (!r) return { pending: true, passed: false, avg: null, att: null, error: "" };
  if (r.error) return { pending: true, passed: false, avg: null, att: null, error: r.error };
  if (r.pending) return { pending: true, passed: false, avg: null, att: r.att, error: "" };
  return { pending: false, passed: r.passed === true, avg: r.avg, att: r.att, error: "" };
}

function cardHtml(c, opts) {
  const p = portalStatus(c);
  const title = c?.title ?? "";
  const trainer = c?.trainerName || c?.instructor || "";
  const done = p.group === "completed";
  const days = deliveryDaysHtml(c, { emptyMode: "announce" });
  const pi = done ? passInfo(c, opts.results) : { passed: false, known: false, label: "" };
  const certDoc = (opts.certs || []).find((x) => x.courseId === c.id || x.id === ((opts.uid || "") + "_" + c.id));
  const revoked = certDoc && (String(certDoc.status) === "revoked" || certDoc.revoked === true);
  const cert = done && pi.passed && certDoc && !revoked
    ? `<a class="btn btn-sm btn-ghost" href="./student-certificates.html?item=${esc(certDoc.id)}">Certificate</a>`
    : "";
  const acts = done
    ? `<button class="btn btn-sm" type="button" data-mc2-open="${esc(c.id)}">Open course</button>
       <button class="btn btn-sm btn-ghost" type="button" data-mc2-result="${esc(c.id)}">View result</button>
       <a class="btn btn-sm btn-ghost" href="./student-grades.html">View grades</a>${cert}`
    : `<button class="btn btn-sm" type="button" data-mc2-open="${esc(c.id)}">Open course</button>`;
  const attLine = done && pi.att != null ? `<p class="mc2-stat">Attendance ${esc(pi.att)}%</p>` : (done ? `<p class="mc2-stat">Attendance —</p>` : attendanceStrip(c, opts.attendance, opts.sessions));
  const avgLine = done && !pi.pending && pi.avg != null ? `<p class="mc2-stat">Final grade ${esc(pi.avg)} / 100</p>` : "";
  const badge = !done ? "" : pi.error ? `<p class="banner">${esc(pi.error)}</p>` : pi.pending ? `<span class="mc2-res pend">Result pending</span>` : pi.passed ? `<span class="mc2-res ok">Course passed</span>` : `<span class="mc2-res no">Course failed</span>`;
  const body = done
    ? `<h3>${esc(title)}</h3>${attLine}${avgLine}${badge}`
    : `<h3>${esc(title)}</h3>${trainer ? `<p class="mc2-tr">${esc(trainer)}</p>` : ""}${startLine(c)}${days}${nextSessionLine(c, opts.sessions)}${attendanceStrip(c, opts.attendance, opts.sessions)}${homeworkStrip(c, opts.assigns, opts.subs)}`;
  return `<article class="mc2-card${done ? " muted" : ""}">
    <div class="mc2-cover">
      <span class="mc2-mono">${esc(initials(title))}</span>
      <span class="mc2-badge ${done ? "navy" : (String(c.status) === "Coming soon" ? "soon" : "green")}">${done ? "Completed" : (String(c.status) === "Coming soon" ? ("Scheduled · Starts " + esc(formatCourseDate(c.startDate) || c.startDate || "")) : "Active")}</span>
    </div>
    <div class="mc2-body">${body}</div>
    <div class="mc2-foot">${acts}</div>
  </article>`;
}

export function renderMyCoursesV2(opts) {
  const host = opts?.host;
  if (!host) return false;
  try {
    const courses = Array.isArray(opts.courses) ? opts.courses : [];
    const active = courses.filter((c) => portalStatus(c).group === "active");
    const done = courses.filter((c) => portalStatus(c).group === "completed");
    const tab = state.tab === "completed" ? "completed" : "active";
    const list = tab === "completed" ? done : active;
    const extra = { sessions: opts.sessions ?? [], assigns: opts.assigns ?? [], subs: opts.subs ?? {}, attendance: opts.attendance ?? [], results: opts.results ?? {} };

    const empty = tab === "completed"
      ? `<div class="mc2-empty"><div class="ico">🎓</div><p>No completed courses yet</p></div>`
      : `<div class="mc2-empty"><div class="ico">📡</div><p>You're not enrolled in an active course yet</p><button class="btn btn-sm" type="button" data-mc2-browse>Browse courses</button></div>`;

    host.innerHTML = `<div class="mc2-wrap">
      <div class="mc2-head">
        <div>
          <h2>My courses</h2>
          <p class="mc2-sub">Your learning journey at GHz Academy</p>
        </div>
        <div class="mc2-chips"><span>${active.length} active</span><span>${done.length} completed</span></div>
      </div>
      <div class="mc2-tabs">
        <button type="button" class="${tab==="active"?"on":""}" data-mc2-tab="active">Active (${active.length})</button>
        <button type="button" class="${tab==="completed"?"on":""}" data-mc2-tab="completed">Completed (${done.length})</button>
        <i class="mc2-pill ${tab==="completed"?"right":""}"></i>
      </div>
      ${list.length ? `<div class="mc2-grid">${list.map((c) => cardHtml(c, extra)).join("")}</div>` : empty}
    </div>`;

    host.onclick = (e) => {
      const t = e.target?.closest?.("[data-mc2-tab],[data-mc2-open],[data-mc2-browse],[data-mc2-result]");
      if (!t) return;
      if (t.hasAttribute("data-mc2-tab")) {
        state.tab = t.getAttribute("data-mc2-tab") === "completed" ? "completed" : "active";
        renderMyCoursesV2(opts);
        return;
      }
      if (t.hasAttribute("data-mc2-browse")) {
        opts.onBrowse?.();
        return;
      }
      if (t.hasAttribute("data-mc2-result")) {
        opts.onResult?.(t.getAttribute("data-mc2-result"));
        return;
      }
      const id = t.getAttribute("data-mc2-open");
      if (id) opts.onOpen?.(id);
    };
    opts.onReady?.();
    return true;
  } catch (e) {
    const code = (e?.code || "error") + ": " + (e?.message || e);
    host.innerHTML = `<div class="mc2-fail"><p>Could not load courses (${esc(code)})</p><button class="btn btn-sm" type="button" data-classic>Use classic view</button></div>`;
    host.onclick = (ev) => { if (ev.target?.closest?.("[data-classic]")) opts.onClassic?.(); };
    return false;
  }
}
