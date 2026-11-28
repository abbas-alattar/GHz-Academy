import { createElement as e, useState } from "https://esm.sh/react@18.3.1";
import { showConfirmDialog } from "./ConfirmDialog.js";
import { courseStatusLabel } from "./courseStatusLabel.js?v=r2";
import { formatGrade } from "./gradeCalc.js";

const JSPDF = "https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js";
const AUTO = "https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.4/dist/jspdf.plugin.autotable.min.js";

let libs = null;
let logoCache = undefined;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if ([...document.scripts].some((s) => s.src === src)) { resolve(); return; }
    const el = document.createElement("script");
    el.src = src;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error("Could not load PDF library"));
    document.head.appendChild(el);
  });
}

async function ensureLibs() {
  if (libs) return libs;
  await loadScript(JSPDF);
  await loadScript(AUTO);
  libs = window.jspdf || window.jsPDF;
  return libs;
}

async function loadLogoUrl(path) {
  const img = new Image();
  img.crossOrigin = "anonymous";
  const url = new URL(path, location.href).href;
  await new Promise((ok, err) => { img.onload = ok; img.onerror = err; img.src = url; });
  const nw = img.naturalWidth || 260;
  const nh = img.naturalHeight || 70;
  const c = document.createElement("canvas");
  c.width = Math.max(1, nw);
  c.height = Math.max(1, nh);
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return { data: c.toDataURL("image/png"), nw, nh };
}

async function logoPng() {
  if (logoCache !== undefined) return logoCache;
  logoCache = null;
  for (const path of ["./logo-mark.png", "./pdf-logo.png", "./logo.png"]) {
    try {
      logoCache = await loadLogoUrl(path);
      if (logoCache?.data) return logoCache;
    } catch (_) {}
  }
  logoCache = null;
  return logoCache;
}

let gradesLogoCache = undefined;
async function gradesPdfLogo() {
  if (gradesLogoCache !== undefined) return gradesLogoCache;
  gradesLogoCache = null;
  for (const path of ["./grades-pdf-logo.png", "./logo-mark.png", "./logo.png"]) {
    try {
      gradesLogoCache = await loadLogoUrl(path);
      if (gradesLogoCache?.data) return gradesLogoCache;
    } catch (_) {}
  }
  gradesLogoCache = null;
  return gradesLogoCache;
}

function logoBox(logo) {
  const nw = logo?.nw || 260;
  const nh = logo?.nh || 70;
  const lw = 46;
  const lh = Math.max(8, lw * (nh / nw));
  return { lw, lh };
}

function paintModernHeader(doc, logo, title, who, when) {
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  doc.setFillColor(15, 39, 71);
  doc.rect(0, 0, w, 28, "F");
  doc.setFillColor(37, 99, 235);
  doc.rect(0, 28, w, 1.6, "F");
  if (logo?.data) {
    try {
      const { lw, lh } = logoBox(logo);
      doc.addImage(logo.data, "PNG", 12, 8, lw, lh);
    } catch (_) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(255, 255, 255);
      doc.text("GHz Academy", 14, 17);
    }
  } else {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(255, 255, 255);
    doc.text("GHz Academy", 14, 17);
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(255, 255, 255);
  doc.text(String(title || "Report"), w - 14, 12, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(186, 206, 232);
  doc.text(when + " (Beirut)", w - 14, 17.5, { align: "right" });
  doc.text("Prepared by " + who, w - 14, 22.5, { align: "right" });
  doc.setFillColor(248, 250, 252);
  doc.rect(0, h - 14, w, 14, "F");
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.line(0, h - 14, w, h - 14);
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text("GHz Academy  ·  Confidential", 14, h - 6);
}

function beirutNow() {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Beirut", day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: false
    }).format(new Date());
  } catch {
    return new Date().toLocaleString();
  }
}

function statusColor(v) {
  const s = String(v || "");
  if (/confirmed|open|passed|enrolled|active|yes|issued|replied/i.test(s)) return [22, 163, 74];
  if (/review|pending|await|coming/i.test(s)) return [180, 83, 9];
  if (/fail|cancel|reject|no\b/i.test(s)) return [185, 28, 28];
  if (/complet|archiv|read/i.test(s)) return [71, 85, 105];
  return [15, 39, 71];
}

