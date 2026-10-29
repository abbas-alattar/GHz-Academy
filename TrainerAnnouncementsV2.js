import { createElement as e, useMemo, useState, useEffect, Component } from "https://esm.sh/react@18.3.1";
import { createRoot } from "https://esm.sh/react-dom@18.3.1/client";
import { db, auth } from "./firebase-config.js?v=auth8";
import { collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
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
  componentDidCatch(err) { console.error("TrainerAnnouncementsV2", err); }
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

function Modal({ row, courses, onClose, onSaved, uid, authorName }) {
  const live = courses.filter((c) => String(c.status || "").toLowerCase() !== "completed");
  const [title, setTitle] = useState(row?.title || "");
  const [body, setBody] = useState(row?.body || "");
  const [courseId, setCourseId] = useState(row?.courseId || live[0]?.id || "");
  const [pinned, setPinned] = useState(!!row?.pinned);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const ttl = title.trim().slice(0, 120);
    const msg = body.trim().slice(0, 3000);
    if (!ttl || !msg) { setErr("Title and message are required."); return; }
    if (!row && !courseId) { setErr("Choose a live course."); return; }
    setBusy(true); setErr("");
    try {
      if (row) {
        await updateDoc(doc(db, "announcements", row.id), { title: ttl, body: msg, pinned });
      } else {
        await addDoc(collection(db, "announcements"), {
          courseId, title: ttl, body: msg, authorId: uid, authorName, authorRole: "trainer", pinned, createdAt: serverTimestamp()
        });
      }
      try { window.__ghzBumpActive?.(); } catch (_) {}
      onSaved(); onClose();
    } catch (er) { setErr(fbErr(er)); }
    setBusy(false);
  };
  return e("div", { className: "aanv2-modal", onClick: (ev) => { if (ev.target === ev.currentTarget) onClose(); } },
    e("div", { className: "aanv2-dlg", role: "dialog" },
      e("h3", null, row ? "Edit announcement" : "New announcement"),
      e("label", null, "Title", e("input", { value: title, maxLength: 120, onChange: (ev) => setTitle(ev.target.value) })),
      e("label", null, "Message", e("textarea", { rows: 6, maxLength: 3000, value: body, onChange: (ev) => setBody(ev.target.value) })),
      e("label", null, "Target",
        e("select", { className: "aanv2-target", value: courseId, disabled: !!row, onChange: (ev) => setCourseId(ev.target.value) },
          live.map((c) => e("option", { key: c.id, value: c.id }, c.title))
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
  const [q, setQ] = useState("");
  const [tgt, setTgt] = useState("");
  const [chip, setChip] = useState("All");
  const [modal, setModal] = useState(null);
  const [dlg, setDlg] = useState(null);
  const [saveErr, setSaveErr] = useState("");
  const unreadN = rows.filter((r) => uid && !isRead(uid, r.id) && r.authorId !== uid).length;
  const vis = useMemo(() => {
    let list = rows.slice();
    if (tgt === "all") list = list.filter((r) => !r.courseId || r.courseId === "all");
    else if (tgt) list = list.filter((r) => r.courseId === tgt);
    if (chip === "Unread") list = list.filter((r) => uid && !isRead(uid, r.id) && r.authorId !== uid);
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
    return list;
  }, [rows, q, tgt, chip, uid, tick]);
  const mine = (a) => a.authorId === uid;
  const pin = async (a) => {
    if (!mine(a)) return;
    try { await updateDoc(doc(db, "announcements", a.id), { pinned: !a.pinned }); await reload(); }
    catch (err) { setSaveErr(fbErr(err)); }
  };
  const del = (a) => {
    if (!mine(a)) return;
    setDlg({
      title: "Delete announcement?", message: "This announcement will be removed for everyone.", name: a.title, tone: "danger", confirmLabel: "Delete",
      onConfirm: async () => { await deleteDoc(doc(db, "announcements", a.id)); setDlg(null); await reload(); }
    });
  };
  const bar = e("div", { className: "aanv2-bar" },
    e("select", { className: "aanv2-sel", value: tgt, disabled: loading, onChange: (ev) => setTgt(ev.target.value) },
      e("option", { value: "" }, "All"),
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
      e("div", { className: "aanv2-head" }, e("div", null, e("h2", null, "Announcements"), e("p", { className: "sub" }, "Your courses and academy news"))),
      bar, [1, 2, 3].map((i) => e("div", { key: i, className: "aanv2-sk" }))
    );
  }
  if (error) {
    return e("div", { className: "aanv2" },
      e("div", { className: "aanv2-head" }, e("div", null, e("h2", null, "Announcements"), e("p", { className: "sub" }, "Your courses and academy news"))),
      e("p", { className: "aanv2-err" }, String(error), " ", e("button", { type: "button", className: "aanv2-ghost", onClick: onRetry }, "Try again"))
    );
  }
  return e("div", { className: "aanv2" },
    e("div", { className: "aanv2-head" },
      e("div", null, e("h2", null, "Announcements"), e("p", { className: "sub" }, "Your courses and academy news")),
      e("div", { style: { display: "flex", gap: 10, alignItems: "center" } },
        unreadN ? e("button", { type: "button", className: "aanv2-classic", onClick: () => markAllAnnouncementsRead(uid, vis.filter((a) => a.authorId !== uid)) }, "Mark all as read") : null,
        e("button", { type: "button", className: "aanv2-new", onClick: () => setModal({}) }, "New announcement")
      )
    ),
    bar,
    saveErr ? e("p", { className: "aanv2-err" }, saveErr) : null,
    e(Boundary, { onRetry },
      vis.length ? vis.map((a) => e(AnnouncementCard, {
        key: a.id, a, courses, unread: uid && !isRead(uid, a.id) && a.authorId !== uid,
        controls: mine(a), onEdit: mine(a) ? setModal : null, onPin: mine(a) ? pin : null, onDel: mine(a) ? del : null,
        onOpen: () => { if (uid && a.authorId !== uid) markAnnouncementRead(uid, a.id); }
      })) : e("div", { className: "aanv2-empty" }, e("p", null, "No announcements yet"))
    ),
    modal ? e(Modal, { row: modal.id ? modal : null, courses, onClose: () => setModal(null), onSaved: reload, uid, authorName: document.getElementById("userName")?.textContent?.trim() || "Trainer" }) : null,
    e(ConfirmDialog, { open: !!dlg, title: dlg?.title, message: dlg?.message, name: dlg?.name, tone: dlg?.tone, confirmLabel: dlg?.confirmLabel, onCancel: () => setDlg(null), onConfirm: dlg?.onConfirm })
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
    let cs = [];
    try {
      const snap = await withTimeout(getDocs(query(collection(db, "courses"), where("trainerIds", "array-contains", uid))), 10000);
      cs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setCourses(cs);
    } catch { setCourses([]); }
    try {
      const jobs = [withTimeout(getDocs(query(collection(db, "announcements"), where("courseId", "==", "all"))), 10000)];
      cs.forEach((c) => jobs.push(withTimeout(getDocs(query(collection(db, "announcements"), where("courseId", "==", c.id))), 10000)));
      const settled = await Promise.allSettled(jobs);
      const list = []; const seen = new Set();
      settled.forEach((r) => {
        if (r.status !== "fulfilled") return;
        (r.value.docs || []).forEach((d) => { if (!seen.has(d.id)) { seen.add(d.id); list.push({ id: d.id, ...d.data() }); } });
      });
      const failed = settled.find((r) => r.status === "rejected");
      if (!list.length && failed) { setError(fbErr(failed.reason)); setLoading(false); return; }
      setRows(list);
      try { window.__ghzTrainerAnns = list; } catch (_) {}
      if (uid) loadAnnouncementReads(uid).catch(() => {});
      setLoading(false);
    } catch (err) { setRows([]); setError(fbErr(err)); setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  useEffect(() => onAnnouncementReads(() => setTick((n) => n + 1)), []);
  return e(App, { courses, rows, loading, error, onRetry: load, reload: load, uid, tick });
}

const roots = new WeakMap();
export function renderTrainerAnnouncementsV2(host, opts = {}) {
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
    showSecErr(host, err, () => renderTrainerAnnouncementsV2(host, opts));
  }
}
