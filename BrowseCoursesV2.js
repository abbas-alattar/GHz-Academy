import { formatDuration, formatSchedule } from "./DeliveryDays.js";
import { formatBeirutTimeLine, timeInfoButton, bindTimePopovers } from "./courseTimeFacts.js";
import { formatCourseDate } from "./courseDates.js";
import { coverMarkup, hydrateCovers } from "./coverFor.js?v=stu11";
import { courseStatusLabel, statusChipKind, canRegisterForCourse } from "./courseStatusLabel.js";
import { icon } from "./ghz-icons.js";

const asArray = (x) => Array.isArray(x) ? x : [];
const esc = (s) => String(s ?? "").replace(/&/g,"&"+"amp;").replace(/</g,"&"+"lt;").replace(/"/g,"&"+"quot;");

const state = { search: "", status: "all" };
const STATUSES = ["Open", "Coming soon", "Closed"];

function visibleOf(catalog) {
  return asArray(catalog).filter((c) => {
    const st = c?.status ?? "";
    return st === "Open" || st === "Coming soon" || st === "Closed";
  });
}

function filtered(visible) {
  const q = String(state.search ?? "").trim().toLowerCase();
  const status = state.status || "all";
  return visible.filter((c) => {
    const title = c?.title ?? "";
    const desc = c?.short ?? c?.description ?? "";
    if (status !== "all" && (c?.status ?? "") !== status) return false;
    if (q && !title.toLowerCase().includes(q) && !desc.toLowerCase().includes(q)) return false;
    return true;
  }).slice().sort((a, b) => String(a?.title ?? "").localeCompare(String(b?.title ?? "")));
}

function startLine(c) {
  return formatCourseDate(c?.startDate) || "To be announced";
}
function timeLine(c) {
  const sch = formatSchedule(c);
  const days = (sch.daysLine || "").replace(/ \u00b7 /g, ", ");
  const time = formatBeirutTimeLine(sch.timeLine || c?.sessionTime) || (sch.timeLine || "").replace(/\s*[–-]\s*/g, "–");
  if (!days && !time) return "To be announced";
  return days + (time ? " · " + time : "");
}
function cardsHtml(rows, opts) {
  return rows.map((c) => {
    try {
      const title = c?.title ?? "";
      const desc = c?.short ?? c?.description ?? "";
      const lv = String(c?.level || "").trim() || "Level TBC";
      const dur = formatDuration(c) || String(c?.duration || "").trim() || "Duration TBC";
      const kind = statusChipKind(c);
      const lab = courseStatusLabel(c);
      const price = opts.money?.({ ...c, price: c?.price ?? null }) || "Price on request";
      const cover = coverMarkup(c, "cc1-cover");
      let acts = "";
      try { acts = String(opts.cardActions?.(c) || ""); } catch {}
      const chip = (acts.match(/<span class="v2-enrolled"[^>]*>[\s\S]*?<\/span>/) || [""])[0];
      const btns = acts.replace(/<span class="v2-enrolled"[^>]*>[\s\S]*?<\/span>/, "");
      const badges = (lab === "On going · Registration closed" || kind === "closed")
        ? `<span class="v2-stchip ongoing"><i class="v2-dot green"></i>On going</span><span class="v2-stchip closed"><i class="v2-dot amber"></i>Closed</span>`
        : `<span class="v2-stchip ${esc(kind)}"><i class="v2-dot ${kind === "sched-open" ? "blue" : (kind === "ongoing" ? "green" : "amber")}"></i>${esc(lab.indexOf("Scheduled") === 0 ? "Scheduled" : (lab.indexOf("On going") === 0 ? "On going" : lab))}</span>`;
      let clock = "To be announced";
      try { clock = timeLine(c); } catch { clock = "To be announced"; }
      const clockMain = String(clock).replace(/ Beirut time$/i, "");
      return `<article class="v2-card" data-cid="${esc(c.id)}">
        <div class="v2-coverwrap">${cover}<div class="v2-badges">${badges}</div>${chip}</div>
        <div class="v2-body">
          <h3>${esc(title)}</h3>
          <p class="v2-desc">${esc(desc || "\u00a0")}</p>
          <div class="v2-facts">
            <p class="v2-fact">${icon("level")}<span>${esc(lv)}</span></p>
            <p class="v2-fact">${icon("calendar")}<span>${esc(startLine(c))}</span></p>
            <p class="v2-fact ghz-tz-wrap">${icon("clock")}<span class="ghz-tz-stack"><span class="ghz-tz-main">${esc(clockMain)}</span><span class="ghz-tz-sub">Beirut time</span></span>${timeInfoButton((() => { try { return formatSchedule(c).timeLine || c.sessionTime; } catch { return ""; } })())}</p>
          </div>
        </div>
        <div class="v2-foot"><span class="v2-price">${esc(price)}</span><div class="v2-acts">${btns}</div></div>
      </article>`;
    } catch (err) {
      try { console.warn("[ghz-courses] card", c?.id, err?.message || err); } catch {}
      return `<article class="v2-card" data-cid="${esc(c?.id || "")}"><div class="v2-body"><h3>${esc(c?.title || "Course")}</h3><p class="v2-desc">Details to be announced</p></div></article>`;
    }
  }).join("");
}

export function renderBrowseCoursesV2(opts) {
  const host = opts?.host;
  if (!host) return false;
  const phone = typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;
  const t0 = phone ? performance.now() : 0;
  if (phone) {
    try { console.log("[ghz-perf] page browse start"); } catch {}
  }
  try {
    const visible = visibleOf(opts.catalog);
    if (phone) {
      try { console.log("[ghz-courses-phone] loaded", visible.length, Math.round(performance.now() - t0) + "ms"); } catch {}
    }
    const confirmed = opts.catalogConfirmed === true;
    const counts = { all: visible.length };
    STATUSES.forEach((s) => { counts[s] = visible.filter((c) => (c?.status ?? "") === s).length; });
    const status = state.status || "all";
    const chips = ["all", ...STATUSES].map((s) =>
      `<button type="button" class="v2-chip${status===s?" on":""}" data-v2="status" data-val="${esc(s)}">${s === "all" ? "All" : (s === "Closed" ? "Registration closed" : courseStatusLabel(s))}${confirmed || visible.length ? " " + (counts[s] || 0) : ""}</button>`
    ).join("");

    if (phone || !host.querySelector(".v2-wrap")) {
      host.innerHTML = opts.bare
        ? `<div class="v2-wrap v2-bare"><div data-v2-results></div></div>`
        : (phone
        ? `<div class="v2-wrap v2-phone">
      <div class="v2-search"><input type="search" placeholder="Search courses" autocomplete="off" data-v2="search" /></div>
      <div class="v2-bar" data-v2-bar></div>
      <div data-v2-results></div>
    </div>`
        : `<div class="v2-wrap">
      <h2>Explore our courses</h2>
      <p class="v2-sub">Learn wireless communications from LTE to 6G with industry experts</p>
      <div class="v2-search"><input type="search" placeholder="Search courses" autocomplete="off" data-v2="search" /></div>
      <div class="v2-bar" data-v2-bar></div>
      <div data-v2-results></div>
    </div>`);
    }

    const searchEl = host.querySelector("[data-v2=search]");
    if (searchEl && searchEl.value !== state.search) searchEl.value = state.search;

    const bar = host.querySelector("[data-v2-bar]");
    if (bar) bar.innerHTML = chips;

    const paintResults = () => {
      const box = host.querySelector("[data-v2-results]");
      if (!box) return;
      const rows = filtered(visible);
      const confirmed = opts.catalogConfirmed === true;
      if (!visible.length && !confirmed) {
        box.innerHTML = `<div class="v2-grid"><div class="v2-skel"></div><div class="v2-skel"></div></div>`;
        if (phone) { try { console.log("[ghz-perf] page browse skeleton", Math.round(performance.now() - t0) + "ms"); } catch {} }
      } else if (!visible.length && confirmed) {
        box.innerHTML = `<div class="v2-empty"><p>No courses available yet</p></div>`;
      } else {
      box.innerHTML = rows.length
        ? `<div class="v2-grid">${cardsHtml(rows, opts)}</div>`
        : `<div class="v2-empty"><p>No courses match your search</p><button class="btn btn-sm" type="button" data-v2="clear">Clear filters</button></div>`;
      }
      if (phone) {
        try { console.log("[ghz-courses-phone] first card", Math.round(performance.now() - t0) + "ms", rows.length); } catch {}
      }
      try { opts.bind?.(); } catch {}
      hydrateCovers(box, { thumb: true, eager: 3 });
      if (phone && rows.length) {
        try { window.__ghzPageMark && null; console.log("[ghz-perf] page browse first-card", Math.round(performance.now() - t0) + "ms"); } catch {}
      }
    };
    paintResults();
    hydrateCovers(host, { thumb: true, eager: 3 });

    host.onclick = (e) => {
      const t = e.target?.closest?.("[data-v2]");
      if (!t) return;
      const kind = t.getAttribute("data-v2");
      if (kind === "status") {
        state.status = t.getAttribute("data-val") || "all";
        renderBrowseCoursesV2(opts);
      }
      if (kind === "clear" || kind === "retry") {
        state.search = "";
        state.status = "all";
        if (searchEl) searchEl.value = "";
        renderBrowseCoursesV2(opts);
      }
    };
    if (searchEl && searchEl.dataset.bound !== "1") {
      searchEl.dataset.bound = "1";
      searchEl.addEventListener("input", () => {
        state.search = searchEl.value ?? "";
        paintResults();
      });
    }
    bindTimePopovers(host);
    opts.onReady?.();
    return true;
  } catch (e) {
    if (phone) {
      try { console.log("[ghz-courses-phone] error", e?.code || e?.message || e); } catch {}
      host.innerHTML = `<div class="v2-fail"><p>Could not load courses</p><button class="btn btn-sm" type="button" data-v2="retry">Retry</button></div>`;
      host.onclick = () => renderBrowseCoursesV2(opts);
      return false;
    }
    host.innerHTML = `<div class="v2-fail"><p>Could not load courses (${esc(e?.code || e?.message || e)})</p><button class="btn btn-sm" type="button" data-classic>Use classic view</button></div>`;
    host.onclick = (ev) => { if (ev.target?.getAttribute?.("data-classic") != null) opts.onClassic?.(); };
    return false;
  }
}
