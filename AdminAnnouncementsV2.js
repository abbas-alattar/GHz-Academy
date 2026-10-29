import { createElement as e, useMemo, useState, useEffect, Component } from "https://esm.sh/react@18.3.1";
import { createRoot } from "https://esm.sh/react-dom@18.3.1/client";
import { db, auth } from "./firebase-config.js?v=auth8";
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { ConfirmDialog } from "./ConfirmDialog.js";
import { AnnouncementCard } from "./AnnouncementCard.js";
import { loadAnnouncementReads, markAnnouncementRead, markAllAnnouncementsRead, isRead, onAnnouncementReads } from "./announcementReads.js";

function showSecErr(host, err, retry) {
  if (!host) return;
  const msg = String((err && (err.message || err.code)) || err || "error");
  host.innerHTML = '<div style="margin:16px;padding:16px;background:#fff;border:1px solid #E5EAF1;border-radius:14px;max-width:480px;font-family:system-ui,sans-serif"><p style="margin:0 0 8px;font-weight:650">This section could not load</p><p style="margin:0 0 12px;color:#64748B;font-size:14px"></p><button type="button" style="height:36px;padding:0 14px;border:0;border-radius:10px;background:#2563EB;color:#fff;font-weight:600;cursor:pointer">Retry</button></div>';
  const p = host.querySelector("p:nth-of-type(2)");
  if (p) p.textContent = msg;
  const b = host.querySelector("button");
  if (b) b.onclick = () => { try { retry(); } catch (e2) { showSecErr(host, e2, retry); } };
}

class Boundary extends Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err) { console.error("AdminAnnouncementsV2", err); }
  render() {
    if (this.state.err) {
      return e("div", null,
        e("p", { className: "aanv2-err" }, String(this.state.err?.code || this.state.err?.message || this.state.err)),
        e("button", { type: "button", className: "aanv2-ghost", onClick: this.props.onRetry }, "Try again"));
    }
    return this.props.children;
  }
}

function fbErr(err) { return err?.code || err?.message || String(err); }
function withTimeout(p, ms) {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error("deadline-exceeded"), { code: "deadline-exceeded" })), ms))]);
}
function titleOf(id, courses) {
  if (!id || id === "all") return "Everyone";
  return (courses.find((c) => c.id === id)?.title) || id;
}
function when(t) {
  try {
    const d = t?.toDate ? t.toDate() : t ? new Date(t) : null;
    return d && !isNaN(d) ? d.toLocaleString() : "—";
  } catch { return "—"; }
}
function Ico({ d, stroke = "currentColor" }) {
  return e("svg", { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke, strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true }, e("path", { d }));
}