function adminName() {
  return document.getElementById("userName")?.textContent?.trim()
    || window.__ghzLiveName
    || "Admin";
}
export function nameWithId(name, id) {
  const n = String(name || "").trim() || "Student";
  const d = String(id || "").replace(/\D/g, "");
  const sid = d ? d.padStart(7, "0").slice(-7) : "";
  return { name: n, id: sid, label: sid ? n + " (" + sid + ")" : n };
}
function paintNameId(doc, cell, name, id) {
  const x = cell.x + 2, y = cell.y + 4.2, max = cell.width - 4;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(15, 39, 71);
  const lines = doc.splitTextToSize(String(name || "Student"), max);
  lines.forEach((ln, i) => doc.text(ln, x, y + i * 3.4));
  if (id) {
    const last = lines[lines.length - 1] || "";
    const w = doc.getTextWidth(last);
    const idStr = " (" + id + ")";
    if (w + doc.getTextWidth(idStr) <= max) {
      doc.setTextColor(100, 116, 139);
      doc.text(idStr, x + w, y + (lines.length - 1) * 3.4);
    } else {
      doc.setTextColor(100, 116, 139);
      doc.text(idStr.trim(), x, y + lines.length * 3.4);
    }
  }
  doc.setTextColor(15, 39, 71);
}

function writePreparing(win) {
  if (!win || win.closed) return;
  try {
    win.document.open();
    win.document.write("<!DOCTYPE html><title>Preparing PDF...</title><body style=\"font-family:IBM Plex Sans,sans-serif;color:#0F2747;padding:40px\">Preparing PDF...</body>");
    win.document.close();
  } catch (_) {}
}

function showPopupBlocked(url) {
  let bar = document.getElementById("apdfBlocked");
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "apdfBlocked";
    bar.className = "apdf-blocked";
    document.body.appendChild(bar);
  }
  bar.hidden = false;
  bar.innerHTML = "";
  const msg = document.createElement("span");
  msg.textContent = "Allow popups to view the PDF";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "apdf-open-fallback";
  btn.textContent = "Open PDF";
  btn.onclick = () => {
    window.open(url, "_blank");
    bar.hidden = true;
  };
  bar.append(msg, btn);
}

function openPdfInTab(blob, preview) {
  const url = URL.createObjectURL(blob);
  if (preview && !preview.closed) {
    try { preview.location = url; return url; } catch (_) {}
  }
  const w = window.open(url, "_blank");
  if (!w) showPopupBlocked(url);
  return url;
}

export async function exportAdminPdf({
  page = "Report",
  columns = [],
  rows = [],
  filters = "",
  summary = "",
  preparedBy,
  previewWin = null
} = {}) {
  const pack = await ensureLibs();
  const jsPDF = pack.jsPDF || pack.default || window.jspdf?.jsPDF;
  if (!jsPDF) throw new Error("jsPDF missing");
  const cols = columns.filter((c) => c && c.key !== "actions" && String(c.label || "").toLowerCase() !== "actions");
  const landscape = cols.length >= 6;
  const doc = new jsPDF({ orientation: landscape ? "landscape" : "portrait", unit: "mm", format: "a4" });
  const logo = await logoPng();
  const who = preparedBy || adminName();
  const when = beirutNow();
  const title = page + " report";
  const drawChrome = (data) => {
    const w = doc.internal.pageSize.getWidth();
    const h = doc.internal.pageSize.getHeight();
    paintModernHeader(doc, logo, title, who, when);
    const pages = doc.internal.getNumberOfPages();
    doc.text("Page " + data.pageNumber + " of " + pages, w - 14, h - 6, { align: "right" });
  };

  const head = [cols.map((c) => c.label)];
  const body = rows.map((r) => cols.map((c) => {
    const v = r[c.key];
    return v == null || v === "" ? "—" : String(v);
  }));

  doc.autoTable({
    head,
    body,
    startY: 48,
    margin: { top: 36, left: 14, right: 14, bottom: 18 },
    styles: { fontSize: 9, cellPadding: 3, overflow: "linebreak", valign: "middle", textColor: [15, 39, 71] },
    columnStyles: Object.fromEntries(cols.map((c, i) => /student/i.test(c.label) ? [i, { cellWidth: 48, overflow: "linebreak", fontStyle: "normal" }] : []).filter((x) => x.length)),
    headStyles: { fillColor: [15, 39, 71], textColor: [255, 255, 255], fontStyle: "bold", valign: "middle" },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    rowPageBreak: "avoid",
    didDrawPage: (data) => {
      drawChrome(data);
      if (data.pageNumber === 1) {
        doc.setFontSize(9);
        doc.setTextColor(71, 85, 105);
        const line = (filters ? filters + " · " : "") + rows.length + " row" + (rows.length === 1 ? "" : "s");
        doc.text(line, 14, 38);
        if (summary) doc.text(String(summary), 14, 43);
      }
    },
    didParseCell: (data) => {
      if (data.section !== "body") return;
      const col = cols[data.column.index];
      if (!col) return;
      if (/status|result|verified|active/i.test(col.label) || col.tone) {
        const rgb = statusColor(data.cell.raw);
        data.cell.styles.textColor = rgb;
        data.cell.styles.fontStyle = "bold";
      }
    }
  });

  const pages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    const w = doc.internal.pageSize.getWidth();
    const h = doc.internal.pageSize.getHeight();
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text("Page " + i + " of " + pages, w - 14, h - 7, { align: "right" });
  }

  const blob = doc.output("blob");
  openPdfInTab(blob, previewWin);
}

