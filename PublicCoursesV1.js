import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { auth, db } from "./firebase-config.js?v=auth10";
import { formatCourseDate, startsEndsLine } from "./courseDates.js";
import { formatDuration, formatPrice, formatSchedule, parseCourseDays, sessionsPerWeekWords } from "./DeliveryDays.js";
import { formatBeirutTimeLine, timeInfoButton, bindTimePopovers } from "./courseTimeFacts.js";
import { courseCardHtml, coverHtml } from "./CourseCard.js";
import { stripCoverFields, hydrateCovers } from "./coverFor.js?v=stu11";
import { renderBrowseCoursesV2 } from "./BrowseCoursesV2.js";
import { publicCardActions, moneyLabel, getCourseAction, courseSlug } from "./courseCardActions.js";
import { statusLabel, statusChipKind, canRegisterForCourse } from "./courseStatusLabel.js";
import { icon } from "./ghz-icons.js";

const PUBLIC = ["Open", "Coming soon", "Closed"];
const CACHE_KEY = "ghz-pc1-courses-v6";
const CACHE_MS = 30 * 60 * 1000;
const root = document.getElementById("pc1Root");

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (ch) => {
    if (ch === "&") return "\u0026amp;";
    if (ch === "<") return "\u0026lt;";
    if (ch === ">") return "\u0026gt;";
    if (ch === '"') return "\u0026quot;";
    return "\u0026#39;";
  });
}

function startMs(c) {
  const v = c?.startDate;
  try {
    if (v && typeof v.toDate === "function") return v.toDate().getTime();
  } catch {}
  const t = Date.parse(v || "");
  return Number.isFinite(t) ? t : 9e15;
}

function priceLine(c) {
  return formatPrice(c) || "Price on request";
}

function trainers(c) {
  const n = Array.isArray(c.trainerNames) ? c.trainerNames.filter(Boolean) : [];
  return n.length ? n.join(", ") : "To be announced";
}

function badge(cOrSt) {
  const c = cOrSt && typeof cOrSt === "object" ? cOrSt : { status: cOrSt };
  const lab = statusLabel(c);
  return `<span class="pc1-badge ${statusChipKind(c)}">${lab}</span>`;
}

function edge(st) {
  if (st === "Open") return "open";
  if (st === "Coming soon") return "soon";
  return "closed";
}

function rememberCourse(id) {
  try { if (id) sessionStorage.setItem("ghz-reg-course", id); } catch {}
}
function registerHref(id, role) {
  rememberCourse(id);
  if (role === "student") return "./student.html#register/" + encodeURIComponent(id);
  return "./login.html?tab=signup&course=" + encodeURIComponent(id) + "&next=register";
}

function findByParam(list, want) {
  const w = String(want || "").trim().toLowerCase();
  if (!w) return null;
  return (list || []).find((x) => String(x.id) === want || courseSlug(x) === w) || null;
}
function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY) || sessionStorage.getItem("ghz-pc1-courses-v5");
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (!o || !Array.isArray(o.list)) return null;
    return o;
  } catch { return null; }
}

function writeCache(list) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), list })); } catch {}
}

async function fetchCourses() {
  const snap = await getDocs(query(collection(db, "courses"), where("status", "in", PUBLIC)));
  const list = snap.docs.map((d) => {
    const data = d.data() || {};
    return {
      id: d.id,
      title: data.title || "",
      short: data.short || data.summary || "",
      full: data.full || data.description || data.long || "",
      outline: data.outline || data.chapters || [],
      prerequisites: data.prerequisites || data.prereq || "",
      level: data.level || "",
      duration: data.duration || "",
      days: data.days || [],
      sessionTime: data.sessionTime || data.time || "",
      startDate: data.startDate || null,
      endDate: data.endDate || null,
      price: data.price,
      currency: data.currency,
      trainerNames: data.trainerNames || [],
      seats: data.seats || data.capacity || "",
      status: data.status,
      topic: data.topic || data.category || "",
      coverImage: data.coverImage || data.cover || ""
    };
  }).map(stripCoverFields).filter((c) => PUBLIC.includes(c.status));
  list.forEach((c) => {
    const sch = formatSchedule(c);
    if (sch.invalidLetterString) console.warn("Bad course.days (letter string, ignored):", c.title, sch.rawDays);
  });
  return list;
}

function stateLabelHtml(kind) {
  const clock = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.8"/><path d="M12 8v4l3 2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
  const text = statusLabel({ status: kind });
  return `<span class="pc1-statelabel" aria-disabled="true">${clock}${text}</span>`;
}
function cardHtml(c, role) {
  return courseCardHtml(c, { role, viewMode: "button" });
}

