function tsMs(v) {
  try {
    if (!v) return 0;
    if (v.toMillis) return v.toMillis();
    if (v.toDate) return v.toDate().getTime();
    const t = new Date(v).getTime();
    return isNaN(t) ? 0 : t;
  } catch { return 0; }
}
function fmt(v) {
  const ms = tsMs(v);
  if (!ms) return "—";
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, "0");
  return p(d.getDate()) + "/" + p(d.getMonth() + 1) + "/" + d.getFullYear() + " " + p(d.getHours()) + ":" + p(d.getMinutes());
}
function unpackPay(r) {
  const raw = String(r?.paymentRef || "").trim();
  let conf = raw, ghz = String(r?.paymentReference || r?.transferRef || "").trim();
  if (raw.startsWith("{")) {
    try {
      const o = JSON.parse(raw);
      conf = String(o.conf || "");
      ghz = String(o.ghz || ghz);
    } catch (_) {}
  }
  return { conf, ghz };
}
export function stableReceiptNo(r) {
  if (r?.receiptNo) return String(r.receiptNo);
  const src = String(r?.id || "XXXXX");
  let h = 2166136261;
  for (let i = 0; i < src.length; i++) { h ^= src.charCodeAt(i); h = Math.imul(h, 16777619); }
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let tail = "";
  let n = h >>> 0;
  for (let i = 0; i < 5; i++) { tail += alphabet[n % alphabet.length]; n = Math.floor(n / alphabet.length) || (n ^ 0x9e3779b9); }
  const ms = tsMs(r?.confirmedAt) || tsMs(r?.createdAt) || Date.now();
  const d = new Date(ms);
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return "GHZ-R-" + yy + mm + "-" + tail;
}
export function makeReceiptNo() {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let tail = "";
  for (let i = 0; i < 5; i++) tail += alphabet[Math.floor(Math.random() * alphabet.length)];
  return "GHZ-R-" + yy + mm + "-" + tail;
}

async function loadLogo() {
  for (const path of ["./logo-mark.png", "./pdf-logo.png", "./logo.png"]) {
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise((ok, err) => { img.onload = ok; img.onerror = err; img.src = new URL(path, location.href).href; });
      const nw = img.naturalWidth || 260;
      const nh = img.naturalHeight || 70;
      const c = document.createElement("canvas");
      c.width = nw; c.height = nh;
      c.getContext("2d").drawImage(img, 0, 0, nw, nh);
      return { data: c.toDataURL("image/png"), nw, nh };
    } catch (_) {}
  }
  return null;
}