export async function exportStudentProfilePdf({
  student = {},
  details = [],
  courses = [],
  previewWin = null
} = {}) {
  const pack = await ensureLibs();
  const jsPDF = pack.jsPDF || pack.default || window.jspdf?.jsPDF;
  if (!jsPDF) throw new Error("jsPDF missing");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const logo = await logoPng();
  const who = adminName();
  const when = beirutNow();
  const title = "Student profile";
  const drawChrome = chromeDrawer(doc, logo, title, who, when);
  const name = student.name || "Student";
  const sid = student.studentId || "—";
  doc.autoTable({
    startY: 40,
    margin: { top: 36, left: 14, right: 14, bottom: 18 },
    body: [[name], ["ID " + sid], ["Printed " + when]],
    theme: "plain",
    styles: { fontSize: 11, textColor: [15, 39, 71], cellPadding: 1 },
    didDrawPage: drawChrome,
    didParseCell: (data) => {
      if (data.row.index === 0) data.cell.styles.fontStyle = "bold";
      if (data.row.index > 0) data.cell.styles.fontSize = 9;
    }
  });
  const pairs = [];
  for (let i = 0; i < details.length; i += 2) {
    const a = details[i] || { k: "", v: "" };
    const b = details[i + 1] || { k: "", v: "" };
    pairs.push([a.k, a.v, b.k, b.v]);
  }
  doc.autoTable({
    head: [["Student details", "", "", ""]],
    body: pairs.length ? pairs : [["—", "—", "", ""]],
    startY: (doc.lastAutoTable?.finalY || 50) + 6,
    margin: { top: 36, left: 14, right: 14, bottom: 18 },
    styles: { fontSize: 9, cellPadding: 3, textColor: [15, 39, 71] },
    headStyles: { fillColor: [15, 39, 71], textColor: [255, 255, 255], fontStyle: "bold" },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 38 }, 2: { fontStyle: "bold", cellWidth: 38 } },
    didDrawPage: drawChrome
  });
  doc.autoTable({
    head: [["#", "Course", "Trainer(s)", "Enrolled on", "Status"]],
    body: (courses || []).map((c, i) => [String(i + 1), c.title || "—", c.trainers || "—", c.enrolled || "—", courseStatusLabel(c) || "IP"]),
    startY: (doc.lastAutoTable?.finalY || 80) + 8,
    margin: { top: 36, left: 14, right: 14, bottom: 18 },
    styles: { fontSize: 9, cellPadding: 3, textColor: [15, 39, 71] },
    headStyles: { fillColor: [15, 39, 71], textColor: [255, 255, 255], fontStyle: "bold" },
    didDrawPage: (data) => {
      drawChrome(data);
      if (data.pageNumber === 1) {
        doc.setFontSize(9);
        doc.setTextColor(71, 85, 105);
        doc.text("Registered courses", 14, (doc.lastAutoTable?.finalY || 90) - 2);
      }
    },
    didParseCell: (data) => {
      if (data.section !== "body" || data.column.index !== 4) return;
      const rgb = statusColor(data.cell.raw);
      data.cell.styles.textColor = rgb;
      data.cell.styles.fontStyle = "bold";
    }
  });
  const blob = doc.output("blob");
  openPdfInTab(blob, previewWin);
}

