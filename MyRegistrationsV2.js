import { formatSchedule } from "./DeliveryDays.js";
import { canRegisterForCourse } from "./courseStatusLabel.js";
import { coverMarkup, hydrateCovers } from "./coverFor.js?v=stu11";

const esc = (s) => String(s ?? "").replace(/&/g,"&"+"amp;").replace(/</g,"&"+"lt;").replace(/"/g,"&"+"quot;");

const state = { tab: "all", q: "", loading: false };

function kindOf(status) {
  const s = String(status ?? "");
  if (s === "enrolled" || s === "confirmed" || s === "paid") return "enrolled";
  if (s === "payment_submitted") return "review";
  if (s === "pending_payment" || s === "expired") return "pending";
  if (s === "rejected") return "rejected";
  if (s === "cancelled" || s === "refunded") return "cancelled";
  return "cancelled";
}

function chipLabel(kind) {
  if (kind === "enrolled") return "Enrolled";
  if (kind === "review") return "In review";
  if (kind === "pending") return "Awaiting payment";
  if (kind === "rejected") return "Rejected";
  return "Cancelled";
}

function tsVal(v) {
  try {
    if (!v) return 0;
    if (typeof v.toMillis === "function") return v.toMillis();
    if (typeof v.toDate === "function") return v.toDate().getTime();
    const n = new Date(v).getTime();
    return Number.isFinite(n) ? n : 0;
  } catch { return 0; }
}

function unpackPay(r) {
  const raw = String(r?.paymentRef || "").trim();
  let conf = raw, ghz = String(r?.paymentReference || r?.transferRef || "").trim(), mid = String(r?.paymentMethodId || "").trim(), at = "";
  if (raw.startsWith("{") && raw.endsWith("}")) {
    try {
      const o = JSON.parse(raw);
      if (o && typeof o === "object") {
        conf = String(o.conf || "");
        ghz = String(o.ghz || ghz);
        mid = String(o.mid || mid);
        at = String(o.at || "");
      }
    } catch (_) {}
  }
  return { conf, ghz, mid, at };
}

function activityMs(r) {
  const p = unpackPay(r);
  return tsVal(r?.paymentSubmittedAt) || tsVal(p.at) || tsVal(r?.updatedAt) || tsVal(r?.createdAt);
}

function isDateOnly(v) {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.trim());
}
function dateParts(r) {
  const p = (n) => String(n).padStart(2, "0");
  const fmt = (ms, withTime) => {
    if (!ms) return { d: "—", t: "" };
    const d = new Date(ms);
    return { d: p(d.getDate()) + "/" + p(d.getMonth() + 1) + "/" + d.getFullYear(), t: withTime ? p(d.getHours()) + ":" + p(d.getMinutes()) : "" };
  };
  if (r?.paymentSubmittedAt) return fmt(tsVal(r.paymentSubmittedAt), true);
  const packed = unpackPay(r).at;
  if (packed && !isDateOnly(packed)) return fmt(tsVal(packed), true);
  const d = r?.paymentDate;
  if (d && isDateOnly(d)) {
    const [y, m, day] = d.trim().split("-");
    return { d: day + "/" + m + "/" + y, t: "" };
  }
  if (d && tsVal(d)) return fmt(tsVal(d), !isDateOnly(d));
  return fmt(tsVal(r?.updatedAt) || tsVal(r?.createdAt), !!tsVal(r?.updatedAt));
}

function priceTag(r) {
  const n = Number(r?.amount);
  if (!Number.isFinite(n) || n <= 0) return "Free";
  const cur = String(r?.currency || "USD").trim() || "USD";
  return n + " " + cur;
}

function courseOf(r, catalog) {
  const list = Array.isArray(catalog) ? catalog : [];
  return list.find((c) => (c?.id ?? "") === (r?.courseId ?? "")) || null;
}