function outlineMods(o) {
  const rows = Array.isArray(o) ? o : (typeof o === "string" && o.trim() ? o.split(/\n+/) : []);
  return rows.map((x) => {
    if (typeof x === "string") return { title: x.replace(/^\d+[.)]\s*/, "").trim(), description: "", hours: "", topics: [] };
    const title = String(x.title || x.name || "").trim();
    const description = String(x.description || x.short || x.summary || x.details || "").trim();
    const hours = String(x.hours || x.duration || "").trim();
    const topics = Array.isArray(x.topics) ? x.topics : String(x.topics || "").split(/,|\n/).map((t) => t.trim()).filter(Boolean);
    return { title, description, hours, topics };
  }).filter((m) => m.title);
}
function isPlaceholderPrereq(s) {
  const t = String(s || "").trim().replace(/[.]+$/, "").toLowerCase();
  return !t || t === "to be listed" || t === "none" || t === "n/a" || t === "na";
}
function prereqItems(p) {
  const raw = Array.isArray(p)
    ? p.map((x) => String(x).trim()).filter(Boolean)
    : (typeof p === "string" && p.trim() ? p.split(/\n+|;/).map((s) => s.replace(/^[-*\u2022]\s*/, "").trim()).filter(Boolean) : []);
  return raw.filter((s) => !isPlaceholderPrereq(s));
}
function ico(path, size) {
  const s = size || 20;
  return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}
