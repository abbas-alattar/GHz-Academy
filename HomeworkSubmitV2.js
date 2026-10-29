import { createElement as e, Component, useEffect, useState } from "https://esm.sh/react@18.3.1";
import { createRoot } from "https://esm.sh/react-dom@18.3.1/client";
import { db } from "./firebase-config.js?v=auth8";
import { doc, setDoc, updateDoc, deleteDoc, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { FileDropzone, typeOf, tileColor } from "./FileDropzone.js";
import { HomeworkFilesViewer } from "./HomeworkFilesViewer.js";
import { AssignmentFilesCards } from "./HomeworkFormV2.js";

const MAX = 650 * 1024;
const MAXB64 = 900000;
const OKEXT = /^(pdf|docx|doc|xlsx|pptx|txt|zip|png|jpe?g)$/i;
const BIG = "This file is larger than 650 KB. Add a link instead (Google Drive or OneDrive).";

class Boundary extends Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  render() {
    if (this.state.err) return this.props.fallback || null;
    return this.props.children;
  }
}

function daysLeft(due) {
  const d = String(due || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return "";
  const [y, m, n] = d.split("-").map(Number);
  const left = Math.round((new Date(y, m - 1, n, 12, 0, 0) - Date.now()) / 86400000);
  if (left > 0) return left + " day" + (left === 1 ? "" : "s") + " left";
  if (left === 0) return "Due today";
  return Math.abs(left) + " days overdue";
}

function readFile(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(new Error("read"));
    r.readAsDataURL(file);
  });
}

async function compressImage(file) {
  const url = URL.createObjectURL(file);
  const img = new Image();
  await new Promise((ok, bad) => { img.onload = ok; img.onerror = bad; img.src = url; });
  URL.revokeObjectURL(url);
  let w = img.width, h = img.height, q = 0.8;
  if (w > 1600) { h = Math.round(h * 1600 / w); w = 1600; }
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  canvas.getContext("2d").drawImage(img, 0, 0, w, h);
  let data = canvas.toDataURL("image/jpeg", q);
  while (data.length > MAXB64 && q > 0.4) { q -= 0.1; data = canvas.toDataURL("image/jpeg", q); }
  while (data.length > MAXB64 && w > 600) {
    w = Math.round(w * 0.85); h = Math.round(h * 0.85);
    canvas.width = w; canvas.height = h;
    canvas.getContext("2d").drawImage(img, 0, 0, w, h);
    data = canvas.toDataURL("image/jpeg", q);
  }
  return { data, mimeType: "image/jpeg", size: Math.round((data.length * 3) / 4), fileName: file.name.replace(/\.[^.]+$/, ".jpg") };
}

async function stageFile(file) {
  const ext = String(file.name || "").split(".").pop();
  if (!OKEXT.test(ext)) throw new Error("This file type is not supported.");
  if (/png|jpe?g/i.test(file.type || ext)) {
    const out = await compressImage(file);
    if (out.size > MAX || out.data.length > MAXB64) throw new Error(BIG);
    return { ...out, status: "Ready" };
  }
  if (file.size > MAX) throw new Error(BIG);
  const data = await readFile(file);
  if (String(data).length > MAXB64) throw new Error(BIG);
  return { fileName: file.name, mimeType: file.type || "application/octet-stream", size: file.size, data, status: "Ready" };
}

function initials(n) {
  return String(n || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0].toUpperCase()).join("") || "?";
}
function fmtNice(v) {
  const d = v?.toDate ? v.toDate() : v ? new Date(v) : null;
  if (!d || isNaN(d)) return "";
  return d.toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}
function trainerName(course, a) {
  if (Array.isArray(course?.trainerNames) && course.trainerNames[0]) return course.trainerNames[0];
  return a?.authorName || course?.trainerName || "Your trainer";
}
function seenKey(id) { return "ghz-hw-seen-" + id; }