function methodMeta(r) {
  const p = unpackPay(r);
  const id = String(p.mid || "").toLowerCase();
  const lab = String(r?.paymentMethod || "");
  const byId = { wu: { src: "./pay-wu.png", name: "Western Union" }, whish: { src: "./pay-whish.png", name: "Whish Money" }, omt: { src: "./pay-omt.png", name: "OMT" }, payoneer: { src: "./pay-payoneer.png", name: "Payoneer" } };
  if (byId[id]) return byId[id];
  const l = lab.toLowerCase();
  if (/western|wu/.test(l)) return byId.wu;
  if (/whish/.test(l)) return byId.whish;
  if (/omt/.test(l)) return byId.omt;
  if (/payoneer/.test(l)) return byId.payoneer;
  return { src: "", name: lab || "—" };
}

function reasonText(r) {
  const s = String(r?.rejectNote || r?.rejectReason || r?.reason || "").trim();
  if (!s || /^rejected$/i.test(s)) return "";
  return s;
}

function actions(r, kind, course, opts) {
  const id = esc(r?.id ?? "");
  const why = kind === "rejected" ? reasonText(r) : "";
  if (kind === "pending") {
    return `<button class="mr2-pri" type="button" data-mr2-resume="${id}">Resume payment</button>
      <button class="btn-text mr2-cancel" type="button" data-mr2-cancel="${id}">Cancel</button>`;
  }
  if (kind === "review") return `<span class="mr2-wait">Awaiting confirmation</span>`;
  if (kind === "enrolled") {
    const cid = encodeURIComponent(String(r?.courseId ?? ""));
    return `<a class="mr2-open" href="./course.html?id=${cid}">Open course</a><a class="mr2-rcpt" href="./receipt.html#${id}" target="_blank" rel="noopener"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" stroke="currentColor" stroke-width="1.8"/><path d="M14 3v5h5M8 13h8M8 17h6" stroke="currentColor" stroke-width="1.8"/></svg> Receipt</a>`;
  }
  if (kind === "cancelled" || kind === "rejected") {
    const bits = [];
    if (kind === "rejected") bits.push(`<button class="mr2-pri" type="button" data-mr2-resume="${id}">Resubmit payment</button>` + (why ? `<p class="mr2-why">${esc(why)}</p>` : ""));
    if (canRegisterForCourse(course || {}) && opts.emailVerified) bits.push(`<button class="mr2-again" type="button" data-mr2-reopen="${id}">Register again</button>`);
    return bits.join("");
  }
  return "";
}

function schedLine(course) {
  const sch = course ? formatSchedule(course) : { daysLine: "", timeLine: "" };
  const days = String(sch.daysLine || "").replace(/ \u00b7 /g, ", ");
  let time = String(sch.timeLine || "").replace(/\s*Beirut time\s*/gi, "").trim();
  return [days, time].filter(Boolean).join(" · ");
}

