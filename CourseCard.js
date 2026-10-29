import { deliveryDaysHtml, formatDuration, formatPrice } from "./DeliveryDays.js";
import { startsEndsLine } from "./courseDates.js";
import { statusLabel, statusChipKind, canRegisterForCourse } from "./courseStatusLabel.js";

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (ch) => {
    if (ch === "&") return "\u0026amp;";
    if (ch === "<") return "\u0026lt;";
    if (ch === ">") return "\u0026gt;";
    if (ch === '"') return "\u0026quot;";
    return "\u0026#39;";
  });
}

function theme(title) {
  const t = String(title || "").toLowerCase();
  if (/\b(5g|nr|core)\b/.test(t)) return "5g";
  if (/antenna/.test(t)) return "antenna";
  if (/\b(rf|spectrum)\b/.test(t)) return "rf";
  if (/microwave|\blink\b/.test(t)) return "microwave";
  if (/\b(lte|4g)\b/.test(t)) return "lte";
  if (/\b6g\b/.test(t)) return "6g";
  return "tower";
}

function artSvg(kind) {
  const common = `xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450" preserveAspectRatio="xMidYMid slice"`;
  const bg = `<rect width="800" height="450" fill="#071a33"/><rect width="800" height="450" fill="url(#g)" opacity=".9"/>
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b2748"/><stop offset="1" stop-color="#123a68"/></linearGradient></defs>`;
  const cyan = "#22d3ee";
  const blue = "#38bdf8";
  if (kind === "5g") {
    return `<svg ${common}>${bg}
      <g fill="none" stroke="${cyan}" stroke-width="4" stroke-linecap="round">
        <path d="M140 390 L140 210"/><path d="M128 210h24"/><circle cx="140" cy="188" r="18" stroke="${blue}"/>
        <path d="M400 400 L400 160"/><path d="M382 160h36"/><circle cx="400" cy="132" r="22"/>
        <path d="M660 390 L660 230"/><path d="M646 230h28"/><circle cx="660" cy="208" r="16"/>
        <path d="M158 200 L382 150" stroke="${blue}" stroke-width="2"/>
        <path d="M418 145 L644 214" stroke="${blue}" stroke-width="2"/>
        <circle cx="270" cy="172" r="6" fill="${cyan}" stroke="none"/>
        <circle cx="530" cy="176" r="6" fill="${cyan}" stroke="none"/>
      </g></svg>`;
  }
  if (kind === "antenna") {
    return `<svg ${common}>${bg}
      <g fill="none" stroke="${cyan}" stroke-width="4" stroke-linecap="round">
        <path d="M400 400 V210"/><path d="M360 210 h80"/><path d="M400 210 L330 90"/><path d="M400 210 L470 90"/>
        <path d="M300 130 Q400 40 500 130" stroke="${blue}" stroke-width="3"/>
        <path d="M270 160 Q400 50 530 160" stroke="${blue}" stroke-width="2" opacity=".7"/>
      </g></svg>`;
  }
  if (kind === "rf") {
    return `<svg ${common}>${bg}
      <g fill="none" stroke="${cyan}" stroke-linecap="round">
        <path d="M60 230 C120 120, 180 340, 240 230 S360 120, 420 230 S540 340, 600 230 S720 120, 760 230" stroke-width="5"/>
        <g fill="${blue}" stroke="none">
          <rect x="120" y="300" width="28" height="80" rx="4"/><rect x="170" y="260" width="28" height="120" rx="4"/>
          <rect x="220" y="220" width="28" height="160" rx="4"/><rect x="270" y="280" width="28" height="100" rx="4"/>
          <rect x="500" y="250" width="28" height="130" rx="4"/><rect x="550" y="210" width="28" height="170" rx="4"/>
          <rect x="600" y="290" width="28" height="90" rx="4"/>
        </g>
      </g></svg>`;
  }
  if (kind === "microwave") {
    return `<svg ${common}>${bg}
      <g fill="none" stroke="${cyan}" stroke-width="4" stroke-linecap="round">
        <ellipse cx="180" cy="230" rx="70" ry="90" transform="rotate(-18 180 230)"/>
        <ellipse cx="620" cy="230" rx="70" ry="90" transform="rotate(18 620 230)"/>
        <path d="M250 230 L550 230" stroke="${blue}" stroke-dasharray="10 8"/>
        <path d="M180 320 V390"/><path d="M620 320 V390"/>
      </g></svg>`;
  }
  if (kind === "lte" || kind === "6g") {
    return `<svg ${common}>${bg}
      <g fill="none" stroke="${cyan}" stroke-width="4" stroke-linecap="round">
        <path d="M400 400 V140"/><path d="M370 140 h60"/><rect x="372" y="88" width="56" height="52" rx="6" stroke="${blue}"/>
        <path d="M430 110 Q520 90 560 50" stroke="${blue}"/><path d="M430 130 Q540 120 600 90" stroke="${blue}"/>
        <path d="M370 110 Q280 90 240 50" stroke="${blue}"/><path d="M370 130 Q260 120 200 90" stroke="${blue}"/>
      </g></svg>`;
  }
  return `<svg ${common}>${bg}
    <g fill="none" stroke="${cyan}" stroke-width="4" stroke-linecap="round">
      <path d="M400 410 V120"/><path d="M372 120 h56"/><path d="M388 70 h24 v50"/>
      <path d="M424 100 Q520 70 560 30" stroke="${blue}"/><path d="M424 130 Q540 110 600 70" stroke="${blue}"/>
      <path d="M376 100 Q280 70 240 30" stroke="${blue}"/><path d="M376 130 Q260 110 200 70" stroke="${blue}"/>
    </g></svg>`;
}