function hico(kind, tone) {
  const paths = {
    list: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>',
    shield: '<path d="M12 3l8 4v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7l8-4z"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/>',
    users: '<circle cx="9" cy="8" r="3"/><path d="M3 19c0-3 2.5-5 6-5s6 2 6 5"/><circle cx="17" cy="9" r="2.4"/><path d="M16 19c1.8-.4 3.5-1.8 4-4"/>',
    spark: '<path d="M12 3l1.4 5.2L18 9.6l-4.6 1.4L12 16l-1.4-5-4.6-1.4 4.6-1.4z"/>'
  };
  return `<span class="pc1-hico ${tone}">${ico(paths[kind] || paths.list, 18)}</span>`;
}
function tile(label, value, path, tone) {
  if (!value) return "";
  return `<div class="pc1-tile pc1-rise"><span class="pc1-ticon ${tone||""}">${ico(path)}</span><div><span>${esc(label)}</span><strong>${value}</strong></div></div>`;
}
function trainerCards(c) {
  const n = Array.isArray(c.trainerNames) ? c.trainerNames.filter(Boolean) : [];
  if (!n.length) return `<p class="pc1-muted">To be announced</p>`;
  return `<div class="pc1-trcards">${n.map((name) => {
    const ini = name.split(/\s+/).map((p) => p[0] || "").join("").slice(0, 2).toUpperCase();
    return `<article class="pc1-trcard"><span class="pc1-ini lg" aria-hidden="true">${esc(ini)}</span><div><strong>${esc(name)}</strong><span>Instructor</span></div></article>`;
  }).join("")}</div>`;
}
function countdownHtml(c) {
  const now = Date.now();
  const a = startMs(c);
  const b = (() => {
    const v = c?.endDate;
    try { if (v && typeof v.toDate === "function") return v.toDate().getTime(); } catch {}
    const t = Date.parse(v || "");
    return Number.isFinite(t) ? t : NaN;
  })();
  if (!Number.isFinite(a) || a > 8e15) return "";
  if (now < a) {
    const days = Math.max(1, Math.ceil((a - now) / 86400000));
    return `<span class="pc1-count">Starts in ${days} day${days === 1 ? "" : "s"}</span>`;
  }
  if (Number.isFinite(b) && now <= b) return `<span class="pc1-count on">In progress</span>`;
  return "";
}
function weekDots(codes) {
  const letters = ["M","T","W","T","F","S","S"];
  const order = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  return `<div class="pc1-dots" aria-hidden="true">${order.map((d, i) => `<span class="${codes.includes(d) ? "on" : ""}">${letters[i]}</span>`).join("")}</div>`;
}
function seatsLine(c) {
  const n = Number(c.seats);
  if (!Number.isFinite(n) || n <= 0) return "";
  return `<p class="pc1-seats">${n} seat${n === 1 ? "" : "s"} left</p>`;
}
function relatedHtml(c, all) {
  const others = (all || []).filter((x) => x.id !== c.id && (x.status === "Open" || x.status === "Coming soon")).slice(0, 3);
  if (!others.length) return "";
  return `<section class="pc1-rel"><h3>${hico("spark","teal")}You may also like</h3><div class="pc1-relg">${others.map((x) => {
    const sch = formatSchedule(x);
    return `<button type="button" class="pc1-mini" data-rel="${esc(x.id)}"><span class="pc1-edge ${edge(x.status)}"></span><strong>${esc(x.title)}</strong>${badge(x)}<span class="pc1-minisch">${esc(sch.daysLine || "")}</span><span class="pc1-price">${esc(priceLine(x))}</span></button>`;
  }).join("")}</div></section>`;
}
function icsBlob(c) {
  const a = startMs(c);
  if (!Number.isFinite(a) || a > 8e15) return "";
  const dt = (ms) => {
    const d = new Date(ms);
    const p = (n) => String(n).padStart(2, "0");
    return d.getUTCFullYear() + p(d.getUTCMonth() + 1) + p(d.getUTCDate()) + "T" + p(d.getUTCHours()) + p(d.getUTCMinutes()) + "00Z";
  };
  const end = (() => {
    const v = c?.endDate;
    try { if (v && typeof v.toDate === "function") return v.toDate().getTime(); } catch {}
    const t = Date.parse(v || "");
    return Number.isFinite(t) ? t : a + 2 * 3600000;
  })();
  const ics = ["BEGIN:VCALENDAR","VERSION:2.0","BEGIN:VEVENT","SUMMARY:" + String(c.title || "Course").replace(/\n/g, " "),"DTSTART:" + dt(a),"DTEND:" + dt(Math.max(a + 3600000, end)),"END:VEVENT","END:VCALENDAR"].join("\r\n");
  return ics;
}
function factRow(kind, label, valueHtml) {
  if (!valueHtml) return "";
  return `<li>${icon(kind)} <span>${esc(label)}</span> <strong>${valueHtml}</strong></li>`;
}
let authKnown = false;
let authReady = false;
let authUser = null;
let regsReady = false;
let checkingTimedOut = false;
function userCtx(role) {
  return {
    role: role || (authUser ? "student" : "guest"),
    user: authUser,
    regsByCourse,
    authKnown,
    authReady,
    regsReady,
    checkingTimedOut
  };
}
function withTimeout(p, ms) {
  return Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))
  ]);
}
function ctaMarkup(st) {
  if (st.checking) {
    return `<button type="button" class="pc1-btn pri pc1-footbtn" disabled><span class="pc1-spin" aria-hidden="true"></span> Checking…</button>`;
  }
  if (st.disabled) return `<button type="button" class="pc1-btn pri pc1-footbtn" disabled>${esc(st.label)}</button>`;
  return `<a class="pc1-btn pri pc1-footbtn" href="${esc(st.href)}">${esc(st.label)}</a>`;
}
function modalHtml(c, role, all) {
  const dur = formatDuration(c);
  const sch = formatSchedule(c);
  const start = formatCourseDate(c.startDate);
  const end = formatCourseDate(c.endDate);
  const schedVal = [sch.daysLine, sch.timeLine ? esc(sch.timeLine) + (sch.zone ? ` <span class="dd-zone">${esc(sch.zone)}</span>` : "") : ""].filter(Boolean).join("<br/>");
  const prereqs = prereqItems(c.prerequisites);
  const mods = outlineMods(c.outline);
  const full = String(c.full || "").trim();
  const short = String(c.short || "").trim();
  const chev = `<svg class="pc1-chev" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9l6 6 6-6" stroke="#64748b" stroke-width="1.8" stroke-linecap="round"/></svg>`;
  const outlineHtml = mods.length ? `<ol class="pc1-tl">${mods.map((m, i) => {
    const topics = (m.topics || []).map((t) => `<span class="pc1-tchip">${esc(t)}</span>`).join("");
    const has = !!m.description;
    return `<li class="pc1-mod${i===0 && has ? " open" : ""}${has ? "" : " plain"}" data-mod>
      <div class="pc1-modcard">
        <button type="button" class="pc1-modh" ${has ? "" : "disabled"}>
          <span class="pc1-num">${i + 1}</span>
          <span class="pc1-modt">${esc(m.title)}${m.hours ? `<em>${esc(m.hours)}</em>` : ""}</span>
          ${has ? chev : ""}
        </button>
        ${has ? `<div class="pc1-modb"><p>${esc(m.description)}</p>${topics ? `<div class="pc1-topics">${topics}</div>` : ""}</div>` : ""}
      </div>
    </li>`;
  }).join("")}</ol>` : `<p class="pc1-muted">Outline will be shared with registered students.</p>`;
  const codes = parseCourseDays(c).codes || [];
  const glass = [
    start ? `Starts ${esc(start)}` : "",
    dur ? esc(dur) : "",
    [sch.daysLine, sch.timeLine].filter(Boolean).join(" · ")
  ].filter(Boolean).slice(0, 3);
  const glance = [
    c.level ? ["Level", esc(c.level)] : null,
    dur ? ["Duration", esc(dur)] : null,
    sch.daysLine || sch.timeLine ? ["Schedule", esc(sch.daysLine || sch.timeLine)] : null,
    ["Price", esc(priceLine(c))]
  ].filter(Boolean);
  const ics = icsBlob(c);
  const names = Array.isArray(c.trainerNames) ? c.trainerNames.filter(Boolean) : [];
  const days = Array.isArray(c.days) ? c.days.filter(Boolean).join(" · ") : "";
  const tline = String(c.sessionTime || sch.timeLine || "").trim();
  const dayTime = [days, tline].filter(Boolean).join(" · ") || "Not set";
  const pri = getCourseAction(c, { ...userCtx(role), forDetails: true });
  const cta = ctaMarkup(pri);
  const enrolledChip = pri.enrolled ? `<span class="pc1-enrolled">Enrolled</span>` : "";
  const bullets = (mods.length ? mods.map((m) => m.title).filter(Boolean) : []).slice(0, 8);
  const sessN = Number(c.sessions || c.sessionCount || c.totalSessions) || (codes.length ? codes.length : 0);
  const sessLine = sessN ? sessN + " session" + (sessN === 1 ? "" : "s") : (sch.daysLine || "");
  const weekN = Number(c.sessionsPerWeek) || codes.length || 0;
  const weekLine = weekN ? sessionsPerWeekWords(weekN) : sessLine;
  const learnHtml = bullets.length ? `<div class="pc1-v4learn"><h3>${icon("level")} What you will learn</h3><ul>${bullets.map((t) => `<li>${esc(t)}</li>`).join("")}</ul></div>` : "";
  const extraHtml = `<div class="pc1-v4extra">
        <section class="pc1-v4sec"><h3>${icon("trainers")} Your trainers</h3><div class="pc1-trcards">${names.length ? names.map((name) => {
          const ini = name.split(/\s+/).map((p) => p[0] || "").join("").slice(0, 2).toUpperCase();
          return `<article class="pc1-trcard"><span class="pc1-ini lg" aria-hidden="true">${esc(ini)}</span><div><strong>${esc(name)}</strong><span>Instructor</span></div></article>`;
        }).join("") : `<p class="pc1-muted">To be announced</p>`}</div></section>
      </div>`;
  const daysVal = sch.daysLine || days;
  const timeVal = formatBeirutTimeLine(sch.timeLine || tline) || sch.timeLine || tline;
  const sessVal = weekN ? sessionsPerWeekWords(weekN) : "To be announced";
  const desc = full || short || "";
  const factsPhone = [
    ["Level", c.level, "level"],
    ["Duration", dur, "info"],
    ["Starts", start || "To be announced", "calendar"],
    ["Ends", end, "flag"],
    ["Days", daysVal, "clock"],
    ["Time", timeVal, "clock"],
    ["Sessions", sessVal, "calendar"]
  ].filter((r) => r[1]).map(([lab, val, k]) => {
    const info = lab === "Time" ? ` <span class="ghz-tz-wrap">${timeInfoButton(timeVal)}</span>` : "";
    const stacked = lab === "Time" ? `<span class="ghz-tz-wrap"><span class="ghz-tz-stack"><span class="ghz-tz-main">${esc(val)}</span><span class="ghz-tz-sub">Beirut time</span></span>${timeInfoButton(timeVal)}</span>` : `<strong>${esc(val)}</strong>`;
    return `<div class="pc1-ph-fact">${icon(k)}<span>${esc(lab)}</span>${stacked}</div>`;
  }).join("");
  const learnPhone = bullets.length ? `<div class="pc1-ph-learn" data-ph="learn"><h3>What you will learn</h3><ul>${bullets.map((t) => `<li>${esc(t)}</li>`).join("")}</ul></div>` : "";
  const trainersPhone = `<div class="pc1-ph-train" data-ph="trainers"><h3>Your trainers</h3><div class="pc1-ph-trlist">${names.length ? names.map((name) => {
    const ini = name.split(/\s+/).map((p) => p[0] || "").join("").slice(0, 2).toUpperCase();
    return `<article class="pc1-trcard"><span class="pc1-ini lg" aria-hidden="true">${esc(ini)}</span><div><strong>${esc(name)}</strong><span>Instructor</span></div></article>`;
  }).join("") : `<p class="pc1-muted">To be announced</p>`}</div></div>`;
  const phoneSheet = `<div class="pc1-phone-sheet" role="dialog" aria-modal="true" aria-labelledby="pc1PhoneTitle">
    <div class="pc1-ph-top"><span class="pc1-ph-handle" aria-hidden="true"></span><button type="button" class="pc1-x" data-close aria-label="Close">×</button></div>
    <div class="pc1-ph-scroll">
      <div class="pc1-ph-cover" data-ph="cover" data-cover-slot="${esc(c.id)}">${coverHtml(c)}</div>
      <div class="pc1-ph-badge" data-ph="badge">${badge(c)}${enrolledChip}</div>
      <h2 class="pc1-ph-title" data-ph="title" id="pc1PhoneTitle">${esc(c.title)}</h2>
      ${desc ? `<p class="pc1-ph-desc" data-ph="description">${esc(desc)}</p>` : `<p class="pc1-ph-desc" data-ph="description" hidden></p>`}
      <div class="pc1-ph-facts" data-ph="facts">${factsPhone}</div>
      ${learnPhone}
      ${trainersPhone}
    </div>
    <div class="pc1-ph-bar">
      <div class="pc1-priceblock"><strong>${esc(priceLine(c))}</strong><span>per course</span></div>
      <div class="pc1-footacts">
        <button type="button" class="pc1-share" data-share="${esc(courseSlug(c))}" aria-label="Copy link">Share</button>
        ${cta}
      </div>
    </div>
  </div>`;
  return phoneSheet + `<div class="pc1-sheet pc1-sheet-v4 pc1-in" role="dialog" aria-modal="true" aria-labelledby="pc1DlgTitle">
    <button type="button" class="pc1-x" data-close aria-label="Close">×</button>
    <div class="pc1-v4grid">
      <div class="pc1-v4left">
        <div class="pc1-v4cover" data-cover-slot="${esc(c.id)}">${coverHtml(c)}</div>
        <ul class="pc1-v4facts">
          ${factRow("level", "Level", c.level ? esc(c.level) : "")}
          ${factRow("info", "Duration", dur ? esc(dur) : "")}
          ${factRow("calendar", "Starts", start ? esc(start) : "To be announced")}
          ${factRow("flag", "Ends", end ? esc(end) : "")}
          ${factRow("clock", "Days", daysVal ? esc(daysVal) : "")}
          ${timeVal ? factRow("clock", "Time", `<span class="ghz-tz-wrap"><span class="ghz-tz-stack"><span class="ghz-tz-main">${esc(daysVal ? daysVal.replace(/ · /g, ", ") + " · " : "")}${esc(timeVal)}</span><span class="ghz-tz-sub">Beirut time</span></span>${timeInfoButton(timeVal)}</span>`) : ""}
          ${factRow("calendar", "Sessions", sessVal ? esc(sessVal) : "")}
          ${factRow("seats", "Seats", c.seats ? esc(c.seats) : "")}
          ${factRow("language", "Language", c.language ? esc(c.language) : "")}
        </ul>
      </div>
      <div class="pc1-v4right" id="pc1Scroll">
        <div class="pc1-v4head">${badge(c)}${enrolledChip}
        <h2 id="pc1DlgTitle">${esc(c.title)}</h2></div>
        <div class="pc1-v4desc">${desc ? `<p>${esc(desc)}</p>` : ""}</div>
        ${learnHtml}${extraHtml}
      </div>
    </div>
    <div class="pc1-sticky">
      <div class="pc1-priceblock"><strong>${esc(priceLine(c))}</strong><span>per course</span></div>
      <div class="pc1-footacts">
        <button type="button" class="pc1-share" data-share="${esc(courseSlug(c))}" aria-label="Copy link">Share</button>
        ${cta}
      </div>
    </div>
  </div>`;
}

