import { createElement as e, useEffect, useRef, useState, Component } from "https://esm.sh/react@18.3.1";
import { createRoot } from "https://esm.sh/react-dom@18.3.1/client";
import { auth, db } from "./firebase-config.js?v=auth8";
import {
  collection, query, where, getDocs, getDoc, doc, addDoc, setDoc, updateDoc, deleteDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { ConfirmDialog, showNoticeDialog } from "./ConfirmDialog.js";
import { formatCourseDate } from "./courseDates.js";
import { courseStatusLabel } from "./courseStatusLabel.js";

const roots = new WeakMap();
const TYPES = [
  { id: "syllabus", label: "Syllabus", ico: "📘", col: "#2563EB" },
  { id: "reading", label: "Readings", ico: "📖", col: "#0EA5E9" },
  { id: "book", label: "Books", ico: "📚", col: "#7C3AED" },
  { id: "slides", label: "Slides", ico: "🖥", col: "#D97706" },
  { id: "video", label: "Videos", ico: "▶", col: "#DC2626" },
  { id: "link", label: "Links", ico: "↗", col: "#16A34A" },
  { id: "note", label: "Notes", ico: "📝", col: "#64748B" }
];
const OKEXT = /^(pdf|docx?|pptx?|xlsx?|txt|zip|png|jpe?g|gif|webp)$/i;
const MAX = 600 * 1024;
const VIEW_MAX = 5 * 1024 * 1024;
const TABS = ["materials", "sessions", "overview"];
const VIEW_ONLY_MSG = "View only works for PDFs up to 80 pages, with each page under 900 KB.";
const VIEW_NOTE = "PDF up to 5 MB, 80 pages max (converted to protected pages)";

async function delIfExists(col, id) {
  const path = col + "/" + id;
  try {
    const ref = doc(db, col, id);
    const snap = await getDoc(ref);
    if (!snap.exists()) return path;
    await deleteDoc(ref);
    return path;
  } catch (ex) {
    throw Object.assign(new Error((ex?.code || ex?.message || "error") + " at " + path), { code: ex?.code, path });
  }
}
async function deleteMaterialPages(materialId, pageCount) {
  const n = Math.max(0, Number(pageCount) || 0);
  for (let i = 0; i < n; i++) {
    await delIfExists("materialPages", materialId + "_" + i);
  }
}

async function pdfPagesFromFile(file, onProgress) {
  if (!file || !/pdf/i.test(file.type || file.name || "")) throw new Error(VIEW_ONLY_MSG);
  let pdfjs;
  try { pdfjs = await import("https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.min.mjs"); }
  catch (err) { throw new Error(err?.message || "Could not load PDF tools"); }
  pdfjs.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs";
  const buf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  if (pdf.numPages > 80) throw new Error(VIEW_ONLY_MSG);
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    if (onProgress) onProgress(i, pdf.numPages);
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
    let q = 0.75;
    let dataUrl = canvas.toDataURL("image/jpeg", q);
    while (dataUrl.length > 900 * 1024 * 1.37 && q > 0.2) {
      q -= 0.1;
      dataUrl = canvas.toDataURL("image/jpeg", q);
    }
    if (dataUrl.length > 900 * 1024 * 1.37) throw new Error(VIEW_ONLY_MSG);
    pages.push(dataUrl);
  }
  return pages;
}