function chromeDrawer(doc, logo, title, who, when) {
  return (data) => {
    const w = doc.internal.pageSize.getWidth();
    const h = doc.internal.pageSize.getHeight();
    paintModernHeader(doc, logo, title, who, when);
    const pages = doc.internal.getNumberOfPages();
    doc.text("Page " + data.pageNumber + " of " + pages, w - 14, h - 6, { align: "right" });
  };
}
function paintGradeHeader(doc, logo, when) {
  const w = doc.internal.pageSize.getWidth();
  doc.setFillColor(1, 18, 46);
  doc.rect(0, 0, w, 28, "F");
  doc.setFillColor(37, 99, 235);
  doc.rect(0, 28, w, 1.6, "F");
  if (logo?.data) {
    try {
      const nw = logo.nw || 260, nh = logo.nh || 70;
      const lh = 14;
      const lw = Math.max(18, lh * (nw / Math.max(1, nh)));
      doc.addImage(logo.data, "PNG", 12, (28 - lh) / 2, lw, lh);
    } catch (_) {
      doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(255, 255, 255);
      doc.text("GHz Academy", 14, 17);
    }
  } else {
    doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(255, 255, 255);
    doc.text("GHz Academy", 14, 17);
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  doc.text("Grade report", w - 14, 13, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(186, 206, 232);
  doc.text(String(when || "") + " (Beirut)", w - 14, 20, { align: "right" });
}
function paintGradeFooter(doc) {
  const pages = doc.internal.getNumberOfPages();
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text("GHz Academy  ·  ghzacademy.com", 14, h - 8);
    doc.text("Page " + i + " of " + pages, w - 14, h - 8, { align: "right" });
  }
}
function uniqueTrainer(name) {
  const parts = String(name || "").split(/\s*,\s*/).map((s) => s.trim()).filter(Boolean);
  const seen = new Set();
  const out = [];
  parts.forEach((p) => {
    const k = p.toLowerCase();
    if (!seen.has(k)) { seen.add(k); out.push(p); }
  });
  return out.join(", ") || "—";
}

export async function exportStudentGradesPdf({
  courses = [],
  studentName = "",
  studentId = "",
  previewWin = null
} = {}) {
  const pack = await ensureLibs();
  const jsPDF = pack.jsPDF || pack.default || window.jspdf?.jsPDF;
  if (!jsPDF) throw new Error("jsPDF missing");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const logo = await gradesPdfLogo();
  const when = beirutNow();
  const pageH = doc.internal.pageSize.getHeight();
  const pageW = doc.internal.pageSize.getWidth();
  const bottom = pageH - 18;
  const list = (courses || []).filter((c) => c && c.completed !== false && c.passed != null);
  paintGradeHeader(doc, logo, when);

  const idTxt = studentId ? String(studentId).padStart(7, "0").slice(-7) : "—";
  let y = 38;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, y, pageW - 28, 22, 2, 2, "FD");
  const meta = [
    ["Student name", studentName || "Student", "Report date", when],
    ["Student ID", idTxt, "Courses count", String(list.length)]
  ];
  meta.forEach((row, i) => {
    const yy = y + 7 + i * 8;
    doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(100, 116, 139);
    doc.text(row[0], 18, yy - 2.5);
    doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(15, 39, 71);
    doc.text(String(row[1]), 18, yy + 1.5);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(100, 116, 139);
    doc.text(row[2], pageW / 2 + 4, yy - 2.5);
    doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(15, 39, 71);
    doc.text(String(row[3]), pageW / 2 + 4, yy + 1.5);
  });
  y += 30;

  const chipH = 7.4;
  const chipPadX = 3.7;
  const drawChip = (label, rgb, rightX, midY) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    const tw = doc.getTextWidth(label);
    const cw = tw + chipPadX * 2;
    const cx = rightX - cw;
    const cy = midY - chipH / 2;
    doc.setFillColor(rgb[0], rgb[1], rgb[2]);
    doc.roundedRect(cx, cy, cw, chipH, 1.4, 1.4, "F");
    doc.setTextColor(255, 255, 255);
    doc.text(label, cx + cw / 2, cy + chipH / 2, { align: "center", baseline: "middle" });
    return cw;
  };

  list.forEach((course) => {
    const bodyRows = (course.rows || []).map((r) => [
      r.section == null ? "—" : String(r.section),
      r.weight == null ? "—" : String(r.weight),
      r.score == null ? "—" : String(r.score),
      r.weighted == null ? "—" : String(r.weighted)
    ]);
    bodyRows.push([
      "Final average",
      "100%",
      course.avg == null ? "—" : formatGrade(course.avg),
      course.passed ? "Passed" : "Failed"
    ]);
    const cardH = 18 + 8 + Math.max(1, bodyRows.length) * 8 + 10;
    if (y + cardH > bottom) {
      doc.addPage();
      y = 16;
    }
    const x = 14, w = pageW - 28;
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(x, y, w, cardH, 2, 2, "S");
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(15, 39, 71);
    doc.text(String(course.title || "Course"), x + 4, y + 7);
    drawChip("Completed", [15, 39, 71], x + w - 4, y + 6.5);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(71, 85, 105);
    doc.text(uniqueTrainer(course.trainer), x + 4, y + 13);
    const tableStart = y + 16;
    const tableW = w - 4;
    const numW = tableW * 0.18;
    const padR = 4.23;
    const rowH = 8;
    doc.autoTable({
      head: [["Component", "Weight", "Score", "Weighted"]],
      body: bodyRows,
      startY: tableStart,
      margin: { left: 16, right: 16, bottom: 16, top: tableStart },
      tableWidth: tableW,
      styles: {
        font: "helvetica",
        fontSize: 9,
        cellPadding: { top: 1.8, bottom: 1.8, left: 2, right: padR },
        minCellHeight: rowH,
        overflow: "linebreak",
        valign: "middle",
        textColor: [15, 39, 71],
        halign: "left"
      },
      columnStyles: {
        0: { halign: "left", cellPadding: { top: 1.8, bottom: 1.8, left: 2.2, right: padR } },
        1: { halign: "right", cellWidth: numW, cellPadding: { top: 1.8, bottom: 1.8, left: 2, right: padR } },
        2: { halign: "right", cellWidth: numW, cellPadding: { top: 1.8, bottom: 1.8, left: 2, right: padR } },
        3: { halign: "right", cellWidth: numW, cellPadding: { top: 1.8, bottom: 1.8, left: 2, right: padR } }
      },
      headStyles: {
        fillColor: [241, 245, 249],
        textColor: [71, 85, 105],
        fontStyle: "bold",
        valign: "middle",
        fontSize: 9,
        minCellHeight: rowH
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      pageBreak: "avoid",
      rowPageBreak: "avoid",
      didParseCell: (data) => {
        if (data.section === "head") {
          data.cell.styles.halign = data.column.index === 0 ? "left" : "right";
          data.cell.styles.cellPadding = data.column.index === 0
            ? { top: 1.8, bottom: 1.8, left: 2.2, right: padR }
            : { top: 1.8, bottom: 1.8, left: 2, right: padR };
          return;
        }
        if (data.section !== "body") return;
        const last = data.row.index === bodyRows.length - 1;
        if (last) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fillColor = [241, 245, 249];
          if (data.column.index === 3) {
            data.cell.styles.textColor = [255, 255, 255];
            data.cell.text = [""];
          }
        }
      },
      didDrawCell: (data) => {
        if (data.section !== "body") return;
        if (data.row.index !== bodyRows.length - 1 || data.column.index !== 3) return;
        const pass = /passed/i.test(String(data.cell.raw));
        const label = pass ? "Passed" : "Failed";
        const rgb = pass ? [22, 163, 74] : [185, 28, 28];
        drawChip(label, rgb, data.cell.x + data.cell.width - 1.2, data.cell.y + data.cell.height / 2);
      }
    });
    y = (doc.lastAutoTable ? doc.lastAutoTable.finalY : tableStart) + 8;
  });

  const sumNeed = 12 + (list.length + 1) * 8 + 8;
  if (y + sumNeed > bottom) { doc.addPage(); y = 16; }
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(15, 39, 71);
  doc.text("Summary", 14, y);
  y += 3;
  const sumBody = list.map((c) => [
    String(c.title || "Course"),
    c.avg == null ? "—" : formatGrade(c.avg),
    c.passed ? "Passed" : "Failed"
  ]);
  doc.autoTable({
    head: [["Course", "Average", "Result"]],
    body: sumBody,
    startY: y,
    margin: { left: 14, right: 14, bottom: 16 },
    styles: { font: "helvetica", fontSize: 9, cellPadding: 2.4, overflow: "linebreak", valign: "middle", textColor: [15, 39, 71] },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "center" } },
    headStyles: { fillColor: [15, 39, 71], textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    pageBreak: "avoid",
    rowPageBreak: "avoid",
    didParseCell: (data) => {
      if (data.section !== "body") return;
      if (data.column.index === 2) {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.textColor = /passed/i.test(String(data.cell.raw)) ? [22, 163, 74] : [185, 28, 28];
      }
    }
  });

  paintGradeFooter(doc);
  const blob = doc.output("blob");
  openPdfInTab(blob, previewWin);
}

