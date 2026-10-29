import { deliveryDaysHtml } from "./DeliveryDays.js";
import { startsEndsLine } from "./courseDates.js";
import { coverHtml } from "./CourseCard.js";
import { courseStatusLabel } from "./courseStatusLabel.js";

const esc = (s) => String(s ?? "").replace(/&/g,"&"+"amp;").replace(/</g,"&"+"lt;").replace(/"/g,"&"+"quot;");

const state = { search: "", status: "all" };
const STATUSES = ["Open", "Coming soon", "Closed"];

function visibleOf(catalog) {
  return (Array.isArray(catalog) ? catalog : []).filter((c) => {
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

function cardsHtml(rows, opts) {
  return rows.map((c) => {
    const title = c?.title ?? "";
    const desc = c?.short ?? c?.description ?? "";
    const lv = String(c?.level ?? "");
    return `<article class="v2-card">
        ${coverHtml(c)}
        <div class="v2-body">
          ${opts.badge?.(c?.status ?? "") || ""}
          <h3>${esc(title)}</h3>
          <p class="v2-desc">${esc(desc)}</p>
          <p class="v2-meta">${esc(c?.duration ?? "Duration TBC")} · ${esc(c?.level ?? "Level TBC")}<br>${esc(startsEndsLine(c) || "Start date TBC")}</p>
          ${deliveryDaysHtml(c, { emptyMode: "announce" })}
          <p class="v2-price">${esc(opts.money?.({ ...c, price: c?.price ?? null }) || "")}</p>
        </div>
        <div class="v2-foot">${opts.cardActions?.(c) || ""}</div>
      </article>`;
  }).join("");
}

export function renderBrowseCoursesV2(opts) {
  const host = opts?.host;
  if (!host) return false;
  try {
    const visible = visibleOf(opts.catalog);
    const counts = { all: visible.length };
    STATUSES.forEach((s) => { counts[s] = visible.filter((c) => (c?.status ?? "") === s).length; });
    const status = state.status || "all";
    const chips = ["all", ...STATUSES].map((s) =>
      `<button type="button" class="v2-chip${status===s?" on":""}" data-v2="status" data-val="${esc(s)}">${s === "all" ? "All" : courseStatusLabel(s)} ${counts[s] || 0}</button>`
    ).join("");

    if (!host.querySelector(".v2-wrap")) {
      host.innerHTML = `<div class="v2-wrap">
      <h2>Explore our courses</h2>
      <p class="v2-sub">Learn wireless communications from LTE to 6G with industry experts</p>
      <div class="v2-search"><input type="search" placeholder="Search courses" autocomplete="off" data-v2="search" /></div>
      <div class="v2-bar" data-v2-bar></div>
      <div data-v2-results></div>
    </div>`;
    }

    const searchEl = host.querySelector("[data-v2=search]");
    if (searchEl && searchEl.value !== state.search) searchEl.value = state.search;

    const bar = host.querySelector("[data-v2-bar]");
    if (bar) bar.innerHTML = chips;

    const paintResults = () => {
      const box = host.querySelector("[data-v2-results]");
      if (!box) return;
      const rows = filtered(visible);
      box.innerHTML = rows.length
        ? `<div class="v2-grid">${cardsHtml(rows, opts)}</div>`
        : `<div class="v2-empty"><p>No courses match your search</p><button class="btn btn-sm" type="button" data-v2="clear">Clear filters</button></div>`;
      try { opts.bind?.(); } catch {}
    };
    paintResults();

    host.onclick = (e) => {
      const t = e.target?.closest?.("[data-v2]");
      if (!t) return;
      const kind = t.getAttribute("data-v2");
      if (kind === "status") {
        state.status = t.getAttribute("data-val") || "all";
        renderBrowseCoursesV2(opts);
      }
      if (kind === "clear") {
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
    opts.onReady?.();
    return true;
  } catch (e) {
    host.innerHTML = `<div class="v2-fail"><p>Could not load courses (${esc(e?.code || e?.message || e)})</p><button class="btn btn-sm" type="button" data-classic>Use classic view</button></div>`;
    host.onclick = (ev) => { if (ev.target?.getAttribute?.("data-classic") != null) opts.onClassic?.(); };
    return false;
  }
}
