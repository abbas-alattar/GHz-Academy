import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { auth, db } from "./firebase-config.js?v=auth10";
import { formatSchedule } from "./DeliveryDays.js";
import { stableReceiptNo } from "./ReceiptPdf.js?v=stu22";

const esc = (s) => String(s ?? "").replace(/&/g,"&"+"amp;").replace(/</g,"&"+"lt;").replace(/"/g,"&"+"quot;");

function tsMs(v) {
  try {
    if (!v) return 0;
    if (v.toMillis) return v.toMillis();
    if (v.toDate) return v.toDate().getTime();
    const t = new Date(v).getTime();
    return isNaN(t) ? 0 : t;
  } catch { return 0; }
}
function isDateOnly(v) {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.trim());
}
function fmtDate(v) {
  const ms = tsMs(v);
  if (!ms) return "";
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, "0");
  return p(d.getDate()) + "/" + p(d.getMonth() + 1) + "/" + d.getFullYear();
}
function unpackPay(r) {
  const raw = String(r?.paymentRef || "").trim();
  let conf = "", ghz = String(r?.paymentReference || r?.transferRef || "").trim(), at = "";
  if (raw.startsWith("{")) {
    try {
      const o = JSON.parse(raw);
      conf = String(o.conf || "");
      ghz = String(o.ghz || ghz);
      at = String(o.at || "");
    } catch (_) {}
  } else if (raw) conf = raw;
  return { conf, ghz, at };
}
function methodName(r) {
  const lab = String(r?.paymentMethod || "").trim();
  const l = lab.toLowerCase();
  if (/western|wu/.test(l)) return "Western Union";
  if (/whish/.test(l)) return "Whish Money";
  if (/omt/.test(l)) return "OMT";
  if (/payoneer/.test(l)) return "Payoneer";
  if (!lab) return "";
  return lab.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}
function methodLogoSrc(r) {
  const n = methodName(r).toLowerCase();
  if (/western/.test(n)) return "./pay-wu.png";
  if (/whish/.test(n)) return "./pay-whish.png";
  if (/omt/.test(n)) return "./pay-omt.png";
  if (/payoneer/.test(n)) return "./pay-payoneer.png";
  return "";
}
function issueAndPay(r) {
  const created = tsMs(r.createdAt);
  const issueMs = tsMs(r.confirmedAt) || tsMs(r.paymentSubmittedAt) || tsMs(unpackPay(r).at) || tsMs(r.paymentDate) || Date.now();
  let payMs = tsMs(r.paymentSubmittedAt);
  if (!payMs) {
    const p = unpackPay(r).at;
    if (p && !isDateOnly(p)) payMs = tsMs(p);
  }
  const issue = fmtDate(issueMs) || fmtDate(Date.now());
  let pay = payMs ? fmtDate(payMs) : "";
  if (payMs && created && payMs < created) pay = "";
  return { issue, pay };
}

function showMsg(html) {
  document.getElementById("rcRoot").innerHTML = `<div class="rc-msg">${html}</div>`;
}