async function runExport(getData, page, previewWin) {
  const data = typeof getData === "function" ? await getData() : getData;
  await exportAdminPdf({ ...(data || {}), page: (data && data.page) || page, previewWin });
}

export function AdminPdfButton({ page, getData, className, label }) {
  const [busy, setBusy] = useState(false);
  const run = async (ev) => {
    ev?.preventDefault?.();
    const preview = window.open("", "_blank");
    writePreparing(preview);
    if (!preview) showPopupBlocked("about:blank");
    setBusy(true);
    try {
      await runExport(getData, page, preview);
    } catch (err) {
      console.error("pdf", err);
      try { if (preview && !preview.closed) preview.close(); } catch (_) {}
      showConfirmDialog({ title: "Could not create PDF", message: String(err?.message || err), tone: "danger", confirmLabel: "OK" });
    }
    setBusy(false);
  };
  return e("div", { className: "apdf-wrap " + (className || ""), style: { position: "relative", display: "inline-flex" } },
    e("button", {
      type: "button",
      className: "apdf-btn apdf-btn-solo",
      disabled: busy,
      onClick: run
    }, busy ? "Preparing…" : e("span", null,
      e("svg", { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2 },
        e("path", { d: "M6 9V2h12v7" }), e("path", { d: "M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" }),
        e("path", { d: "M6 14h12v8H6z" })),
      " " + (label || "Print / PDF")))
  );
}