function applyFilters(list, q, level, status, sort) {
  const qq = q.trim().toLowerCase();
  let out = list.filter((c) => {
    if (level && level !== "All" && String(c.level || "") !== level) return false;
    if (status && c.status !== status) return false;
    if (!qq) return true;
    const hay = [c.title, trainers(c), c.topic, c.short, c.level].join(" ").toLowerCase();
    return hay.includes(qq);
  });
  if (sort === "price") out.sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0));
  else if (sort === "title") out.sort((a, b) => String(a.title).localeCompare(String(b.title)));
  else out.sort((a, b) => startMs(a) - startMs(b));
  return out;
}

let regsByCourse = {};
function renderGrid(list, role) {
  const grid = document.getElementById("pc1Grid");
  if (!grid) return;
  if (!list.length) {
    grid.innerHTML = `<div class="pc1-empty"><p>No courses are open right now — check back soon</p>
      <p><a class="pc1-btn pri" href="./login.html?tab=signup" target="_blank" rel="noopener noreferrer" style="display:inline-flex">Register</a></p></div>`;
    return;
  }
  renderBrowseCoursesV2({
    host: grid,
    catalog: list,
    bare: true,
    money: moneyLabel,
    cardActions: (c) => publicCardActions(c, userCtx(role))
  });
  hydrateCovers(grid);
}