function openPdfInTab(blob) {
  const url = URL.createObjectURL(blob);
  const w = window.open(url, "_blank");
  if (!w) {
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  return url;
}

export async function downloadReceiptPdf({ reg, course, profile, user }) {
  const preview = window.open("about:blank", "_blank");
  if (preview) {
    try {
      preview.document.write("<!DOCTYPE html><title>Preparing receipt…</title><body style=\"font-family:IBM Plex Sans,sans-serif;color:#0F2747;padding:40px\">Preparing receipt…</body>");
      preview.document.close();
    } catch (_) {}
  }
  const JsPDF = window.jspdf?.jsPDF;
  if (!JsPDF) {
    if (preview) preview.close();
    throw new Error("PDF library missing");
  }
  const r = reg || {};
  const c = course || {};
  const free = !(Number(r.amount) > 0);
  const no = stableReceiptNo(r);
  const pay = unpackPay(r);
  const logo = await loadLogo();
  const doc = new JsPDF({ unit: "mm", format: "a4" });
  const W = 210;
  const H = 297;
  doc.setFillColor(15, 39, 71);
  doc.rect(0, 0, W, 32, "F");
  doc.setFillColor(37, 99, 235);
  doc.rect(0, 32, W, 1.8, "F");
  if (logo?.data) {
    try {
      const lw = 48;
      const lh = Math.max(8, lw * ((logo.nh || 70) / (logo.nw || 260)));
      doc.addImage(logo.data, "PNG", 14, 9, lw, lh);
    } catch (_) {
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text("GHz Academy", 14, 18);
    }
  } else {
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("GHz Academy", 14, 18);
  }
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(free ? "Enrollment receipt" : "Payment receipt", W - 14, 14, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(186, 206, 232);
  doc.text(no, W - 14, 20, { align: "right" });
  if (free) {
    doc.setFillColor(22, 163, 74);
    doc.roundedRect(W - 72, 22.2, 58, 7, 1.5, 1.5, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text("ENROLLMENT CONFIRMED", W - 43, 27, { align: "center" });
  } else {
    doc.setFillColor(22, 163, 74);
    doc.roundedRect(W - 42, 22.2, 28, 7, 1.5, 1.5, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text("PAID", W - 28, 27, { align: "center" });
  }

  const name = r.studentName || profile?.name || user?.displayName || "Student";
  const email = r.studentEmail || profile?.email || user?.email || "";
  const phone = r.phone || profile?.phone || "";
  const sid = r.studentId || profile?.studentId || "";

  doc.setFillColor(248, 250, 252);
  doc.roundedRect(14, 42, 88, 38, 2, 2, "F");
  doc.roundedRect(108, 42, 88, 38, 2, 2, "F");
  doc.setTextColor(100, 116, 139);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("BILLED TO", 18, 50);
  doc.text("RECEIPT DETAILS", 112, 50);
  doc.setTextColor(15, 39, 71);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text([name, sid ? "ID " + sid : "", email, phone].filter(Boolean), 18, 58);
  doc.text([
    "Issued  " + fmt(new Date()),
    "Paid  " + fmt(r.paymentSubmittedAt || r.paymentDate),
    "Method  " + (r.paymentMethod || (free ? "Free" : "—")),
    "Ref  " + (pay.ghz || "—"),
    pay.conf ? "Conf  " + pay.conf : ""
  ].filter(Boolean), 112, 58);

  const y0 = 92;
  doc.setFillColor(15, 39, 71);
  doc.rect(14, y0, 182, 10, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Description", 18, y0 + 7);
  doc.text("Qty", 148, y0 + 7);
  doc.text("Amount", 172, y0 + 7);
  const title = r.courseTitle || c.title || "Course";
  const dates = String(c.schedule || "");
  const trainers = Array.isArray(c.trainerNames) ? c.trainerNames.join(", ") : String(c.trainerName || "");
  doc.setTextColor(15, 39, 71);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(title, 18, y0 + 20);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  const sub = [dates, trainers].filter(Boolean).join(" · ").slice(0, 90);
  if (sub) doc.text(sub, 18, y0 + 26);
  doc.setTextColor(15, 39, 71);
  doc.setFontSize(10);
  doc.text("1", 150, y0 + 20);
  const amt = free ? "Free" : (Number(r.amount) || 0) + " " + (r.currency || "USD");
  doc.setFont("helvetica", "bold");
  doc.text(amt, 172, y0 + 20);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.4);
  doc.line(14, y0 + 34, 196, y0 + 34);
  doc.setFontSize(11);
  doc.text("Total", 148, y0 + 44);
  doc.text(amt, 172, y0 + 44);

  doc.setFillColor(248, 250, 252);
  doc.rect(0, H - 18, W, 18, "F");
  doc.setDrawColor(226, 232, 240);
  doc.line(0, H - 18, W, H - 18);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text("Thank you for choosing GHz Academy  ·  " + no, 14, H - 10);
  doc.text("Page 1 of 1", W - 14, H - 10, { align: "right" });
  doc.text("WhatsApp +961 76 908 224  ·  hello@ghzacademy.com", 14, H - 5);

  const blob = doc.output("blob");
  const url = URL.createObjectURL(blob);
  if (preview && !preview.closed) {
    try { preview.location = url; return; } catch (_) {}
  }
  openPdfInTab(blob);
}