function ensureCss() {
  if (document.getElementById("cc1-css")) return;
  const l = document.createElement("link");
  l.id = "cc1-css"; l.rel = "stylesheet"; l.href = "./CourseContentV1.css";
  document.head.appendChild(l);
}
class Boundary extends Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err) { console.error("CourseContentV1", err); }
  render() {
    if (this.state.err) {
      const code = this.state.err?.code || this.state.err?.message || "error";
      return e("div", { className: "cc1" }, e("p", { className: "cc1-err" }, String(code)),
        e("button", { type: "button", className: "cc1-add", onClick: this.props.onRetry }, "Try again"));
    }
    return this.props.children;
  }
}
const withTimeout = (p, ms = 10000) => Promise.race([
  p, new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error("timeout"), { code: "timeout" })), ms))
]);
function fmtSize(n) {
  const x = Number(n);
  if (!Number.isFinite(x) || x <= 0) return "";
  return x < 1024 ? x + " B" : Math.round(x / 1024) + " KB";
}
function fmtDate(v) { return formatCourseDate(v); }
function showDate(v) { return formatCourseDate(v) || "To be announced"; }
function colonTime(raw) {
  let t = String(raw || "").trim();
  if (!t) return "";
  t = t.replace(/\b([01]?\d|2[0-3])([0-5]\d)\b/g, (m, h, mm) => (m.indexOf(":") >= 0 ? m : (h + ":" + mm)));
  t = t.replace(/(\d{1,2}):(\d{2})/g, (_, h, mm) => h + ":" + mm);
  t = t.replace(/,\s*Beirut time/i, " (Beirut time)");
  t = t.replace(/\s+-\s+/g, " – ");
  return t;
}
function sessionRange(list) {
  const s = (list || []).find((x) => x.startTime || x.endTime);
  if (!s) return "";
  const a = colonTime(s.startTime), b = colonTime(s.endTime);
  return [a, b].filter(Boolean).join(" – ");
}
function lastSessionDate(list) {
  const dates = (list || []).map((x) => x.date).filter(Boolean).sort();
  return dates.length ? dates[dates.length - 1] : "";
}
function initials(n) {
  const p = String(n || "").split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] || "") + (p[1]?.[0] || "")).toUpperCase() || "?";
}
function typeMeta(id) { return TYPES.find((t) => t.id === id) || TYPES[1]; }
function fileKind(it) {
  const mime = String(it.mimeType || "").toLowerCase();
  const fn = String(it.fileName || "").toLowerCase();
  const t = String(it.type || "").toLowerCase();
  const blob = mime + " " + fn;
  if ((it.link && !it.hasFile) || t === "link") return { lab: "LINK", col: "#16A34A" };
  if (t === "video" || mime.startsWith("video")) return { lab: "VID", col: "#7C3AED" };
  if (t === "slides" || /ppt|presentation/.test(blob)) return { lab: "PPT", col: "#D97706" };
  if (/pdf/.test(blob)) return { lab: "PDF", col: "#DC2626" };
  if (/word|msword|docx?/.test(blob)) return { lab: "DOC", col: "#2563EB" };
  if (t === "note" || /txt|plain/.test(blob)) return { lab: "NOTE", col: "#64748B" };
  if (t === "book" || t === "reading" || t === "syllabus") return { lab: "PDF", col: "#DC2626" };
  return { lab: "FILE", col: "#64748B" };
}
function namesFromCourse(c) {
  if (!c) return [];
  const ids = [].concat(c.trainerIds || c.trainerId || []).filter(Boolean).map(String);
  const listed = Array.isArray(c.trainerNames) ? c.trainerNames : [];
  if (ids.length) return ids.map((id, i) => ({ id, name: String(listed[i] || "").trim() }));
  return listed.map((n, i) => ({ id: "n" + i, name: String(n || "").trim() })).filter((p) => p.name);
}
function displayTrainerName(n) {
  const s = String(n || "").trim();
  if (!s || /^trainer$/i.test(s)) return "Trainer to be announced";
  return s;
}
function looksLikePrefix(n) {
  const s = String(n || "").trim();
  if (!s) return true;
  if (s.includes("@")) return true;
  if (!/\s/.test(s)) return true;
  return false;
}
function nameFromCourseTrainers(course, uid) {
  const people = namesFromCourse(course);
  const hit = people.find((p) => String(p.id) === String(uid));
  const n = String(hit?.name || "").trim();
  if (n && !looksLikePrefix(n)) return n;
  const any = people.map((p) => String(p.name || "").trim()).find((x) => x && !looksLikePrefix(x));
  return any || "";
}
function materialAuthorName(it, course, liveName) {
  const stored = String(it?.createdByName || "").trim();
  if (stored && !looksLikePrefix(stored)) return stored;
  const fromCourse = nameFromCourseTrainers(course, it?.createdBy);
  if (fromCourse) return fromCourse;
  const live = String(liveName || "").trim();
  if (live && !looksLikePrefix(live)) return live;
  return "Trainer";
}
function toastMsg(text) {
  let el = document.getElementById("cc1-toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "cc1-toast";
    el.className = "cc1-toast";
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.classList.add("on");
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove("on"), 3200);
}
function mimeOf(it, d) {
  return String((d && d.mimeType) || it.mimeType || "").toLowerCase();
}
function nameOf(it, d) {
  return String((d && d.fileName) || it.fileName || "file");
}
function kindFromNameMime(name, mime) {
  const n = String(name || "").toLowerCase();
  const m = String(mime || "").toLowerCase();
  const blob = m + " " + n;
  if (/pdf/.test(blob) || /\.pdf$/.test(n)) return "pdf";
  if (/^image\/|\.(png|jpe?g|gif|webp|svg)$/.test(blob)) return "image";
  if (/^text\/|\.(txt|csv|md)$/.test(blob)) return "text";
  if (/^audio\//.test(blob)) return "audio";
  if (/^video\//.test(blob)) return "video";
  if (/\.docx$/.test(n) || /wordprocessingml\.document/.test(m)) return "docx";
  if (/\.doc$/.test(n) || (m === "application/msword")) return "office";
  if (/presentationml|ms-powerpoint|\.pptx?$/.test(blob)) return "office";
  if (/spreadsheetml|ms-excel|\.xlsx?$/.test(blob)) return "office";
  return "other";
}
function escHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function b64ToArrayBuffer(data) {
  const raw = String(data || "");
  const comma = raw.indexOf(",");
  const b64 = /base64/i.test(raw.slice(0, Math.max(0, comma))) && comma >= 0 ? raw.slice(comma + 1) : (comma >= 0 ? raw.slice(comma + 1) : raw);
  const bin = atob(b64.replace(/\s/g, ""));
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr.buffer;
}
function downloadHref(blobUrl, fileName) {
  return "<a class='cc1-dlbtn' href='" + escHtml(blobUrl) + "' download='" + escHtml(fileName || "file") + "'>Download</a>";
}
function officeFallbackHtml(title, fileName, blobUrl, errMsg) {
  const t = escHtml(title || fileName || "File");
  const err = errMsg ? "<p class='cc1-errnote'>" + escHtml(errMsg) + "</p>" : "";
  return "<!DOCTYPE html><html><head><meta charset='utf-8'><title>" + t + "</title><link rel='preconnect' href='https://fonts.googleapis.com'><link href='https://fonts.googleapis.com/css2?family=Figtree:wght@400;600;700&display=swap' rel='stylesheet'><style>html,body{margin:0;background:#F4F7FB;min-height:100%;font-family:Figtree,system-ui,sans-serif;color:#0F2747} .wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:32px 20px} .card{background:#fff;max-width:440px;width:100%;border-radius:16px;padding:36px 28px;text-align:center;box-shadow:0 10px 32px rgba(15,39,71,.08)} .ico{width:56px;height:56px;margin:0 auto 16px;border-radius:14px;background:#EEF3FB;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:700;color:#2563EB} h1{font-size:20px;margin:0 0 8px;line-height:1.3} p{margin:0;color:#64748B;font-size:15px;line-height:1.5} .cc1-dlbtn{display:inline-block;margin-top:20px;background:#2563EB;color:#fff;text-decoration:none;padding:10px 18px;border-radius:10px;font-weight:600;font-size:14px} .cc1-errnote{margin-top:14px;font-size:12px;color:#94A3B8}</style></head><body><div class='wrap'><div class='card'><div class='ico' aria-hidden='true'>DOC</div><h1>" + t + "</h1><p>Preview is not available for this file type</p>" + err + downloadHref(blobUrl, fileName) + "</div></div></body></html>";
}
function docxPreviewHtml(title, fileName, html, blobUrl) {
  const t = escHtml(title || fileName || "Document");
  return "<!DOCTYPE html><html><head><meta charset='utf-8'><title>" + t + "</title><link rel='preconnect' href='https://fonts.googleapis.com'><link href='https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&display=swap' rel='stylesheet'><style>html,body{margin:0;background:#EEF2F7;color:#0F2747;font-family:Figtree,system-ui,sans-serif;font-size:16px;line-height:1.65} header{position:sticky;top:0;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 24px;background:#fff;border-bottom:1px solid #E5EAF1} header h1{margin:0;font-size:16px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap} .cc1-dlbtn{flex:none;background:#2563EB;color:#fff;text-decoration:none;padding:8px 14px;border-radius:10px;font-weight:600;font-size:13px} .page{max-width:820px;margin:28px auto 48px;background:#fff;padding:40px 44px;border-radius:4px;box-shadow:0 8px 28px rgba(15,39,71,.08)} .page h1,.page h2,.page h3{line-height:1.3;margin:1.2em 0 .5em} .page p{margin:0 0 .85em} .page img{max-width:100%;height:auto} .page table{border-collapse:collapse;width:100%;margin:1em 0;font-size:14px} .page td,.page th{border:1px solid #E5EAF1;padding:8px 10px;text-align:left} .page ul,.page ol{margin:0 0 1em;padding-left:1.3em}</style></head><body><header><h1>" + t + "</h1>" + downloadHref(blobUrl, fileName) + "</header><article class='page'>" + html + "</article></body></html>";
}
function writeTab(win, html, title) {
  try {
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.document.title = title || "Preview";
  } catch (_) {}
}
async function loadMammoth() {
  if (window.mammoth) return window.mammoth;
  await new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.8.0/mammoth.browser.min.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Could not load preview tools"));
    document.head.appendChild(s);
  });
  if (!window.mammoth) throw new Error("Could not load preview tools");
  return window.mammoth;
}
async function showInline(win, blob, mime, title, fileName, rawB64) {
  const kind = kindFromNameMime(fileName, mime);
  const t = title || fileName || "File";
  const url = URL.createObjectURL(blob);
  if (kind === "docx") {
    try {
      const lib = await loadMammoth();
      const buf = rawB64 != null ? b64ToArrayBuffer(rawB64) : await blob.arrayBuffer();
      const res = await lib.convertToHtml({ arrayBuffer: buf });
      writeTab(win, docxPreviewHtml(t, fileName, res.value || "", url), t);
      return;
    } catch (ex) {
      writeTab(win, officeFallbackHtml(t, fileName, url, ex?.message || ex?.code || String(ex)), t);
      return;
    }
  }
  if (kind === "office" || kind === "other") {
    writeTab(win, officeFallbackHtml(t, fileName, url, ""), t);
    return;
  }
  try {
    win.location.replace(url);
    setTimeout(() => { try { win.document.title = t; } catch (_) {} }, 200);
  } catch (_) {
    win.location.href = url;
  }
}
function b64toBlob(data, mime) {
  const raw = String(data || "");
  const comma = raw.indexOf(",");
  const b64 = comma >= 0 ? raw.slice(comma + 1) : raw;
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime || "application/octet-stream" });
}
function setTabHash(courseId, tab) {
  const base = "#course/" + courseId + "/" + tab;
  if (location.hash !== base) history.replaceState(null, "", base);
}
function TabErr({ code, onRetry }) {
  return e("div", { className: "cc1-err" }, String(code || "error"), " ",
    e("button", { type: "button", className: "cc1-add", onClick: onRetry }, "Try again"));
}

