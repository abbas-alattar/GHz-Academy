import { db } from "./firebase-config.js?v=auth10";
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { createPayment, normalizeMethods, DEFAULT_METHODS, methodInstructions, isFreeCourse, makeTransferRef } from "./paymentProviders.js?v=stu30";
import { dateRangeLine } from "./courseDates.js?v=stu11";
import { formatSchedule } from "./DeliveryDays.js";
import { coverMarkup, hydrateCovers } from "./coverFor.js?v=stu11";

function el(html) {
  const d = document.createElement("div");
  d.innerHTML = html.trim();
  return d.firstElementChild;
}
function esc(s) {
  return String(s ?? "").replace(/&/g, "&" + "amp;").replace(/</g, "&" + "lt;").replace(/"/g, "&" + "quot;");
}
function datesOf(course) {
  try { return dateRangeLine(course) || "TBC"; } catch (_) { return "TBC"; }
}
function scheduleOf(course) {
  try {
    const sch = formatSchedule(course) || {};
    const days = String(sch.daysLine || "").replace(/ \u00b7 /g, ", ").trim();
    const time = String(sch.timeLine || "").replace(/\s*Beirut time\s*/gi, "").trim();
    return [days, time].filter(Boolean).join(" · ");
  } catch (_) { return String(course?.schedule || "").trim(); }
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function logos() {
  return { wu: "./pay-wu.png", whish: "./pay-whish.png", omt: "./pay-omt.png", payoneer: "./pay-payoneer.png", card: "./pay-visa.png" };
}
function tagFor(m) {
  if (m.comingSoon || m.type === "gateway") return "Coming soon";
  if (m.id === "whish" || m.id === "omt") return "Lebanon";
  return "International";
}
function orderMethods(list, country) {
  const lb = /lebanon|lb|\+961/i.test(String(country || ""));
  const rank = lb
    ? { whish: 1, omt: 2, wu: 3, payoneer: 4, card: 5 }
    : { wu: 1, payoneer: 2, whish: 3, omt: 4, card: 5 };
  return [...list].sort((a, b) => (rank[a.id] || 9) - (rank[b.id] || 9));
}
function tsMs(v) {
  try {
    if (!v) return 0;
    if (v.toMillis) return v.toMillis();
    if (v.toDate) return v.toDate().getTime();
    const t = new Date(v).getTime();
    return isNaN(t) ? 0 : t;
  } catch { return 0; }
}
function holdUntil(reg) {
  const start = tsMs(reg?.createdAt) || tsMs(reg?.reservedAt) || Date.now();
  return start + 72 * 3600 * 1000;
}
function fmtLeft(ms) {
  if (ms <= 0) return "expired";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  if (h >= 24) return Math.floor(h / 24) + "d " + (h % 24) + "h left";
  if (h) return h + "h " + String(m).padStart(2, "0") + "m left";
  return m + "m " + String(s).padStart(2, "0") + "s left";
}

async function loadMethods() {
  try {
    const snap = await getDoc(doc(db, "settings", "paymentMethods"));
    if (snap.exists()) return normalizeMethods(snap.data().methods);
  } catch (_) {}
  return normalizeMethods(DEFAULT_METHODS);
}

export async function openCheckout({ user, profile, course, existing }) {
  if (!user || !course) return;
  try { location.hash = "checkout/" + encodeURIComponent(course.id); } catch (_) {}
  if (course.full === true) {
    const box = el(`<div class="co-page"><div class="co-top"><a class="co-brand" href="./index.html"><img src="./logo-receipt.png" alt="GHz Academy" /></a><p class="co-secure"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" stroke-width="1.8"/></svg> Secure registration</p><a class="co-helpwa" href="https://wa.me/96176908224" target="_blank" rel="noopener">Need help?</a></div><div class="co-wrap"><div class="co-card"><h2 class="co-h">This course is full</h2><p class="co-body">Registration is closed for this class.</p></div></div></div>`);
    document.body.appendChild(box);
    return;
  }
  const amount = Number(course.price);
  const currency = course.currency || "USD";
  const free = isFreeCourse(course);
  const methods = orderMethods(await loadMethods(), profile?.country || profile?.phone || "");
  const rid = user.uid + "_" + course.id;
  let step = 0;
  let details = {
    name: profile?.name || profile?.fullName || user.displayName || "",
    email: profile?.email || user.email || "",
    phone: profile?.phone || ""
  };
  let method = null;
  let pay = { conf: "", sender: details.name, note: "" };
  let noteOpen = false;
  let fieldErr = {};
  let transferRef = existing?.transferRef || makeTransferRef(course);
  let err = "";
  let loading = false;
  let sumOpen = false;
  let tickTimer = 0;
  const priceLine = (!Number.isFinite(amount) || amount <= 0) ? "Free" : (amount + " " + currency);
  const dateLine = datesOf(course);
  const schedLine = scheduleOf(course);
  const trainers = (course.trainerNames || course.trainers || []).join ? (course.trainerNames || course.trainers).join(", ") : String(course.trainerName || "Academy trainers");
  const settings = {};
  try {
    const s = await getDoc(doc(db, "settings", "checkout"));
    if (s.exists()) Object.assign(settings, s.data());
  } catch (_) {}
  const verifyText = settings.verifyText || "usually confirmed within 24 hours";
  const holder = settings.accountHolder || "GHz Academy";
  const wa = String(settings.whatsapp || "96176908224").replace(/[^\d]/g, "") || "96176908224";
  const coverHtml = coverMarkup(course, "co-cover");
  const holdEnd = holdUntil(existing);
  let expired = holdEnd < Date.now() && !free && String(existing?.status || "") === "pending_payment";

  const root = el(`<div class="co-page" role="dialog" aria-label="Secure registration"></div>`);
  document.body.appendChild(root);
  const close = () => { try { clearInterval(tickTimer); root.remove(); } catch (_) {} };
  const labels = ["Details", "Payment method", "Pay and confirm", "Done"];

  function fmtFsErr(op, fields, e) {
    const code = e?.code || e?.name || "error";
    const msg = e?.message || String(e);
    return op + " registration — " + code + ": " + msg + " · fields: " + fields.join(", ");
  }
  async function writeReg(status, extra) {
    const created = await createPayment({ method, course, amount, currency, transferRef });
    transferRef = created.transferRef || transferRef;
    const ref = doc(db, "registrations", rid);
    let snap = null;
    try { snap = await getDoc(ref); } catch (_) { snap = null; }
    const st = String(snap && snap.exists() ? (snap.data()?.status || "") : (existing?.status || ""));
    if (st === "payment_submitted") return;
    if (!(snap && snap.exists()) && st !== "pending_payment") {
      const createFields = ["uid", "studentName", "studentEmail", "phone", "courseId", "courseTitle", "amount", "currency", "status", "createdAt"];
      try {
        await setDoc(ref, {
          uid: user.uid,
          studentName: details.name,
          studentEmail: details.email,
          phone: details.phone,
          courseId: course.id,
          courseTitle: course.title,
          amount: Number.isFinite(amount) ? amount : 0,
          currency,
          status: "pending_payment",
          createdAt: serverTimestamp()
        });
      } catch (e) { throw new Error(fmtFsErr("create", createFields, e)); }
    }
    if (status !== "payment_submitted") return;
    const packed = JSON.stringify({
      v: 1,
      conf: extra?.paymentRef || "",
      ghz: transferRef || "",
      sender: extra?.paymentSender || "",
      note: extra?.paymentNote || "",
      mid: method?.id || "",
      at: new Date().toISOString()
    });
    const patch = {
      status: "payment_submitted",
      paymentMethod: method?.label || (free ? "free" : ""),
      paymentRef: packed,
      paymentDate: serverTimestamp()
    };
    try { await updateDoc(ref, patch); }
    catch (e) { throw new Error(fmtFsErr("update", ["status", "paymentMethod", "paymentRef", "paymentDate"], e)); }
  }

  function flashCopy(btn, text) {
    const prev = btn.textContent;
    btn.textContent = "Copied";
    setTimeout(() => { btn.textContent = prev; }, 2000);
    try { navigator.clipboard.writeText(text); } catch (_) {}
  }

  function summaryInner() {
    return `${coverHtml}
      <h3 class="co-cname">${esc(course.title || "Course")}</h3>
      <p class="co-meta">${esc(course.level || "Course")} · ${esc(trainers)}</p>
      <div class="co-rows">
        <div class="co-r"><span>Dates</span><strong>${esc(dateLine)}</strong></div>
        ${schedLine ? `<div class="co-r"><span>Schedule</span><strong>${esc(schedLine)}</strong></div>` : ""}
      </div>
      <p class="co-code"><button type="button" class="co-link" id="coCode">Have a discount code?</button></p>
      <div class="co-tot"><span>Total</span><b>${esc(priceLine)}</b></div>`;
  }
  function nextCard() {
    return `<div class="co-nextcard"><h3>What happens next</h3>
      <div class="co-nx on"><i>✓</i><p>Pay with your chosen method</p></div>
      <div class="co-nx"><i></i><p>The academy checks your payment</p></div>
      <div class="co-nx"><i></i><p>You get a notification and your course opens</p></div>
    </div>`;
  }

  function paint() {
    const s = step;
    const L = logos();
    clearInterval(tickTimer);
    if (loading) {
      root.innerHTML = `<div class="co-top"><a class="co-brand" href="./index.html"><img src="./logo-receipt.png" alt="GHz Academy" /></a><p class="co-secure">Secure registration</p></div><div class="co-wrap"><div class="co-card"><div class="co-sk"></div><div class="co-sk"></div><div class="co-sk"></div></div></div>`;
      return;
    }
    if (expired) {
      root.innerHTML = `<div class="co-top"><a class="co-brand" href="./index.html"><img src="./logo-receipt.png" alt="GHz Academy" /></a><p class="co-secure">Secure registration</p><a class="co-helpwa" href="https://wa.me/${esc(wa)}" target="_blank" rel="noopener">Need help?</a></div>
        <div class="co-wrap"><div class="co-card"><h2 class="co-h">Reservation expired</h2><p class="co-body">Your 72-hour seat hold has ended. Start registration again if seats remain.</p><button type="button" class="co-pri" id="coExp">Back to courses</button></div></div>`;
      root.querySelector("#coExp").onclick = () => { close(); location.hash = "browse"; };
      return;
    }
    root.innerHTML = `<div class="co-top">
        <a class="co-brand" href="./index.html" aria-label="GHz Academy"><img src="./logo-receipt.png" alt="GHz Academy" /></a>
        <p class="co-secure"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" stroke-width="1.8"/></svg> Secure registration</p>
        <a class="co-helpwa" href="https://wa.me/${esc(wa)}" target="_blank" rel="noopener">Need help?</a>
      </div>
      <div class="co-wrap">
        <div class="co-left">
          <p class="co-phone-step">Step ${s + 1} of 4 · ${esc(labels[s])}</p>
          <div class="co-pbar" aria-hidden="true"><i style="width:${((s + 1) / 4) * 100}%"></i></div>
          <div class="co-steps" aria-label="Checkout steps">${[0,1,2,3].map((i) => {
            const st = i < s ? "done" : (i === s ? "on" : "");
            const mark = i < s ? "✓" : String(i + 1);
            return `<div class="co-si ${st}"><i>${mark}</i><span>${esc(labels[i])}</span></div>${i < 3 ? `<div class="co-line ${i < s ? "on" : ""}"></div>` : ""}`;
          }).join("")}</div>
          <button type="button" class="co-sumbar" id="coSumBar">${esc(course.title || "Course")} · ${esc(priceLine)}</button>
          ${sumOpen ? `<div class="co-sumcard" id="coSumPhone">${summaryInner()}${nextCard()}</div>` : ""}
          ${err ? `<div class="co-err" role="alert"><span>Could not save this step.</span> <button type="button" class="co-retry" id="coRetry">Retry</button><p class="co-tech">${esc(err)}</p></div>` : ""}
          <div class="co-card" id="coBody"></div>
          <div class="co-deskacts" id="coDesk"></div>
        </div>
        <aside class="co-side">
          <div class="co-sumcard" id="coSumDesk">${summaryInner()}</div>
          ${nextCard()}
        </aside>
      </div>
      <div class="co-stick" id="coStick"></div>`;
    const body = root.querySelector("#coBody");
    const stick = root.querySelector("#coStick");
    const desk = root.querySelector("#coDesk");
    function onAll(sel, fn) {
      root.querySelectorAll(sel).forEach((n) => { n.onclick = fn; });
    }
    const bar = root.querySelector("#coSumBar");
    if (bar) bar.onclick = () => { sumOpen = !sumOpen; paint(); };
    try {
      hydrateCovers(root);
      root.querySelectorAll(".co-sumcard .ghz-cover").forEach((n) => {
        n.style.aspectRatio = "auto";
        n.style.height = "130px";
        n.style.maxHeight = "130px";
      });
    } catch (_) {}
    const retry = root.querySelector("#coRetry");
    if (retry) retry.onclick = () => { err = ""; paint(); };
    const code = root.querySelector("#coCode");
    if (code) code.onclick = () => { code.textContent = "No discount on this course"; };

    if (s === 0) {
      body.innerHTML = `<h2 class="co-h">Your details</h2>
        <label class="co-lab" for="coName">Name</label><input class="co-in" id="coName" value="${esc(details.name)}" autocomplete="name" />
        ${fieldErr.name ? `<p class="co-ferr" id="coNameErr">${esc(fieldErr.name)}</p>` : ""}
        <label class="co-lab" for="coEmail">Email</label><input class="co-in" id="coEmail" value="${esc(details.email)}" autocomplete="email" />
        ${fieldErr.email ? `<p class="co-ferr">${esc(fieldErr.email)}</p>` : ""}
        <label class="co-lab" for="coPhone">Phone</label><input class="co-in" id="coPhone" value="${esc(details.phone)}" autocomplete="tel" />
        ${fieldErr.phone ? `<p class="co-ferr">${esc(fieldErr.phone)}</p>` : ""}`;
      const nextHtml = `<span class="co-stickprice">${esc(priceLine)}</span><button type="button" class="co-pri co-go">Continue</button>`;
      stick.innerHTML = nextHtml;
      desk.innerHTML = `<button type="button" class="co-pri co-go">Continue</button>`;
      const go = () => {
        details = { name: root.querySelector("#coName").value.trim(), email: root.querySelector("#coEmail").value.trim(), phone: root.querySelector("#coPhone").value.trim() };
        fieldErr = {};
        if (!details.name) fieldErr.name = "Enter your name.";
        if (!details.email) fieldErr.email = "Enter your email.";
        if (!details.phone) fieldErr.phone = "Enter your phone.";
        if (fieldErr.name || fieldErr.email || fieldErr.phone) { err = ""; paint(); return; }
        err = "";
        if (free) { step = 3; paint(); return; }
        step = 1; paint();
      };
      onAll(".co-go", go);
      return;
    }
    if (s === 1) {
      body.innerHTML = `<h2 class="co-h">Payment method</h2><div class="co-grid">${methods.filter((m) => m.enabled).map((m) => {
        const soon = !!(m.comingSoon || m.type === "gateway");
        const on = !soon && method && method.id === m.id;
        const isCard = m.id === "card" || m.type === "gateway";
        const src = L[m.icon] || L[m.id] || "./pay-wu.png";
        const mark = isCard
          ? `<span class="co-ltile co-cardmarks"><img src="./pay-visa.png" alt="Visa" /><img src="./pay-mc.png" alt="Mastercard" /></span>`
          : `<span class="co-ltile"><img class="co-logo" src="${esc(src)}" alt="${esc(m.label)}" /></span>`;
        return `<button type="button" class="co-meth ${soon ? "soon" : ""} ${on ? "on" : ""}" data-mid="${esc(m.id)}" ${soon ? "disabled" : ""} aria-pressed="${on}">
          ${mark}
          <span class="co-mname"><strong>${esc(m.label)}</strong><span class="co-tag">${esc(tagFor(m))}</span></span>
          <span class="co-radio" aria-hidden="true"></span>
        </button>`;
      }).join("")}</div>`;
      body.querySelectorAll("[data-mid]").forEach((b) => {
        b.onclick = () => {
          const next = methods.find((m) => m.id === b.dataset.mid);
          if (!next || next.comingSoon || next.type === "gateway") return;
          method = next;
          paint();
        };
      });
      const html1 = `<button type="button" class="co-backbtn co-back" aria-label="Back"><span aria-hidden="true">‹</span> Back</button><button type="button" class="co-pri co-go" ${method ? "" : "disabled"}>Continue</button>`;
      stick.innerHTML = html1;
      desk.innerHTML = html1;
      onAll(".co-back", () => { step = 0; paint(); });
      onAll(".co-go", async () => {
        if (!method) return;
        try { await writeReg("pending_payment"); err = ""; step = 2; paint(); }
        catch (e) { err = e.message || String(e); paint(); }
      });
      return;
    }
    if (s === 2) {
      const left0 = holdEnd - Date.now();
      const fillAmt = (t) => String(t || "").replace(/\{amount\}/g, priceLine);
      const steps = (method.steps && method.steps.length ? method.steps : []).map((t, i) => `<div class="co-nstep"><i>${i + 1}</i><p>${esc(fillAmt(t))}</p></div>`).join("");
      const detailRows = (method.details || []).map((r) => {
        const valCls = r.mono ? "co-mono" : "co-plain";
        const copy = r.copy ? `<button type="button" class="co-copy" data-copy="${esc(r.value)}">Copy</button>` : "";
        return `<div class="co-drow"><span>${esc(r.label)}</span><strong class="${valCls}">${esc(r.value)}</strong>${copy}</div>`;
      }).join("");
      const ask = method.askConf || { senderName: true };
      const askCode = !!(ask.mtcn || ask.paymentId);
      const codeLabel = ask.mtcn ? "MTCN" : (ask.paymentId ? "Payment ID" : "");
      const ready = !!(pay.sender && (!askCode || pay.conf));
      const backBtn = `<button type="button" class="co-backbtn co-back" aria-label="Back"><span aria-hidden="true">‹</span> Back</button>`;
      body.innerHTML = `<div class="co-payhead"><span class="co-ltile"><img class="co-logo" src="${esc(L[method.id] || "./pay-wu.png")}" alt="" /></span><div><h2 class="co-h">Pay with ${esc(method.label)}</h2><p class="co-help">${esc(verifyText)}</p></div></div>
        <div class="co-navy">
          <span>Send exactly</span>
          <div class="co-amtline"><b>${esc(priceLine)}</b> <button type="button" class="co-copy" data-copy="${esc(priceLine)}">Copy</button></div>
          <p class="co-hold"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.8"/><path d="M12 8v5l3 2" stroke="currentColor" stroke-width="1.8"/></svg> Your seat is reserved for 72 hours · <em id="coLeft">${esc(fmtLeft(left0))}</em></p>
        </div>
        <div class="co-nsteps">${steps}</div>
        <div class="co-drows">${detailRows}</div>
        <div class="co-2in">
          ${askCode ? `<div><label class="co-lab" for="coConf">${esc(codeLabel)}</label><input class="co-in" id="coConf" value="${esc(pay.conf)}" />${fieldErr.conf ? `<p class="co-ferr">${esc(fieldErr.conf)}</p>` : ""}</div>` : ""}
          <div><label class="co-lab" for="coSend">Sender name</label><input class="co-in" id="coSend" value="${esc(pay.sender)}" />${fieldErr.sender ? `<p class="co-ferr">${esc(fieldErr.sender)}</p>` : ""}</div>
        </div>
        ${noteOpen ? `<label class="co-lab" for="coNote">Note (optional)</label><textarea class="co-ta" id="coNote">${esc(pay.note)}</textarea>` : `<button type="button" class="co-link" id="coNoteTog">Add a note (optional)</button>`}
        <p class="co-secureline">Your details are sent over a secure connection</p>
        <ul class="co-prog" id="coProg" hidden></ul>`;
      tickTimer = setInterval(() => {
        const n = root.querySelector("#coLeft");
        const left = holdEnd - Date.now();
        if (!n) return;
        n.textContent = fmtLeft(left);
        if (left <= 0) { expired = true; paint(); }
      }, 1000);
      body.querySelectorAll("[data-copy]").forEach((b) => {
        b.onclick = () => flashCopy(b, b.dataset.copy);
      });
      const syncPay = () => {
        pay = {
          conf: root.querySelector("#coConf")?.value.trim() || "",
          sender: root.querySelector("#coSend")?.value.trim() || "",
          note: root.querySelector("#coNote")?.value.trim() || pay.note
        };
        root.querySelectorAll(".co-pay").forEach((btn) => { btn.disabled = !(pay.sender && (!askCode || pay.conf)); });
      };
      ["coConf", "coSend", "coNote"].forEach((id) => root.querySelector("#" + id)?.addEventListener("input", syncPay));
      const nt = root.querySelector("#coNoteTog");
      if (nt) nt.onclick = () => { syncPay(); noteOpen = true; paint(); };
      stick.innerHTML = `${backBtn}<button type="button" class="co-pri co-pay" ${ready ? "" : "disabled"}>I have paid ${esc(priceLine)}</button>`;
      desk.innerHTML = `${backBtn}<button type="button" class="co-pri co-pay" ${ready ? "" : "disabled"}>I have paid ${esc(priceLine)}</button>`;
      onAll(".co-back", () => { syncPay(); step = 1; paint(); });
      onAll(".co-pay", async () => {
        syncPay();
        fieldErr = {};
        if (askCode && !pay.conf) fieldErr.conf = "Enter the " + codeLabel + ".";
        if (!pay.sender) fieldErr.sender = "Enter the sender name.";
        if (fieldErr.conf || fieldErr.sender) { paint(); return; }
        const btns = [...root.querySelectorAll(".co-pay")];
        const prog = root.querySelector("#coProg");
        root.querySelectorAll(".co-in,.co-ta").forEach((n) => { n.disabled = true; });
        btns.forEach((btn) => { btn.disabled = true; btn.innerHTML = '<span class="co-spin"></span> Submitting securely'; });
        const lines = ["Saving your payment details", "Securing your reservation", "Notifying the academy"];
        if (prog) {
          prog.hidden = false;
          prog.innerHTML = lines.map((t, i) => `<li data-i="${i}"><span class="co-spin"></span> ${esc(t)}</li>`).join("");
        }
        const mark = (i) => {
          const li = prog?.querySelector(`[data-i="${i}"]`);
          if (li) li.innerHTML = `<span class="co-ok">✓</span> ${esc(lines[i])}`;
        };
        try {
          const t0 = Date.now();
          await writeReg("payment_submitted", { paymentRef: pay.conf, paymentSender: pay.sender, paymentNote: pay.note, paymentDate: new Date().toISOString() });
          mark(0); await sleep(Math.max(0, 400 - (Date.now() - t0)));
          mark(1); await sleep(400);
          mark(2); await sleep(400);
          step = 3; err = ""; paint();
        } catch (e) {
          err = e.message || String(e);
          paint();
        }
      });
      return;
    }
    body.innerHTML = `<div class="co-done"><div class="co-check" aria-hidden="true">✓</div>
      <h2 class="co-h">Payment submitted</h2>
      <p class="co-help">Reference ${esc(transferRef)} · ${esc(priceLine)} · ${esc(method?.label || "")}</p>
      <p class="co-body">We'll check it and notify you</p>
      <p class="co-doneacts">
        <button type="button" class="co-pri" id="coRegs">View my registrations</button>
        <button type="button" class="co-ghost" id="coBrowse">Back to courses</button>
      </p></div>`;
    stick.innerHTML = `<button type="button" class="co-pri co-regs">View my registrations</button>`;
    desk.innerHTML = "";
    const goRegs = () => { close(); location.hash = "regs"; };
    onAll(".co-regs, #coRegs", goRegs);
    root.querySelector("#coBrowse").onclick = () => { close(); location.hash = "browse"; };
  }
  paint();
}
