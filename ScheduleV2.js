import { deliveryDaysHtml } from "./DeliveryDays.js";

const esc = (s) => String(s ?? "").replace(/&/g,"&"+"amp;").replace(/</g,"&"+"lt;").replace(/"/g,"&"+"quot;");
const COLORS = ["#2563EB", "#16A34A", "#D97706", "#7C3AED", "#0EA5E9", "#DC2626"];
const state = { view: "agenda", course: "all", week: 0, month: 0, pastOpen: false, nodateOpen: false, day: "", now: Date.now(), timer: 0 };

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + day;
}
function colorFor(id, courses) {
  const i = Math.max(0, (courses || []).findIndex((c) => c.id === id));
  return COLORS[i % COLORS.length];
}
function sessTitle(s) {
  const t = String(s?.title ?? s?.topic ?? s?.name ?? "").trim();
  if (!t || /^session$/i.test(t)) return "Class session";
  return t;
}
function validDate(s) {
  const d = String(s?.date ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const dt = new Date(d + "T12:00:00");
  return !Number.isNaN(dt.getTime());
}
function hasTime(s) {
  return Boolean(String(s?.startTime ?? s?.time ?? "").trim());
}
function timeRange(s) {
  const a = String(s?.startTime ?? s?.time ?? "").trim();
  const b = String(s?.endTime ?? "").trim();
  if (a && b) return a + " – " + b;
  if (a) return a;
  return "";
}
function prettyWhen(s) {
  if (!validDate(s)) return "";
  const dt = new Date(String(s.date) + "T12:00:00");
  const day = dt.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  const tr = timeRange(s);
  return tr ? day + " · " + tr : day + " · Time TBA";
}
function prettyDay(iso) {
  try {
    return new Date(iso + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  } catch { return iso; }
}
function durationChip(s) {
  const a = String(s?.startTime ?? "").trim();
  const b = String(s?.endTime ?? "").trim();
  if (!a || !b) return "";
  const pa = a.split(":").map(Number);
  const pb = b.split(":").map(Number);
  if (pa.length < 2 || pb.length < 2) return "";
  const mins = (pb[0] * 60 + pb[1]) - (pa[0] * 60 + pa[1]);
  if (!Number.isFinite(mins) || mins <= 0) return "";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h && m ? `${h} h ${m} m` : h ? `${h} h` : `${m} min`;
}
function startMs(s) {
  const d = String(s?.date ?? "");
  const t = String(s?.startTime ?? "00:00");
  const dt = new Date(d + "T" + (t.length === 5 ? t + ":00" : t));
  return dt.getTime();
}
function endMs(s) {
  const d = String(s?.date ?? "");
  const t = String(s?.endTime ?? "").trim();
  if (!t) return startMs(s) + 3600000;
  const dt = new Date(d + "T" + (t.length === 5 ? t + ":00" : t));
  return dt.getTime();
}
function attChip(s, attendance) {
  const rec = (attendance || []).find((a) => (a?.sessionId ?? "") === (s?.id ?? "") || ((a?.courseId ?? "") === (s?.courseId ?? "") && (a?.date ?? "") === (s?.date ?? "")));
  const st = String(rec?.status ?? rec?.mark ?? "").toLowerCase();
  if (st === "present") return `<span class="sv2-chip ok">Present</span>`;
  if (st === "late") return `<span class="sv2-chip late">Late</span>`;
  if (st === "absent") return `<span class="sv2-chip abs">Absent</span>`;
  if (st === "excused") return `<span class="sv2-chip ex">Excused</span>`;
  return "";
}
function dayLabel(d) {
  const t = todayStr();
  const tom = new Date(); tom.setDate(tom.getDate() + 1);
  const t2 = todayStrFrom(tom);
  if (d === t) return "Today";
  if (d === t2) return "Tomorrow";
  return prettyDay(d);
}
function todayStrFrom(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function countdownText(s, now) {
  if (!validDate(s) || !hasTime(s)) return "";
  const start = startMs(s);
  const end = endMs(s);
  if (!Number.isFinite(start)) return "";
  if (now >= start && now < end) return "In progress";
  if (now >= end) return "";
  if (now >= start - 60000 && now < start) return "Starting now";
  let ms = start - now;
  const days = Math.floor(ms / 86400000);
  ms -= days * 86400000;
  const hrs = Math.floor(ms / 3600000);
  ms -= hrs * 3600000;
  const mins = Math.floor(ms / 60000);
  return days + "d " + String(hrs).padStart(2, "0") + "h " + String(mins).padStart(2, "0") + "m";
}
function icsFor(s) {
  const start = startMs(s);
  const end = endMs(s);
  const fmt = (n) => {
    const d = new Date(n);
    return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  };
  const body = `BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nDTSTART:${fmt(start)}\nDTEND:${fmt(end)}\nSUMMARY:${sessTitle(s)}\nDESCRIPTION:${s.courseTitle || ""}\nEND:VEVENT\nEND:VCALENDAR`;
  return "data:text/calendar;charset=utf-8," + encodeURIComponent(body);
}
function mondayOf(offsetWeeks) {
  const d = new Date();
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day + offsetWeeks * 7);
  d.setHours(12, 0, 0, 0);
  return d;
}
function monthDate(offset) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  return d;
}
function clockSvg() {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/><path d="M12 7v5l3 2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
}
function calSvg() {
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" stroke-width="2"/><path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
}

function cardHtml(s, courses, attendance, past) {
  const col = colorFor(s.courseId, courses);
  const today = validDate(s) && s.date === todayStr();
  const dur = durationChip(s);
  const tba = !hasTime(s);
  const timeHtml = tba
    ? `<div class="sv2-time tba">${clockSvg()} Time TBA</div>`
    : `<div class="sv2-time-row"><div class="sv2-time">${esc(timeRange(s))}</div>${dur ? `<span class="sv2-dur">${esc(dur)}</span>` : ""}</div>`;
  return `<article class="sv2-card${today ? " today" : ""}" style="border-left-color:${col}">
    <div>${timeHtml}</div>
    <div>
      <p class="sv2-title">${esc(sessTitle(s))} ${today ? `<span class="sv2-chip today">Today</span>` : ""}</p>
      <span class="sv2-chip" style="background:${col}22;color:${col}">${esc(s.courseTitle || "")}</span>
      ${past ? attChip(s, attendance) : ""}
    </div>
  </article>`;
}

function startClock(opts) {
  if (state.timer) clearInterval(state.timer);
  state.timer = setInterval(() => {
    state.now = Date.now();
    const el = opts?.host?.querySelector?.("[data-sv2-count]");
    if (!el) return;
    const iso = el.getAttribute("data-date");
    const st = el.getAttribute("data-start") || "";
    const en = el.getAttribute("data-end") || "";
    el.textContent = countdownText({ date: iso, startTime: st, endTime: en }, state.now);
  }, 60000);
}

export function renderScheduleV2(opts) {
  const host = opts?.host;
  if (!host) return false;
  try {
    if (opts.loading) {
      const wrap = document.createElement("div");
      wrap.className = "sv2-wrap";
      wrap.innerHTML = `<div class="sv2-skel"></div><div class="sv2-skel"></div>`;
      host.replaceChildren(wrap);
      return true;
    }
    const courses = Array.isArray(opts.courses) ? opts.courses : [];
    const sessions = Array.isArray(opts.sessions) ? opts.sessions : [];
    const attendance = Array.isArray(opts.attendance) ? opts.attendance : [];
    const cid = state.course;
    const filtered = sessions.filter((s) => cid === "all" || s.courseId === cid);
    const dated = filtered.filter(validDate);
    const nodate = filtered.filter((s) => !validDate(s));
    const t = todayStr();
    const upcoming = dated.filter((s) => String(s.date) >= t && s.status !== "Cancelled").sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.startTime||"").localeCompare(String(b.startTime||"")));
    const past = dated.filter((s) => String(s.date) < t).sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const next = upcoming[0] || null;
    const byDay = {};
    for (const s of upcoming) { (byDay[s.date] = byDay[s.date] || []).push(s); }

    const courseCards = courses.map((c) => {
      const col = colorFor(c.id, courses);
      const on = cid === c.id;
      return `<button type="button" class="sv2-ccard${on ? " on" : ""}" style="--sv2-col:${col}" data-sv2-ccard="${esc(c.id)}">
        <span class="sv2-ccard-top"><span class="sv2-dot" style="background:${col}"></span><span class="sv2-ccard-name">${esc(c.title || "")}</span></span>
        ${deliveryDaysHtml(c, { emptyMode: "hide" })}
      </button>`;
    }).join("");

    let body = "";
    if (state.view === "week") {
      const mon = mondayOf(state.week);
      const days = [...Array(7)].map((_, i) => {
        const d = new Date(mon); d.setDate(mon.getDate() + i);
        return todayStrFrom(d);
      });
      body = `<div class="sv2-weekbar">
        <button type="button" data-sv2-w="-1">‹</button>
        <strong>${esc(prettyDay(days[0]))} – ${esc(prettyDay(days[6]))}</strong>
        <button type="button" data-sv2-w="1">›</button>
        <button type="button" data-sv2-today>Today</button>
      </div>
      <div class="sv2-grid">${days.map((d) => {
        const list = dated.filter((s) => s.date === d);
        return `<div class="sv2-col${d===t?" today":""}"><h4>${esc(dayLabel(d))}</h4>${list.map((s) => `<div class="sv2-blk" style="background:${colorFor(s.courseId, courses)}">${esc(hasTime(s) ? timeRange(s) : "Time TBA")}<br>${esc(sessTitle(s))}</div>`).join("") || ""}</div>`;
      }).join("")}</div>`;
    } else if (state.view === "month") {
      const m = monthDate(state.month);
      const y = m.getFullYear();
      const mo = m.getMonth();
      const first = new Date(y, mo, 1);
      const startPad = (first.getDay() + 6) % 7;
      const daysIn = new Date(y, mo + 1, 0).getDate();
      const cells = [];
      for (let i = 0; i < startPad; i++) cells.push(`<div></div>`);
      for (let day = 1; day <= daysIn; day++) {
        const ds = `${y}-${String(mo+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
        const list = dated.filter((s) => s.date === ds);
        const dots = list.map((s) => `<span class="sv2-dot" style="background:${colorFor(s.courseId, courses)}"></span>`).join("");
        cells.push(`<button type="button" class="sv2-cell${state.day===ds?" on":""}" data-sv2-day="${ds}">${day}<div>${dots}</div></button>`);
      }
      const picked = state.day ? dated.filter((s) => s.date === state.day) : [];
      body = `<div class="sv2-weekbar">
        <button type="button" data-sv2-m="-1">‹</button>
        <strong>${esc(m.toLocaleString("en-GB",{month:"long",year:"numeric"}))}</strong>
        <button type="button" data-sv2-m="1">›</button>
      </div>
      <div class="sv2-month">${cells.join("")}</div>
      ${picked.length ? picked.map((s) => cardHtml(s, courses, attendance, s.date < t)).join("") : (state.day ? `<p class="sv2-empty">No classes on this day.</p>` : "")}`;
    } else {
      const days = Object.keys(byDay).sort();
      const agenda = days.length
        ? days.map((d) => `<div class="sv2-dayh">${esc(dayLabel(d))}</div>${byDay[d].map((s) => cardHtml(s, courses, attendance, false)).join("")}`).join("")
        : `<div class="sv2-empty">📅<p>No upcoming classes.</p></div>`;
      body = agenda + `<div class="sv2-past">
        <button type="button" data-sv2-past>Past sessions (${past.length})</button>
        ${state.pastOpen ? past.map((s) => cardHtml(s, courses, attendance, true)).join("") : ""}
      </div>`;
    }
    if (nodate.length) {
      body += `<div class="sv2-nodate">
        <button type="button" data-sv2-nodate>Date not set (${nodate.length})</button>
        ${state.nodateOpen ? nodate.map((s) => cardHtml({ ...s, date: "" }, courses, attendance, false)).join("") : ""}
      </div>`;
    }

    const count = next ? countdownText(next, Date.now()) : "";
    const wrap = document.createElement("div");
    wrap.className = "sv2-wrap";
    wrap.innerHTML = `
      <div class="sv2-head">
        <div><h2>Schedule</h2><p class="sv2-sub">Your classes at a glance</p></div>
        <div class="sv2-tools">
          <div class="sv2-tog">
            <button type="button" class="${state.view==="agenda"?"on":""}" data-sv2-view="agenda">Agenda</button>
            <button type="button" class="${state.view==="week"?"on":""}" data-sv2-view="week">Week</button>
            <button type="button" class="${state.view==="month"?"on":""}" data-sv2-view="month">Month</button>
          </div>
        </div>
      </div>
      <div class="sv2-hero">
        ${next ? `<div>
          <h3>Next class</h3>
          <p class="t">${esc(sessTitle(next))}</p>
          <p>${esc(prettyWhen(next))}</p>
          <p>${esc(next.courseTitle || "")}</p>
          <div class="sv2-hero-actions">
            <a class="sv2-ics" href="${icsFor(next)}" download="class.ics">${calSvg()} Add to calendar</a>
            <a class="sv2-open" href="#coursesv2">Open course</a>
          </div>
        </div>
        <div class="sv2-count" data-sv2-count data-date="${esc(next.date||"")}" data-start="${esc(next.startTime||"")}" data-end="${esc(next.endTime||"")}">${esc(count)}</div>` : `<div><h3>Next class</h3><p class="t">No upcoming classes</p></div>`}
      </div>
      <div class="sv2-ccards">${courseCards}</div>
      ${body}
    `;
    wrap.addEventListener("click", (e) => {
      const tEl = e.target;
      if (!tEl || !tEl.closest) return;
      const v = tEl.closest("[data-sv2-view]");
      const w = tEl.closest("[data-sv2-w]");
      const m = tEl.closest("[data-sv2-m]");
      const pastBtn = tEl.closest("[data-sv2-past]");
      const nd = tEl.closest("[data-sv2-nodate]");
      const day = tEl.closest("[data-sv2-day]");
      const tod = tEl.closest("[data-sv2-today]");
      const cc = tEl.closest("[data-sv2-ccard]");
      if (v) { state.view = v.getAttribute("data-sv2-view"); renderScheduleV2(opts); return; }
      if (w) { state.week += Number(w.getAttribute("data-sv2-w")); renderScheduleV2(opts); return; }
      if (m) { state.month += Number(m.getAttribute("data-sv2-m")); renderScheduleV2(opts); return; }
      if (tod) { state.week = 0; renderScheduleV2(opts); return; }
      if (pastBtn) { state.pastOpen = !state.pastOpen; renderScheduleV2(opts); return; }
      if (nd) { state.nodateOpen = !state.nodateOpen; renderScheduleV2(opts); return; }
      if (cc) {
        const id = cc.getAttribute("data-sv2-ccard");
        state.course = state.course === id ? "all" : id;
        renderScheduleV2(opts);
        return;
      }
      if (day) { state.day = day.getAttribute("data-sv2-day"); renderScheduleV2(opts); }
    });
    host.replaceChildren(wrap);
    startClock(opts);
    opts.onReady?.();
    return true;
  } catch (e) {
    const code = (e?.code || "error") + ": " + (e?.message || e);
    const box = document.createElement("div");
    box.className = "sv2-fail";
    const p = document.createElement("p");
    p.textContent = "Could not load schedule (" + code + ")";
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