function ModalForm({ courseId, user, name, row, onSaved, onClose, course }) {
  const [title, setTitle] = useState(row?.title || "");
  const [description, setDescription] = useState(row?.description || "");
  const [type, setType] = useState(row?.type || "reading");
  const [chapter, setChapter] = useState(row?.chapter || "");
  const [link, setLink] = useState(row?.link || "");
  const [visible, setVisible] = useState(row ? !!row.visible : true);
  const [viewOnly, setViewOnly] = useState(!!row?.viewOnly);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [drag, setDrag] = useState(false);
  const pick = (f) => {
    if (!f) return;
    const cap = viewOnly ? VIEW_MAX : MAX;
    if (f.size > cap) {
      setErr(viewOnly ? VIEW_NOTE : "Files up to 600 KB. Use a link for larger files.");
      setFile(null); return;
    }
    if (viewOnly && !/pdf/i.test((f.type || "") + " " + f.name)) { setErr(VIEW_ONLY_MSG); setFile(null); return; }
    if (!OKEXT.test((f.name.split(".").pop() || ""))) { setErr("Allowed: PDF, Word, PowerPoint, Excel, images, text, zip."); return; }
    setErr(""); setFile(f);
  };
  const turningOff = !!row?.viewOnly && !viewOnly;
  const canSave = title.trim() && (file || link.trim() || (row && (row.hasFile || row.link || row.viewOnly) && !turningOff) || (viewOnly && file));
  const save = async () => {
    if (!canSave) return;
    if (viewOnly && !file && !row?.viewOnly) { setErr(VIEW_ONLY_MSG); return; }
    if (turningOff && !file) { setErr("Upload the file again after turning View only off."); return; }
    setBusy("Saving…"); setErr("");
    let mid = row?.id || "";
    let failPath = "courseMaterials";
    let timer = null;
    let timedOut = false;
    try {
      let pages = null;
      if (viewOnly && file) {
        pages = await pdfPagesFromFile(file, (cur, tot) => setBusy("Preparing pages " + cur + "/" + tot));
      }
      const hasFile = viewOnly ? false : !!(file || (row?.hasFile && !link.trim()));
      const pageCount = viewOnly ? Number(pages ? pages.length : (row?.pageCount || 0)) : 0;
      const meta = {
        courseId: row?.courseId || courseId,
        title: title.trim(),
        description: description.trim(),
        type,
        chapter: chapter.trim(),
        link: viewOnly ? "" : link.trim(),
        fileName: file ? file.name : (row?.fileName || ""),
        mimeType: file ? (file.type || "") : (row?.mimeType || ""),
        size: Number(file ? file.size : (row?.size || 0)) || 0,
        hasFile: !!hasFile,
        viewOnly: !!viewOnly,
        pageCount,
        visible: !!visible,
        order: Number(row?.order || Date.now()),
        createdBy: row?.createdBy || user.uid,
        createdByName: materialAuthorName({ createdBy: row?.createdBy || user.uid, createdByName: name }, course, name),
        createdAt: row?.createdAt || serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      const writes = (async () => {
        failPath = mid ? ("courseMaterials/" + mid) : "courseMaterials";
        if (row?.id) {
          await updateDoc(doc(db, "courseMaterials", row.id), meta);
          mid = row.id;
        } else {
          const ref = await addDoc(collection(db, "courseMaterials"), meta);
          mid = ref.id;
          failPath = "courseMaterials/" + mid;
        }
        if (viewOnly && pages) {
          try { await deleteDoc(doc(db, "materialFiles", mid)); } catch (_) {}
          await deleteMaterialPages(mid, Math.max(pages.length, row?.pageCount || 0));
          for (let i = 0; i < pages.length; i++) {
            failPath = "materialPages/" + mid + "_" + i;
            await setDoc(doc(db, "materialPages", mid + "_" + i), {
              materialId: mid, courseId, index: i, data: pages[i], createdAt: serverTimestamp()
            });
          }
        } else if (!viewOnly && file) {
          setBusy("Uploading file…");
          await deleteMaterialPages(mid, row?.pageCount || 0);
          const data = await new Promise((res, rej) => {
            const r = new FileReader();
            r.onload = () => res(r.result);
            r.onerror = () => rej(new Error("read"));
            r.readAsDataURL(file);
          });
          failPath = "materialFiles/" + mid;
          await setDoc(doc(db, "materialFiles", mid), {
            materialId: mid, courseId, fileName: file.name, mimeType: file.type || "", size: file.size, data, updatedAt: serverTimestamp()
          });
        } else if (turningOff) {
          await deleteMaterialPages(mid, row?.pageCount || 0);
        }
      })();
      timer = setTimeout(() => {
        timedOut = true;
        setErr("Saving is taking longer than expected");
        setBusy("");
      }, 30000);
      await writes;
      if (timedOut) return;
      const saved = Object.assign({}, row || {}, meta, { id: mid, createdAt: row?.createdAt || null, updatedAt: Date.now() });
      onSaved(saved);
      showNoticeDialog({ title: "Saved", tone: "ok", message: "Material saved." });
    } catch (ex) {
      if (!row && mid) { try { await deleteDoc(doc(db, "courseMaterials", mid)); } catch (_) {} }
      setErr((ex?.code || ex?.message || "error") + " · " + failPath);
    } finally {
      if (timer) clearTimeout(timer);
      setBusy("");
    }
  };
  return e("div", { className: "cc1-scrim", onClick: (ev) => { if (ev.target === ev.currentTarget && !busy) onClose(); } },
    e("div", { className: "cc1-dlg", role: "dialog", "aria-modal": "true" },
      e("h3", null, row ? "Edit material" : "Add material"),
      e("label", null, "File"),
      e("div", {
        className: "cc1-drop" + (drag ? " on" : ""),
        onDragOver: (ev) => { ev.preventDefault(); setDrag(true); },
        onDragLeave: () => setDrag(false),
        onDrop: (ev) => { ev.preventDefault(); setDrag(false); pick(ev.dataTransfer.files?.[0]); },
        onClick: () => document.getElementById("cc1file")?.click()
      }, file ? (file.name + " · " + fmtSize(file.size)) : "Drop a file here or click to browse"),
      e("input", { id: "cc1file", type: "file", hidden: true, onChange: (ev) => pick(ev.target.files?.[0]) }),
      file ? e("button", { type: "button", className: "cc1-cancel", onClick: () => setFile(null) }, "Remove file") : null,
      e("p", { className: "cc1-note" }, viewOnly ? VIEW_NOTE : "Files up to 600 KB. Use a link for larger files."),
      e("label", null, "Or paste a link", e("input", { value: link, placeholder: "https://", onChange: (ev) => setLink(ev.target.value) })),
      e("label", null, "Title", e("input", { value: title, onChange: (ev) => setTitle(ev.target.value) })),
      e("label", null, "Description", e("textarea", { rows: 3, value: description, onChange: (ev) => setDescription(ev.target.value) })),
      e("label", null, "Type", e("select", { value: type, onChange: (ev) => setType(ev.target.value) },
        TYPES.map((t) => e("option", { key: t.id, value: t.id }, t.ico + " " + t.label)))),
      e("label", null, "Chapter / week", e("input", { placeholder: "Chapter 3 or Week 2", value: chapter, onChange: (ev) => setChapter(ev.target.value) })),
      e("label", { className: "cc1-tog" }, e("input", { type: "checkbox", checked: visible, onChange: (ev) => setVisible(ev.target.checked) }), e("span", null, "Visible to students")),
      e("div", { className: "cc1-togwrap" },
        e("label", { className: "cc1-tog" }, e("input", { type: "checkbox", checked: viewOnly, onChange: (ev) => setViewOnly(ev.target.checked) }), e("span", null, "View only (students cannot download)")),
        e("p", { className: "cc1-help" }, viewOnly ? VIEW_NOTE : "Students can download the original file.")
      ),
      row?.viewOnly && row?.pagesClean !== true ? e("p", { className: "cc1-note" }, "Re-upload to remove old watermark") : null,
      turningOff ? e("p", { className: "cc1-note" }, "Turning View only off removes the pages. Upload the file again.") : null,
      busy ? e("p", null, busy) : null,
      err ? e("p", { className: "cc1-err" }, err,
        err === "Saving is taking longer than expected" ? e("button", { type: "button", className: "cc1-add", style: { marginLeft: 8 }, onClick: save }, "Retry") : null) : null,
      e("div", { className: "cc1-dlgfoot" },
        e("button", { type: "button", className: "cc1-cancel", onClick: onClose }, "Cancel"),
        e("button", { type: "button", className: "cc1-add", disabled: !canSave || !!busy, onClick: save }, busy || "Save")
      )
    )
  );
}

function Materials({ courseId, canEdit, items, err, onRetry, onChanged, user, name, course }) {
  const [q, setQ] = useState("");
  const [chip, setChip] = useState("all");
  const [form, setForm] = useState(null);
  const [busyId, setBusyId] = useState("");
  const [del, setDel] = useState(null);
  const [menu, setMenu] = useState("");
  const [openG, setOpenG] = useState(null);
  const openView = (it) => {
    window.open("./material-view.html#view/" + encodeURIComponent(it.id), "_blank", "noopener");
  };
  const openFile = async (it, download) => {
    if (it.viewOnly) { openView(it); return; }
    if (it.link && !it.hasFile) { window.open(it.link, "_blank", "noopener"); return; }
    let win = null;
    if (!download) {
      win = window.open("about:blank", "_blank");
      if (!win) { toastMsg("Allow popups to open the file"); return; }
      try { win.document.title = it.title || "Loading…"; win.document.body.innerHTML = "<p style='font-family:system-ui;padding:24px;color:#64748B'>Loading…</p>"; } catch (_) {}
    }
    setBusyId(it.id + (download ? "d" : "o"));
    try {
      const snap = await withTimeout(getDoc(doc(db, "materialFiles", it.id)));
      if (!snap.exists()) throw Object.assign(new Error("not-found"), { code: "not-found" });
      const d = snap.data();
      const mime = mimeOf(it, d) || "application/octet-stream";
      const fileName = nameOf(it, d);
      const blob = b64toBlob(d.data, mime);
      if (download) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        a.remove();
      } else {
        await showInline(win, blob, mime, it.title || fileName, fileName, d.data);
      }
    } catch (ex) {
      const msg = ex?.code || ex?.message || "Could not open the file";
      toastMsg(msg);
      if (win && !win.closed) {
        try { writeTab(win, "<!DOCTYPE html><html><body style='font-family:system-ui;padding:40px'><p>" + String(msg).replace(/&/g, "&").replace(/</g, "<") + "</p></body></html>", it.title || "Error"); } catch (_) {}
      }
    }
    setBusyId("");
  };
  const toggleVis = async (it) => {
    try { await updateDoc(doc(db, "courseMaterials", it.id), { visible: !it.visible, updatedAt: serverTimestamp() }); onChanged(); }
    catch (ex) { alert(ex?.code || ex?.message); }
  };
  const doDel = async () => {
    const it = del;
    if (!it?.id) return;
    let failPath = "courseMaterials/" + it.id;
    try {
      const run = (async () => {
        if (it.viewOnly) {
          failPath = "materialPages/" + it.id + "_0";
          await deleteMaterialPages(it.id, Number(it.pageCount) || 0);
        } else if (it.hasFile) {
          failPath = "materialFiles/" + it.id;
          await delIfExists("materialFiles", it.id);
        }
        failPath = "courseMaterials/" + it.id;
        await deleteDoc(doc(db, "courseMaterials", it.id));
      })();
      await Promise.race([
        run,
        new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error("timeout at " + failPath), { code: "timeout", path: failPath })), 20000))
      ]);
      setDel(null);
      onChanged({ id: it.id, _removed: true });
      showNoticeDialog({ title: "Deleted", message: "The material was removed.", tone: "ok" });
    } catch (ex) {
      const path = ex?.path || failPath;
      throw Object.assign(new Error((ex?.code || ex?.message || "error") + (path ? " (" + path + ")" : "")), { code: ex?.code, path });
    }
  };
  const counts = { all: items.length };
  TYPES.forEach((t) => { counts[t.id] = items.filter((x) => x.type === t.id).length; });
  let list = items;
  if (chip !== "all") list = list.filter((x) => x.type === chip);
  const s = q.trim().toLowerCase();
  if (s) list = list.filter((x) => (x.title + " " + x.description + " " + x.chapter).toLowerCase().includes(s));
  const syllabus = list.filter((x) => x.type === "syllabus");
  const rest = list.filter((x) => x.type !== "syllabus");
  const groups = {};
  rest.forEach((it) => { const g = it.chapter || "General"; (groups[g] = groups[g] || []).push(it); });
  const gKeys = Object.keys(groups).sort();
  const firstG = openG == null ? gKeys[0] : openG;
  const row = (it) => {
    const fk = fileKind(it);
    const isLink = !!(it.link && !it.hasFile);
    return e("article", { key: it.id, className: "cc1-row" + (it.visible ? "" : " hid") + (it.type === "syllabus" ? " syl" : ""), style: { position: "relative" } },
      e("div", { className: "cc1-sq", style: { background: fk.col } }, fk.lab),
      e("div", { className: "cc1-main" },
        e("h3", null, String(it.title == null ? "" : it.title), it.viewOnly ? e("span", { className: "cc1-lock" }, "🔒 View only") : null, !it.visible && canEdit ? e("span", { className: "cc1-hidp" }, "Hidden") : null),
        it.description ? e("p", { className: "cc1-desc" }, String(it.description)) : null,
        e("p", { className: "cc1-meta" }, [
          it.viewOnly ? (Number(it.pageCount || 0) === 1 ? "1 page" : (Number(it.pageCount || 0) || 0) + " pages") : fmtSize(it.size),
          fmtDate(it.createdAt),
          materialAuthorName(it, course, name)
        ].filter(Boolean).join(" · "))
      ),
      e("div", { className: "cc1-right" },
        it.viewOnly
          ? e("button", { type: "button", className: "cc1-open", onClick: () => openView(it) }, "View")
          : e("button", { type: "button", className: "cc1-open", disabled: busyId === it.id + "o", onClick: () => isLink ? window.open(it.link, "_blank", "noopener") : openFile(it, false) },
            busyId === it.id + "o" ? "…" : (isLink ? "Open link ↗" : "Open")),
        !it.viewOnly && it.hasFile ? e("button", { type: "button", className: "cc1-dl", "aria-label": "Download", disabled: busyId === it.id + "d", onClick: () => openFile(it, true) }, "↓") : null,
        canEdit ? e("button", { type: "button", className: "cc1-more", "aria-label": "More", onClick: () => setMenu(menu === it.id ? "" : it.id) }, "⋯") : null
      ),
      menu === it.id ? e("div", { className: "cc1-menu" },
        e("button", { type: "button", onClick: () => { setMenu(""); setForm(it); } }, "Edit"),
        e("button", { type: "button", onClick: () => { setMenu(""); toggleVis(it); } }, it.visible ? "Hide" : "Show"),
        e("button", { type: "button", onClick: () => { setMenu(""); setDel(it); } }, "Delete")
      ) : null
    );
  };
  return e("div", { className: "cc1-pane" },
    canEdit ? e("div", { className: "cc1-tools" }, e("button", { type: "button", className: "cc1-add", onClick: () => setForm({}) }, "Add material")) : null,
    e("div", { className: "cc1-filter" },
      e("input", { className: "cc1-search", type: "search", placeholder: "Search materials", value: q, onChange: (ev) => setQ(ev.target.value), "aria-label": "Search materials" }),
      e("div", { className: "cc1-chips" },
        e("button", { type: "button", className: "cc1-chip" + (chip === "all" ? " on" : ""), onClick: () => setChip("all") }, "All", e("span", { className: "cc1-cpill" }, String(counts.all))),
        TYPES.filter((t) => (counts[t.id] || 0) > 0).map((t) => e("button", { key: t.id, type: "button", className: "cc1-chip" + (chip === t.id ? " on" : ""), onClick: () => setChip(t.id) }, t.label, e("span", { className: "cc1-cpill" }, String(counts[t.id] || 0))))
      )
    ),
    err ? e(TabErr, { code: err, onRetry }) : null,
    !err && !list.length ? e("div", { className: "cc1-empty" }, e("div", { className: "ico" }, "📂"), e("p", null, canEdit ? "Add your first material" : "Your instructor has not uploaded any materials yet.")) : null,
    syllabus.map(row),
    gKeys.map((g) => e("div", { key: g },
      e("button", { type: "button", className: "cc1-ghead", onClick: () => setOpenG(firstG === g ? "__none" : g) },
        g + " · " + groups[g].length + " item" + (groups[g].length === 1 ? "" : "s"), firstG === g ? "▾" : "▸"),
      firstG === g ? groups[g].map(row) : null
    )),
    form ? e(ModalForm, { courseId, user, name, course, row: form.id ? form : null, onSaved: (item) => { setForm(null); onChanged(item); }, onClose: () => setForm(null) }) : null,
    e(ConfirmDialog, { open: !!del, title: "Delete this material?", message: "This material and its file will be removed for students. This cannot be undone.", name: del?.title, tone: "danger", confirmLabel: "Delete", onCancel: () => setDel(null), onConfirm: doDel })
  );
}

