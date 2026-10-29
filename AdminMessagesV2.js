import { createElement as e, useMemo, useState, useEffect, Component } from "https://esm.sh/react@18.3.1";
import { createRoot } from "https://esm.sh/react-dom@18.3.1/client";
import { db, auth } from "./firebase-config.js?v=auth8";
import { collection, query, orderBy, getDocs, updateDoc, deleteDoc, doc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { AdminPdfButton, fmtPdfDate } from "./AdminPdfExport.js";
import { ConfirmDialog } from "./ConfirmDialog.js";

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
  componentDidCatch(err) { console.error("AdminMessagesV2", err); }
  render() {
    if (this.state.err) {
      return e("div", null,
        e("p", { className: "amv2-err" }, String(this.state.err?.code || this.state.err?.message || this.state.err)),
        e("button", { type: "button", className: "amv2-pri", onClick: this.props.onRetry }, "Try again"));
    }
    return this.props.children;
  }
}

function fbErr(err) { return err?.code || err?.message || String(err); }
function stOf(r) { return String(r.status || "new").toLowerCase(); }
function initials(n) { return String(n || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase(); }
function avBg(n) {
  let h = 0; String(n || "").split("").forEach((c) => { h = (h * 17 + c.charCodeAt(0)) % 360; });
  return `linear-gradient(135deg, hsl(${h},62%,42%), hsl(${(h + 40) % 360},70%,56%))`;
}
function tsMs(v) {
  try {
    const d = v?.toDate ? v.toDate() : v ? new Date(v) : null;
    return d && !isNaN(d) ? d.getTime() : 0;
  } catch { return 0; }
}
function fmtShort(v) {
  const d = v?.toDate ? v.toDate() : v ? new Date(v) : null;
  if (!d || isNaN(d)) return "—";
  const mon = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getMonth()];
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return d.getDate() + " " + mon + ", " + hh + ":" + mm;
}
function fmtFull(v) {
  try {
    const d = v?.toDate ? v.toDate() : v ? new Date(v) : null;
    return d && !isNaN(d) ? d.toLocaleString() : "—";
  } catch { return "—"; }
}
function lab(st) {
  return ({ new: "New", read: "Read", replied: "Replied", archived: "Archived" })[st] || st;
}
function pingBadges(rows) {
  const n = (rows || []).filter((r) => stOf(r) === "new").length;
  ["msgBadge", "msgBellBadge"].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.className = "ann-side-badge";
    el.hidden = n < 1;
    el.textContent = n > 99 ? "99+" : String(n);
    el.style.display = n < 1 ? "none" : "inline-flex";
    el.style.color = "#FFFFFF";
  });
  try { window.dispatchEvent(new CustomEvent("ghz-messages-changed", { detail: { newCount: n } })); } catch (_) {}
}

async function patch(id, extra) {
  const user = auth.currentUser;
  await updateDoc(doc(db, "inquiries", id), {
    ...extra,
    handledBy: user?.uid || "",
    handledAt: serverTimestamp()
  });
}