function Drawer({ opts }) {
  const a = opts.assignment || {};
  const course = opts.course || {};
  const user = opts.user || {};
  const uid = user.uid;
  const [liveSub, setLiveSub] = useState(opts.sub || null);
  const graded = liveSub?.status === "graded";
  const locked = String(course.status || "") === "Completed" || graded;
  useEffect(() => {
    if (!uid || !a.id) return;
    getDoc(doc(db, "submissions", a.id + "_" + uid)).then((s) => {
      if (s.exists()) setLiveSub({ id: s.id, ...s.data() });
    }).catch(() => {});
  }, [uid, a.id]);
  useEffect(() => {
    if (graded && a.id) try { localStorage.setItem(seenKey(a.id), String(liveSub?.gradedAt?.toMillis?.() || Date.now())); } catch {}
  }, [graded, a.id, liveSub?.gradedAt]);
  const [text, setText] = useState(opts.sub?.text || "");
  const [link, setLink] = useState(opts.sub?.link || "");
  const [note, setNote] = useState(opts.sub?.note || "");
  const [files, setFiles] = useState((opts.sub?.files || []).map((f) => ({ ...f, status: "Ready", kept: true })));
  const [dropErr, setDropErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(!!opts.sub && !locked ? false : !!opts.sub);
  const dueChip = daysLeft(a.dueDate);
  const canGo = !!(files.length || String(text).trim() || String(link).trim());

  const add = async (list) => {
    setDropErr("");
    try {
      const next = [...files];
      for (const f of list) {
        if (next.length >= 3) break;
        next.push(await stageFile(f));
      }
      setFiles(next.slice(0, 3));
    } catch (err) { setDropErr(err.message || String(err)); }
  };

  const writeOne = async (f, index, setProg) => {
    setProg(40);
    const id = a.id + "_" + uid + "_" + index;
    await setDoc(doc(db, "submissionFiles", id), {
      uid, assignmentId: a.id, courseId: a.courseId, index,
      fileName: f.fileName, mimeType: f.mimeType, size: f.size, data: f.data, createdAt: serverTimestamp()
    });
    setProg(100);
    return { index, fileName: f.fileName, mimeType: f.mimeType, size: f.size };
  };

  const submit = async () => {
    if (locked || busy || !canGo) return;
    setBusy(true);
    const meta = [];
    const used = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const idx = i;
        setFiles((cur) => cur.map((x, n) => n === i ? { ...x, status: "Uploading", prog: 10, err: null } : x));
        if (f.data) {
          const m = await writeOne(f, idx, (p) => setFiles((cur) => cur.map((x, n) => n === i ? { ...x, prog: p } : x)));
          meta.push(m); used.push(idx);
        } else if (f.kept) {
          meta.push({ index: f.index, fileName: f.fileName, mimeType: f.mimeType, size: f.size });
          used.push(f.index);
        }
        setFiles((cur) => cur.map((x, n) => n === i ? { ...x, status: "Ready", prog: 100 } : x));
      }
      const subId = a.id + "_" + uid;
      const payload = {
        text, link, note, files: meta, fileCount: meta.length,
        submittedAt: serverTimestamp(), studentName: (typeof window !== "undefined" && window.__ghzLiveName) || user.displayName || user.name || "",
        status: "submitted", uid, assignmentId: a.id, courseId: a.courseId
      };
      const existing = opts.sub;
      if (existing) {
        await updateDoc(doc(db, "submissions", subId), {
          text, link, note, files: meta, fileCount: meta.length, submittedAt: serverTimestamp(),
          studentName: (typeof window !== "undefined" && window.__ghzLiveName) || user.displayName || user.name || ""
        });
        for (let i = 0; i < 3; i++) {
          if (!used.includes(i) && (existing.files || []).some((x) => x.index === i)) {
            try { await deleteDoc(doc(db, "submissionFiles", subId + "_" + i)); } catch {}
          }
        }
      } else {
        await setDoc(doc(db, "submissions", subId), payload);
      }
      try { window.__ghzPingActivity?.(); } catch (_) {}
      setDone(true);
      opts.onSaved?.();
    } catch (err) {
      setFiles((cur) => cur.map((x, n) => n === files.length - 1 ? { ...x, err: err.code || err.message, status: "Error" } : x));
    }
    setBusy(false);
  };

  const close = () => opts.onClose?.();

  return e("div", { className: "hs2" },
    e("div", { className: "hs2-scrim", onClick: close }),
    e("aside", { className: "hs2-draw", role: "dialog", "aria-modal": "true" },
      e("header", { className: "hs2-head" },
        e("div", null,
          e("span", { className: "hs2-pill" }, graded ? "Graded" : (liveSub ? "Submitted" : "To do")),
          e("h2", null, a.title || "Homework"),
          e("p", null, course.title || a.courseTitle || ""),
          e("div", { className: "hs2-meta" },
            e("span", null, a.dueDate || "No due date"),
            dueChip ? e("em", null, dueChip) : null,
            e("span", null, (a.maxPoints || 0) + " pts")
          )
        ),
        e("button", { type: "button", className: "hs2-x", onClick: close, "aria-label": "Close" }, "×")
      ),
      e("div", { className: "hs2-body" },
        e("section", { className: "hs2-card" }, e("h3", null, "Instructions"), e("p", null, a.instructions || a.description || "No instructions yet."), e(AssignmentFilesCards, { assignmentId: a.id, files: a.files || [] })),
        graded ? (() => {
          const max = Number(a.maxPoints) || 100;
          const g = Number(liveSub.grade);
          const pct = max ? Math.round((g / max) * 100) : 0;
          const tone = pct >= 60 ? "hi" : pct >= 40 ? "mid" : "lo";
          const col = tone === "hi" ? "#16A34A" : tone === "mid" ? "#D97706" : "#DC2626";
          const who = trainerName(course, a);
          return e("section", { className: "hs2-result " + tone },
            e("div", { className: "hs2-resrow" },
              e("div", { className: "hs2-ring", style: { background: `conic-gradient(${col} ${pct}%, #E5EAF1 0)` } }, pct + "%"),
              e("div", null,
                e("p", { className: "hs2-grade" }, g + " / " + max),
                e("span", { className: "hs2-pill" }, "Graded"),
                e("p", { style: { margin: "6px 0 0", color: "#64748B" } }, "Graded " + (fmtNice(liveSub.gradedAt) || "—"))
              )
            ),
            e("div", { className: "hs2-fb" },
              e("div", { className: "hs2-fbhead" }, e("span", { className: "hs2-av" }, initials(who)), "Trainer feedback"),
              e("p", { style: { margin: 0 } }, String(liveSub.feedback || "").trim() || "No written feedback."),
              e("p", { style: { margin: "8px 0 0", color: "#64748B", fontSize: 12 } }, who)
            )
          );
        })() : liveSub && liveSub.status !== "not_submitted" ? e("div", { className: "hs2-wait" },
          e("span", null, "⏱"),
          e("p", { style: { margin: 0 } }, "Submitted on " + (fmtNice(liveSub.submittedAt) || "—") + " · Waiting for your trainer's review")
        ) : null,
        (graded || (liveSub && liveSub.status !== "not_submitted")) ? e("section", { className: "hs2-card" },
          e("h3", null, "Your submission"),
          e("div", { className: "hs2-ans" }, liveSub.text || liveSub.answer || "—"),
          e(HomeworkFilesViewer, { assignmentId: a.id, uid, files: liveSub.files || [], readonly: true })
        ) : null,
        done && !locked ? e("div", { className: "hs2-ok" },
          e("p", null, "Homework submitted"),
          e(HomeworkFilesViewer, { assignmentId: a.id, uid, files: files.map((f, i) => ({ ...f, index: i })) }),
          e("button", { type: "button", className: "hs2-browse", onClick: () => setDone(false) }, "Edit submission")
        ) : locked && !graded && !(liveSub && liveSub.status !== "not_submitted") ? e(HomeworkFilesViewer, { assignmentId: a.id, uid: opts.sub?.uid || uid, files: opts.sub?.files || [], readonly: true })
        : locked ? null
        : e("div", null,
            e(FileDropzone, { disabled: files.length >= 3, onFiles: add, error: dropErr }),
            files.map((f, i) => e("div", { className: "hs2-row", key: i },
              e("b", { className: "hs2-tile", style: { background: tileColor(typeOf(f.fileName, f.mimeType)) } }, typeOf(f.fileName, f.mimeType)),
              e("div", null, e("strong", null, f.fileName), e("span", null, Math.round((f.size || 0) / 1024) + " KB")),
              e("em", { className: "hs2-st" }, f.status || "Ready"),
              e("button", { type: "button", className: "hs2-mini", onClick: () => setFiles(files.filter((_, n) => n !== i)), "aria-label": "Remove" }, "Remove"),
              f.prog ? e("i", { className: "hs2-bar", style: { width: f.prog + "%" } }) : null,
              f.err ? e("span", { className: "hs2-err" }, f.err, e("button", { type: "button", onClick: submit }, "Retry")) : null
            )),
            e("label", null, "Link (optional)"),
            e("input", { value: link, onChange: (ev) => setLink(ev.target.value), placeholder: "https://" }),
            e("label", null, "Note (optional)"),
            e("textarea", { value: note, onChange: (ev) => setNote(ev.target.value) }),
            e("label", null, "Your answer"),
            e("textarea", { value: text, onChange: (ev) => setText(ev.target.value) })
          )
      ),
      e("footer", { className: "hs2-foot" },
        e("p", null, "Only you and your trainer can see your files"),
        e("button", { type: "button", className: "btn btn-ghost", onClick: close }, "Cancel"),
        locked || done ? null : e("button", { type: "button", className: "btn", disabled: !canGo || busy, onClick: submit }, "Submit homework")
      )
    )
  );
}

export function renderHomeworkSubmitV2(opts) {
  const host = opts?.host;
  if (!host) return false;
  try {
    createRoot(host).render(e(Boundary, { fallback: null }, e(Drawer, { opts })));
    return true;
  } catch (e) {
    return false;
  }
}