function App({ opts }) {
  const courseId = opts.courseId;
  const role = opts.role || "student";
  const uid = opts.uid || auth.currentUser?.uid;
  const hashTab = ((location.hash || "").split("/")[2] || "").toLowerCase();
  const [tab, setTab] = useState(TABS.includes(hashTab) ? hashTab : "materials");
  const [course, setCourse] = useState(opts.course || null);
  const [headErr, setHeadErr] = useState("");
  const [mats, setMats] = useState([]);
  const [matErr, setMatErr] = useState("");
  const [matLoad, setMatLoad] = useState(true);
  const [sess, setSess] = useState([]);
  const [sessErr, setSessErr] = useState("");
  const [sessLoad, setSessLoad] = useState(true);
  const [denied, setDenied] = useState(false);
  const bar = useRef(null);
  const ink = useRef(null);
  const completed = String(course?.status || "") === "Completed";
  const canEdit = (role === "trainer" || role === "admin") && !completed;
  const goTab = (t) => { setTab(t); setTabHash(courseId, t); };

  const loadHead = async () => {
    setHeadErr("");
    try {
      const snap = await withTimeout(getDoc(doc(db, "courses", courseId)));
      if (!snap.exists()) throw Object.assign(new Error("not-found"), { code: "not-found" });
      const c = { id: snap.id, ...snap.data() };
      if (role === "student") {
        const en = await withTimeout(getDocs(query(collection(db, "enrollments"), where("uid", "==", uid), where("courseId", "==", courseId))));
        if (!en.docs.length) { setDenied(true); return; }
      }
      setCourse(c);
    } catch (ex) { setHeadErr(ex?.code || ex?.message || "error"); }
  };
  const loadMats = async () => {
    setMatLoad(true); setMatErr("");
    try {
      const qy = role === "student"
        ? query(collection(db, "courseMaterials"), where("courseId", "==", courseId), where("visible", "==", true))
        : query(collection(db, "courseMaterials"), where("courseId", "==", courseId));
      const snap = await withTimeout(getDocs(qy));
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => {
        const ca = String(a.chapter || "").localeCompare(String(b.chapter || ""));
        if (ca) return ca;
        const oa = Number(a.order ?? 9999) - Number(b.order ?? 9999);
        if (oa) return oa;
        const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
        const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
        return ta - tb;
      });
      setMats(list);
    } catch (ex) { setMatErr(ex?.code || ex?.message || "error"); }
    setMatLoad(false);
  };
  const loadSess = async () => {
    setSessLoad(true); setSessErr("");
    try {
      const snap = await withTimeout(getDocs(query(collection(db, "sessions"), where("courseId", "==", courseId))));
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      rows.sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
      setSess(rows);
    } catch (ex) { setSessErr(ex?.code || ex?.message || "error"); }
    setSessLoad(false);
  };
  useEffect(() => { loadHead(); Promise.allSettled([loadMats(), loadSess()]); }, [courseId, role, uid]);
  useEffect(() => {
    const barEl = bar.current;
    const on = barEl?.querySelector("button.on");
    const inkEl = ink.current;
    if (on && inkEl && barEl) {
      inkEl.style.width = on.offsetWidth + "px";
      inkEl.style.transform = "translateX(" + (on.offsetLeft - 4) + "px)";
    }
  }, [tab, course]);

  if (denied) return e("div", { className: "cc1" }, e("a", { className: "cc1-back", href: "#courses" }, "← Back to courses"), e("p", { className: "cc1-err" }, "You are not enrolled in this course."));
  const back = opts.backHref || "#courses";
  const trainers = namesFromCourse(course);
  const days = [].concat(course?.days || course?.classDays || course?.scheduleDays || []).filter(Boolean);
  const timeLine = colonTime(course?.sessionTime) || colonTime(course?.classTime) || colonTime(course?.scheduleTime) || sessionRange(sess);
  const schedLine = [days.length ? days.join(", ") : "", timeLine].filter(Boolean).join(" · ") || (days.length ? days.join(", ") : "");
  const endShown = fmtDate(course?.endDate) || fmtDate(lastSessionDate(sess)) || "To be announced";
  const av = (p) => e("span", { key: p.id, className: "cc1-avwrap" },
    e("span", { className: "cc1-av" }, initials(displayTrainerName(p.name))),
    e("span", null, displayTrainerName(p.name)));

  return e("div", { className: "cc1" },
    e("a", { className: "cc1-back", href: back }, "← Back to courses"),
    e("div", { className: "cc1-hero" },
      e("h1", { className: "cc1-title" }, course?.title || "Course content"),
      e("div", { className: "cc1-hero-row" },
        course ? e("span", { className: "cc1-st " + String(course.status || "").replace(/\s/g, "") }, courseStatusLabel(course)) : null
      ),
      e("div", { className: "cc1-stats" }, (function () {
        const matTxt = matLoad ? "—" : (mats.length === 1 ? "1 material" : mats.length + " materials");
        const sesTxt = sessLoad ? "—" : (sess.length === 1 ? "1 session" : sess.length + " sessions");
        const startBit = formatCourseDate(course?.startDate);
        const endBit = formatCourseDate(course?.endDate) || formatCourseDate(lastSessionDate(sess));
        let dates = "";
        if (startBit) dates += " · starts " + startBit;
        if (endBit) dates += " · ends " + endBit;
        else if (startBit) dates += " · ends To be announced";
        return matTxt + " · " + sesTxt + dates;
      })()),
      trainers.length ? e("div", { className: "cc1-avs" }, trainers.map(av)) : null
    ),
    headErr ? e(TabErr, { code: headErr, onRetry: loadHead }) : null,
    e("div", { className: "cc1-tabbar", ref: bar },
      e("div", { className: "cc1-ink", ref: ink }),
      e("button", { type: "button", className: tab === "materials" ? "on" : "", onClick: () => goTab("materials") }, "📄 Materials"),
      e("button", { type: "button", className: tab === "sessions" ? "on" : "", onClick: () => goTab("sessions") }, "📅 Sessions"),
      e("button", { type: "button", className: tab === "overview" ? "on" : "", onClick: () => goTab("overview") }, "ℹ Overview")
    ),
    tab === "materials" ? (matLoad ? e("div", null, e("div", { className: "cc1-skel" }), e("div", { className: "cc1-skel" })) :
      e(Materials, { courseId, canEdit, items: mats, err: matErr, onRetry: loadMats, onChanged: (item) => {
        if (item && item.id && item._removed) {
          setMats((prev) => prev.filter((x) => x.id !== item.id));
          return;
        }
        if (item && item.id) {
          setMats((prev) => {
            const i = prev.findIndex((x) => x.id === item.id);
            if (i >= 0) { const n = prev.slice(); n[i] = Object.assign({}, prev[i], item); return n; }
            return prev.concat([item]);
          });
        }
      }, user: { uid }, name: opts.name, course })) : null,
    tab === "sessions" ? e("div", { className: "cc1-pane" },
      sessLoad ? e("div", { className: "cc1-skel" }) : sessErr ? e(TabErr, { code: sessErr, onRetry: loadSess }) :
      (sess.length ? e("div", { className: "cc1-tl" }, sess.map((s) => {
        const range = [colonTime(s.startTime), colonTime(s.endTime)].filter(Boolean).join(" – ") || "Time to be announced";
        return e("div", { key: s.id, className: "cc1-srow" },
          e("div", null, e("strong", null, s.date || "To be announced")),
          e("div", { className: "cc1-rd" }),
          e("div", { className: "cc1-sc" },
            e("div", { className: "cc1-shead" }, e("strong", null, s.title || "Class session"), s.status ? e("span", { className: "cc1-spill" }, s.status) : null),
            e("p", { className: "cc1-time" }, range)
          )
        );
      })) : e("div", { className: "cc1-empty" }, e("p", null, "No sessions yet.")))
    ) : null,
    tab === "overview" ? e("div", { className: "cc1-pane cc1-ov" },
      e("div", { className: "cc1-card cc1-ov-wide" }, e("h3", null, "Description"),
        (function () {
          const txt = String(course?.full || course?.short || course?.description || course?.summary || "").trim();
          return txt ? e("p", { className: "cc1-desc-full" }, txt) : e("p", { className: "cc1-muted" }, "No description provided yet");
        })(),
        e("div", { className: "cc1-ov-pills" },
          course?.level ? e("span", { className: "cc1-spill" }, course.level) : null,
          course?.duration ? e("span", { className: "cc1-spill" }, course.duration) : null
        ),
        String(course?.prerequisites || "").trim() ? e("p", { className: "cc1-prereq" }, e("strong", null, "Prerequisites: "), course.prerequisites) : null
      ),
      Array.isArray(course?.outline) && course.outline.filter((m) => m && (m.title || m.description)).length
        ? e("div", { className: "cc1-card cc1-ov-wide" }, e("h3", null, "What you will learn"),
          e("ol", { className: "cc1-learn" }, course.outline.filter((m) => m && (m.title || m.description)).map((m, i) =>
            e("li", { key: i },
              e("span", { className: "cc1-num" }, String(i + 1)),
              e("div", null, e("strong", null, m.title || ("Chapter " + (i + 1))), m.description ? e("p", null, m.description) : null)
            )
          )))
        : null,
      e("div", { className: "cc1-card" }, e("h3", null, "Schedule"),
        schedLine ? e("p", null, schedLine) : e("p", { className: "cc1-muted" }, "Times to be announced"),
        course?.duration ? e("p", { className: "cc1-muted" }, course.duration) : null),
      e("div", { className: "cc1-card" }, e("h3", null, "Dates"),
        e("p", null, "Starts: " + showDate(course?.startDate)), e("p", null, "Ends: " + endShown)),
      e("div", { className: "cc1-card" }, e("h3", null, "Trainers"),
        trainers.length ? trainers.map((p) => e("div", { key: p.id, className: "cc1-trow" },
          e("span", { className: "cc1-av" }, initials(displayTrainerName(p.name))), e("span", null, displayTrainerName(p.name)))) : e("p", { className: "cc1-muted" }, "Trainer to be announced"))
    ) : null
  );
}