function rowHtml(r, opts) {
  const kind = kindOf(r?.status);
  const course = courseOf(r, opts.catalog);
  const title = r?.courseTitle || course?.title || "Course";
  const pay = unpackPay(r);
  const mm = methodMeta(r);
  const when = dateParts(r);
  const why = kind === "rejected" ? reasonText(r) : "";
  const cover = coverMarkup(course || { id: r?.courseId, title }, "mr2-thumb");
  return `<article class="mr2-row ${kind}">
    <div class="mr2-course">
      ${cover}
      <div class="mr2-ct"><p class="mr2-title">${esc(title)}</p><p class="mr2-subline">${esc(schedLine(course))}</p></div>
    </div>
    <div class="mr2-amt">${esc(priceTag(r))}</div>
    <div class="mr2-pay">${priceTag(r) === "Free" ? `<span class="mr2-free">No payment needed</span>` : `${mm.src ? `<img src="${esc(mm.src)}" alt="${esc(mm.name)}" width="96" height="28">` : ""}<span class="mr2-payname">${esc(mm.name)}</span>${pay.ghz ? `<span class="mr2-mono">${esc(pay.ghz)}<button type="button" class="mr2-copy" data-copy="${esc(pay.ghz)}" aria-label="Copy">⧉</button></span>` : ""}`}</div>
    <div class="mr2-stcell"><span class="mr2-pill ${kind}">${esc(chipLabel(kind))}</span></div>
    <div class="mr2-date"><span>${esc(when.d)}</span>${when.t ? `<small>${esc(when.t)}</small>` : ""}</div>
    <div class="mr2-acts">${actions(r, kind, course, opts)}</div>
    <div class="mr2-phone">
      <div class="mr2-course">${cover}<div class="mr2-ct"><p class="mr2-title">${esc(title)}</p></div></div>
      <span class="mr2-pill ${kind}">${esc(chipLabel(kind))}</span>
      <p class="mr2-amt">${esc(priceTag(r))}</p>
      <p class="mr2-date"><span>${esc(when.d)}</span>${when.t ? ` <small>${esc(when.t)}</small>` : ""}</p>
      ${why ? `<p class="mr2-why">${esc(why)}</p>` : ""}
      <div class="mr2-acts">${actions(r, kind, course, opts)}</div>
    </div>
  </article>`;
}

function inTab(r, tab) {
  const k = kindOf(r?.status);
  if (tab === "all") return true;
  if (tab === "pending") return k === "pending";
  if (tab === "review") return k === "review";
  if (tab === "enrolled") return k === "enrolled";
  if (tab === "closed") return k === "cancelled" || k === "rejected";
  return true;
}

function sortRegs(list) {
  return [...list].sort((a, b) => {
    const cmp = activityMs(b) - activityMs(a);
    if (cmp !== 0) return cmp;
    return String(a.id || "").localeCompare(String(b.id || ""));
  });
}