function paint(r, course, profile, user) {
  const free = !(Number(r.amount) > 0);
  const no = stableReceiptNo(r);
  const pay = unpackPay(r);
  const dates = issueAndPay(r);
  const name = r.studentName || profile?.name || user?.displayName || "Student";
  const email = r.studentEmail || profile?.email || user?.email || "";
  const phone = r.phone || profile?.phone || "";
  const sid = r.studentId || profile?.studentId || "";
  const title = r.courseTitle || course?.title || "Course";
  const sch = course ? formatSchedule(course) : { daysLine: "", timeLine: "" };
  const trainers = Array.isArray(course?.trainerNames) ? course.trainerNames.join(", ") : String(course?.trainerName || "");
  const amt = free ? "Free" : (Number(r.amount) || 0) + " " + (r.currency || "USD");
  const discount = Number(r.discount);
  const hasDisc = Number.isFinite(discount) && discount > 0;
  const method = methodName(r) || (free ? "No payment needed" : "");
  const methodLogo = free ? "" : methodLogoSrc(r);
  const meta = [sch.daysLine, sch.timeLine, trainers].filter(Boolean).join(" · ");
  const data = { free, no, name, email, phone, sid, title, meta, amt, hasDisc, discount, method, methodLogo, pay, dates, currency: r.currency || "USD" };

  document.getElementById("rcRoot").innerHTML = `
    <div class="rc-bar">
      <button type="button" class="rc-dl" id="rcDl">Download PDF</button>
      <button type="button" class="rc-pr" id="rcPr">Print</button>
    </div>
    <article class="rc-page" id="rcPage">
      <header class="rc-band">
        <div class="rc-brand"><img class="rc-logo" src="./logo-receipt.png" alt="GHz Academy"></div>
        <div class="rc-right">
          <h1>PAYMENT RECEIPT</h1>
          <p class="rc-no">${esc(no)}</p>
          <p class="rc-issued">Issue date ${esc(dates.issue)}</p>
        </div>
      </header>
      <div class="rc-body">
        <span class="rc-badge">${free ? "ENROLLMENT CONFIRMED" : "PAID"}</span>
        <div class="rc-grid">
          <div class="rc-box">
            <h2>Billed to</h2>
            ${name ? `<div class="rc-kv"><span class="rc-k">Name</span><span class="rc-v">${esc(name)}</span></div>` : ""}
            ${sid ? `<div class="rc-kv"><span class="rc-k">Student ID</span><span class="rc-v">${esc(sid)}</span></div>` : ""}
            ${email ? `<div class="rc-kv"><span class="rc-k">Email</span><span class="rc-v">${esc(email)}</span></div>` : ""}
            ${phone ? `<div class="rc-kv"><span class="rc-k">Phone</span><span class="rc-v">${esc(phone)}</span></div>` : ""}
          </div>
          <div class="rc-box">
            <h2>Payment details</h2>
            ${method ? `<div class="rc-kv"><span class="rc-k">Method</span><span class="rc-v"><span class="rc-methval">${methodLogo ? `<img class="rc-methlogo" src="${esc(methodLogo)}" alt="">` : ""}<span>${esc(method)}</span></span></span></div>` : ""}
            ${pay.ghz ? `<div class="rc-kv"><span class="rc-k">Reference</span><span class="rc-v mono">${esc(pay.ghz)}</span></div>` : ""}
            ${pay.conf ? `<div class="rc-kv"><span class="rc-k">Confirmation number</span><span class="rc-v">${esc(pay.conf)}</span></div>` : ""}
            ${dates.pay ? `<div class="rc-kv"><span class="rc-k">Payment date</span><span class="rc-v">${esc(dates.pay)}</span></div>` : ""}
            <div class="rc-kv"><span class="rc-k">Status</span><span class="rc-v"><span class="rc-pillok">${free ? "Enrollment confirmed" : "Paid in full"}</span></span></div>
          </div>
        </div>
        <table class="rc-table">
          <thead><tr><th>Description</th><th class="amt">Amount</th></tr></thead>
          <tbody>
            <tr>
              <td>${esc(title)}${meta ? `<p class="rc-meta">${esc(meta)}</p>` : ""}</td>
              <td class="amt">${esc(amt)}</td>
            </tr>
          </tbody>
        </table>
        <p class="rc-note">This receipt confirms your payment and your enrollment.</p>
        <div class="rc-tot">
          <div><span>Subtotal</span><span>${esc(amt)}</span></div>
          ${hasDisc ? `<div><span>Discount</span><span>${esc(discount + " " + (r.currency || "USD"))}</span></div>` : ""}
          <div class="grand"><span>Total</span><span>${esc(amt)}</span></div>
        </div>
        <div class="rc-foot">
          <div>
            <p>Thank you for choosing GHz Academy</p>
            <p>WhatsApp +961 76 908 224 · ghzacademy.com</p>
          </div>
          <p>Page 1 of 1</p>
        </div>
      </div>
    </article>`;

  document.getElementById("rcPr").onclick = () => window.print();
  document.getElementById("rcDl").onclick = () => downloadPdf(data);
}

