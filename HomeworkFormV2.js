import { createElement as e, useEffect, useRef, useState } from "https://esm.sh/react@18.3.1";
import { createPortal } from "https://esm.sh/react-dom@18.3.1";
import { db } from "./firebase-config.js?v=auth8";
import { addDoc, collection, deleteDoc, doc, serverTimestamp, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { isCourseLocked } from "./course-lock.js";
import { showConfirmDialog } from "./ConfirmDialog.js";
import { typeOf, tileColor } from "./FileDropzone.js";

const MAX = 600 * 1024;
const OK = /^(pdf|doc|docx|ppt|pptx|xls|xlsx|txt|png|jpe?g)$/i;

function readFile(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(new Error("Could not read file"));
    r.readAsDataURL(file);
  });
}
function friendlyDue(date, time) {
  if (!date) return "";
  const d = new Date(date + "T" + (time || "23:59"));
  if (isNaN(d)) return "";
  const days = Math.round((d - Date.now()) / 86400000);
  const when = d.toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const rel = days === 0 ? "today" : days > 0 ? "in " + days + " day" + (days === 1 ? "" : "s") : Math.abs(days) + " days ago";
  return when + " · " + rel;
}

function isActiveCourse(c) { const s = c?.status; return s === "Open" || s === "Closed"; }
function fmtSize(n) { return Math.max(1, Math.round((Number(n) || 0) / 1024)) + " KB"; }
function statusLabel(file) {
  const s = file.status || (file.data ? "Ready" : "Ready");
  if (s === "Uploading" || s === "Uploading…") return { k: "up", t: "Uploading…" };
  if (s === "Uploaded" || s === "Ready") return { k: file.data || file.kept ? "ok" : "ready", t: file.data || file.kept ? "Uploaded" : "Ready" };
  if (s === "Error") return { k: "err", t: file.err || "Error" };
  return { k: "ready", t: "Ready" };
}
function AttachZone({ locked, files, err, onAdd, onRetry, onRemove }) {
  const [over, setOver] = useState(false);
  const ref = useRef(null);
  const full = (files || []).length >= 3;
  return e("div", { className: "th2-dlg-f th2-attach" },
    e("label", null, "Attach documents"),
    e("button", {
      type: "button",
      className: "th2-drop" + (over ? " on" : ""),
      disabled: locked || full,
      onClick: () => { if (!locked && !full) ref.current?.click(); },
      onDragOver: (ev) => { ev.preventDefault(); if (!locked && !full) setOver(true); },
      onDragLeave: () => setOver(false),
      onDrop: (ev) => { ev.preventDefault(); setOver(false); if (!locked && !full) onAdd(ev.dataTransfer.files); }
    },
      e("span", { className: "th2-drop-ico", "aria-hidden": true },
        e("svg", { width: 28, height: 28, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8 },
          e("path", { d: "M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" }), e("path", { d: "M17 8l-5-5-5 5" }), e("path", { d: "M12 3v12" }))),
      e("span", { className: "th2-drop-t" }, "Drag files here or click to browse"),
      e("span", { className: "th2-drop-h" }, "PDF, DOC, DOCX, PPT, XLSX, TXT, PNG, JPG · up to 3 files · 600 KB each")
    ),
    e("input", { ref, type: "file", multiple: true, className: "th2-filehid", disabled: locked || full, onChange: (ev) => { onAdd(ev.target.files); ev.target.value = ""; } }),
    err ? e("span", { className: "th2-ferr" }, err) : null,
    (files || []).map((file, i) => {
      const st = statusLabel(file);
      return e("div", { className: "th2-fc", key: i },
        e("b", { style: { background: tileColor(typeOf(file.fileName || file.name, file.mimeType)) } }, typeOf(file.fileName || file.name, file.mimeType)),
        e("span", { className: "th2-fc-meta" }, e("span", { className: "th2-fc-name" }, file.fileName || file.name), e("span", { className: "th2-fc-size" }, fmtSize(file.size))),
        e("em", { className: "th2-fc-st " + st.k }, st.k === "up" ? e("span", { className: "th2-spin" }) : null, st.t),
        st.k === "err" ? e("button", { type: "button", className: "th2-btn", onClick: () => onRetry(file, i) }, "Retry") : null,
        e("button", { type: "button", className: "th2-btn", disabled: locked, onClick: () => onRemove(i), "aria-label": "Remove" }, "×")
      );
    })
  );
}
function defaultCourseId(form, courses) {
  const cur = (courses || []).find((c) => c.id === form.courseId);
  if (cur && isActiveCourse(cur)) return cur.id;
  return (courses || []).find(isActiveCourse)?.id || "";
}
export function HomeworkFormV2({ form, courses, uid, onClose, onSaved, CourseSelect }) {
  const [f, setF] = useState({
    title: form.title || "", description: form.description || form.instructions || "",
    courseId: defaultCourseId(form, courses),
    dueDate: form.dueDate || "", dueTime: form.dueTime || "23:59",
    maxPoints: form.maxPoints || 100, status: form.status || "Published",
    rubric: form.rubric || [], files: (form.files || []).map((x) => ({ ...x, kept: true })),
    id: form.id
  });
  const [rubOpen, setRubOpen] = useState(!!(form.rubric && form.rubric.length));
  const [err, setErr] = useState({});
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const dirty = useRef(false);
  const titleRef = useRef(null);
  const course = courses.find((c) => c.id === f.courseId);
  const locked = isCourseLocked(course);
  const rubTot = (f.rubric || []).reduce((n, r) => n + Number(r.max || 0), 0);
  const max = Number(f.maxPoints) || 100;
  const rubOk = !rubOpen || !(f.rubric || []).length || rubTot === max;

  const close = async () => {
    if (dirty.current) {
      const ok = await showConfirmDialog({ title: "Discard changes?", message: "Unsaved homework will be lost.", confirmLabel: "Discard", tone: "danger" });
      if (!ok) return;
    }
    onClose();
  };
  useEffect(() => {
    const onKey = (ev) => { if (ev.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    const t = requestAnimationFrame(() => titleRef.current?.focus());
    return () => { window.removeEventListener("keydown", onKey); cancelAnimationFrame(t); };
  }, []);

  const addFiles = async (list) => {
    const next = [...(f.files || [])];
    for (const file of Array.from(list || [])) {
      if (next.length >= 3) break;
      const ext = String(file.name || "").split(".").pop();
      if (!OK.test(ext)) { setErr({ files: "Allowed: PDF, DOC, DOCX, PPT, PPTX, XLS, XLSX, TXT, PNG, JPG" }); continue; }
      if (file.size > MAX) { setErr({ files: file.name + " is larger than 600 KB" }); continue; }
      try {
        const data = await readFile(file);
        next.push({ fileName: file.name, mimeType: file.type || "application/octet-stream", size: file.size, data, index: next.length, status: "Ready" });
        dirty.current = true;
      } catch (er) { setErr({ files: er.message }); }
    }
    setF({ ...f, files: next.slice(0, 3) });
  };

  const writeFile = async (aid, file, index) => {
    const id = aid + "_" + index;
    await setDoc(doc(db, "assignmentFiles", id), {
      assignmentId: aid, courseId: f.courseId, index,
      fileName: file.fileName, mimeType: file.mimeType, size: file.size, data: file.data, createdAt: serverTimestamp()
    });
  };

  const save = async () => {
    if (locked) return;
    const eobj = {};
    if (!f.courseId) eobj.courseId = "Choose a course";
    if (!String(f.title).trim()) eobj.title = "Title is required";
    if (String(f.title).length > 120) eobj.title = "Max 120 characters";
    if (String(f.description).length > 2000) eobj.description = "Max 2000 characters";
    if (!f.dueDate) eobj.dueDate = "Due date is required";
    const pts = Number(f.maxPoints);
    if (!Number.isFinite(pts) || pts < 1 || pts > 1000) eobj.maxPoints = "1 to 1000";
    if (!rubOk) eobj.rubric = "Total must equal max points";
    setErr(eobj);
    if (Object.keys(eobj).length) { titleRef.current?.focus(); return; }
    setBusy(true);
    try {
      const payload = {
        title: f.title.trim().slice(0, 120),
        description: String(f.description || "").slice(0, 2000),
        instructions: String(f.description || "").slice(0, 2000),
        dueDate: f.dueDate, dueTime: f.dueTime || "23:59",
        maxPoints: pts, status: f.status || "Published", courseId: f.courseId,
        rubric: rubOpen ? (f.rubric || []).filter((r) => r.name) : [],
        files: (f.files || []).map((x, i) => ({ name: x.fileName || x.name, size: x.size, mimeType: x.mimeType, index: i }))
      };
      let aid = f.id;
      if (aid) await updateDoc(doc(db, "assignments", aid), payload);
      else {
        const ref = await addDoc(collection(db, "assignments"), { ...payload, createdAt: serverTimestamp(), createdBy: uid });
        aid = ref.id;
      }
      for (let i = 0; i < (f.files || []).length; i++) {
        const file = f.files[i];
        if (file.data) {
          try {
            setF((cur) => ({ ...cur, files: cur.files.map((x, n) => n === i ? { ...x, status: "Uploading" } : x) }));
            await writeFile(aid, file, i);
            setF((cur) => ({ ...cur, files: cur.files.map((x, n) => n === i ? { ...x, status: "Uploaded", err: null } : x) }));
          } catch (er) {
            setF((cur) => ({ ...cur, files: cur.files.map((x, n) => n === i ? { ...x, status: "Error", err: (er.code || "") + " " + (er.message || er) } : x) }));
            setBusy(false);
            return;
          }
        }
      }
      for (let i = (f.files || []).length; i < 3; i++) {
        try { await deleteDoc(doc(db, "assignmentFiles", aid + "_" + i)); } catch {}
      }
      dirty.current = false;
      setSaved(true);
      onSaved?.();
      setTimeout(() => onClose(), 900);
    } catch (er) {
      setErr({ form: (er.code || "") + " " + (er.message || er) });
    }
    setBusy(false);
  };

  const noActive = !(courses || []).some(isActiveCourse);
  const saveDisabled = locked || busy || noActive || !f.courseId;
  const body = e("div", { className: "th2-dlg-scrim", onClick: (ev) => { if (ev.target === ev.currentTarget) close(); } },
    saved ? e("div", { className: "th2-savedbox" }, "✓ Saved") : null,
    e("div", { className: "th2-dlg", role: "dialog", "aria-modal": "true" },
      e("div", { className: "th2-dlg-h" },
        e("div", { className: "th2-dlg-ico" }, e("svg", { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2 }, e("rect", { x: 8, y: 2, width: 8, height: 4, rx: 1 }), e("path", { d: "M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" }), e("path", { d: "M12 11v6M9 14h6" }))),
        e("div", null, e("h3", null, f.id ? "Edit homework" : "Create homework"), e("p", null, course?.title || "Choose a course")),
        e("button", { type: "button", className: "th2-dlg-x", onClick: close, "aria-label": "Close" }, "×")
      ),
      e("div", { className: "th2-dlg-b" },
        e("div", { className: "th2-dlg-f" }, e("label", null, "Course"),
          CourseSelect ? e(CourseSelect, { courses, cid: f.courseId, hideAll: true, disableLocked: true, onPick: (id) => {
            const c = courses.find((x) => x.id === id);
            if (isCourseLocked(c)) return;
            dirty.current = true; setF({ ...f, courseId: id });
          } }) : null,
          locked ? e("p", { className: "th2-ferr th2-lockban" }, "This course is completed — homework can't be added") : null,
          noActive ? e("p", { className: "th2-ferr" }, "No active course available — homework can only be created for Open or Closed courses") : null,
          err.courseId ? e("span", { className: "th2-ferr" }, err.courseId) : null),
        e("div", { className: "th2-dlg-f" }, e("label", null, "Title"),
          e("div", { className: "th2-dlg-wrap" }, e("span", { className: "ic" }, "✎"),
            e("input", { ref: titleRef, maxLength: 120, value: f.title, disabled: locked, onChange: (ev) => { dirty.current = true; setF({ ...f, title: ev.target.value }); } })),
          e("div", { className: "th2-count" }, String(f.title).length + " / 120"),
          err.title ? e("span", { className: "th2-ferr" }, err.title) : null),
        e("div", { className: "th2-dlg-f" }, e("label", null, "Instructions"),
          e("textarea", { rows: 7, maxLength: 2000, spellCheck: true, value: f.description, disabled: locked, onChange: (ev) => { dirty.current = true; setF({ ...f, description: ev.target.value }); } }),
          e("div", { className: "th2-count" + (String(f.description).length > 1900 ? " th2-count-warn" : "") }, String(f.description).length + " / 2000"),
          err.description ? e("span", { className: "th2-ferr" }, err.description) : null),
        e("div", { className: "th2-3col" },
          e("div", { className: "th2-dlg-f" }, e("label", null, "Due date"),
            e("input", { type: "date", value: f.dueDate, disabled: locked, onChange: (ev) => { dirty.current = true; setF({ ...f, dueDate: ev.target.value }); } }),
            err.dueDate ? e("span", { className: "th2-ferr" }, err.dueDate) : null),
          e("div", { className: "th2-dlg-f" }, e("label", null, "Time"),
            e("input", { type: "time", value: f.dueTime, disabled: locked, onChange: (ev) => { dirty.current = true; setF({ ...f, dueTime: ev.target.value }); } })),
          e("div", { className: "th2-dlg-f" }, e("label", null, "Max points"),
            e("input", { type: "number", min: 1, max: 1000, value: f.maxPoints, disabled: locked, onChange: (ev) => { dirty.current = true; setF({ ...f, maxPoints: ev.target.value }); } }),
            err.maxPoints ? e("span", { className: "th2-ferr" }, err.maxPoints) : null)
        ),
        e("p", { className: "th2-hint" }, friendlyDue(f.dueDate, f.dueTime)),
        e("div", { className: "th2-dlg-f" }, e("label", null, "Status"),
          e("div", { className: "th2-seg" },
            e("button", { type: "button", className: f.status === "Published" ? "on" : "", disabled: locked, onClick: () => { dirty.current = true; setF({ ...f, status: "Published" }); } }, "Published"),
            e("button", { type: "button", className: f.status === "Draft" ? "on" : "", disabled: locked, onClick: () => { dirty.current = true; setF({ ...f, status: "Draft" }); } }, "Draft")),
          e("p", { className: "th2-hint" }, "Draft homework is hidden from students until you publish it")),
        e("button", { type: "button", className: "th2-btn", onClick: () => setRubOpen(!rubOpen) }, rubOpen ? "Hide grading rubric" : "Add grading rubric"),
        rubOpen ? e("div", { style: { display: "grid", gap: 8 } },
          (f.rubric || []).map((r, i) => e("div", { key: i, style: { display: "flex", gap: 8 } },
            e("input", { placeholder: "Criterion", value: r.name, disabled: locked, onChange: (ev) => { const n = f.rubric.slice(); n[i] = { ...n[i], name: ev.target.value }; dirty.current = true; setF({ ...f, rubric: n }); } }),
            e("input", { type: "number", placeholder: "Points", value: r.max || "", disabled: locked, onChange: (ev) => { const n = f.rubric.slice(); n[i] = { ...n[i], max: Number(ev.target.value) }; dirty.current = true; setF({ ...f, rubric: n }); } }),
            e("button", { type: "button", className: "th2-btn", disabled: locked, onClick: () => { dirty.current = true; setF({ ...f, rubric: f.rubric.filter((_, n) => n !== i) }); } }, "×")
          )),
          (f.rubric || []).length < 5 ? e("button", { type: "button", className: "th2-btn", disabled: locked, onClick: () => setF({ ...f, rubric: [...(f.rubric || []), { name: "", max: 20 }] }) }, "Add criterion") : null,
          e("p", { className: "th2-eq " + (rubOk ? "ok" : "bad") }, rubOk ? "Total equals max points" : "Total must equal max points (" + rubTot + " / " + max + ")"),
          err.rubric ? e("span", { className: "th2-ferr" }, err.rubric) : null
        ) : null,
        e(AttachZone, { locked, files: f.files || [], err: err.files, onAdd: addFiles, onRetry: (file, i) => writeFile(f.id, file, i), onRemove: async (i) => {
          if (f.id) try { await deleteDoc(doc(db, "assignmentFiles", f.id + "_" + i)); } catch {}
          dirty.current = true; setF({ ...f, files: f.files.filter((_, n) => n !== i) });
        } }),
        err.form ? e("p", { className: "th2-ferr" }, err.form) : null
      ),
      e("div", { className: "th2-dlg-ft" },
        e("button", { type: "button", className: "th2-btn", onClick: close }, "Cancel"),
        e("button", { type: "button", className: "th2-btn pri", disabled: saveDisabled, onClick: save }, busy ? "Saving…" : "Save homework")
      )
    )
  );
  return createPortal(body, document.body);
}

export function AssignmentFilesCards({ assignmentId, files }) {
  const [rows, setRows] = useState((files || []).map((f) => ({ ...f, loading: true })));
  useEffect(() => {
    let live = true;
    (async () => {
      const { getDoc } = await import("https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js");
      const next = [];
      for (const f of files || []) {
        const id = assignmentId + "_" + f.index;
        try {
          const snap = await getDoc(doc(db, "assignmentFiles", id));
          next.push({ ...f, loading: false, data: snap.exists() ? snap.data().data : null, err: snap.exists() ? null : "missing" });
        } catch (er) { next.push({ ...f, loading: false, err: er.code || String(er) }); }
        if (live) setRows([...next]);
      }
    })();
    return () => { live = false; };
  }, [assignmentId, JSON.stringify(files || [])]);
  const open = (row, download) => {
    if (!row.data) return;
    const s = String(row.data);
    const i = s.indexOf(",");
    const b64 = i >= 0 ? s.slice(i + 1) : s;
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let n = 0; n < bin.length; n++) arr[n] = bin.charCodeAt(n);
    const blob = new Blob([arr], { type: row.mimeType || "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    if (download) { const a = document.createElement("a"); a.href = url; a.download = row.fileName || row.name || "file"; a.click(); }
    else window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };
  if (!(files || []).length) return null;
  return e("div", { style: { display: "grid", gap: 8, marginTop: 8 } },
    rows.map((r, i) => e("div", { className: "th2-fc", key: i },
      e("b", { style: { background: tileColor(typeOf(r.fileName || r.name, r.mimeType)) } }, typeOf(r.fileName || r.name, r.mimeType)),
      e("span", { style: { flex: 1 } }, r.fileName || r.name),
      r.loading ? e("span", null, "…") : null,
      r.err ? e("span", { className: "th2-ferr" }, r.err) : null,
      r.data ? e("button", { type: "button", className: "th2-btn", onClick: () => open(r, false) }, "View") : null,
      r.data ? e("button", { type: "button", className: "th2-btn", onClick: () => open(r, true) }, "Download") : null
    ))
  );
}