export function renderMyRegistrationsV2(opts) {
  const host = opts?.host;
  if (!host) return false;
  try {
    const regs = Array.isArray(opts.regs) ? opts.regs : [];
    const catalog = Array.isArray(opts.catalog) ? opts.catalog : [];
    const nEn = regs.filter((r) => kindOf(r.status) === "enrolled").length;
    const nPend = regs.filter((r) => kindOf(r.status) === "pending").length;
    const nRev = regs.filter((r) => kindOf(r.status) === "review").length;
    const nClosed = regs.filter((r) => {
      const k = kindOf(r.status);
      return k === "cancelled" || k === "rejected";
    }).length;
    const tab = ["all","pending","review","enrolled","closed"].includes(state.tab) ? state.tab : "all";
    const qq = String(state.q || "").trim().toLowerCase();
    const list = sortRegs(regs.filter((r) => {
      if (!inTab(r, tab)) return false;
      if (!qq) return true;
      const p = unpackPay(r);
      return [r.courseTitle, p.ghz, r.paymentMethod].join(" ").toLowerCase().includes(qq);
    }));

    const phone = typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;
    const t0 = phone ? performance.now() : 0;
    if (opts.loading) {
      host.innerHTML = `<div class="mr2-wrap"><div class="mr2-skel"></div><div class="mr2-skel"></div><div class="mr2-skel"></div></div>`;
      if (phone) { try { console.log("[ghz-perf] page regs skeleton", Math.round(performance.now() - t0) + "ms"); } catch {} }
      return true;
    }

    const empty = `<div class="mr2-empty"><div class="ico">📋</div><p>No registrations yet<span style="display:block;margin-top:4px;font-size:13px;line-height:1.45;color:#64748b;font-weight:400">Find a course that fits you and register in a few steps.</span></p><button class="btn btn-sm" type="button" data-mr2-browse>Browse courses</button></div>`;

    host.innerHTML = `<div class="mr2-wrap">
      <div class="mr2-head">
        <div>
          <h2>My registrations</h2>
          <p class="mr2-sub">Track your course registrations and payments</p>
        </div>
        <span class="mr2-count">${list.length} registration${list.length===1?"":"s"}</span>
      </div>
      <div class="mr2-bar">
        <div class="mr2-tabs">
          <button type="button" class="${tab==="all"?"on":""}" data-mr2-tab="all">All</button>
          <button type="button" class="${tab==="pending"?"on":""}" data-mr2-tab="pending">Action needed</button>
          <button type="button" class="${tab==="review"?"on":""}" data-mr2-tab="review">In review</button>
          <button type="button" class="${tab==="enrolled"?"on":""}" data-mr2-tab="enrolled">Enrolled</button>
          <button type="button" class="${tab==="closed"?"on":""}" data-mr2-tab="closed">Cancelled/Rejected</button>
        </div>
        <input class="mr2-search" type="search" placeholder="Search course or reference" value="${esc(state.q)}" data-mr2-q />
      </div>
      ${list.length ? `<div class="mr2-card"><div class="mr2-scroll">
        <div class="mr2-th"><span>Course</span><span>Amount</span><span>Payment</span><span>Status</span><span>Date</span><span>Actions</span></div>
        ${list.map((r) => rowHtml(r, { catalog, emailVerified: !!opts.emailVerified })).join("")}
      </div></div>` : empty}
    </div>`;
    try { hydrateCovers(host); } catch (_) {}
    if (phone) { try { console.log("[ghz-perf] page regs first-card", Math.round(performance.now() - t0) + "ms", list.length); console.log("[ghz-perf] page regs all-cards", Math.round(performance.now() - t0) + "ms"); } catch {} }

    host.querySelector("[data-mr2-q]")?.addEventListener("input", (ev) => {
      state.q = ev.target.value;
      renderMyRegistrationsV2(opts);
    });

    host.onclick = (e) => {
      const copy = e.target?.closest?.("[data-copy]");
      if (copy) {
        e.preventDefault();
        const prev = copy.textContent;
        try { navigator.clipboard.writeText(copy.getAttribute("data-copy") || ""); copy.textContent = "Copied"; setTimeout(() => { copy.textContent = prev; }, 2000); } catch (_) {}
        return;
      }
      const t = e.target?.closest?.("[data-mr2-tab],[data-mr2-browse],[data-mr2-paid],[data-mr2-resume],[data-mr2-receipt],[data-mr2-cancel],[data-mr2-reopen]");
      if (!t) return;
      if (t.hasAttribute("data-mr2-tab")) {
        state.tab = t.getAttribute("data-mr2-tab") || "all";
        renderMyRegistrationsV2(opts);
        return;
      }
      if (t.hasAttribute("data-mr2-browse")) { opts.onBrowse?.(); return; }
      if (t.hasAttribute("data-mr2-paid")) { opts.onPaid?.(t.getAttribute("data-mr2-paid"), t); return; }
      if (t.hasAttribute("data-mr2-resume")) { opts.onResume?.(t.getAttribute("data-mr2-resume"), t); return; }
      if (t.hasAttribute("data-mr2-receipt")) { opts.onReceipt?.(t.getAttribute("data-mr2-receipt"), t); return; }
      if (t.hasAttribute("data-mr2-cancel")) { opts.onCancel?.(t.getAttribute("data-mr2-cancel"), t); return; }
      if (t.hasAttribute("data-mr2-reopen")) { opts.onReopen?.(t.getAttribute("data-mr2-reopen"), t); return; }
    };
    opts.onReady?.();
    return true;
  } catch (e) {
    const code = (e?.code || "error") + ": " + (e?.message || e);
    host.innerHTML = `<div class="mr2-fail"><p>Could not load registrations (${esc(code)})</p><button class="btn btn-sm" type="button" data-classic>Use classic view</button></div>`;
    host.onclick = (ev) => { if (ev.target?.closest?.("[data-classic]")) opts.onClassic?.(); };
    return false;
  }
}