async function pngData(src) {
  const img = new Image();
  img.crossOrigin = "anonymous";
  await new Promise((ok, err) => { img.onload = ok; img.onerror = err; img.src = src; });
  const c = document.createElement("canvas");
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  c.getContext("2d").drawImage(img, 0, 0);
  return { data: c.toDataURL("image/png"), nw: img.naturalWidth, nh: img.naturalHeight };
}
async function downloadPdf(d) {
  const JsPDF = window.jspdf?.jsPDF;
  if (!JsPDF) return;
  const doc = new JsPDF({ unit: "pt", format: "a4" });
  const W = 595.28;
  const H = 841.89;
  doc.setFillColor(1, 18, 46);
  doc.rect(0, 0, W, 90, "F");
  try {
    const logo = await pngData("./logo-receipt.png");
    const lh = 44;
    const lw = lh * (logo.nw / logo.nh);
    doc.addImage(logo.data, "PNG", 24, (90 - lh) / 2, lw, lh);
  } catch (_) {}
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);
  doc.text("PAYMENT RECEIPT", W - 28, 36, { align: "right" });
  doc.setFontSize(14);
  doc.text(d.no, W - 28, 56, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(201, 212, 227);
  doc.text("Issue date " + fmtDate(Date.now()), W - 28, 72, { align: "right" });

  doc.setFillColor(22, 163, 74);
  const badge = d.free ? "ENROLLMENT CONFIRMED" : "PAID";
  const bw = d.free ? 150 : 52;
  doc.roundedRect(W - 28 - bw, 102, bw, 18, 9, 9, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text(badge, W - 28 - bw / 2, 114, { align: "center" });

  const billed = [
    d.name ? ["NAME", d.name] : null,
    d.sid ? ["STUDENT ID", d.sid] : null,
    d.email ? ["EMAIL", d.email] : null,
    d.phone ? ["PHONE", d.phone] : null
  ].filter(Boolean);
  const pays = [
    d.method ? ["METHOD", d.method, d.methodLogo] : null,
    d.pay.ghz ? ["REFERENCE", d.pay.ghz] : null,
    d.pay.conf ? ["CONFIRMATION NUMBER", d.pay.conf] : null,
    d.dates.pay ? ["PAYMENT DATE", d.dates.pay] : null,
    ["STATUS", d.free ? "Enrollment confirmed" : "Paid in full"]
  ].filter(Boolean);
  const rowsN = Math.max(billed.length, pays.length, 1);
  const cardH = 28 + rowsN * 26;
  const cardY = 130;
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(28, cardY, 255, cardH, 8, 8, "F");
  doc.roundedRect(312, cardY, 255, cardH, 8, 8, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text("BILLED TO", 40, cardY + 16);
  doc.text("PAYMENT DETAILS", 324, cardY + 16);
  const drawKv = async (x, y, lab, val, logoSrc) => {
    doc.setDrawColor(229, 234, 241);
    doc.setLineWidth(0.4);
    doc.line(x, y + 10, x + 231, y + 10);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(lab, x, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(15, 39, 71);
    if (logoSrc) {
      try {
        const ml = await pngData(logoSrc);
        const mh = 18;
        const mw = mh * (ml.nw / ml.nh);
        doc.addImage(ml.data, "PNG", x + 231 - mw - doc.getTextWidth(val) - 8, y - 12, mw, mh);
      } catch (_) {}
    }
    doc.text(val, x + 231, y, { align: "right" });
  };
  for (let i = 0; i < billed.length; i++) await drawKv(40, cardY + 36 + i * 26, billed[i][0], billed[i][1]);
  for (let i = 0; i < pays.length; i++) await drawKv(324, cardY + 36 + i * 26, pays[i][0], pays[i][1], pays[i][2]);

  const ty = cardY + cardH + 18;
  doc.setFillColor(15, 39, 71);
  doc.rect(28, ty, 539, 22, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text("DESCRIPTION", 40, ty + 15);
  doc.text("AMOUNT", 555, ty + 15, { align: "right" });
  doc.setDrawColor(229, 234, 241);
  doc.rect(28, ty + 22, 539, 48);
  doc.setTextColor(15, 39, 71);
  doc.setFontSize(11);
  doc.text(d.title, 40, ty + 40);
  if (d.meta) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(String(d.meta).slice(0, 90), 40, ty + 54);
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 39, 71);
  doc.text(d.amt, 555, ty + 40, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  doc.text("This receipt confirms your payment and your enrollment.", 28, ty + 88);

  let yy = ty + 110;
  doc.setFontSize(11);
  doc.setTextColor(71, 85, 105);
  doc.text("Subtotal", 400, yy);
  doc.text(d.amt, 555, yy, { align: "right" });
  if (d.hasDisc) {
    yy += 16;
    doc.text("Discount", 400, yy);
    doc.text(d.discount + " " + d.currency, 555, yy, { align: "right" });
  }
  yy += 22;
  doc.setDrawColor(15, 39, 71);
  doc.setLineWidth(1.2);
  doc.line(400, yy - 10, 555, yy - 10);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(15, 39, 71);
  doc.text("Total", 400, yy + 8);
  doc.text(d.amt, 555, yy + 8, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text("Thank you for choosing GHz Academy", 28, H - 36);
  doc.text("WhatsApp +961 76 908 224  ·  ghzacademy.com", 28, H - 22);
  doc.text("Page 1 of 1", W - 28, H - 22, { align: "right" });
  doc.save("GHz-Receipt-" + d.no + ".pdf");
}

async function boot() {
  const id = decodeURIComponent((location.hash || "").replace(/^#/, "")).trim();
  if (!id) {
    showMsg("<p>This receipt link is missing.</p><p><a href=\"./student.html#regsv2\">Back to registrations</a></p>");
    return;
  }
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      location.href = "./login.html?next=" + encodeURIComponent("./receipt.html#" + id);
      return;
    }
    try {
      const snap = await getDoc(doc(db, "registrations", id));
      if (!snap.exists()) {
        showMsg("<p>We could not find this receipt.</p><p><a href=\"./student.html#regsv2\">Back to registrations</a></p>");
        return;
      }
      const r = { id: snap.id, ...snap.data() };
      if (r.uid !== user.uid) {
        showMsg("<p>This receipt belongs to another student.</p><p><a href=\"./student.html#regsv2\">Back to registrations</a></p>");
        return;
      }
      let course = {};
      let profile = {};
      try {
        if (r.courseId) {
          const cs = await getDoc(doc(db, "courses", r.courseId));
          if (cs.exists()) course = cs.data();
        }
      } catch (_) {}
      try {
        const us = await getDoc(doc(db, "users", user.uid));
        if (us.exists()) profile = us.data();
      } catch (_) {}
      paint(r, course, profile, user);
    } catch (_) {
      showMsg("<p>We could not open this receipt.</p><p><a href=\"./student.html#regsv2\">Back to registrations</a></p>");
    }
  });
}
boot();
