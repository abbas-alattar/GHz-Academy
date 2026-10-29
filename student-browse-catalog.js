import { startsEndsLine } from "./courseDates.js";
import { courseStatusLabel } from "./courseStatusLabel.js";

const esc = (s) => String(s ?? "").replace(/&/g,"&"+"amp;").replace(/</g,"&"+"lt;").replace(/"/g,"&"+"quot;");

const statusOrder = ["Open", "Coming soon", "Closed"];
const chipLabel = { all: "All", Open: courseStatusLabel("Open"), "Coming soon": courseStatusLabel("Coming soon"), Closed: courseStatusLabel("Closed") };

const filters = { search: "", status: "all", level: "all" };

function levelOf(c) {
  const l = String(c?.level ?? "").trim();
  if (/advanced/i.test(l)) return "Advanced";
  if (/inter/i.test(l)) return "Intermediate";
  if (/found/i.test(l)) return "Foundation";
  return l || "other";
}

function visibleCatalog(list) {
  return (Array.isArray(list) ? list : []).filter((c) => {
    const st = c?.status ?? "";
    return st === "Open" || st === "Coming soon" || st === "Closed";
  });
}

function filteredRows(all) {
  const q = String(filters.search ?? "").trim().toLowerCase();
  const st = filters.status === "all" || !filters.status ? "all" : filters.status;
  const lv = filters.level === "all" || !filters.level ? "all" : filters.level;
  return all.filter((c) => {
    const title = c?.title ?? "";
    const desc = c?.short ?? c?.description ?? "";
    if (st !== "all" && (c?.status ?? "") !== st) return false;
    if (lv !== "all" && levelOf(c) !== lv) return false;
    if (q && !title.toLowerCase().includes(q) && !desc.toLowerCase().includes(q)) return false;
    return true;
  }).slice().sort((a, b) => String(a?.title ?? "").localeCompare(String(b?.title ?? "")));
}

function cardHtml(c, cardActions, money, badge) {
  const title = c?.title ?? "";
  const desc = c?.short ?? c?.description ?? "";
  const level = c?.level ?? "";
  const lvName = levelOf(c);
  const cover = ["Foundation","Intermediate","Advanced"].includes(lvName) ? lvName : "other";
  return `<article class="cat-card">
        <div class="cat-cover ${cover}">${badge(c?.status ?? "")}</div>
        <div class="cat-body">
          <h3>${esc(title)}</h3>
          <p class="cat-desc">${esc(desc)}</p>
          <div class="cat-meta">
            <div>${esc(c?.duration ?? "Duration TBC")}</div>
            <div>${esc(c?.sessionsPerWeek ? c.sessionsPerWeek + " sessions / week" : "Sessions TBC")}</div>
            <div>${esc(level || "Level TBC")}</div>
            <div>${esc(startsEndsLine(c) || "Start date TBC")}</div>
            ${c?.trainerName || c?.instructor ? `<div>${esc(c.trainerName || c.instructor)}</div>` : ""}
          </div>
          <p class="cat-price">${esc(money({ ...c, price: c?.price ?? null }))}</p>
        </div>
        <div class="cat-foot">${cardActions(c)}</div>
      </article>`;
}

function resultsHtml(rows, cardActions, money, badge) {
  if (!rows.length) {
    return `<div class="cat-empty"><div class="big">📡</div><p>No courses match your search</p><button class="btn btn-sm" type="button" id="catClear">Clear filters</button></div>`;
  }
  return statusOrder.map((s) => {
    const list = rows.filter((c) => (c?.status ?? "") === s);
    if (!list.length) return "";
    return `<section class="cat-sec"><h3>${esc(courseStatusLabel(s))}</h3><div class="cat-grid">${list.map((c) => cardHtml(c, cardActions, money, badge)).join("")}</div></section>`;
  }).join("");
}

export function paintBrowseCatalog(opts) {
  const { host, catalog, cardActions, money, badge, bind } = opts;
  if (!host) return;
  try {
    const all = visibleCatalog(catalog);
    const st = filters.status === "all" || !filters.status ? "all" : filters.status;
    const lv = filters.level === "all" || !filters.level ? "all" : filters.level;
    const counts = { all: all.length };
    statusOrder.forEach((s) => { counts[s] = all.filter((c) => (c?.status ?? "") === s).length; });
    const levels = [...new Set(all.map(levelOf).filter((x) => x && x !== "other"))];
    const rows = filteredRows(all);
    const chips = ["all", ...statusOrder].map((s) =>
      `<button type="button" class="cat-chip${st===s?" on":""}" data-st="${esc(s)}">${chipLabel[s] || s}<span>${counts[s] || 0}</span></button>`
    ).join("");

    const ensureShell = () => {
      if (host.querySelector(".cat-wrap")) return;
      host.innerHTML = `
      <div class="cat-wrap">
        <div class="cat-head">
          <h2>Explore our courses</h2>
          <p class="cat-sub">Learn wireless communications from LTE to 6G with industry experts</p>
          <div class="cat-search"><span class="ico">⌕</span><input id="catQ" type="search" placeholder="Search courses" autocomplete="off" /></div>
        </div>
        <div class="cat-bar" id="catBar"></div>
        <div id="catResults"></div>
      </div>`;
      const nq = host.querySelector("#catQ");
      if (nq) {
        nq.addEventListener("input", () => {
          filters.search = nq.value ?? "";
          paintResults();
        });
      }
    };

    const paintBar = () => {
      const bar = host.querySelector("#catBar");
      if (!bar) return;
      bar.innerHTML = `${chips}
          <select id="catLevel"><option value="all">All levels</option>${levels.map((l)=>`<option value="${esc(l)}" ${lv===l?"selected":""}>${esc(l)}</option>`).join("")}</select>`;
      bar.querySelectorAll("[data-st]").forEach((b) => {
        b.onclick = () => { filters.status = b.dataset.st || "all"; paintBrowseCatalog(opts); };
      });
      const nlv = bar.querySelector("#catLevel");
      if (nlv) nlv.onchange = () => { filters.level = nlv.value ?? "all"; paintBrowseCatalog(opts); };
    };

    const paintResults = () => {
      const box = host.querySelector("#catResults");
      if (!box) return;
      box.innerHTML = resultsHtml(filteredRows(all), cardActions, money, badge);
      box.querySelector("#catClear")?.addEventListener("click", () => {
        filters.search = "";
        filters.status = "all";
        filters.level = "all";
        const nq = host.querySelector("#catQ");
        if (nq) nq.value = "";
        paintBrowseCatalog(opts);
      });
      try { bind?.(); } catch (e) {
        box.insertAdjacentHTML("beforeend", `<p class="banner">${esc(e?.code || e?.message || e)}</p>`);
      }
    };

    ensureShell();
    const nq = host.querySelector("#catQ");
    if (nq && nq.value !== filters.search) nq.value = filters.search;
    paintBar();
    paintResults();
  } catch (e) {
    host.innerHTML = `<p class="banner">Could not load courses (${esc(e?.code || e?.message || e)})</p>`;
  }
}