function logSheetBlocks(el) {
  if (!window.matchMedia("(max-width: 767px)").matches) return;
  const keys = ["cover", "badge", "title", "description", "facts", "learn", "trainers"];
  keys.forEach((name) => {
    const node = el.querySelector('[data-ph="' + name + '"]');
    if (!node || node.hidden) return;
    const r = node.getBoundingClientRect();
    try { console.log("[ghz-sheet] block top/bottom", name, Math.round(r.top), Math.round(r.bottom)); } catch {}
  });
}
function bindModal(el, c, all, role) {
  const sc = el.querySelector("#pc1Scroll");
  const tabsBar = el.querySelector(".pc1-tabs");
  const tabs = [...el.querySelectorAll(".pc1-tabs a")];
  const ind = el.querySelector(".pc1-tabind");
  const secs = ["pc1-ov", "pc1-ol", "pc1-pr", "pc1-tr"].map((id) => el.querySelector("#" + id)).filter(Boolean);
  let lockUntil = 0;
  function slide(a) {
    if (!ind || !a) return;
    ind.style.width = a.offsetWidth + "px";
    ind.style.transform = "translateX(" + a.offsetLeft + "px)";
  }
  function setOn(a) {
    tabs.forEach((x) => x.classList.toggle("on", x === a));
    slide(a);
  }
  function tabH() { return (tabsBar?.offsetHeight || 48) + 12; }
  sc?.addEventListener("scroll", () => {
    tabsBar?.classList.toggle("stuck", sc.scrollTop > (el.querySelector(".pc1-hero")?.offsetHeight || 0) - 4);
    if (Date.now() < lockUntil) return;
    if (sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 12) {
      setOn(tabs[tabs.length - 1]);
      return;
    }
    if (sc.scrollTop < 24) setOn(tabs[0]);
  });
  el.querySelectorAll("[data-mod] .pc1-modh").forEach((b) => {
    b.addEventListener("click", () => b.closest("[data-mod]")?.classList.toggle("open"));
  });
  el.querySelectorAll(".pc1-more").forEach((b) => {
    b.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const p = b.previousElementSibling;
      p?.classList.toggle("pc1-clamp");
      b.textContent = p?.classList.contains("pc1-clamp") ? "Show more" : "Show less";
    });
  });
  if (sc && secs.length && typeof IntersectionObserver === "function") {
    const io = new IntersectionObserver((ents) => {
      if (Date.now() < lockUntil) return;
      const vis = ents.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!vis) return;
      const a = tabs.find((t) => t.getAttribute("href") === "#" + vis.target.id);
      if (a) setOn(a);
    }, { root: sc, rootMargin: "-30% 0px -60% 0px", threshold: [0, 0.1, 0.4, 1] });
    secs.forEach((s) => io.observe(s));
  }
  setOn(tabs[0]);
  el.querySelectorAll(".pc1-tabs a").forEach((a) => {
    a.addEventListener("click", (ev) => {
      ev.preventDefault();
      const id = a.getAttribute("href")?.slice(1);
      const t = el.querySelector("#" + id);
      setOn(a);
      lockUntil = Date.now() + 600;
      if (t && sc) {
        const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
        sc.scrollTo({ top: Math.max(0, t.offsetTop - tabH()), behavior: reduce ? "auto" : "smooth" });
      }
    });
  });
  el.querySelector("[data-exall]")?.addEventListener("click", (ev) => {
    const b = ev.currentTarget;
    const open = b.dataset.open === "1";
    el.querySelectorAll("[data-mod]").forEach((n) => n.classList.toggle("open", !open));
    b.dataset.open = open ? "0" : "1";
    b.textContent = open ? "Expand all" : "Collapse all";
  });
  el.querySelector("[data-ics]")?.addEventListener("click", () => {
    const ics = icsBlob(c);
    if (!ics) return;
    const blob = new Blob([ics], { type: "text/calendar" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (c.title || "course").replace(/\s+/g, "-") + ".ics";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
  el.querySelectorAll("[data-rel]").forEach((b) => {
    b.addEventListener("click", () => {
      const id = b.getAttribute("data-rel");
      const nx = (all || []).find((x) => x.id === id);
      if (nx) {
        el.classList.add("pc1-fade");
        setTimeout(() => { openModal(nx, role, all); el.querySelector("#pc1Scroll")?.scrollTo(0, 0); }, 160);
      }
    });
  });
}
function missingHtml() {
  return `<div class="pc1-sheet pc1-in" role="dialog" aria-modal="true" aria-labelledby="pc1Miss">
    <button type="button" class="pc1-x" data-close aria-label="Close">×</button>
    <div class="pc1-sheet-b" style="padding:40px 28px">
      <h2 id="pc1Miss">This course is not available</h2>
      <p class="pc1-muted">Stay on the list and pick another course.</p>
    </div>
  </div>`;
}
function openMissing() {
  const el = document.getElementById("pc1Modal");
  if (!el) return;
  el.innerHTML = missingHtml();
  el.hidden = false;
  document.body.classList.add("pc1-lock");
}
function cloneCardCover(id, dest) {
  if (!dest || !id) return;
  const src = document.querySelector('#pc1Grid [data-cover-id="' + CSS.escape(id) + '"]');
  if (!src) return;
  const img = src.querySelector("img");
  dest.innerHTML = src.outerHTML;
  const copy = dest.querySelector("[data-cover-id]");
  if (copy) {
    copy.classList.add("cc1-cover");
    copy.style.height = "200px";
    copy.style.position = "relative";
    if (img && img.src && !copy.querySelector("img")) {
      const n = img.cloneNode(true);
      n.style.cssText = "position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block";
      copy.appendChild(n);
    }
    copy.dataset.coverHydrated = copy.querySelector("img") ? "1" : "";
  }
}
let isClosing = false;
let openSlug = "";
let lastList = [];
let lastRole = "guest";
let closeBound = false;

function pathWithoutCourseParam() {
  const url = new URL(location.href);
  url.searchParams.delete("course");
  const q = url.searchParams.toString();
  return url.pathname + (q ? "?" + q : "") + url.hash;
}

export function closeModal() {
  isClosing = true;
  const el = document.getElementById("pc1Modal");
  if (el) { el.hidden = true; el.innerHTML = ""; }
  document.body.classList.remove("pc1-lock");
  openSlug = "";
  history.replaceState(null, "", pathWithoutCourseParam());
  setTimeout(() => { isClosing = false; }, 300);
}

function landingShareUrl(slug) {
  const u = new URL("./", location.href);
  return u.origin + u.pathname + "?course=" + encodeURIComponent(slug);
}
function copyWithFallback(url) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(url).then(() => true).catch(() => false);
  }
  return Promise.resolve(false);
}
function execCopy(url) {
  try {
    const ta = document.createElement("textarea");
    ta.value = url;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;left:-9999px;top:0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch { return false; }
}
function markCopied(btn) {
  const prev = btn.innerHTML;
  btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12l5 5L20 7" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg> Link copied`;
  setTimeout(() => { btn.innerHTML = prev; }, 2000);
}
function showManualLink(btn, url) {
  let box = btn.parentElement?.querySelector(".pc1-share-box");
  if (!box) {
    box = document.createElement("input");
    box.className = "pc1-share-box";
    box.setAttribute("readonly", "");
    btn.insertAdjacentElement("afterend", box);
  }
  box.value = url;
  box.hidden = false;
  box.select();
}
function onShareClick(ev) {
  const btn = ev.target.closest("[data-share]");
  if (!btn) return;
  ev.preventDefault();
  ev.stopPropagation();
  const slug = btn.getAttribute("data-share") || "";
  const title = document.getElementById("pc1DlgTitle")?.textContent || "GHz Academy";
  const url = landingShareUrl(slug);
  const finishCopy = () => {
    copyWithFallback(url).then((ok) => {
      if (ok || execCopy(url)) markCopied(btn);
      else showManualLink(btn, url);
    });
  };
  if (typeof navigator.share === "function") {
    const p = navigator.share({ title, text: "Check out this course at GHz Academy", url });
    if (p && typeof p.then === "function") {
      p.catch((err) => {
        if (err && err.name === "AbortError") return;
        finishCopy();
      });
    }
    return;
  }
  finishCopy();
}

function bindCloseOnce() {
  if (closeBound) return;
  closeBound = true;
  document.getElementById("pc1Modal")?.addEventListener("click", (ev) => {
    if (ev.target.closest("[data-share]")) { onShareClick(ev); return; }
    if (ev.target.id === "pc1Modal" || ev.target.closest("[data-close]")) closeModal();
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") closeModal();
  });
  window.addEventListener("popstate", () => {
    const want = new URLSearchParams(location.search).get("course");
    if (!want) {
      if (!isClosing) {
        const el = document.getElementById("pc1Modal");
        if (el && !el.hidden) closeModal();
      }
      return;
    }
    applyCourseParam(true);
  });
}

export function applyCourseParam(fromPop) {
  if (isClosing) return;
  const want = new URLSearchParams(location.search).get("course");
  if (!want) return;
  const el = document.getElementById("pc1Modal");
  const open = el && !el.hidden;
  if (open && openSlug === want) return;
  if (open) return;
  const c = findByParam(lastList, want);
  if (c) openModal(c, lastRole, lastList, true);
  else if (lastList.length) openMissing();
}

export function openModal(c, role, all, fromPop) {
  const el = document.getElementById("pc1Modal");
  if (!el || !c) return;
  lastList = all || lastList;
  lastRole = role || lastRole;
  bindCloseOnce();
  const slug = courseSlug(c);
  if (!el.hidden && openSlug === slug) return;
  el.innerHTML = modalHtml(c, role, all);
  el.hidden = false;
  document.body.classList.add("pc1-lock");
  bindModal(el, c, all, role);
  requestAnimationFrame(() => logSheetBlocks(el));
  el.querySelector("#pc1Scroll")?.scrollTo(0, 0);
  const slot = el.querySelector("[data-cover-slot]");
  cloneCardCover(c.id, slot);
  hydrateCovers(el);
  openSlug = slug;
  if (!fromPop) {
    const url = new URL(location.href);
    if (url.searchParams.get("course") !== slug) {
      url.searchParams.set("course", slug);
      history.pushState({ pc1: "open", slug }, "", url);
    }
  }
}
function logGhzReg(kind, extra, t0) {
  const ms = t0 != null ? Math.round(performance.now() - t0) : 0;
  try { console.log("[ghz-reg] " + kind, extra, ms); } catch {}
}

export async function bootPublicCourses() {
  if (!root) return;
  let role = "guest";
  let readyPaint = null;
  const t0 = performance.now();
  authKnown = false;
  authReady = false;
  authUser = null;
  regsReady = false;
  checkingTimedOut = false;
  const authFailSafe = setTimeout(() => {
    if (authReady) return;
    authReady = true;
    authKnown = true;
    authUser = null;
    role = "guest";
    regsReady = true;
    checkingTimedOut = true;
    logGhzReg("auth", null, t0);
    logGhzReg("cards", 0, t0);
    readyPaint?.();
  }, 3000);
  onAuthStateChanged(auth, async (u) => {
    clearTimeout(authFailSafe);
    authUser = u || null;
    authReady = true;
    authKnown = true;
    logGhzReg("auth", u || null, t0);
    regsByCourse = {};
    regsReady = false;
    checkingTimedOut = false;
    if (!u) {
      role = "guest";
      regsReady = true;
      logGhzReg("cards", Array.isArray(list) ? list.length : 0, t0);
      readyPaint?.();
      return;
    }
    role = "student";
    readyPaint?.();
    try {
      const snap = await withTimeout(getDoc(doc(db, "users", u.uid)), 4000);
      role = String(snap.exists() ? snap.data().role : "student").toLowerCase() || "student";
    } catch { role = "student"; }
    if (role !== "student") {
      regsReady = true;
      logGhzReg("cards", Array.isArray(list) ? list.length : 0, t0);
      readyPaint?.();
      return;
    }
    const checkOnce = async () => {
      const rs = await getDocs(query(collection(db, "registrations"), where("uid", "==", u.uid)));
      rs.docs.forEach((d) => { const r = { id: d.id, ...d.data() }; if (r.courseId) regsByCourse[r.courseId] = r; });
      try {
        const es = await getDocs(query(collection(db, "enrollments"), where("uid", "==", u.uid)));
        es.docs.forEach((d) => { const e = d.data() || {}; if (e.courseId && !regsByCourse[e.courseId]) regsByCourse[e.courseId] = { courseId: e.courseId, status: "enrolled" }; });
      } catch (_) {}
    };
    try {
      await withTimeout(checkOnce(), 4000);
      regsReady = true;
    } catch (_) {
      checkingTimedOut = true;
      regsReady = false;
      checkOnce().then(() => { regsReady = true; checkingTimedOut = false; readyPaint?.(); }).catch(() => {});
    }
    readyPaint?.();
    const modal = document.getElementById("pc1Modal");
    const titleEl = modal?.querySelector("#pc1DlgTitle");
    const openC = titleEl && list.find((x) => x.title === titleEl.textContent);
    logGhzReg("cards", Array.isArray(list) ? list.length : 0, t0);
  });

  const grid = document.getElementById("pc1Grid");
  if (grid) grid.innerHTML = `<div class="pc1-skel"></div><div class="pc1-skel"></div><div class="pc1-skel"></div>`;

  let list = [];
  const cached = readCache();
  const stale = cached && Date.now() - cached.at < CACHE_MS;
  if (cached?.list?.length) {
    list = cached.list;
    renderGrid(applyFilters(list, "", "All", "", "soon"), role);
  }

  const load = async () => {
    try {
      const fresh = await fetchCourses();
      list = fresh;
      try { console.log("[ghz-courses] loaded", Array.isArray(fresh) ? fresh.length : 0); } catch {}
      writeCache(fresh);
      paint();
    } catch (err) {
      try { console.log("[ghz-courses] error", err?.code, err?.message); } catch {}
      if (!list.length && grid) {
        grid.innerHTML = `<div class="pc1-err"><p>Could not load courses. Retry</p><code>${esc(err && err.message ? err.message : String(err))}</code>
          <button type="button" class="pc1-btn pri" id="pc1Retry">Retry</button></div>`;
        document.getElementById("pc1Retry")?.addEventListener("click", load);
      }
    }
  };

  function paint() {
    const q = document.getElementById("pc1Search")?.value || "";
    const level = document.querySelector(".pc1-chip.lv.on")?.dataset.v || "All";
    const status = document.querySelector(".pc1-chip.st.on")?.dataset.v || "";
    const sort = document.getElementById("pc1Sort")?.value || "soon";
    const shown = applyFilters(list, q, level, status, sort);
    const nEl = document.getElementById("pc1Count");
    if (nEl) nEl.textContent = shown.length + (shown.length === 1 ? " course" : " courses");
    lastList = list;
    lastRole = role;
    renderGrid(shown, role);
    bindTimePopovers(document);
    const modal = document.getElementById("pc1Modal");
    const titleEl = modal?.querySelector("#pc1DlgTitle");
    if (modal && !modal.hidden && titleEl) {
      const openC = list.find((x) => x.title === titleEl.textContent) || findByParam(list, new URLSearchParams(location.search).get("course"));
      if (openC) {
        const foot = modal.querySelector(".pc1-footacts");
        const pri = getCourseAction(openC, { ...userCtx(role), forDetails: true });
        const share = modal.querySelector("[data-share]");
        if (foot) {
          const shareHtml = share ? share.outerHTML : "";
          foot.innerHTML = shareHtml + ctaMarkup(pri);
        }
      }
    }
  }
  document.getElementById("pc1Search")?.addEventListener("input", paint);
  document.getElementById("pc1Sort")?.addEventListener("change", paint);
  document.querySelectorAll(".pc1-chip.lv").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll(".pc1-chip.lv").forEach((x) => x.classList.toggle("on", x === b));
    paint();
  }));
  document.querySelectorAll(".pc1-chip.st").forEach((b) => b.addEventListener("click", () => {
    const on = b.classList.contains("on");
    document.querySelectorAll(".pc1-chip.st").forEach((x) => x.classList.remove("on"));
    if (!on) b.classList.add("on");
    paint();
  }));
  document.getElementById("pc1Grid")?.addEventListener("click", (ev) => {
    if (ev.defaultPrevented || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey || ev.button) return;
    const viewA = ev.target?.closest?.("[data-view]");
    const card = ev.target?.closest?.(".v2-card");
    const id = viewA?.getAttribute("data-view") || card?.getAttribute("data-cid");
    if (!id) return;
    if (ev.target?.closest?.("a.v2-pri, a.btn, button")) return;
    ev.preventDefault();
    const c = list.find((x) => x.id === id);
    if (c) openModal(c, role, list);
  });
  lastList = list;
  lastRole = role;
  readyPaint = paint;
  paint();
  if (new URLSearchParams(location.search).get("course")) applyCourseParam(false);
  load();
}

bootPublicCourses();
