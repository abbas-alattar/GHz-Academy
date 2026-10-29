import { deliveryDaysHtml } from "./DeliveryDays.js";
import { startsEndsLine } from "./courseDates.js";
import { canRegisterForCourse } from "./courseStatusLabel.js";

const esc = (s) => String(s ?? "").replace(/&/g,"&"+"amp;").replace(/</g,"&"+"lt;").replace(/"/g,"&"+"quot;");

const state = { tab: "all", loading: false };

function kindOf(status) {
  const s = String(status ?? "");
  if (s === "enrolled" || s === "confirmed") return "enrolled";
  if (s === "payment_submitted") return "review";
  if (s === "pending_payment") return "pending";
  if (s === "rejected") return "rejected";
  if (s === "cancelled") return "cancelled";
  return "cancelled";
}

function badgeLabel(kind) {
  if (kind === "enrolled") return "Enrolled";
  if (kind === "review") return "Payment submitted / In review";
  if (kind === "pending") return "Pending payment · Action needed";
  if (kind === "rejected") return "Rejected";
  return "Cancelled by admin";
}

function helper(kind) {
  if (kind === "pending") return "Complete your payment so the academy can confirm your seat.";
  if (kind === "review") return "We received your payment details. The admin will confirm shortly.";
  if (kind === "enrolled") return "You're in! Open the course to get started.";
  if (kind === "cancelled") return "Cancelled by admin. You no longer have access to this course.";
  if (kind === "rejected") return "This registration was not confirmed.";
  return "";
}

function tsMs(r) {
  const t = r?.createdAt;
  if (t && typeof t.toDate === "function") {
    try { return t.toDate().getTime(); } catch { return 0; }
  }
  if (typeof t === "number") return t;
  const s = String(t ?? "");
  const n = Date.parse(s);
  return Number.isFinite(n) ? n : 0;
}

function dateLine(r) {
  const ms = tsMs(r);
  if (!ms) return "Registered date unavailable";
  try { return "Registered " + new Date(ms).toLocaleDateString(); } catch { return "Registered date unavailable"; }
}

function priceTag(r) {
  const n = Number(r?.amount);
  if (!Number.isFinite(n) || n <= 0) return "Free";
  const cur = String(r?.currency || "USD").trim() || "USD";
  return `${n} ${cur}`;
}

function courseOf(r, catalog) {
  const list = Array.isArray(catalog) ? catalog : [];
  return list.find((c) => (c?.id ?? "") === (r?.courseId ?? "")) || null;
}

function stepper(kind) {
  let dots = ["cur", "", ""];
  if (kind === "review") dots = ["done", "cur", ""];
  if (kind === "enrolled") dots = ["done", "done", "done"];
  if (kind === "cancelled") dots = ["halt", "", ""];
  if (kind === "rejected") dots = ["stop", "", ""];
  const mark = (d) => d === "done" ? "✓" : d === "stop" || d === "halt" ? "×" : "";
  return `<div class="mr2-step">
    <span class="mr2-dot ${dots[0]}">${mark(dots[0])}</span><i class="mr2-line ${dots[1]?"on":""}"></i>
    <span class="mr2-dot ${dots[1]}">${mark(dots[1])}</span><i class="mr2-line ${dots[2]==="done"?"on":""}"></i>
    <span class="mr2-dot ${dots[2]}">${mark(dots[2])}</span>
  </div>
  <div class="mr2-slabel"><span>Registered</span><span>Paid</span><span>Confirmed</span></div>`;
}

function actions(r, kind, course, opts) {
  const id = esc(r?.id ?? "");
  if (kind === "pending") {
    return `<button class="btn btn-sm" type="button" data-mr2-paid="${id}">${esc(opts.payLabel || "I have paid")}</button>
      <button class="btn-text" type="button" data-mr2-cancel="${id}">Cancel</button>`;
  }
  if (kind === "enrolled") {
    const cid = encodeURIComponent(String(r?.courseId ?? ""));
    return `<a class="btn btn-sm" href="./course.html?id=${cid}">Open course</a>`;
  }
  if (kind === "cancelled") {
    const open = canRegisterForCourse(course?.status);
    if (!open) return `<button class="btn btn-sm" disabled>Register again</button><p style="font-size:.82rem;color:var(--muted)">Registration is closed</p>`;
    if (!opts.emailVerified) return `<button class="btn btn-sm" disabled>Register again</button><p style="font-size:.82rem;color:var(--muted)">Verify your email</p>`;
    return `<button class="btn btn-sm" type="button" data-mr2-reopen="${id}">Register again</button>`;
  }
  return "";
}

function cardHtml(r, opts) {
  const kind = kindOf(r?.status);
  const course = courseOf(r, opts.catalog);
  const title = r?.courseTitle || course?.title || "Course";
  const days = course ? deliveryDaysHtml(course, { emptyMode: "hide" }) : "";
  const time = String(course?.sessionTime ?? "").trim();
  const ico = kind === "enrolled" ? "✓" : kind === "pending" ? "!" : kind === "review" ? "…" : kind === "rejected" ? "!" : "–";
  return `<article class="mr2-card">
    <span class="mr2-strip ${kind}"></span>
    <div class="mr2-ico ${kind}">${ico}</div>
    <div class="mr2-mid">
      <h3 class="mr2-title">${esc(title)}</h3>
      <p class="mr2-date">${esc(dateLine(r))}</p>
      ${days}${startsEndsLine(course) ? `<p class="mr2-date">${esc(startsEndsLine(course))}</p>` : ""}${time ? `<p class="mr2-date">${esc(time)}</p>` : ""}
      <span class="mr2-badge ${kind}">${esc(badgeLabel(kind))}</span>
      ${stepper(kind)}
      <p class="mr2-help">${esc(helper(kind))}</p>
    </div>
    <div class="mr2-right">
      <span class="mr2-price">${esc(priceTag(r))}</span>
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
    const ap = kindOf(a.status) === "pending" ? 0 : 1;
    const bp = kindOf(b.status) === "pending" ? 0 : 1;
    if (ap !== bp) return ap - bp;
    return tsMs(b) - tsMs(a);
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
    const list = sortRegs(regs.filter((r) => inTab(r, tab)));

    if (opts.loading) {
      host.innerHTML = `<div class="mr2-wrap"><div class="mr2-skel"></div><div class="mr2-skel"></div></div>`;
      return true;
    }

    const empty = `<div class="mr2-empty"><div class="ico">📋</div><p>No registrations yet</p><button class="btn btn-sm" type="button" data-mr2-browse>Browse courses</button></div>`;

    host.innerHTML = `<div class="mr2-wrap">
      <div class="mr2-head">
        <div>
          <h2>My registrations</h2>
          <p class="mr2-sub">Track your course registrations and payments</p>
        </div>
        <div class="mr2-sum">
          <span>Enrolled ${nEn}</span>
          <span>Awaiting payment ${nPend}</span>
          <span>In review ${nRev}</span>
        </div>
      </div>
      <div class="mr2-tabs">
        <button type="button" class="${tab==="all"?"on":""}" data-mr2-tab="all">All (${regs.length})</button>
        <button type="button" class="${tab==="pending"?"on":""}" data-mr2-tab="pending">Action needed (${nPend})</button>
        <button type="button" class="${tab==="review"?"on":""}" data-mr2-tab="review">In review (${nRev})</button>
        <button type="button" class="${tab==="enrolled"?"on":""}" data-mr2-tab="enrolled">Enrolled (${nEn})</button>
        <button type="button" class="${tab==="closed"?"on":""}" data-mr2-tab="closed">Cancelled/Rejected (${nClosed})</button>
      </div>
      ${list.length ? list.map((r) => cardHtml(r, { catalog, emailVerified: !!opts.emailVerified, payLabel: opts.payLabel })).join("") : empty}
    </div>`;

    host.onclick = (e) => {
      const t = e.target?.closest?.("[data-mr2-tab],[data-mr2-browse],[data-mr2-paid],[data-mr2-cancel],[data-mr2-reopen]");
      if (!t) return;
      if (t.hasAttribute("data-mr2-tab")) {
        state.tab = t.getAttribute("data-mr2-tab") || "all";
        renderMyRegistrationsV2(opts);
        return;
      }
      if (t.hasAttribute("data-mr2-browse")) { opts.onBrowse?.(); return; }
      if (t.hasAttribute("data-mr2-paid")) { opts.onPaid?.(t.getAttribute("data-mr2-paid"), t); return; }
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
