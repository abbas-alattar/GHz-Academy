import { createElement as e, useEffect, useMemo, useState, Component } from "https://esm.sh/react@18.3.1";
import { createRoot } from "https://esm.sh/react-dom@18.3.1/client";
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
  componentDidCatch(err) { console.error("AdminRegistrationsV2", err); }
  render() {
    if (this.state.err) {
      return e("div", { className: "admin-regs arv2" },
        e("p", { className: "arv2-err" }, "Registrations could not load"),);
    }
    return this.props.children;
  }
}

const EDGE = ["#2563EB", "#16A34A", "#D97706", "#7C3AED", "#0EA5E9", "#EC4899"];
const hue = (id) => { let h = 0; String(id || "").split("").forEach((c) => { h = (h * 31 + c.charCodeAt(0)) >>> 0; }); return EDGE[h % EDGE.length]; };
const initials = (n) => String(n || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
const avBg = (n) => { let h = 0; String(n || "").split("").forEach((c) => { h = (h * 17 + c.charCodeAt(0)) % 360; }); return `linear-gradient(135deg,hsl(${h},62%,42%),hsl(${(h+40)%360},70%,56%))`; };
function tsMs(v) { try { if (!v) return 0; if (v.toMillis) return v.toMillis(); if (v.toDate) return v.toDate().getTime(); const t = new Date(v).getTime(); return isNaN(t) ? 0 : t; } catch { return 0; } }
function ago(ms) {
  if (!ms) return "—";
  const s = Math.max(0, Date.now() - ms);
  if (s < 60000) return "now";
  if (s < 3600000) return Math.round(s / 60000) + "m";
  if (s < 86400000) return Math.round(s / 3600000) + "h";
  return Math.round(s / 86400000) + "d";
}
function fullDate(ms) { return ms ? new Date(ms).toLocaleString() : "—"; }
function dateParts(ms) {
  if (!ms) return { d: "—", t: "" };
  const d = new Date(ms);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return { d: dd + "/" + mm + "/" + yyyy, t: hh + ":" + mi };
}
function labelOf(st) {
  return ({ pending_payment: "Awaiting payment", payment_submitted: "Payment submitted – review", enrolled: "Confirmed", confirmed: "Confirmed", cancelled: "Cancelled", rejected: "Rejected" })[st] || st;
}
function pillClass(st) {
  if (st === "payment_submitted") return "review";
  if (st === "pending_payment") return "wait";
  if (st === "enrolled" || st === "confirmed") return "ok";
  if (st === "rejected") return "rej";
  return "gray";
}
function bucket(st) {
  if (st === "payment_submitted") return "review";
  if (st === "pending_payment") return "wait";
  if (st === "enrolled" || st === "confirmed") return "ok";
  if (st === "cancelled" || st === "rejected") return "cancel";
  return "other";
}
function issueLabel(it) {
  const p = String(it.problem || "");
  if (it.kind === "missing" || /no enrollment/i.test(p)) return { text: "Confirmed but no enrollment", cls: "blue" };
  if (/rejected/i.test(p)) return { text: "Still enrolled after rejected", cls: "amber" };
  if (/cancelled/i.test(p)) return { text: "Still enrolled after cancelled", cls: "amber" };
  return { text: p || "Still enrolled after rejected", cls: "amber" };
}

function Page({ regs, courses, error, loading, onRetry, onConfirm, onReject, onCancel, onRefresh, onAudit, onFix }) {
  regs = Array.isArray(regs) ? regs : [];
  courses = Array.isArray(courses) ? courses : [];
  const [tab, setTab] = useState("all");
  const [cid, setCid] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(null);
  const [ask, setAsk] = useState(null);
  const [audit, setAudit] = useState(null);
  const [picked, setPicked] = useState({});
  const [busy, setBusy] = useState(false);
  const [fixedN, setFixedN] = useState(0);

  useEffect(() => {
    const quiet = () => onRefresh?.();
    const id = setInterval(quiet, 90000);
    window.addEventListener("focus", quiet);
    const onFilter = (ev) => {
      const name = String(ev.detail?.q || "").trim();
      const courseId = String(ev.detail?.courseId || "").trim();
      if (name) setQ(name);
      if (courseId) setCid(courseId);
    };
    window.addEventListener("ghz-filter-regs", onFilter);
    return () => { clearInterval(id); window.removeEventListener("focus", quiet); window.removeEventListener("ghz-filter-regs", onFilter); };
  }, [onRefresh]);

  const counts = useMemo(() => {
    const review = regs.filter((r) => bucket(r.status) === "review").length;
    const wait = regs.filter((r) => bucket(r.status) === "wait").length;
    const ok = regs.filter((r) => bucket(r.status) === "ok").length;
    const cancel = regs.filter((r) => bucket(r.status) === "cancel" || bucket(r.status) === "other").length;
    return { review, wait, ok, cancel, all: review + wait + ok + cancel };
  }, [regs]);

  const rows = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const list = regs.filter((r) => {
      if (tab !== "all" && (tab === "cancel" ? (bucket(r.status) !== "cancel" && bucket(r.status) !== "other") : bucket(r.status) !== tab)) return false;
      if (cid && r.courseId !== cid) return false;
      if (!qq) return true;
      return [r.studentName, r.studentEmail, r.courseTitle].join(" ").toLowerCase().includes(qq);
    });
    const rank = (r) => bucket(r.status) === "review" ? 0 : bucket(r.status) === "wait" ? 1 : 2;
    return [...list].sort((a, b) => rank(a) - rank(b) || tsMs(b.createdAt) - tsMs(a.createdAt));
  }, [regs, tab, cid, q]);

  const courseTitle = (r) => r.courseTitle || (courses.find((c) => c.id === r.courseId) || {}).title || "Course";

  const stOf = (r) => String(r.status || "");
  const isOk = (r) => stOf(r) === "enrolled" || stOf(r) === "confirmed";
  const isClosed = (r) => stOf(r) === "cancelled" || stOf(r) === "rejected";
  const acts = (r, stop) => {
    if (stOf(r) === "payment_submitted") {
      return e("div", { className: "arv2-acts", onClick: stop },
        e("button", { type: "button", className: "arv2-ok", onClick: () => onConfirm(r) }, "Confirm"),
        e("button", { type: "button", className: "arv2-no", onClick: () => onReject(r) }, "Reject")
      );
    }
    if (isOk(r)) {
      return e("div", { className: "arv2-acts", onClick: stop },
        e("button", { type: "button", className: "arv2-no", onClick: () => setAsk(r) }, "Cancel registration")
      );
    }
    if (isClosed(r)) {
      return e("div", { className: "arv2-acts", onClick: stop },
        e("button", { type: "button", className: "arv2-ok", onClick: () => onConfirm(r) }, "Re-confirm")
      );
    }
    return e("div", { className: "arv2-acts", onClick: stop }, e("button", { type: "button", className: "arv2-view", onClick: () => setOpen(r) }, "View"));
  };

  if (error) {
    return e("div", { className: "admin-regs arv2" }, e("p", { className: "arv2-err" }, String(error)), e("button", { type: "button", className: "arv2-ok", onClick: onRetry }, "Try again"),);
  }

  return e("div", { className: "admin-regs arv2" },
    e("div", { style: { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" } },
      e("div", null, e("h2", null, "Registrations"), e("p", { className: "sub" }, "Review payments and confirm student enrollments")),
      e(AdminPdfButton, { page: "Registrations", getData: () => ({
        page: "Registrations",
        filters: "Status: " + (tab === "all" ? "All" : tab) + (cid ? " · Course: " + ((courses.find((c) => c.id === cid) || {}).title || cid) : " · Course: All courses") + (q ? " · Search: " + q : ""),
        summary: "Total " + rows.length + " · Confirmed " + counts.ok + " · Pending " + (counts.review + counts.wait),
        columns: [
          { key: "student", label: "Student" }, { key: "email", label: "Email" }, { key: "course", label: "Course" },
          { key: "amount", label: "Amount" }, { key: "status", label: "Status" }, { key: "method", label: "Payment method" }, { key: "date", label: "Date" }
        ],
        rows: rows.map((r) => ({
          student: r.studentName || "Student", email: r.studentEmail || "—", course: courseTitle(r),
          amount: (r.amount || 0) + " " + (r.currency || ""), status: labelOf(r.status), method: r.paymentMethod || "—", date: fmtPdfDate(r.createdAt)
        }))
      }) })
    ),
    e("div", { className: "arv2-stats" },
      [
        { k: "review", n: counts.review, label: "Needs review", cls: counts.review ? " amber" : "" },
        { k: "wait", n: counts.wait, label: "Awaiting payment", cls: "" },
        { k: "ok", n: counts.ok, label: "Confirmed", cls: "" },
        { k: "cancel", n: counts.cancel, label: "Cancelled / rejected", cls: "" }
      ].map((s) => e("button", { type: "button", key: s.k, className: "arv2-stat" + s.cls, onClick: () => setTab(s.k) }, e("strong", null, String(s.n)), e("span", null, s.label)))
    ),
    e("div", { className: "arv2-bar" },
      [["all", "All"], ["review", "Needs review"], ["wait", "Awaiting payment"], ["ok", "Confirmed"], ["cancel", "Cancelled / rejected"]].map(([k, lab]) =>
        e("button", { type: "button", key: k, className: "arv2-pill" + (tab === k ? " on" : ""), onClick: () => setTab(k) }, lab + " " + (k === "all" ? counts.all : counts[k]))
      ),
      e("select", { className: "arv2-sel", value: cid, onChange: (ev) => setCid(ev.target.value) },
        e("option", { value: "" }, "All courses"),
        courses.map((c) => e("option", { key: c.id, value: c.id }, c.title))
      ),
      e("input", { className: "arv2-search", placeholder: "Search student, email, course", value: q, onChange: (ev) => setQ(ev.target.value) }),
      e("button", { type: "button", className: "arv2-view", onClick: async () => {
        setBusy(true);
        const list = await onAudit?.();
        setBusy(false);
        setAudit(Array.isArray(list) ? list : []);
        setPicked({});
        setFixedN(0);
      } }, busy ? "Checking…" : "Check enrollments")
    ),
    e("div", { className: "arv2-card" },
      e("div", { className: "arv2-th" }, e("div", null, "Student"), e("div", null, "Course"), e("div", null, "Amount"), e("div", null, "Status"), e("div", null, "Payment"), e("div", null, "Date"), e("div", null, "Actions")),
      loading ? [1, 2, 3].map((i) => e("div", { className: "arv2-row", key: i }, e("div", { className: "arv2-sk" }))) :
      !regs.length ? e("div", { className: "arv2-empty" }, e("p", null, "No registrations yet")) :
      !rows.length ? e("div", { className: "arv2-empty" }, e("p", null, "No registrations match"), e("button", { type: "button", className: "arv2-view", onClick: () => { setTab("all"); setCid(""); setQ(""); } }, "Clear filters")) :
      rows.map((r) => {
        const ms = tsMs(r.createdAt);
        const stop = (ev) => ev.stopPropagation();
        return e("div", { className: "arv2-row", key: r.id, onClick: () => setOpen(r) },
          e("div", { className: "arv2-edge", style: { background: hue(r.courseId) } }),
          e("div", { className: "arv2-stu" },
            e("div", { className: "arv2-av", style: { background: avBg(r.studentName) } }, initials(r.studentName || r.studentEmail)),
            e("div", null, e("p", null, r.studentName || "Student"), e("small", null, r.studentEmail || ""))
          ),
          e("div", null, courseTitle(r)),
          e("div", { style: { fontWeight: 700 } }, (r.amount || 0) + " " + (r.currency || "")),
          e("div", null, e("span", { className: "arv2-st " + pillClass(r.status) }, labelOf(r.status))),
          e("div", { style: { color: "#64748B", fontSize: 12.5 } }, [r.paymentMethod, r.paymentRef].filter(Boolean).join(" · ") || "—"),
          e("div", { className: "arv2-date", title: fullDate(ms) }, e("span", { className: "arv2-date-d" }, dateParts(ms).d), dateParts(ms).t ? e("span", { className: "arv2-date-t" }, dateParts(ms).t) : null),
          acts(r, stop)
        );
      })
    ),
    open ? e("div", { className: "arv2-dim", onClick: () => setOpen(null) }) : null,
    open ? e("aside", { className: "arv2-draw" },
      e("h3", null, open.studentName || "Student"),
      e("p", null, open.studentEmail || ""),
      open.phone ? e("p", null, open.phone) : null,
      e("p", null, courseTitle(open)),
      e("p", null, (open.amount || 0) + " " + (open.currency || "")),
      e("p", null, labelOf(open.status)),
      e("p", null, "Method: " + (open.paymentMethod || "—")),
      e("p", null, "Reference: " + (open.paymentRef || "—")),
      e("p", null, "Date: " + fullDate(tsMs(open.createdAt))),
      stOf(open) === "payment_submitted" ? e("div", { className: "arv2-acts", style: { marginTop: 16 } },
        e("button", { type: "button", className: "arv2-ok", onClick: () => onConfirm(open) }, "Confirm"),
        e("button", { type: "button", className: "arv2-no", onClick: () => onReject(open) }, "Reject")
      ) : isOk(open) ? e("button", { type: "button", className: "arv2-no", style: { marginTop: 16 }, onClick: () => setAsk(open) }, "Cancel registration")
      : isClosed(open) ? e("button", { type: "button", className: "arv2-ok", style: { marginTop: 16 }, onClick: () => onConfirm(open) }, "Re-confirm")
      : null,
      e("button", { type: "button", className: "arv2-ok", style: { marginTop: 16 }, onClick: () => setOpen(null) }, "Close")
    ) : null,
    e(ConfirmDialog, {
      open: !!ask,
      title: "Cancel this registration?",
      message: "The student will lose access to " + (ask ? courseTitle(ask) : "this course") + ". Their homework, quiz and attendance records are kept.",
      name: ask?.studentName,
      tone: "danger",
      confirmLabel: "Cancel registration",
      onCancel: () => setAsk(null),
      onConfirm: async () => { await onCancel(ask); setAsk(null); setOpen(null); }
    }),
    audit ? e("div", { className: "arv2-dim", onClick: () => setAudit(null) }) : null,
    audit ? e("div", { className: "arv2-check", role: "dialog", "aria-labelledby": "arv2-chk-title" },
      e("h3", { id: "arv2-chk-title" }, "Enrollment check"),
      e("p", { className: "arv2-chk-sub" }, "Enrollments that do not match their registration"),
      fixedN ? e("p", { className: "arv2-chk-ok" }, "Fixed " + fixedN + (fixedN === 1 ? " issue." : " issues.")) : null,
      !audit.length ? e("div", { className: "arv2-sync" }, e("span", { className: "arv2-tick" }, "✓"), e("p", null, "Everything is in sync")) : e("div", null,
        e("label", { className: "arv2-selall" },
          e("span", { className: "arv2-round" + (audit.length && audit.every((_, i) => picked[i]) ? " on" : "") }),
          e("input", { type: "checkbox", checked: audit.length > 0 && audit.every((_, i) => picked[i]), onChange: (ev) => {
            const on = ev.target.checked;
            const next = {};
            audit.forEach((_, i) => { next[i] = on; });
            setPicked(next);
          } }),
          "Select all"
        ),
        audit.map((it, i) => {
          const lab = issueLabel(it);
          return e("label", { key: i, className: "arv2-chk-row" },
            e("span", { className: "arv2-round" + (picked[i] ? " on" : "") }),
            e("input", { type: "checkbox", checked: !!picked[i], onChange: (ev) => setPicked((p) => ({ ...p, [i]: ev.target.checked })) }),
            e("div", { className: "arv2-av", style: { background: avBg(it.studentName) } }, initials(it.studentName)),
            e("span", { className: "arv2-chk-name" }, it.studentName || "Student"),
            e("span", { className: "arv2-chk-course" }, it.courseTitle || it.courseId || "Course"),
            e("span", { className: "arv2-prob " + lab.cls }, lab.text)
          );
        })
      ),
      e("div", { className: "arv2-chk-foot" },
        e("button", { type: "button", className: "arv2-view", onClick: () => setAudit(null) }, "Cancel"),
        e("button", {
          type: "button",
          className: "arv2-fixbtn",
          disabled: !audit.filter((_, i) => picked[i]).length,
          onClick: async () => {
            const sel = audit.filter((_, i) => picked[i]);
            if (!sel.length) return;
            await onFix(sel);
            setFixedN(sel.length);
            setBusy(true);
            const list = await onAudit?.();
            setBusy(false);
            setAudit(Array.isArray(list) ? list : []);
            setPicked({});
          }
        }, "Fix selected (" + audit.filter((_, i) => picked[i]).length + ")")
      )
    ) : null,);
}

let root;
export function renderAdminRegistrationsV2(host, opts = {}) {
  if (!host) return false;
  try {
    if (!root) root = createRoot(host);
    root.render(e(Boundary, null, e(Page, opts || {})));
    return true;
  } catch (err) {
    console.error("AdminRegistrationsV2", err);
    showSecErr(host, err, () => renderAdminRegistrationsV2(host, opts));
    return false;
  }
}