function Modal({ row, courses, onClose, onSaved }) {
  const [title, setTitle] = useState(row?.title || "");
  const [body, setBody] = useState(row?.body || "");
  const [courseId, setCourseId] = useState(row?.courseId || "all");
  const [pinned, setPinned] = useState(!!row?.pinned);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const onKey = (ev) => { if (ev.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const save = async () => {
    const ttl = title.trim().slice(0, 120);
    const msg = body.trim().slice(0, 3000);
    if (!ttl || !msg) { setErr("Title and message are required."); return; }
    setBusy(true); setErr("");
    try {
      if (row) {
        await updateDoc(doc(db, "announcements", row.id), { title: ttl, body: msg, pinned });
      } else {
        const user = auth.currentUser;
        const authorName = document.getElementById("userName")?.textContent?.trim() || user?.displayName || (user?.email || "").split("@")[0] || "Admin";
        await addDoc(collection(db, "announcements"), {
          courseId,
          title: ttl,
          body: msg,
          authorId: user?.uid || "",
          authorName,
          authorRole: "admin",
          pinned,
          createdAt: serverTimestamp()
        });
      }
      onSaved();
      onClose();
    } catch (e) {
      setErr(fbErr(e));
    }
    setBusy(false);
  };
  return e("div", { className: "aanv2-modal", onClick: (ev) => { if (ev.target === ev.currentTarget) onClose(); } },
    e("div", { className: "aanv2-dlg", role: "dialog", "aria-label": row ? "Edit announcement" : "New announcement" },
      e("h3", null, row ? "Edit announcement" : "New announcement"),
      e("label", null, "Title", e("input", { value: title, maxLength: 120, onChange: (ev) => setTitle(ev.target.value) })),
      e("label", null, "Message", e("textarea", { rows: 6, maxLength: 3000, value: body, onChange: (ev) => setBody(ev.target.value) })),
      e("label", null, "Target",
        e("select", { className: "aanv2-target", value: courseId, readOnly: !!row, onChange: (ev) => { if (!row) setCourseId(ev.target.value); } },
          e("option", { value: "all" }, "Everyone"),
          courses.map((c) => e("option", { key: c.id, value: c.id }, c.title))
        )
      ),
      e("label", { className: "aanv2-pinrow" },
        e("input", { type: "checkbox", checked: pinned, onChange: (ev) => setPinned(ev.target.checked) }),
        e("span", null, "Pin to top")
      ),
      err ? e("p", { className: "aanv2-err" }, err) : null,
      e("footer", null,
        e("button", { type: "button", className: "aanv2-ghost", onClick: onClose }, "Cancel"),
        e("button", { type: "button", className: "aanv2-new", disabled: busy, onClick: save }, busy ? "Saving…" : "Save")
      )
    )
  );
}


function App({ courses, rows, loading, error, onRetry, reload, uid, tick }) {
  courses = Array.isArray(courses) ? courses : [];
  rows = Array.isArray(rows) ? rows : [];
  const [q, setQ] = useState("");
  const [tgt, setTgt] = useState("");
  const [chip, setChip] = useState("All");
  const [modal, setModal] = useState(null);
  const [saveErr, setSaveErr] = useState("");
  const [dlg, setDlg] = useState(null);
  const trainerUnread = (a) => String(a.authorRole || "").toLowerCase() === "trainer" && uid && !isRead(uid, a.id);
  const vis = useMemo(() => {
    let list = rows.slice();
    if (tgt) list = list.filter((r) => r.courseId === tgt);
    if (chip === "Pinned") list = list.filter((r) => r.pinned);
    const qq = q.trim().toLowerCase();
    if (qq) list = list.filter((r) => (r.title || "").toLowerCase().includes(qq) || (r.body || "").toLowerCase().includes(qq));
    list.sort((a, b) => {
      const pa = a.pinned ? 1 : 0, pb = b.pinned ? 1 : 0;
      if (pb !== pa) return pb - pa;
      const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return tb - ta;
    });
    if (chip === "Unread") list = list.filter((r) => trainerUnread(r));
    return list;
  }, [rows, q, tgt, chip, uid, tick]);
  const pin = async (a) => {
    try { await updateDoc(doc(db, "announcements", a.id), { pinned: !a.pinned }); await reload(); }
    catch (err) { setSaveErr(fbErr(err)); }
  };
  const del = (a) => {
    setDlg({
      title: "Delete announcement?",
      message: "This announcement will be removed for everyone.",
      name: a.title,
      tone: "danger",
      confirmLabel: "Delete",
      onConfirm: async () => {
        await deleteDoc(doc(db, "announcements", a.id));
        setDlg(null);
        await reload();
      }
    });
  };
  const bar = e("div", { className: "aanv2-bar" },
    e("select", { className: "aanv2-sel", value: tgt, disabled: loading, "aria-label": "Target", onChange: (ev) => setTgt(ev.target.value) },
      e("option", { value: "" }, "All targets"),
      e("option", { value: "all" }, "Everyone"),
      courses.map((c) => e("option", { key: c.id, value: c.id }, c.title))
    ),
    e("input", { className: "aanv2-in", placeholder: "Search", value: q, disabled: loading, onChange: (ev) => setQ(ev.target.value) }),
    e("div", { className: "aanv2-chips" },
      ["All", "Unread", "Pinned"].map((c) => e("button", { key: c, type: "button", className: "aanv2-chip" + (chip === c ? " on" : ""), onClick: () => setChip(c) }, c))
    )
  );
  if (loading) {
    return e("div", { className: "aanv2" },
      e("div", { className: "aanv2-head" }, e("div", null, e("h2", null, "Announcements"), e("p", { className: "sub" }, "Messages to students and trainers"))),
      bar,
      [1, 2, 3].map((i) => e("div", { key: i, className: "aanv2-sk" }))
    );
  }
  if (error) {
    return e("div", { className: "aanv2" },
      e("div", { className: "aanv2-head" }, e("div", null, e("h2", null, "Announcements"), e("p", { className: "sub" }, "Messages to students and trainers"))),
      e("p", { className: "aanv2-err" }, String(error), " ", e("button", { type: "button", className: "aanv2-ghost", onClick: onRetry }, "Try again"))
    );
  }
  return e("div", { className: "aanv2" },
    e("div", { className: "aanv2-head" },
      e("div", null, e("h2", null, "Announcements"), e("p", { className: "sub" }, "Messages to students and trainers")),
      e("div", { style: { display: "flex", gap: 10, alignItems: "center" } },
        e("button", { type: "button", className: "aanv2-classic", onClick: () => markAllAnnouncementsRead(uid, rows.filter((a) => String(a.authorRole || "").toLowerCase() === "trainer")) }, "Mark all as read"),
        e("button", { type: "button", className: "aanv2-new", onClick: () => setModal({}) }, "New announcement")
      )
    ),
    bar,
    saveErr ? e("p", { className: "aanv2-err" }, saveErr) : null,
    e(Boundary, { onRetry },
      vis.length ? vis.map((a) => e(AnnouncementCard, {
        key: a.id, a, courses, unread: trainerUnread(a), controls: true,
        onEdit: setModal, onPin: pin, onDel: del,
        onOpen: () => { if (trainerUnread(a)) markAnnouncementRead(uid, a.id); }
      }))
        : e("div", { className: "aanv2-empty" },
          e("svg", { width: 40, height: 40, viewBox: "0 0 24 24", fill: "none", stroke: "#94A3B8", strokeWidth: 1.6 }, e("path", { d: "M3 11v2h2l8 5V6L5 11H3z" }), e("path", { d: "M19 8a5 5 0 0 1 0 8" })),
          e("p", null, "No announcements yet"))
    ),
    modal ? e(Modal, { row: modal.id ? modal : null, courses, onClose: () => setModal(null), onSaved: reload }) : null,
    e(ConfirmDialog, {
      open: !!dlg, title: dlg?.title, message: dlg?.message, name: dlg?.name, tone: dlg?.tone,
      confirmLabel: dlg?.confirmLabel, onCancel: () => setDlg(null), onConfirm: dlg?.onConfirm
    })
  );
}

function Host() {
  const [courses, setCourses] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tick, setTick] = useState(0);
  const uid = auth.currentUser?.uid || "";
  const load = async () => {
    setLoading(true); setError(null);
    try {
      const cs = await withTimeout(getDocs(collection(db, "courses")), 10000);
      setCourses(cs.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) { setCourses([]); }
    try {
      const snap = await withTimeout(getDocs(collection(db, "announcements")), 10000);
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setRows(list);
      try { window.__ghzTrainerAnns = list.filter((a) => String(a.authorRole || "").toLowerCase() === "trainer"); } catch (_) {}
      if (uid) loadAnnouncementReads(uid).catch(() => {});
      setLoading(false);
    } catch (err) {
      setRows([]); setError(fbErr(err)); setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);
  useEffect(() => onAnnouncementReads(() => setTick((n) => n + 1)), []);
  return e(App, { courses, rows, loading, error, onRetry: load, reload: load, uid, tick });
}

const roots = new WeakMap();
export function renderAdminAnnouncementsV2(host, opts = {}) {
  if (!host) return;
  let root = roots.get(host);
  if (root) { try { root.unmount(); } catch (_) {} roots.delete(host); }
  host.replaceChildren();
  root = createRoot(host);
  roots.set(host, root);
  try {
    root.render(e(Host, opts || {}));
  } catch (err) {
    console.error(err);
    showSecErr(host, err, () => renderAdminAnnouncementsV2(host, opts));
  }
}