function App({ rows, loading, error, onRetry, reload, setRows }) {
  rows = Array.isArray(rows) ? rows : [];
  const [q, setQ] = useState("");
  const [stF, setStF] = useState("");
  const [courseF, setCourseF] = useState("");
  const [sort, setSort] = useState("new");
  const [open, setOpen] = useState(null);
  const [dlg, setDlg] = useState(null);
  const counts = useMemo(() => {
    const c = { new: 0, read: 0, replied: 0, archived: 0 };
    (rows || []).forEach((r) => { const s = stOf(r); if (c[s] != null) c[s]++; });
    return c;
  }, [rows]);
  const courses = useMemo(() => {
    const m = new Map();
    (rows || []).forEach((r) => { if (r.courseTitle) m.set(r.courseId || r.courseTitle, r.courseTitle); });
    return [...m.entries()];
  }, [rows]);
  const vis = useMemo(() => {
    const qq = q.trim().toLowerCase();
    let list = (rows || []).filter((r) => {
      if (stF && stOf(r) !== stF) return false;
      if (courseF && r.courseId !== courseF && r.courseTitle !== courseF) return false;
      if (qq) {
        const blob = `${r.name || ""} ${r.email || ""} ${r.message || ""}`.toLowerCase();
        if (!blob.includes(qq)) return false;
      }
      return true;
    });
    list.sort((a, b) => sort === "old" ? tsMs(a.createdAt) - tsMs(b.createdAt) : tsMs(b.createdAt) - tsMs(a.createdAt));
    return list;
  }, [rows, q, stF, courseF, sort]);
  useEffect(() => { pingBadges(rows); }, [rows]);

  const applyLocal = (id, extra) => {
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, ...extra } : r));
    setOpen((o) => o && o.id === id ? { ...o, ...extra } : o);
  };
  const setStatus = async (r, status) => {
    await patch(r.id, { status });
    applyLocal(r.id, { status });
  };
  const openRow = async (r) => {
    setOpen(r);
    if (stOf(r) === "new") {
      try { await setStatus(r, "read"); } catch (err) { /* shown in drawer via reload if needed */ }
    }
  };
  const exportCsv = () => {
    const lines = ["Date,Name,Email,Course,Message,Status"].concat(vis.map((r) => {
      const msg = String(r.message || "").replace(/"/g, '""');
      return `"${fmtFull(r.createdAt)}","${String(r.name || "").replace(/"/g, '""')}","${r.email || ""}","${String(r.courseTitle || "").replace(/"/g, '""')}","${msg}","${lab(stOf(r))}"`;
    }));
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "messages.csv"; a.click(); URL.revokeObjectURL(url);
  };
  const pdfData = () => ({
    page: "Messages",
    filters: (stF ? lab(stF) : "All") + (q ? " · " + q : ""),
    columns: [
      { key: "date", label: "Date" }, { key: "name", label: "Name" }, { key: "email", label: "Email" },
      { key: "course", label: "Course" }, { key: "message", label: "Message" }, { key: "status", label: "Status" }
    ],
    rows: vis.map((r) => ({
      date: fmtPdfDate(r.createdAt), name: r.name || "—", email: r.email || "—",
      course: r.courseTitle || "—", message: r.message || "—", status: lab(stOf(r))
    }))
  });
  const pills = [
    ["new", "New", counts.new], ["read", "Read", counts.read],
    ["replied", "Replied", counts.replied], ["archived", "Archived", counts.archived]
  ];
  const bar = e("div", { className: "amv2-bar" },
    e("input", { className: "amv2-in", placeholder: "Search name, email, message", value: q, disabled: loading, onChange: (ev) => setQ(ev.target.value), "aria-label": "Search" }),
    e("select", { className: "amv2-sel", value: courseF, disabled: loading, "aria-label": "Course", onChange: (ev) => setCourseF(ev.target.value) },
      e("option", { value: "" }, "All courses"),
      courses.map(([id, t]) => e("option", { key: id, value: id }, t))
    ),
    e("select", { className: "amv2-sel", value: sort, disabled: loading, "aria-label": "Sort", onChange: (ev) => setSort(ev.target.value) },
      e("option", { value: "new" }, "Newest first"),
      e("option", { value: "old" }, "Oldest first")
    )
  );
  const head = e("div", { className: "amv2-head" },
    e("div", null, e("h2", null, "Messages"), e("p", { className: "sub" }, "Inquiries from the website contact form")),
    e("div", { className: "amv2-head-act" },
      e("button", { type: "button", className: "amv2-csv", onClick: exportCsv }, "Export CSV"),
      e(AdminPdfButton, { getData: pdfData, page: "Messages" })
    )
  );
  const pillRow = e("div", { className: "amv2-pills" },
    pills.map(([k, label, n]) => e("button", {
      key: k, type: "button",
      className: "amv2-pill" + (stF === k ? " on" : "") + (k === "new" && n > 0 ? " new-hot" : ""),
      onClick: () => setStF(stF === k ? "" : k)
    }, label + " " + n))
  );

  if (loading) {
    return e("div", { className: "amv2" }, head, pillRow, bar, e("div", { className: "amv2-sk" }), e("div", { className: "amv2-sk" }), e("div", { className: "amv2-sk" }));
  }
  if (error) {
    return e("div", { className: "amv2" }, head,
      e("p", { className: "amv2-err" }, String(error), " ", e("button", { type: "button", className: "amv2-pri", onClick: onRetry }, "Try again")));
  }
  return e("div", { className: "amv2" },
    head, pillRow, bar,
    vis.length ? e("div", { className: "amv2-list" }, vis.map((r) => {
      const st = stOf(r);
      const first = String(r.message || "").split(/\n/)[0];
      return e("button", { key: r.id, type: "button", className: "amv2-row", onClick: () => openRow(r) },
        e("div", { className: "amv2-av", style: { background: avBg(r.name) } }, initials(r.name), st === "new" ? e("span", { className: "amv2-dot" }) : null),
        e("div", { style: { minWidth: 0 } },
          e("p", { className: "amv2-name" + (st === "new" ? " bold" : "") }, r.name || "—"),
          e("p", { className: "amv2-em" }, r.email || "—"),
          r.courseTitle ? e("span", { className: "amv2-course" }, r.courseTitle) : null,
          e("p", { className: "amv2-snip" }, first || "—")
        ),
        e("div", { className: "amv2-when" }, fmtShort(r.createdAt)),
        e("span", { className: "amv2-st " + st }, lab(st))
      );
    })) : e("div", { className: "amv2-empty" },
      e("svg", { width: 40, height: 40, viewBox: "0 0 24 24", fill: "none", stroke: "#94A3B8", strokeWidth: 1.6 }, e("path", { d: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" })),
      e("p", null, "No messages yet")
    ),
    open ? e("div", { className: "amv2-dim", onClick: () => setOpen(null) }) : null,
    open ? e("aside", { className: "amv2-draw", onClick: (ev) => ev.stopPropagation() },
      e("h3", { style: { marginTop: 0, fontFamily: "Space Grotesk, sans-serif" } }, open.name || "—"),
      e("div", { className: "amv2-kv" },
        open.email ? e("a", { href: "mailto:" + open.email }, open.email) : e("span", null, "No email"),
        open.phone ? e("p", { style: { margin: "4px 0 0", color: "#64748B" } }, open.phone) : null,
        e("p", { style: { margin: "4px 0 0" } }, open.courseTitle || "—"),
        e("p", { style: { margin: "4px 0 0", color: "#64748B", fontSize: 13 } }, fmtFull(open.createdAt))
      ),
      e("div", { className: "amv2-box" }, open.message || "—"),
      e("label", { htmlFor: "amv2-st" }, "Status"),
      e("select", { id: "amv2-st", className: "amv2-sel", style: { width: "100%", marginTop: 6 }, value: stOf(open), onChange: async (ev) => {
        try { await setStatus(open, ev.target.value); } catch (err) { setDlg({ title: "Could not save", message: fbErr(err), tone: "danger", confirmLabel: "OK", onConfirm: async () => setDlg(null) }); }
      } },
        e("option", { value: "new" }, "New"), e("option", { value: "read" }, "Read"),
        e("option", { value: "replied" }, "Replied"), e("option", { value: "archived" }, "Archived")
      ),
      e("div", { className: "amv2-acts" },
        e("a", {
          className: "amv2-pri", style: { textDecoration: "none", display: "inline-flex", alignItems: "center" },
          href: "mailto:" + encodeURIComponent(open.email || "") + "?subject=" + encodeURIComponent("Re: your inquiry about " + (open.courseTitle || "GHz Academy")) + "&body=" + encodeURIComponent("Hello " + (open.name || "") + ",\n\n"),
          onClick: async () => { try { await setStatus(open, "replied"); } catch (_) {} }
        }, "Reply by email"),
        e("button", { type: "button", className: "amv2-ghost", onClick: async () => { try { await setStatus(open, "archived"); } catch (err) { setDlg({ title: "Could not archive", message: fbErr(err), tone: "danger", confirmLabel: "OK", onConfirm: async () => setDlg(null) }); } } }, "Archive"),
        e("button", { type: "button", className: "amv2-del", onClick: () => setDlg({
          title: "Delete this message?",
          message: "This inquiry will be removed.",
          name: open.name,
          tone: "danger",
          confirmLabel: "Delete",
          onConfirm: async () => {
            await deleteDoc(doc(db, "inquiries", open.id));
            setRows((prev) => prev.filter((x) => x.id !== open.id));
            setOpen(null);
            setDlg(null);
          }
        }) }, "Delete")
      )
    ) : null,
    e(ConfirmDialog, {
      open: !!dlg, title: dlg?.title, message: dlg?.message, name: dlg?.name, tone: dlg?.tone,
      confirmLabel: dlg?.confirmLabel, onCancel: () => setDlg(null), onConfirm: dlg?.onConfirm
    })
  );
}

function Host() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const load = async () => {
    setLoading(true); setError(null);
    try {
      const snap = await getDocs(query(collection(db, "inquiries"), orderBy("createdAt", "desc")));
      setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    } catch (err) {
      setRows([]); setError(fbErr(err)); setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);
  return e(Boundary, { onRetry: load }, e(App, { rows, setRows, loading, error, onRetry: load, reload: load }));
}

const roots = new WeakMap();
export function renderAdminMessagesV2(host, opts = {}) {
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
    showSecErr(host, err, () => renderAdminMessagesV2(host, opts));
  }
}
