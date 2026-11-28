import { coverMarkup, hydrateCovers } from "./coverFor.js?v=stu11-r2";
import { portalStatus } from "./portal-status.js?v=r2";
import { formatCourseDate } from "./courseDates.js";
import { statusChipShort, statusChipKind } from "./courseStatusLabel.js?v=r2";
import { icon } from "./ghz-icons.js";
import { attendancePct, formatGrade } from "./gradeCalc.js";

const asArray = (x) => Array.isArray(x) ? x : [];
const esc = (s) => String(s ?? "").replace(/&/g,"&"+"amp;").replace(/</g,"&"+"lt;").replace(/"/g,"&"+"quot;");

const state = { tab: "active" };

function initials(title) {
  const t = String(title ?? "").trim();
  const parts = t.split(/\s+/).filter(Boolean);
  if (!parts.length) return "C";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function trainerName(c) {
  if (Array.isArray(c.trainerNames) && c.trainerNames.length) return c.trainerNames.filter(Boolean).join(", ");
  return c.trainerName || c.instructor || "";
}

function trainerInitials(name) {
  const t = String(name || "").trim();
  const parts = t.split(/\s+/).filter(Boolean);
  if (!parts.length) return "T";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function ymdOf(raw) {
  const s = String(raw || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

function localPartsMs(dateStr, timeStr) {
  const d = ymdOf(dateStr);
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return NaN;
  const t = String(timeStr || "00:00").trim();
  const parts = (t.length >= 5 ? t : "00:00").split(":");
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(parts[0]) || 0, Number(parts[1]) || 0, 0).getTime();
}

function colonTime(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  if (/^\d{1,2}:\d{2}/.test(s)) {
    const [h, m] = s.split(":");
    return String(Number(h) || 0).padStart(2, "0") + ":" + String(m).slice(0, 2).padStart(2, "0");
  }
  return s;
}

function fmtClock(t) {
  const s = colonTime(t);
  if (!s || !/^\d{2}:\d{2}/.test(s)) return s;
  const h = Number(s.slice(0, 2));
  const m = s.slice(3, 5);
  const ap = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return h12 + ":" + m + " " + ap;
}

function friendlyDay(ymd) {
  const m = String(ymd || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const that = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
  const diff = Math.round((that - today) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return dt.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

function nextSession(c, sessions) {
  const list = asArray(sessions).filter((s) => (s?.courseId ?? "") === (c?.id ?? "") && String(s?.status || "") !== "Cancelled");
  const now = Date.now();
  const upcoming = list
    .map((s) => ({ s, t: localPartsMs(s.date, s.startTime || s.time) }))
    .filter((x) => Number.isFinite(x.t) && x.t >= now - 30 * 60000)
    .sort((a, b) => a.t - b.t);
  return upcoming[0] || null;
}

function hwCounts(c, assigns, subs) {
  const all = asArray(assigns).filter((a) => (a?.courseId ?? "") === (c?.id ?? "") && String(a.status || "Published") === "Published");
  const map = subs && typeof subs === "object" && !Array.isArray(subs) ? subs : {};
  const list = Array.isArray(subs) ? subs : Object.values(map);
  const done = all.filter((a) => map[a.id] || list.some((s) => s.assignmentId === a.id)).length;
  return { done, total: all.length };
}

function quizLine(c, quizzes, attempts) {
  const qz = asArray(quizzes).filter((q) => (q?.courseId ?? "") === (c?.id ?? "") && String(q.status || "Published") === "Published");
  if (!qz.length) return "—";
  const taken = new Set(asArray(attempts).map((a) => a.quizId));
  const open = qz.filter((q) => !taken.has(q.id));
  if (!open.length) return qz.length + "/" + qz.length;
  const next = open.slice().sort((a, b) => String(a.dueDate || "").localeCompare(String(b.dueDate || "")))[0];
  return next?.title ? String(next.title).slice(0, 18) : open.length + " open";
}

function attPctFor(c, attendance, sessions, uid) {
  try {
    const att = asArray(attendance).filter((a) => (a?.courseId ?? "") === (c?.id ?? ""));
    const sess = asArray(sessions).filter((s) => (s?.courseId ?? "") === (c?.id ?? ""));
    const g = attendancePct("", uid, { attendance: att, sessions: sess });
    if (g && g.pct != null) return Math.round(g.pct);
  } catch (_) {}
  return null;
}

function sessionProgress(c, sessions, completed) {
  if (completed) return 100;
  const list = asArray(sessions).filter((s) => (s?.courseId ?? "") === (c?.id ?? "") && String(s?.status || "") !== "Cancelled");
  if (!list.length) return null;
  const now = Date.now();
  const held = list.filter((s) => {
    const t = localPartsMs(s.date, s.endTime || s.startTime || s.time || "23:59");
    return Number.isFinite(t) && t <= now;
  }).length;
  return Math.round((held / list.length) * 100);
}

function ringSvg(pct) {
  if (pct == null) return "";
  const p = Math.max(0, Math.min(100, Number(pct) || 0));
  const r = 18;
  const c = 2 * Math.PI * r;
  const dash = (p / 100) * c;
  return `<svg class="mc2-ring" width="44" height="44" viewBox="0 0 44 44" aria-label="${p}% complete"><circle cx="22" cy="22" r="22" fill="rgba(11,27,51,0.6)"/><circle cx="22" cy="22" r="${r}" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="4"/><circle cx="22" cy="22" r="${r}" fill="none" stroke="#22D3EE" stroke-width="4" stroke-linecap="round" stroke-dasharray="${dash} ${c}" transform="rotate(-90 22 22)"/><text x="22" y="26" text-anchor="middle" fill="#fff" font-size="12" font-weight="700">${p}%</text></svg>`;
}

function passInfo(c, results) {
  const r = results && c?.id ? results[c.id] : null;
  if (!r) return { loading: true, pending: false, passed: false, avg: null };
  if (r.unpublished) return { loading: false, pending: true, passed: false, avg: null };
  if (r.error || r.pending || r.loading) return { loading: true, pending: false, passed: false, avg: r.avg ?? null };
  return { loading: false, pending: false, passed: r.passed === true, avg: r.avg };
}

function coverBlock(c) {
  return coverMarkup(c, "mc2-coverart");
}

function icoCal() {
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>`;
}
function icoClock() {
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/></svg>`;
}
function icoBook() {
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>`;
}
function icoCheck() {
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="9"/></svg>`;
}
function icoSched() {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>`;
}
function icoMat() {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/></svg>`;
}

function stripHtml(c, opts, done) {
  if (done) {
    const pi = passInfo(c, opts.results);
    if (pi.loading) {
      return `<div class="mc2-strip">${icoCal()}<span>Final result · </span><span class="mc2-sknum" aria-hidden="true"></span></div>`;
    }
    if (pi.pending || pi.avg == null) {
      return `<div class="mc2-strip">${icoCal()}<span>Final result · —</span><span class="mc2-res pend">Pending</span></div>`;
    }
    const grade = formatGrade(pi.avg);
    const chip = pi.passed ? `<span class="mc2-res ok">Passed</span>` : `<span class="mc2-res no">Failed</span>`;
    return `<div class="mc2-strip">${icoCal()}<span>Final result · ${esc(grade)}/100 ${pi.passed ? "Passed" : "Failed"}</span>${chip}</div>`;
  }
  const st = String(c.status || "");
  if (st === "Coming soon") {
    const start = formatCourseDate(c.startDate) || "";
    return `<div class="mc2-strip" title="Beirut time">${icoCal()}<span>${start ? "Starts " + esc(start) : "No upcoming class"}</span></div>`;
  }
  const nx = nextSession(c, opts.sessions);
  if (!nx) return `<div class="mc2-strip" title="Beirut time">${icoCal()}<span>No upcoming class</span></div>`;
  const day = friendlyDay(ymdOf(nx.s.date));
  const t0 = fmtClock(nx.s.startTime || nx.s.time);
  const t1 = fmtClock(nx.s.endTime);
  const when = t0 && t1 ? day + ", " + t0.replace(" AM", "").replace(" PM", "") + "–" + t1 : day + (t0 ? ", " + t0 : "");
  return `<div class="mc2-strip" title="Beirut time">${icoCal()}<span>Next class · ${esc(when)}</span></div>`;
}

function cardHtml(c, opts) {
  const p = portalStatus(c);
  const done = p.group === "completed";
  const title = c?.title ?? "";
  const trainer = trainerName(c);
  const chipLab = statusChipShort(c);
  const chipKind = statusChipKind(c);
  const hw = hwCounts(c, opts.assigns, opts.subs);
  const att = attPctFor(c, opts.attendance, opts.sessions, opts.uid);
  const qz = quizLine(c, opts.quizzes, opts.attempts);
  const qzAll = asArray(opts.quizzes).filter((q) => (q?.courseId ?? "") === (c?.id ?? "") && String(q.status || "Published") === "Published");
  const taken = new Set(asArray(opts.attempts).map((a) => a.quizId));
  const qzDone = qzAll.filter((q) => taken.has(q.id)).length;
  const workTotal = hw.total + qzAll.length;
  const workDoneN = hw.done + qzDone;
  const endMs = localPartsMs(c.endDate || c.end, "23:59");
  const courseEnded = Number.isFinite(endMs) && Date.now() > endMs;
  const workAllDone = workTotal > 0 && workDoneN === workTotal;
  const officiallyDone = String(c.status || "") === "Completed";
  const showCompleted = officiallyDone;
  const prog = sessionProgress(c, opts.sessions, showCompleted || (workAllDone && courseEnded));
  const certDoc = asArray(opts.certs).find((x) => x.courseId === c.id || x.id === ((opts.uid || "") + "_" + c.id));
  const revoked = certDoc && (String(certDoc.status) === "revoked" || certDoc.revoked === true);
  const certOk = officiallyDone && certDoc && !revoked;
  const primary = officiallyDone
    ? `<button class="mc2-pri" type="button" data-mc2-result="${esc(c.id)}">View results</button>${certOk ? `<a class="mc2-ghost" href="./student.html#certificates">Certificate</a>` : ""}`
    : `<button class="mc2-pri" type="button" data-mc2-open="${esc(c.id)}">Open course</button>`;
  const pendingProg = opts.progressReady !== true;
  const attTxt = pendingProg ? "" : (att == null ? "—" : att + "%");
  const hwTxt = pendingProg ? "" : (hw.total ? (hw.done + "/" + hw.total) : "—");
  const qzTxt = pendingProg ? "" : qz;
  const sk = pendingProg ? `<span class="mc2-sknum" aria-hidden="true"></span>` : "";
  const noAct = !pendingProg && att == null && !hw.total && (qzTxt === "—" || !qzTxt);
  const stBadges = showCompleted
    ? `<span class="mc2-stchip completed-ok"><i class="v2-dot green"></i>Completed</span>`
    : (chipLab === "Ongoing · Registration closed" || chipKind === "closed")
      ? `<span class="mc2-stchip ongoing"><i class="v2-dot green"></i>Ongoing</span><span class="mc2-stchip closed"><i class="v2-dot amber"></i>Closed</span>`
      : `<span class="mc2-stchip ${esc(chipKind)}"><i class="v2-dot ${chipKind === "sched-open" ? "blue" : (chipKind === "ongoing" ? "green" : "amber")}"></i>${esc(chipLab.indexOf("Scheduled") === 0 ? "Scheduled" : (chipLab.indexOf("Ongoing") === 0 ? "Ongoing" : chipLab))}</span>`;
  return `<article class="mc2-card${done ? " muted" : ""}">
    <div class="mc2-cover">
      ${coverBlock(c)}
      <div class="mc2-badges">${stBadges}</div>
      ${pendingProg ? "" : ringSvg(prog)}
    </div>
    <div class="mc2-body">
      <h3>${esc(title)}</h3>
      ${noAct ? `<p class="mc2-none"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>No activity yet</p>` : `<div class="mc2-stats">
        <div class="mc2-tile">${icoCheck()}<span>Attendance</span><b>${pendingProg ? sk : esc(attTxt)}</b></div>
        <div class="mc2-tile">${icoBook()}<span>Homework</span><b>${pendingProg ? sk : esc(hwTxt)}</b></div>
        <div class="mc2-tile">${icoClock()}<span>Quiz</span><b title="${esc(qzTxt)}">${pendingProg ? sk : esc(qzTxt)}</b></div>
      </div>`}
      ${trainer ? `<p class="mc2-tr">${icon("trainers")}<span class="mc2-av">${esc(trainerInitials(trainer))}</span>${esc(trainer)}</p>` : `<p class="mc2-tr">&nbsp;</p>`}
      ${pendingProg ? `<div class="mc2-bar mc2-bar-sk" aria-hidden="true"><i></i></div>` : (prog == null ? "" : `<div class="mc2-bar" aria-hidden="true"><i style="width:${prog}%"></i></div>`)}
    </div>
    ${stripHtml(c, opts, officiallyDone)}
    <div class="mc2-foot">
      ${primary}
      <div class="mc2-icos">
        <button type="button" class="mc2-ico" title="Schedule" data-mc2-sched="${esc(c.id)}">${icoSched()}</button>
        <button type="button" class="mc2-ico" title="Materials" data-mc2-mat="${esc(c.id)}">${icoMat()}</button>
      </div>
    </div>
  </article>`;
}

export function renderMyCoursesV2(opts) {
  const host = opts?.host;
  if (!host) return false;
  const phone = typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;
  const t0 = phone ? performance.now() : 0;
  try {
    if (opts.loading) {
      host.innerHTML = `<div class="mc2-wrap"><div class="mc2-head"><div><h2>My courses</h2><p class="mc2-sub">Your learning journey at GHz Academy</p></div></div><div class="mc2-grid"><div class="mc2-skel"></div><div class="mc2-skel"></div></div></div>`;
      return true;
    }
    const courses = asArray(opts.courses);
    const active = courses.filter((c) => portalStatus(c).group === "active");
    const done = courses.filter((c) => portalStatus(c).group === "completed");
    const tab = state.tab === "completed" ? "completed" : "active";
    const list = tab === "completed" ? done : active;
    const extra = {
      progressReady: opts.progressReady === true || (asArray(opts.sessions).length + asArray(opts.assigns).length + asArray(opts.attendance).length) > 0,
      sessions: asArray(opts.sessions),
      assigns: asArray(opts.assigns),
      subs: opts.subs ?? {},
      attendance: asArray(opts.attendance),
      results: opts.results ?? {},
      quizzes: asArray(opts.quizzes),
      attempts: asArray(opts.attempts),
      certs: asArray(opts.certs),
      uid: opts.uid || ""
    };

    const empty = tab === "completed"
      ? `<div class="mc2-empty"><p>No completed courses yet<span style="display:block;margin-top:4px;font-size:13px;line-height:1.45;color:#64748b;font-weight:400">Finished courses, results and certificates will show here.</span></p></div>`
      : `<div class="mc2-empty"><p>You're not enrolled in an active course yet</p><button class="btn btn-sm" type="button" data-mc2-browse>Browse courses</button></div>`;

    host.innerHTML = `<div class="mc2-wrap${opts.stale ? " is-stale" : ""}">
      ${opts.stale ? `<p class="mc2-sub" style="opacity:.7">Updating courses…</p>` : ""}
      <div class="mc2-head">
        <div>
          <h2>My courses</h2>
          <p class="mc2-sub">Your learning journey at GHz Academy</p>
        </div>
      </div>
      <div class="mc2-seg" role="tablist">
        <button type="button" role="tab" class="${tab==="active"?"on":""}" data-mc2-tab="active">Active (${active.length})</button>
        <button type="button" role="tab" class="${tab==="completed"?"on":""}" data-mc2-tab="completed">Completed (${done.length})</button>
      </div>
      ${list.length ? `<div class="mc2-grid">${list.map((c) => cardHtml(c, extra)).join("")}</div>` : empty}
    </div>`;

    host.onclick = (e) => {
      const t = e.target?.closest?.("[data-mc2-tab],[data-mc2-open],[data-mc2-browse],[data-mc2-result],[data-mc2-sched],[data-mc2-mat]");
      if (!t) return;
      if (t.hasAttribute("data-mc2-tab")) {
        state.tab = t.getAttribute("data-mc2-tab") === "completed" ? "completed" : "active";
        renderMyCoursesV2(opts);
        return;
      }
      if (t.hasAttribute("data-mc2-browse")) { opts.onBrowse?.(); return; }
      if (t.hasAttribute("data-mc2-result")) { opts.onResult?.(t.getAttribute("data-mc2-result")); return; }
      if (t.hasAttribute("data-mc2-sched")) { location.hash = "schedule"; return; }
      if (t.hasAttribute("data-mc2-mat")) {
        const id = t.getAttribute("data-mc2-mat");
        location.hash = "course/" + id + "/materials";
        return;
      }
      const id = t.getAttribute("data-mc2-open");
      if (id) opts.onOpen?.(id);
    };
    hydrateCovers(host, { thumb: true, eager: 3 });
    if (phone) {
      try {
        console.log("[ghz-perf] page my-courses first-card", Math.round(performance.now() - t0) + "ms", list.length);
        console.log("[ghz-perf] page my-courses all-cards", Math.round(performance.now() - t0) + "ms");
      } catch {}
    }
    opts.onReady?.();
    return true;
  } catch (e) {
    const code = (e?.code || "error") + ": " + (e?.message || e);
    host.innerHTML = `<div class="mc2-fail"><p>Could not load courses (${esc(code)})</p><button class="btn btn-sm" type="button" data-retry>Try again</button></div>`;
    host.onclick = (ev) => { if (ev.target?.closest?.("[data-retry]")) renderMyCoursesV2(opts); };
    return false;
  }
}
