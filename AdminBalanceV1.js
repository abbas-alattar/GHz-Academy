import { createElement as e, useEffect, useMemo, useState, Component } from "https://esm.sh/react@18.3.1";
import { createRoot } from "https://esm.sh/react-dom@18.3.1/client";
import { db } from "./firebase-config.js?v=auth8";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { AdminPdfButton, fmtPdfDate } from "./AdminPdfExport.js";
import { csvDown } from "./grades-shell.js";

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
  componentDidCatch(err) { console.error("AdminBalanceV1", err); }
  render() {
    if (this.state.err) {
      return e("div", { className: "admin-balance bl1" },
        e("p", { className: "bl1-err" }, String(this.state.err?.message || this.state.err)),);
    }
    return this.props.children;
  }
}

let cache = null;
const stNorm = (s) => String(s || "").toLowerCase();
function isConfirmed(st) { const s = stNorm(st); return s === "enrolled" || s === "confirmed"; }
function isPending(st) { const s = stNorm(st); return s === "pending_payment" || s === "payment_submitted"; }
function isCancel(st) { const s = stNorm(st); return s === "cancelled" || s === "canceled" || s === "rejected"; }
function tsMs(v) { try { if (!v) return 0; if (v.toMillis) return v.toMillis(); if (v.toDate) return v.toDate().getTime(); const t = new Date(v).getTime(); return isNaN(t) ? 0 : t; } catch { return 0; } }
function money(n, cur) { const v = Number(n) || 0; return (cur ? cur + " " : "") + v.toLocaleString(undefined, { maximumFractionDigits: 2 }); }
function amtOf(r, course) {
  const a = r.amount ?? r.paidAmount ?? r.price;
  if (a != null && a !== "") return Number(a) || 0;
  return Number(course?.price || course?.amount || 0) || 0;
}
function curOf(r, course) { return r.currency || course?.currency || "USD"; }
function StatusBadge({ status }) {
  const st = String(status || "—");
  const k = st.toLowerCase();
  const cls = k === "open" ? "bl1-open" : k === "closed" ? "bl1-closed" : k === "completed" ? "bl1-done" : k.indexOf("archiv") >= 0 ? "bl1-off" : k.indexOf("soon") >= 0 ? "bl1-soon" : "bl1-off";
  return e("span", { className: "bl1-sb " + cls }, st);
}
function pill(st) {
  if (isConfirmed(st)) return e("span", { className: "bl1-pill bl1-ok" }, "Confirmed");
  if (stNorm(st) === "rejected") return e("span", { className: "bl1-pill bl1-no" }, "Rejected");
  if (isCancel(st)) return e("span", { className: "bl1-pill bl1-off" }, "Cancelled");
  return e("span", { className: "bl1-pill bl1-wait" }, "Pending");
}
function Ico({ kind }) {
  const paths = {
    wallet: [e("rect", { key: "a", x: 2, y: 6, width: 20, height: 12, rx: 2 }), e("path", { key: "b", d: "M2 10h20" }), e("circle", { key: "c", cx: 16, cy: 14, r: 1.4 })],
    arrow: [e("path", { key: "a", d: "M12 19V5" }), e("path", { key: "b", d: "M5 12l7-7 7 7" })],
    clock: [e("circle", { key: "a", cx: 12, cy: 12, r: 9 }), e("path", { key: "b", d: "M12 7v5l3 2" })],
    x: [e("circle", { key: "a", cx: 12, cy: 12, r: 9 }), e("path", { key: "b", d: "M15 9l-6 6M9 9l6 6" })]
  };
  const cls = kind === "wallet" ? "navy" : kind === "arrow" ? "blue" : kind === "clock" ? "amber" : "red";
  return e("span", { className: "bl1-ico " + cls },
    e("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8 }, paths[kind]));
}

function Page() {
  const [pack, setPack] = useState(cache);
  const [errR, setErrR] = useState("");
  const [errC, setErrC] = useState("");
  const [q, setQ] = useState("");
  const [cid, setCid] = useState("");
  const [st, setSt] = useState("");
  const [month, setMonth] = useState("");
  const [sort, setSort] = useState("date");
  const [page, setPage] = useState(0);
  const [tip, setTip] = useState(null);
  const [showFreeC, setShowFreeC] = useState(false);
  const [showFreeT, setShowFreeT] = useState(false);
  const load = async () => {
    setErrR(""); setErrC("");
    const [regsP, coursesP] = await Promise.allSettled([getDocs(collection(db, "registrations")), getDocs(collection(db, "courses"))]);
    let regs = cache?.regs || [], courses = cache?.courses || [];
    if (regsP.status === "fulfilled") regs = regsP.value.docs.map((d) => ({ id: d.id, ...d.data() }));
    else setErrR(regsP.reason?.code || regsP.reason?.message || "Could not load registrations");
    if (coursesP.status === "fulfilled") courses = coursesP.value.docs.map((d) => ({ id: d.id, ...d.data() }));
    else setErrC(coursesP.reason?.code || coursesP.reason?.message || "Could not load courses");
    cache = { regs, courses, at: Date.now() };
    setPack(cache);
  };
  useEffect(() => { if (cache) setPack(cache); load(); }, []);
  const courses = pack?.courses || [];
  const courseById = useMemo(() => Object.fromEntries(courses.map((c) => [c.id, c])), [courses]);
  const rows = useMemo(() => (pack?.regs || []).map((r) => {
    const c = courseById[r.courseId] || {};
    const amount = amtOf(r, c);
    const currency = curOf(r, c);
    const when = tsMs(r.confirmedAt || r.paidAt || r.updatedAt || r.createdAt);
    return {
      ...r, amount, currency, when,
      courseTitle: c.title || r.courseTitle || r.courseId,
      trainer: (Array.isArray(c.trainerNames) ? c.trainerNames.filter(Boolean).join(", ") : "") || c.trainerName || "—",
      courseStatus: c.status,
      price: Number(c.price || r.amount || 0)
    };
  }).sort((a, b) => b.when - a.when), [pack, courseById]);

  const confirmed = rows.filter((r) => isConfirmed(r.status));
  const paidConf = confirmed.filter((r) => r.amount > 0);
  const freeConf = confirmed.filter((r) => !(r.amount > 0));
  const pending = rows.filter((r) => isPending(r.status));
  const cancelled = rows.filter((r) => isCancel(r.status));
  const byCur = {};
  paidConf.forEach((r) => { byCur[r.currency] = (byCur[r.currency] || 0) + r.amount; });
  const currencies = Object.keys(byCur);
  const mainCur = currencies[0] || "USD";
  const now = new Date();
  const ym = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
  const thisM = ym(now);
  const last = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastM = ym(last);
  const sumMonth = (key) => paidConf.filter((r) => ym(new Date(r.when || 0)) === key && r.currency === mainCur).reduce((a, r) => a + r.amount, 0);
  const thisAmt = sumMonth(thisM);
  const lastAmt = sumMonth(lastM);
  const delta = lastAmt ? Math.round(((thisAmt - lastAmt) / lastAmt) * 100) : (thisAmt ? 100 : 0);
  const payers = new Set(paidConf.map((r) => r.uid || r.email || r.id)).size;
  const avg = payers ? (byCur[mainCur] || 0) / payers : 0;

  const months = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = ym(d);
    const list = paidConf.filter((r) => ym(new Date(r.when || 0)) === key && r.currency === mainCur);
    months.push({ key, lab: d.toLocaleString(undefined, { month: "short" }), amt: list.reduce((a, r) => a + r.amount, 0), n: list.length, now: key === thisM });
  }
  const maxBar = Math.max(1, ...months.map((m) => m.amt));
  const yTicks = [maxBar, maxBar / 2, 0];

  const byCourseMap = {};
  rows.forEach((r) => {
    const id = r.courseId || r.courseTitle;
    if (!byCourseMap[id]) byCourseMap[id] = { id, title: r.courseTitle, trainer: r.trainer, status: r.courseStatus, price: r.price, confN: 0, confA: 0, pendA: 0, cur: r.currency };
    if (isConfirmed(r.status) && r.amount > 0) { byCourseMap[id].confN++; byCourseMap[id].confA += r.amount; }
    if (isConfirmed(r.status) && !(r.amount > 0)) byCourseMap[id].freeN = (byCourseMap[id].freeN || 0) + 1;
    if (isPending(r.status)) byCourseMap[id].pendA += r.amount;
  });
  const byCourseAll = Object.values(byCourseMap).sort((a, b) => b.confA - a.confA);
  const byCourse = showFreeC ? byCourseAll : byCourseAll.filter((c) => !(!(c.price > 0) && !c.confN));
  const totConf = byCourseAll.reduce((a, x) => a + x.confA, 0);
  const donut = (() => {
    const paid = byCourseAll.filter((x) => x.confA > 0);
    if (!paid.length) return [];
    const top = paid.slice(0, 5);
    const rest = paid.slice(5).reduce((a, x) => a + x.confA, 0);
    const parts = top.map((x) => ({ t: x.title, v: x.confA }));
    if (rest) parts.push({ t: "Others", v: rest });
    return parts;
  })();

  const txBase = showFreeT ? rows : rows.filter((r) => r.amount > 0);
  const filtered = txBase.filter((r) => {
    const s = q.trim().toLowerCase();
    if (s && ![r.studentName, r.name, r.studentId, r.email, r.courseTitle].some((x) => String(x || "").toLowerCase().includes(s))) return false;
    if (cid && r.courseId !== cid) return false;
    if (st === "confirmed" && !isConfirmed(r.status)) return false;
    if (st === "pending" && !isPending(r.status)) return false;
    if (st === "cancelled" && !isCancel(r.status)) return false;
    if (month && ym(new Date(r.when || 0)) !== month) return false;
    return true;
  }).sort((a, b) => sort === "amount" ? b.amount - a.amount : b.when - a.when);
  const per = 25;
  const slice = filtered.slice(page * per, page * per + per);
  useEffect(() => { setPage(0); }, [q, cid, st, month, sort, showFreeT]);

  const pdfData = () => ({
    page: "Balance",
    filters: [cid || "All courses", st || "All statuses", month || "All months"].join(" · "),
    summary: "Confirmed " + money(byCur[mainCur] || 0, mainCur) + " · Pending " + pending.length + " · Cancelled " + cancelled.length,
    columns: [
      { key: "date", label: "Date" }, { key: "student", label: "Student" }, { key: "id", label: "ID" },
      { key: "course", label: "Course" }, { key: "amount", label: "Amount" }, { key: "method", label: "Method" }, { key: "status", label: "Status" }
    ],
    rows: filtered.map((r) => ({
      date: fmtPdfDate(r.confirmedAt || r.createdAt),
      student: r.studentName || r.name || "—",
      id: r.studentId || "—",
      course: r.courseTitle,
      amount: money(r.amount, r.currency),
      method: r.paymentMethod || "—",
      status: isConfirmed(r.status) ? "Confirmed" : isPending(r.status) ? "Pending" : isCancel(r.status) ? (stNorm(r.status) === "rejected" ? "Rejected" : "Cancelled") : r.status
    }))
  });
  const exportCsv = () => {
    csvDown("balance.csv", [
      ["Date", "Student", "ID", "Email", "Course", "Amount", "Currency", "Method", "Status"],
      ...filtered.map((r) => [fmtPdfDate(r.confirmedAt || r.createdAt), r.studentName || r.name, r.studentId, r.email, r.courseTitle, r.amount, r.currency, r.paymentMethod || "", r.status])
    ]);
  };

  const r = 42, circ = 2 * Math.PI * r;
  let acc = 0;
  const cols = ["#2563EB", "#06B6D4", "#8B5CF6", "#F59E0B", "#16A34A", "#94A3B8"];
  const paidN = paidConf.length;
  const txLabel = filtered.length === 1 ? "1 transaction" : filtered.length + " transactions";
  const pages = Math.max(1, Math.ceil(filtered.length / per) || 1);

  return e("div", { className: "admin-balance bl1" },
    e("div", { className: "bl1-head" },
      e("div", null, e("h2", null, "Balance"), e("p", { className: "bl1-sub" }, "Confirmed payments only — cancelled and rejected stay out of the total")),
      e("div", { className: "bl1-act" },
        e("button", { type: "button", className: "bl1-btn", onClick: exportCsv }, "Export CSV"),
        e(AdminPdfButton, { getData: pdfData, page: "Balance", label: "View PDF", className: "bl1-pdf" })
      )
    ),
    errR ? e("p", { className: "bl1-err" }, errR, " ", e("button", { type: "button", className: "bl1-btn", onClick: load }, "Try again")) : null,
    errC ? e("p", { className: "bl1-err" }, errC, " ", e("button", { type: "button", className: "bl1-btn", onClick: load }, "Try again")) : null,
    !pack ? e("div", { className: "bl1-sk" }) : e("div", { className: "bl1-cards" },
      e("div", { className: "bl1-card main" }, e(Ico, { kind: "wallet" }), e("div", { className: "bl1-card-body" },
        e("span", { className: "bl1-lab" }, "Confirmed balance"),
        currencies.map((c) => e("strong", { className: "bl1-num", key: c }, money(byCur[c], c))),
        e("div", { className: "bl1-note" }, paidN + " paid registration" + (paidN === 1 ? "" : "s")))),
      e("div", { className: "bl1-card" }, e(Ico, { kind: "arrow" }), e("div", { className: "bl1-card-body" },
        e("span", { className: "bl1-lab" }, "This month"),
        e("strong", { className: "bl1-num" }, money(thisAmt, mainCur)),
        e("div", { className: "bl1-note" }, e("span", { className: "bl1-pilldelta " + (delta >= 0 ? "bl1-up" : "bl1-dn") }, (delta >= 0 ? "↑ " : "↓ ") + Math.abs(delta) + "% vs last month")))),
      e("div", { className: "bl1-card" }, e(Ico, { kind: "clock" }), e("div", { className: "bl1-card-body" },
        e("span", { className: "bl1-lab" }, "Pending"),
        e("strong", { className: "bl1-num" }, money(pending.reduce((a, r) => a + r.amount, 0), mainCur)),
        e("div", { className: "bl1-note" }, pending.length + " awaiting confirmation"))),
      e("div", { className: "bl1-card" }, e(Ico, { kind: "x" }), e("div", { className: "bl1-card-body" },
        e("span", { className: "bl1-lab" }, "Cancelled / rejected"),
        e("strong", { className: "bl1-num" }, money(cancelled.reduce((a, r) => a + r.amount, 0), mainCur)),
        e("div", { className: "bl1-note" }, cancelled.length + " · not in balance")))
    ),
    pack ? e("div", { className: "bl1-strip" },
      e("span", { className: "bl1-chip" }, "Average per student · " + money(avg, mainCur)),
      e("span", { className: "bl1-chip" }, payers + " paying student" + (payers === 1 ? "" : "s")),
      freeConf.length ? e("span", { className: "bl1-chip mute" }, freeConf.length + " free enrollment" + (freeConf.length === 1 ? "" : "s")) : null
    ) : null,
    e("div", { className: "bl1-charts" },
      e("div", { className: "bl1-chart" },
        e("h3", null, "Confirmed payments · last 12 months"),
        e("div", { className: "bl1-plot" },
          e("div", { className: "bl1-y" }, yTicks.map((t, i) => e("span", { key: i }, money(t, "")))),
          e("div", { className: "bl1-bars" },
            e("div", { className: "bl1-grid" }, e("i"), e("i"), e("i")),
            months.map((m) => e("div", {
              key: m.key,
              className: "bl1-col" + (m.now ? " now" : "") + (m.amt ? "" : " empty"),
              style: { height: m.amt ? Math.max(8, (m.amt / maxBar) * 100) + "%" : undefined },
              onMouseEnter: (ev) => setTip({ t: m.lab + ": " + money(m.amt, mainCur) + " · " + m.n, x: ev.clientX, y: ev.clientY }),
              onMouseLeave: () => setTip(null)
            })),
            tip ? e("div", { className: "bl1-tip", style: { left: 8, top: 8 } }, tip.t) : null
          ),
          e("div", { className: "bl1-ml" }, months.map((m) => e("span", { key: m.key }, m.lab)))
        )
      ),
      e("div", { className: "bl1-chart" },
        e("h3", null, "Revenue by course"),
        donut.length ? e("div", { className: "bl1-donutrow" },
          e("div", { className: "bl1-donutwrap" },
            e("svg", { width: 140, height: 140, viewBox: "0 0 120 120" },
              e("circle", { cx: 60, cy: 60, r, fill: "none", stroke: "#E2E8F0", strokeWidth: 12 }),
              donut.map((p, i) => {
                const len = totConf ? (p.v / totConf) * circ : 0;
                const gap = 4;
                const el = e("circle", { key: p.t, cx: 60, cy: 60, r, fill: "none", stroke: cols[i % cols.length], strokeWidth: 12, strokeLinecap: "round", strokeDasharray: Math.max(0, len - gap) + " " + circ, strokeDashoffset: -acc, transform: "rotate(-90 60 60)" });
                acc += len;
                return el;
              })
            ),
            e("span", null, money(totConf, mainCur))
          ),
          e("ul", { className: "bl1-leg" }, donut.map((p, i) => e("li", { key: p.t },
            e("span", { className: "bl1-dot", style: { background: cols[i % cols.length] } }),
            e("span", { className: "bl1-trunc", title: p.t }, p.t),
            e("span", null, money(p.v, mainCur)),
            e("span", { className: "bl1-mute" }, totConf ? Math.round((p.v / totConf) * 100) + "%" : "—")
          )))
        ) : e("p", { className: "bl1-empty" }, "No paid revenue yet")
      )
    ),
    e("div", { className: "bl1-block" },
      e("div", { className: "bl1-block-h" },
        e("h3", null, "Revenue by course"),
        e("button", { type: "button", className: "bl1-tog", onClick: () => setShowFreeC((v) => !v) }, showFreeC ? "Hide free courses" : "Show free courses")
      ),
      e("div", { className: "bl1-table" },
        e("div", { className: "bl1-th bl1-rev" }, e("span", null, "Course"), e("span", null, "Trainer(s)"), e("span", null, "Status"), e("span", { className: "bl1-amt" }, "Price"), e("span", { className: "bl1-amt" }, "Confirmed students"), e("span", { className: "bl1-amt" }, "Confirmed amount"), e("span", { className: "bl1-amt" }, "Pending"), e("span", null, "Share")),
        byCourse.map((c) => e("div", { className: "bl1-row bl1-rev", key: c.id },
          e("div", null, c.title),
          e("div", null, c.trainer),
          e("div", null, e(StatusBadge, { status: c.status })),
          e("div", { className: "bl1-amt" }, money(c.price, c.cur)),
          e("div", { className: "bl1-amt" }, String(c.confN)),
          e("div", { className: "bl1-amt" }, money(c.confA, c.cur)),
          e("div", { className: "bl1-amt" }, money(c.pendA, c.cur)),
          e("div", { className: "bl1-share" }, e("div", { className: "bl1-barmini" }, e("i", { style: { width: (totConf ? (c.confA / totConf) * 100 : 0) + "%" } })), totConf ? Math.round((c.confA / totConf) * 100) + "%" : "—")
        )),
        e("div", { className: "bl1-row bl1-rev bl1-tot" }, e("div", null, "Total"), e("div", null, ""), e("div", null, ""), e("div", null, ""), e("div", { className: "bl1-amt" }, String(paidN)), e("div", { className: "bl1-amt" }, money(totConf, mainCur)), e("div", { className: "bl1-amt" }, money(pending.reduce((a, r) => a + r.amount, 0), mainCur)), e("div", null, "100%"))
      )
    ),
    e("div", { className: "bl1-block" },
      e("div", { className: "bl1-block-h" },
        e("h3", null, "Transactions"),
        e("button", { type: "button", className: "bl1-tog", onClick: () => setShowFreeT((v) => !v) }, showFreeT ? "Hide free enrollments" : "Show free enrollments")
      ),
      e("div", { className: "bl1-filters" },
        e("input", { placeholder: "Search student, ID, course, email", value: q, onChange: (ev) => setQ(ev.target.value) }),
        e("select", { className: "bl1-course", value: cid, onChange: (ev) => setCid(ev.target.value) }, e("option", { value: "" }, "All courses"), courses.map((c) => e("option", { key: c.id, value: c.id }, c.title))),
        e("select", { value: st, onChange: (ev) => setSt(ev.target.value) }, e("option", { value: "" }, "All statuses"), e("option", { value: "confirmed" }, "Confirmed"), e("option", { value: "pending" }, "Pending"), e("option", { value: "cancelled" }, "Cancelled / rejected")),
        e("select", { value: month, onChange: (ev) => setMonth(ev.target.value) }, e("option", { value: "" }, "All months"), months.map((m) => e("option", { key: m.key, value: m.key }, m.lab + " " + m.key.slice(0, 4)))),
        e("select", { value: sort, onChange: (ev) => setSort(ev.target.value) }, e("option", { value: "date" }, "Sort by date"), e("option", { value: "amount" }, "Sort by amount"))
      ),
      e("div", { className: "bl1-table" },
        e("div", { className: "bl1-th bl1-tx" }, e("span", null, "Date"), e("span", null, "Student"), e("span", null, "Course"), e("span", { className: "bl1-amt" }, "Amount"), e("span", null, "Method"), e("span", null, "Status")),
        slice.map((r) => e("div", { className: "bl1-row bl1-tx", key: r.id },
          e("div", null, r.when ? new Date(r.when).toLocaleDateString() : "—"),
          e("div", null, r.studentName || r.name || "—", e("div", { className: "bl1-sid" }, r.studentId || "")),
          e("div", null, r.courseTitle),
          e("div", { className: "bl1-amt" }, money(r.amount, r.currency)),
          e("div", { className: r.paymentMethod ? "" : "bl1-mute" }, r.paymentMethod || "—"),
          e("div", null, pill(r.status))
        )),
        e("div", { className: "bl1-page" },
          e("span", null, txLabel),
          e("button", { type: "button", className: "bl1-btn", disabled: page === 0, onClick: () => setPage((p) => p - 1) }, "Prev"),
          e("span", null, "Page " + (page + 1) + " of " + pages),
          e("button", { type: "button", className: "bl1-btn", disabled: (page + 1) * per >= filtered.length, onClick: () => setPage((p) => p + 1) }, "Next")
        )
      )
    ),);
}

let root;
export function renderAdminBalanceV1(host, opts = {}) {
  if (!host) return false;
  try {
    if (!root) root = createRoot(host);
    root.render(e(Boundary, null, e(Page, opts || {})));
    return true;
  } catch (err) {
    console.error("AdminBalanceV1", err);
    showSecErr(host, err, () => renderAdminBalanceV1(host, opts));
    return false;
  }
}
