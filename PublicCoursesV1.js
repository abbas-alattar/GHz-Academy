import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { auth, db } from "./firebase-config.js?v=auth8";
import { formatCourseDate, startsEndsLine } from "./courseDates.js";
import { formatDuration, formatPrice, formatSchedule, parseCourseDays } from "./DeliveryDays.js";
import { courseCardHtml, coverHtml } from "./CourseCard.js";
import { statusLabel, statusChipKind, canRegisterForCourse } from "./courseStatusLabel.js";

const PUBLIC = ["Open", "Coming soon", "Closed"];
const CACHE_KEY = "ghz-pc1-courses-v5";
const CACHE_MS = 5 * 60 * 1000;
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

function readCache() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (!o || !Array.isArray(o.list)) return null;
    return o;
  } catch { return null; }
}

function writeCache(list) {
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), list })); } catch {}
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
  }).filter((c) => PUBLIC.includes(c.status));
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
function modalHtml(c, role, all) {
  const dur = formatDuration(c);
  const sch = formatSchedule(c);
  const href = registerHref(c.id, role);
  let cta;
  if (role === "trainer" || role === "admin") cta = `<span class="pc1-opensoon">Registration is for student accounts</span>`;
  else if (canRegisterForCourse(c)) cta = `<a class="pc1-btn pri pc1-footbtn" href="${esc(href)}" target="_blank" rel="noopener noreferrer">Register for this course</a>`;
  else cta = `<span class="pc1-opensoon">${statusLabel(c)}</span>`;
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
  return `<div class="pc1-sheet pc1-sheet-v3 pc1-in" role="dialog" aria-modal="true" aria-labelledby="pc1DlgTitle">
    <div class="pc1-scroll" id="pc1Scroll">
    <div class="pc1-hero ${edge(c.status)}">
      ${coverHtml(c)}
      <div class="pc1-herowave" aria-hidden="true"></div>
      <div class="pc1-herotop">${badge(c)}${c.level ? `<span class="pc1-lev">${esc(c.level)}</span>` : ""}${countdownHtml(c)}</div>
      <h2 id="pc1DlgTitle">${esc(c.title)}</h2>
      <p class="pc1-herosub">${esc(short)}</p>
      <div class="pc1-glass">${glass.map((g) => `<span>${g}</span>`).join("")}</div>
      <button type="button" class="pc1-x" data-close aria-label="Close">×</button>
    </div>
    <div class="pc1-tabs" role="tablist">
      <a href="#pc1-ov">Overview</a><a href="#pc1-ol">Outline</a><a href="#pc1-pr">Prerequisites</a><a href="#pc1-tr">Trainers</a>
      <i class="pc1-tabind"></i>
    </div>
    <div class="pc1-sheet-b" id="pc1Body">
      <section id="pc1-ov" class="pc1-rise">
        ${full && full !== short ? `<p class="pc1-full">${esc(full)}</p>` : ""}
        <div class="pc1-glance">${glance.map(([l,v]) => `<div><span>${l}</span><strong>${v}</strong></div>`).join("")}</div>
        ${(start || end) ? `<p class="pc1-se">${start ? `Starts ${esc(start)}` : ""}${start && end ? " · " : ""}${end ? `Ends ${esc(end)}` : ""}</p>` : ""}
        <div class="pc1-schedbox">
          ${weekDots(codes)}
          ${sch.timeLine ? `<p class="pc1-timel">${esc(sch.timeLine)} <em>Beirut time</em></p>` : ""}
          ${ics ? `<button type="button" class="pc1-ics" data-ics>Add to calendar</button>` : ""}
        </div>
        ${seatsLine(c)}
        <div class="pc1-gets">
          <article><strong>Live sessions with expert trainers</strong></article>
          <article><strong>Graded homework and quizzes</strong></article>
          <article><strong>Verified certificate on completion</strong></article>
        </div>
      </section>
      <section id="pc1-ol" class="pc1-rise">
        <h3>${hico("list","blu")}Outline · ${mods.length} module${mods.length === 1 ? "" : "s"}${mods.length ? `<button type="button" class="pc1-exall" data-exall>Expand all</button>` : ""}</h3>
        ${outlineHtml}
      </section>
      <section id="pc1-pr" class="pc1-rise">
        <h3>${hico("shield","grn")}Prerequisites</h3>
        ${prereqs.length ? `<ul class="pc1-check">${prereqs.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : `<p class="pc1-prempty"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="#94a3b8" stroke-width="1.8"/><path d="M12 8v.01M12 11v5" stroke="#94a3b8" stroke-width="1.8" stroke-linecap="round"/></svg>No prerequisites listed</p>`}
      </section>
      <section id="pc1-tr" class="pc1-rise">
        <h3>${hico("users","vio")}Trainers</h3>
        ${trainerCards(c)}
      </section>
      ${relatedHtml(c, all)}
    </div>
    </div>
    <div class="pc1-sticky">
      <div class="pc1-priceblock"><strong>${esc(priceLine(c))}</strong><span>per course</span></div>
      <div class="pc1-footacts">
        <button type="button" class="pc1-share" data-share="${esc(c.id)}" aria-label="Copy link">Share</button>
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

function renderGrid(list, role) {
  const grid = document.getElementById("pc1Grid");
  if (!grid) return;
  if (!list.length) {
    grid.innerHTML = `<div class="pc1-empty"><p>No courses are open right now — check back soon</p>
      <p><a class="pc1-btn pri" href="./login.html?tab=signup" target="_blank" rel="noopener noreferrer" style="display:inline-flex">Register</a></p></div>`;
    return;
  }
  grid.innerHTML = list.map((c) => cardHtml(c, role)).join("");
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
  el.querySelector("[data-share]")?.addEventListener("click", async () => {
    const link = new URL("./courses.html?course=" + encodeURIComponent(c.id), location.href).href;
    try { await navigator.clipboard.writeText(link); } catch {}
    const t = document.createElement("div");
    t.className = "pc1-toast"; t.textContent = "Link copied";
    el.appendChild(t);
    setTimeout(() => t.remove(), 1800);
  });
}
function missingHtml() {
  return `<div class="pc1-sheet pc1-in" role="dialog" aria-modal="true" aria-labelledby="pc1Miss">
    <button type="button" class="pc1-x" data-close aria-label="Close">×</button>
    <div class="pc1-sheet-b" style="padding:40px 28px">
      <h2 id="pc1Miss">This course is not available right now</h2>
      <p class="pc1-muted">It may be completed, unpublished, or the link is out of date.</p>
      <p><a class="pc1-btn pri" href="./courses.html">Browse all courses</a></p>
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
function openModal(c, role, all) {
  const el = document.getElementById("pc1Modal");
  if (!el) return;
  el.innerHTML = modalHtml(c, role, all);
  el.hidden = false;
  document.body.classList.add("pc1-lock");
  bindModal(el, c, all, role);
  el.querySelector("#pc1Scroll")?.scrollTo(0, 0);
  const url = new URL(location.href);
  url.searchParams.set("course", c.id);
  history.replaceState(null, "", url);
}

function closeModal() {
  const el = document.getElementById("pc1Modal");
  if (el) { el.hidden = true; el.innerHTML = ""; }
  document.body.classList.remove("pc1-lock");
  const url = new URL(location.href);
  url.searchParams.delete("course");
  history.replaceState(null, "", url);
}

export async function bootPublicCourses() {
  if (!root) return;
  let role = "";
  let readyPaint = null;
  onAuthStateChanged(auth, async (u) => {
    role = "";
    if (u) {
      try {
        const snap = await getDoc(doc(db, "users", u.uid));
        role = String(snap.exists() ? snap.data().role : "student").toLowerCase() || "student";
      } catch { role = "student"; }
    }
    readyPaint?.();
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
      writeCache(fresh);
      paint();
    } catch (err) {
      if (!list.length && grid) {
        grid.innerHTML = `<div class="pc1-err"><p>We couldn’t load courses just now.</p><code>${esc(err && err.message ? err.message : String(err))}</code>
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
    renderGrid(shown, role);
    applyCourseParam();
  }
  function applyCourseParam() {
    const want = new URLSearchParams(location.search).get("course");
    const modal = document.getElementById("pc1Modal");
    if (!want) {
      if (modal && !modal.hidden) closeModal();
      return;
    }
    const c = list.find((x) => x.id === want);
    const showing = modal && !modal.hidden && modal.querySelector("#pc1DlgTitle");
    if (c) {
      if (!showing) openModal(c, role, list);
    } else if (list.length) openMissing();
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
    const id = ev.target?.closest("[data-view]")?.getAttribute("data-view");
    if (!id) return;
    const c = list.find((x) => x.id === id);
    if (c) openModal(c, role, list);
  });
  document.getElementById("pc1Modal")?.addEventListener("click", (ev) => {
    if (ev.target.id === "pc1Modal" || ev.target.closest("[data-close]")) closeModal();
  });
  document.addEventListener("keydown", (ev) => { if (ev.key === "Escape") closeModal(); });
  window.addEventListener("popstate", applyCourseParam);
  readyPaint = paint;

  if (!stale) await load();
  else load();
}

bootPublicCourses();