export function mountPdfButton(host, getData, page) {
  if (!host) return;
  host.innerHTML = "";
  host.className = (host.className || "") + " apdf-wrap";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "apdf-btn apdf-btn-solo";
  btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><path d="M6 14h12v8H6z"/></svg> Print / PDF`;
  const run = async () => {
    const preview = window.open("", "_blank");
    writePreparing(preview);
    if (!preview) showPopupBlocked("about:blank");
    btn.disabled = true;
    const old = btn.innerHTML;
    btn.textContent = "Preparing…";
    try {
      await runExport(getData, page, preview);
    } catch (err) {
      console.error("pdf", err);
      try { if (preview && !preview.closed) preview.close(); } catch (_) {}
      showConfirmDialog({ title: "Could not create PDF", message: String(err?.message || err), tone: "danger", confirmLabel: "OK" });
    }
    btn.disabled = false;
    btn.innerHTML = old;
  };
  btn.onclick = run;
  host.append(btn);
}

function attStatusTone(st) {
  const s = String(st || "").toLowerCase();
  if (s === "present") return { t: "Present", rgb: [22, 163, 74] };
  if (s === "late") return { t: "Late", rgb: [180, 83, 9] };
  if (s === "absent") return { t: "Absent", rgb: [185, 28, 28] };
  if (s === "excused") return { t: "Excused", rgb: [37, 99, 235] };
  return { t: "Not marked", rgb: [100, 116, 139] };
}
function letterMark(st) {
  const s = String(st || "").toLowerCase();
  if (s === "present") return "P";
  if (s === "late") return "L";
  if (s === "absent") return "A";
  if (s === "excused") return "E";
  return "—";
}

export async function exportAttendanceSessionPdf({
  session = {}, course = {}, trainerName = "", rows = [], counts = {}, rate = "—", duration = "", previewWin = null
} = {}) {
  const pack = await ensureLibs();
  const jsPDF = pack.jsPDF || pack.default || window.jspdf?.jsPDF;
  if (!jsPDF) throw new Error("jsPDF missing");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const logo = await logoPng();
  const who = trainerName || adminName();
  const when = beirutNow();
  const trainers = Array.isArray(course.trainerNames) ? course.trainerNames.join(", ") : (course.trainerName || who);
  const drawChrome = (data) => {
    const w = doc.internal.pageSize.getWidth();
    const h = doc.internal.pageSize.getHeight();
    paintModernHeader(doc, logo, "Attendance report", who, when);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(186, 206, 232);
    doc.text(String(session.title || "Session"), w - 14, 26.2, { align: "right" });
    const pages = doc.internal.getNumberOfPages();
    doc.setTextColor(100, 116, 139);
    doc.text("Page " + data.pageNumber + " of " + pages, w - 14, h - 6, { align: "right" });
  };
  const loc = session.meetingLink || session.notes || "—";
  doc.autoTable({
    startY: 36, margin: { top: 36, left: 14, right: 14, bottom: 18 }, theme: "plain",
    body: [
      ["Course", course.title || "—", "Trainer(s)", trainers || "—"],
      ["Session date", session.fullDate || session.date || "—", "Time", session.timeLine || "—"],
      ["Duration", duration || "—", "Location / link", loc],
      ["Status", courseStatusLabel(course), "", ""]
    ],
    styles: { fontSize: 8, cellPadding: 2.2, textColor: [15, 39, 71], fillColor: [248, 250, 252] },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 32, textColor: [100, 116, 139] }, 2: { fontStyle: "bold", cellWidth: 32, textColor: [100, 116, 139] } },
    didDrawPage: drawChrome
  });
  const chips = "Present " + (counts.present || 0) + "  ·  Late " + (counts.late || 0) + "  ·  Absent " + (counts.absent || 0) + "  ·  Excused " + (counts.excused || 0) + "  ·  Attendance rate " + rate;
  const y0 = (doc.lastAutoTable?.finalY || 60) + 6;
  doc.setFontSize(9); doc.setTextColor(15, 39, 71); doc.text(chips, 14, y0);
  doc.autoTable({
    head: [["#", "Student", "Email", "Status", "In course %", "Absences"]],
    body: rows.map((r, i) => [String(i + 1), nameWithId(r.name, r.id).label, r.email || "—", r.statusLabel || "Not marked", r.pct || "—", String(r.absences ?? "0")]),
    startY: y0 + 4, margin: { top: 34, left: 14, right: 14, bottom: 22 },
    styles: { fontSize: 8, cellPadding: 2.4, textColor: [15, 39, 71], overflow: "linebreak" },
    columnStyles: { 1: { cellWidth: 52, overflow: "linebreak", fontStyle: "normal" } },
    headStyles: { fillColor: [15, 39, 71], textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    didDrawPage: drawChrome,
    didParseCell: (data) => {
      if (data.section !== "body") return;
      if (data.column.index === 1) {
        const ni = nameWithId(rows[data.row.index]?.name, rows[data.row.index]?.id);
        data.cell.text = [ni.label];
        data.cell.styles.minCellHeight = 10;
      }
      if (data.column.index === 3) {
        const rgb = attStatusTone(rows[data.row.index]?.status).rgb;
        data.cell.styles.textColor = rgb;
        data.cell.styles.fontStyle = "bold";
      }
    }
  });
  const pages = doc.internal.getNumberOfPages();
  doc.setPage(pages);
  const h = doc.internal.pageSize.getHeight();
  const y = Math.max((doc.lastAutoTable?.finalY || 80) + 14, h - 28);
  doc.setFontSize(9); doc.setTextColor(71, 85, 105);
  doc.text("Trainer signature ________________    Date ________________", 14, y);
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    const ww = doc.internal.pageSize.getWidth();
    const hh = doc.internal.pageSize.getHeight();
    doc.setFontSize(8); doc.setTextColor(100, 116, 139);
    doc.text("Page " + i + " of " + pages, ww - 14, hh - 7, { align: "right" });
  }
  openPdfInTab(doc.output("blob"), previewWin);
}

export async function exportAttendanceMatrixPdf({
  course = {}, trainerName = "", sessions = [], rows = [], previewWin = null
} = {}) {
  const pack = await ensureLibs();
  const jsPDF = pack.jsPDF || pack.default || window.jspdf?.jsPDF;
  if (!jsPDF) throw new Error("jsPDF missing");
  const landscape = (sessions || []).length > 6;
  const doc = new jsPDF({ orientation: landscape ? "landscape" : "portrait", unit: "mm", format: "a4" });
  const logo = await logoPng();
  const who = trainerName || adminName();
  const when = beirutNow();
  const trainers = Array.isArray(course.trainerNames) ? course.trainerNames.join(", ") : (course.trainerName || who);
  const drawChrome = chromeDrawer(doc, logo, "Attendance report", who, when);
  doc.autoTable({
    startY: 36, margin: { top: 36, left: 14, right: 14, bottom: 18 }, theme: "plain",
    body: [["Course", course.title || "—", "Trainer(s)", trainers || "—"], ["Status", courseStatusLabel(course), "Sessions", String(sessions.length)]],
    styles: { fontSize: 8, cellPadding: 2.2, fillColor: [248, 250, 252], textColor: [15, 39, 71] },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 32, textColor: [100, 116, 139] }, 2: { fontStyle: "bold", cellWidth: 32, textColor: [100, 116, 139] } },
    didDrawPage: drawChrome
  });
  const head = ["Student", ...(sessions.map((s) => (s.shortDate || s.date || "") + "\n" + (s.title || ""))), "%", "Abs"] ;
  const body = rows.map((r) => [nameWithId(r.name, r.id).label, ...(sessions.map((s) => letterMark(r.marks?.[s.id]))), r.pct || "—", String(r.absences ?? "0")]);
  const nameW = Math.min(58, Math.max(42, Math.max(...body.map((b) => String(b[0] || "").length), 12) * 1.7));
  doc.autoTable({
    head: [head], body, startY: (doc.lastAutoTable?.finalY || 50) + 4,
    margin: { top: 36, left: 14, right: 14, bottom: 18 },
    styles: { fontSize: 7.5, cellPadding: 2, textColor: [15, 39, 71], halign: "center", overflow: "linebreak" },
    columnStyles: { 0: { halign: "left", cellWidth: nameW, fontStyle: "normal", overflow: "linebreak" } },
    headStyles: { fillColor: [15, 39, 71], textColor: [255, 255, 255], fontStyle: "bold", valign: "middle" },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    didDrawPage: drawChrome,
    didParseCell: (data) => {
      if (data.section !== "body" || data.column.index === 0) return;
      const i = data.column.index - 1;
      if (i >= 0 && i < sessions.length) {
        const rgb = attStatusTone(rows[data.row.index]?.marks?.[sessions[i].id]).rgb;
        data.cell.styles.textColor = rgb;
        data.cell.styles.fontStyle = "bold";
      }
    }
  });
  const pages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    const w = doc.internal.pageSize.getWidth();
    const h = doc.internal.pageSize.getHeight();
    doc.setFontSize(8); doc.setTextColor(100, 116, 139);
    doc.text("GHz Academy · " + when + " (Beirut)", 14, h - 7);
    doc.text("Page " + i + " of " + pages, w - 14, h - 7, { align: "right" });
  }
  openPdfInTab(doc.output("blob"), previewWin);
}

export function fmtPdfDate(v) {
  try {
    const d = v?.toDate ? v.toDate() : (v ? new Date(v) : null);
    if (!d || isNaN(d)) return "—";
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return dd + "/" + mm + "/" + d.getFullYear();
  } catch { return "—"; }
}