export function renderCourseContentV1(opts) {
  const host = opts?.host;
  if (!host) return false;
  ensureCss();
  try {
    let root = roots.get(host);
    if (!root) { root = createRoot(host); roots.set(host, root); }
    if (opts.loading || !opts.courseId) {
      root.render(e("div", { className: "cc1" }, e("a", { className: "cc1-back", href: "#courses" }, "← Back to courses"),
        e("div", { className: "cc1-hero" }, e("h1", { className: "cc1-title" }, "Course content")),
        e("div", { className: "cc1-tabbar" }, e("button", { className: "on" }, "Materials"), e("button", null, "Sessions"), e("button", null, "Overview")),
        e("div", { className: "cc1-skel" }), e("div", { className: "cc1-skel" })));
      return true;
    }
    try { window.__ghzPingActivity?.(); } catch (_) {}
    root.render(e(Boundary, { onRetry: () => renderCourseContentV1(opts) }, e(App, { opts })));
    return true;
  } catch (err) {
    host.innerHTML = `<p class="banner">${err.code || err.message}</p><button class="btn btn-sm" type="button" data-cc1-retry>Try again</button>`;
    host.querySelector("[data-cc1-retry]")?.addEventListener("click", () => renderCourseContentV1(opts));
    return false;
  }
}