export function coverHtml(c) {
  const cover = String(c.coverImage || c.cover || "").trim();
  const title = c.title || "Course";
  if (cover.startsWith("data:image") || /^https?:\/\//.test(cover) || cover.startsWith("./")) {
    return `<div class="cc1-cover"><img src="${esc(cover)}" alt="${esc(title)}" /></div>`;
  }
  const kind = theme(title);
  const tag = String(title).trim().split(/\s+/)[0] || "";
  return `<div class="cc1-cover cc1-art" data-kind="${esc(kind)}">${artSvg(kind)}<span class="cc1-tag">${esc(tag)}</span></div>`;
}

function priceLine(c) {
  return formatPrice(c) || "";
}

function badge(c) {
  const lab = statusLabel(c);
  const k = statusChipKind(c);
  return `<span class="cc1-badge ${k}">${lab}</span>`;
}

function rememberCourse(id) {
  try { if (id) sessionStorage.setItem("ghz-reg-course", id); } catch {}
}

export function registerHref(id, role) {
  rememberCourse(id);
  if (role === "student") return "./student.html#register/" + encodeURIComponent(id);
  return "./login.html?tab=signup&course=" + encodeURIComponent(id) + "&next=register";
}

export function courseCardHtml(c, opts = {}) {
  const role = opts.role || "";
  const viewMode = opts.viewMode || "link";
  const st = c.status;
  const dur = formatDuration(c);
  const price = priceLine(c);
  const dates = startsEndsLine(c);
  const days = deliveryDaysHtml(c, { emptyMode: "hide" });
  const chips = [dur, c.level, price].filter(Boolean);
  let primary = "";
  if (canRegisterForCourse(c) && role !== "trainer" && role !== "admin") {
    primary = `<a class="cc1-btn pri" href="${esc(registerHref(c.id, role))}" target="_blank" rel="noopener noreferrer">Register</a>`;
  }
  const view = viewMode === "button"
    ? `<button type="button" class="cc1-btn ghost" data-view="${esc(c.id)}">View course</button>`
    : `<a class="cc1-btn ghost" href="./courses.html?course=${esc(c.id)}" target="_blank" rel="noopener noreferrer">View course</a>`;
  return `<article class="cc1-card" data-id="${esc(c.id)}" data-status="${esc(st)}">
    ${coverHtml(c)}
    <div class="cc1-body">
      ${badge(c)}
      <h3 class="cc1-title">${esc(c.title)}</h3>
      ${c.short ? `<p class="cc1-desc">${esc(c.short)}</p>` : ""}
      ${chips.length ? `<div class="cc1-chips">${chips.map((x) => `<span>${esc(x)}</span>`).join("")}</div>` : ""}
      ${dates ? `<div class="cc1-dates">${esc(dates)}</div>` : ""}
      ${days || ""}
      <div class="cc1-acts">${primary}${view}</div>
    </div>
  </article>`;
}
