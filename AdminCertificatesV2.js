import { createElement as e, useMemo, useState, useEffect, Component } from "https://esm.sh/react@18.3.1";
import { createRoot } from "https://esm.sh/react-dom@18.3.1/client";
import { db, auth } from "./firebase-config.js?v=auth10";
import { collection, query, where, getDocs, getDoc, doc, writeBatch, serverTimestamp, orderBy, limit, startAfter } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { parseScore, formatGrade, storedCourseResult } from "./gradeCalc.js";
import { loadGradeCourses, loadGradePack } from "./AdminGradesV2.js";
import { AdminPdfButton, fmtPdfDate } from "./AdminPdfExport.js";
import { ConfirmDialog } from "./ConfirmDialog.js";
import { courseStatusLabel, statusChipShort } from "./courseStatusLabel.js";

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
  componentDidCatch(err) { console.error("AdminCertificatesV2", err); }
  render() {
    if (this.state.err) {
      return e("div", null,
        e("p", { className: "acv2-err" }, String(this.state.err?.code || this.state.err?.message || this.state.err)),
        e("button", { type: "button", className: "acv2-pri", onClick: this.props.onRetry }, "Try again"));
    }
    return this.props.children;
  }
}

function fbErr(err) { return err?.code || err?.message || String(err); }
function isActive(st) { return st === "Open" || st === "Coming soon" || st === "Closed"; }
function isDone(st) { return st === "Completed"; }
function stClass(s) { if (s === "Open") return "open"; if (s === "Coming soon") return "soon"; return "gray"; }
function looksLikeUid(s) { return /^[A-Za-z0-9_-]{12,}$/.test(String(s || "")) && !/\s/.test(String(s || "")); }
function trainerIdsFromCourse(c) {
  if (!c) return [];
  const out = [];
  const add = (v) => {
    if (!v) return;
    if (Array.isArray(v)) { v.forEach(add); return; }
    const s = String(v).trim();
    if (s) out.push(s);
  };
  add(c.trainerIds); add(c.trainerId); add(c.instructors); add(c.instructorIds); add(c.instructorId);
  return [...new Set(out)];
}
function trainerLineFromNames(names) {
  const n = (names || []).filter(Boolean);
  if (!n.length) return "No trainer assigned";
  return (n.length === 1 ? "Trainer: " : "Trainers: ") + n.join(", ");
}
async function resolveTrainerNames(course) {
  try {
    const ids = trainerIdsFromCourse(course);
    if (!ids.length) {
      const named = course?.trainer || course?.trainerName || course?.instructor;
      if (typeof named === "string" && named.trim()) return [named.trim()];
      return [];
    }
    const settled = await Promise.allSettled(ids.map((id) => getDoc(doc(db, "users", id))));
    const names = [];
    settled.forEach((r, i) => {
      if (r.status === "fulfilled" && r.value?.exists?.()) {
        const d = r.value.data() || {};
        names.push(d.name || d.displayName || ids[i]);
      } else if (ids[i] && !looksLikeUid(ids[i])) names.push(ids[i]);
    });
    return [...new Set(names.filter(Boolean))];
  } catch { return []; }
}

const ALPHA = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
async function makeCode() {
  const year = new Date().getFullYear();
  for (let n = 0; n < 12; n++) {
    const buf = new Uint8Array(6);
    crypto.getRandomValues(buf);
    let tail = "";
    for (let i = 0; i < 6; i++) tail += ALPHA[buf[i] % ALPHA.length];
    const code = `GHZ-${year}-${tail}`;
    const snap = await getDoc(doc(db, "certificateVerify", code));
    if (!snap.exists()) return code;
  }
  throw new Error("Could not allocate a unique code");
}

function hydrateRow(r, scheme, courseStatus) {
  const res = storedCourseResult(scheme, r.rec, courseStatus);
  const done = String(courseStatus || "").trim().toLowerCase() === "completed";
  const result = res.badge || res.status || "In progress";
  const eligible = done && result === "Passed";
  return { ...r, vals: res.values || {}, avg: res.avg, status: res.status, unpublished: res.unpublished, missing: res.missing, result, eligible };
}
function fmtShort(v) {
  try {
    const d = v?.toDate ? v.toDate() : v ? new Date(v) : null;
    if (!d || isNaN(d)) return "";
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return dd + "/" + mm + "/" + d.getFullYear();
  } catch { return ""; }
}
function Ico({ d, stroke = "currentColor" }) {
  return e("svg", { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke, strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" }, e("path", { d }));
}

const LIST_DROP = /^(image|pdf|pdfData|dataUrl|fileData|html|preview|coverData)$/i;
function slimCert(d) {
  const raw = d.data ? d.data() : d;
  const out = { id: d.id };
  Object.keys(raw || {}).forEach((k) => {
    if (LIST_DROP.test(k)) return;
    const v = raw[k];
    if (typeof v === "string" && v.length > 4000) return;
    out[k] = v;
  });
  return out;
}
function kbOf(obj) {
  try { return Math.round(JSON.stringify(obj).length / 1024); } catch { return 0; }
}
async function timedRead(label, fn) {
  const t0 = (typeof performance !== "undefined" ? performance.now() : Date.now());
  try {
    const res = await fn();
    const ms = Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - t0);
    const n = res?.docs ? res.docs.length : (res?.exists ? 1 : (Array.isArray(res) ? res.length : 1));
    const kb = res?.docs ? kbOf(res.docs.map((d) => d.data())) : kbOf(res);
    console.log("[ghz-perf] certs", label, n, "docs", kb + "KB", ms + "ms");
    return { ok: true, res, ms, kb, n };
  } catch (err) {
    const ms = Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - t0);
    console.log("[ghz-perf] certs FAIL", label, err?.code || err?.message, ms + "ms");
    return { ok: false, err, ms, kb: 0, n: 0, res: null };
  }
}
const sessCache = { users: null, courses: null };
async function cachedCourses() {
  if (sessCache.courses) return sessCache.courses;
  const r = await timedRead("courses (session cache)", () => getDocs(collection(db, "courses")));
  if (!r.ok) return { ok: false, rows: [], err: r.err };
  const rows = r.res.docs.map((d) => {
    const data = d.data() || {};
    return { id: d.id, title: data.title, status: data.status, trainerIds: data.trainerIds, trainerName: data.trainerName, trainer: data.trainer, instructor: data.instructor };
  }).filter((c) => isActive(c.status) || isDone(c.status));
  sessCache.courses = { ok: true, rows, err: null, kb: r.kb, ms: r.ms };
  return sessCache.courses;
}
async function cachedUsers() {
  if (sessCache.users) return sessCache.users;
  const r = await timedRead("users (session cache)", () => getDocs(query(collection(db, "users"), limit(400))));
  const map = {};
  if (r.ok) {
    r.res.docs.forEach((d) => {
      const u = d.data() || {};
      map[d.id] = { name: u.name || u.displayName || "", studentId: u.studentId || "" };
    });
  }
  sessCache.users = map;
  return map;
}
async function fetchCertPage({ courseId, cursor, pageSize = 50 }) {
  const col = collection(db, "certificates");
  let qy;
  try {
    if (courseId) {
      qy = cursor
        ? query(col, where("courseId", "==", courseId), orderBy("issuedAt", "desc"), startAfter(cursor), limit(pageSize))
        : query(col, where("courseId", "==", courseId), orderBy("issuedAt", "desc"), limit(pageSize));
    } else {
      qy = cursor
        ? query(col, orderBy("issuedAt", "desc"), startAfter(cursor), limit(pageSize))
        : query(col, orderBy("issuedAt", "desc"), limit(pageSize));
    }
    const r = await timedRead("certificates limit " + pageSize, () => getDocs(qy));
    if (r.ok) return r;
  } catch (_) {}
  const fallback = courseId
    ? query(col, where("courseId", "==", courseId), limit(pageSize))
    : query(col, limit(pageSize));
  return timedRead("certificates fallback limit " + pageSize, () => getDocs(fallback));
}

async function issueOne(row, course, opts) {
  const user = auth.currentUser;
  const existing = row.cert;
  const reissue = existing && (existing.status === "revoked" || opts?.forceNew);
  const prevCode = existing?.certificateId || "";
  const code = reissue || !prevCode ? await makeCode() : prevCode;
  const history = Array.isArray(existing?.history) ? existing.history.slice() : [];
  if (reissue && prevCode) history.push(prevCode);
  const batch = writeBatch(db);
  const certRef = doc(db, "certificates", `${row.uid}_${course.id}`);
  const verRef = doc(db, "certificateVerify", code);
  const payload = {
    uid: row.uid,
    studentName: row.name,
    courseId: course.id,
    courseTitle: course.title || course.id,
    certificateId: code,
    status: "issued",
    average: row.avg,
    attendance: null,
    issuedAt: serverTimestamp(),
    issuedBy: user?.uid || "",
    revokedAt: null,
    revokedBy: null,
    revokeReason: null
  };
  if (opts?.manual) payload.manualOverride = true;
  if (history.length) payload.history = history;
  batch.set(certRef, payload, { merge: true });
  batch.set(verRef, {
    studentName: row.name,
    courseTitle: course.title || course.id,
    issuedAt: serverTimestamp(),
    status: "issued"
  });
  await batch.commit();
}

async function revokeOne(row, courseId, reason) {
  const user = auth.currentUser;
  const batch = writeBatch(db);
  const certRef = doc(db, "certificates", `${row.uid}_${courseId}`);
  const verRef = doc(db, "certificateVerify", row.cert.certificateId);
  batch.set(certRef, { status: "revoked", revokedAt: serverTimestamp(), revokedBy: user?.uid || "", revokeReason: reason }, { merge: true });
  batch.set(verRef, { status: "revoked" }, { merge: true });
  await batch.commit();
}

function App({ courses, courseId, setCourseId, pack, certs, trainers, loading, error, onRetry, reload, seedQ, usersMap, onMore, hasMore, moreLoading, packLoading }) {
  courses = Array.isArray(courses) ? courses : [];
  certs = Array.isArray(certs) ? certs : [];
  trainers = Array.isArray(trainers) ? trainers : [];
  usersMap = usersMap || {};
  const [q, setQ] = useState(seedQ || "");
  useEffect(() => { if (seedQ) setQ(seedQ); }, [seedQ]);
  const [stF, setStF] = useState("All");
  const [msg, setMsg] = useState("");
  const [dlg, setDlg] = useState(null);
  const course = (courses || []).find((c) => c.id === courseId) || courses?.[0] || null;
  const cid = course?.id || "";
  const components = pack?.components || [];
  const passMark = pack?.passMark ?? 60;
  const active = (courses || []).filter((c) => isActive(c.status));
  const done = (courses || []).filter((c) => isDone(c.status));
  const trainerLine = trainerLineFromNames(trainers);
  const [bulkOpen, setBulkOpen] = useState(false);
  const merged = useMemo(() => {
    const scheme = pack?.scheme || { components, passMark };
    const courseStatus = course?.status || "";
    const fromPack = (pack?.rows || []).map((r) => {
      const cert = (certs || []).find((c) => c.uid === r.uid) || null;
      const h = hydrateRow(r, scheme, courseStatus);
      const cstat = cert?.status === "issued" ? "Issued" : (cert?.status === "revoked" ? "Revoked" : "Waiting");
      return { ...h, cert, cstat };
    });
    if (fromPack.length) return fromPack;
    return (certs || []).map((cert) => {
      const u = usersMap[cert.uid] || {};
      const rec = { average: cert.average, scores: {} };
      const h = hydrateRow({ uid: cert.uid, name: cert.studentName || u.name || cert.uid || "", studentId: u.studentId || "", rec }, scheme, courseStatus);
      const cstat = cert?.status === "issued" ? "Issued" : (cert?.status === "revoked" ? "Revoked" : "Waiting");
      return { ...h, avg: Number.isFinite(h.avg) ? h.avg : cert.average, cert, cstat };
    });
  }, [pack, certs, components, passMark, usersMap, course]);
  const vis = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return merged.filter((r) => {
      if (qq && !(r.name || "").toLowerCase().includes(qq) && !(r.studentId || "").toLowerCase().includes(qq)) return false;
      if (stF !== "All" && r.cstat !== stF) return false;
      return true;
    });
  }, [merged, q, stF]);
  const enrolledN = merged.length;
  const passedN = merged.filter((r) => r.result === "Passed").length;
  const issuedN = merged.filter((r) => r.cstat === "Issued").length;
  const waitingN = merged.filter((r) => r.result === "Passed" && r.cstat !== "Issued" && r.cstat !== "Revoked").length;
  const courseDone = isDone(course?.status);
  const revokedN = merged.filter((r) => r.cstat === "Revoked").length;
  const pdfData = () => ({
    page: "Certificates",
    filters: (course?.title || "Course") + " · " + trainerLine + (q ? " · " + q : "") + (stF !== "All" ? " · " + stF : ""),
    summary: trainerLine,
    columns: [
      { key: "n", label: "#" }, { key: "student", label: "Student" }, { key: "sid", label: "Student ID" },
      { key: "avg", label: "Average" }, { key: "result", label: "Result" }, { key: "code", label: "Certificate code" },
      { key: "issued", label: "Issue date" }, { key: "status", label: "Status" }
    ],
    rows: vis.map((r, i) => ({
      n: i + 1, student: r.name, sid: r.studentId || "—",
      avg: Number.isFinite(r.avg) ? formatGrade(r.avg) : "—",
      result: r.result || "—",
      code: r.cert?.certificateId || "—",
      issued: r.cstat === "Issued" ? fmtPdfDate(r.cert?.issuedAt) : "—",
      status: r.cstat
    }))
  });
  const openCertTab = (row, print) => {
    const tab = window.open("about:blank", "_blank");
    if (!tab) { setMsg("Pop-up blocked. Allow pop-ups to view the certificate."); return; }
    try { tab.document.write("<p style='font-family:sans-serif;padding:24px'>Preparing certificate…</p>"); } catch (_) {}
    const q = "./certificate-view.html?id=" + encodeURIComponent(row.uid + "_" + cid) + (print ? "&download=1" : "");
    tab.location = q;
  };
  const finishIssue = async (row, manual) => {
    await issueOne(row, course, { manual: !!manual, forceNew: row.cstat === "Revoked" });
    setMsg("Issued.");
    setDlg(null);
    await reload();
  };
  const doIssue = (row) => {
    if (row.eligible) {
      finishIssue(row, false).catch((err) => setMsg(fbErr(err)));
      return;
    }
    setDlg({
      title: "Issue certificate anyway?",
      message: "This course is not completed. Issue the certificate anyway?",
      name: row.name,
      tone: "caution",
      confirmLabel: "Issue anyway",
      onConfirm: () => finishIssue(row, true)
    });
  };
  const doRevoke = (row) => {
    setDlg({
      title: "Revoke certificate?",
      message: "The student will lose access to this certificate.",
      name: row.name,
      tone: "danger",
      confirmLabel: "Revoke",
      inputLabel: "Revoke reason",
      inputRequired: true,
      onConfirm: async (reason) => {
        await revokeOne(row, cid, String(reason || "").trim());
        setMsg("Revoked.");
        setDlg(null);
        await reload();
      }
    });
  };
  const runBulk = (rows, label) => {
    if (!rows.length) { setMsg("No students to issue."); return; }
    const n = rows.length;
    setDlg({
      title: "Issue certificates?",
      message: "Issue certificates to " + n + " " + label + ".",
      tone: "info",
      confirmLabel: "Issue " + n + " certificate" + (n === 1 ? "" : "s"),
      onConfirm: async () => {
        let ok = 0, fail = 0, last = "";
        for (const row of rows) {
          try { await issueOne(row, course); ok++; }
          catch (err) { fail++; last = fbErr(err); }
        }
        if (fail && !ok) throw new Error(last || "Could not issue certificates");
        setMsg("Issued " + ok + (fail ? ", failed " + fail + (last ? " (" + last + ")" : "") : ""));
        setDlg(null);
        await reload();
      }
    });
  };
  const issueEligible = () => {
    setBulkOpen(false);
    if (!courseDone) { setMsg("Not eligible yet"); return; }
    runBulk(merged.filter((r) => r.eligible && r.cstat !== "Issued"), "eligible student(s)");
  };
  const issueEnrolled = () => {
    setBulkOpen(false);
    runBulk(merged.filter((r) => r.cstat !== "Issued"), "enrolled student(s)");
  };
  if (loading && !certs.length && !courses.length) {
    return e("div", { className: "admin-certs acv2" },
      e("div", { className: "acv2-head" }, e("div", null, e("h2", null, "Certificates"), e("p", { className: "sub" }, "Issue and manage course certificates"))),
      e("div", { className: "acv2-bar" }, e("select", { className: "acv2-sel", disabled: true }, e("option", null, "All courses")), e("input", { className: "acv2-in", disabled: true, placeholder: "Search" })),
      e("div", { className: "acv2-card" }, e("div", { className: "acv2-row" }, e("div", { className: "acv2-sk" })), e("div", { className: "acv2-row" }, e("div", { className: "acv2-sk" })))
    );
  }
  return e("div", { className: "admin-certs acv2" },
    e("div", { className: "acv2-head" },
      e("div", null, e("h2", null, "Certificates"), e("p", { className: "sub" }, "Issue and manage course certificates")),
      e(AdminPdfButton, { getData: pdfData, page: "Certificates" })
    ),
    e("div", { className: "acv2-bar" },
      e("select", { className: "acv2-sel", value: cid, "aria-label": "Course", onChange: (ev) => setCourseId(ev.target.value) },
        e("optgroup", { label: "Active courses" }, active.map((c) => e("option", { key: c.id, value: c.id }, c.title))),
        e("optgroup", { label: "Completed courses" }, done.map((c) => e("option", { key: c.id, value: c.id }, c.title)))
      ),
      course ? e("span", { className: "acv2-st " + stClass(course.status), title: courseStatusLabel(course) }, statusChipShort(course)) : null,
      e("span", { className: "acv2-tr" }, trainerLine),
      e("input", { className: "acv2-in", placeholder: "Search name or Student ID", value: q, onChange: (ev) => setQ(ev.target.value) }),
      e("select", { className: "acv2-sel", value: stF, "aria-label": "Status", onChange: (ev) => setStF(ev.target.value) },
        e("option", null, "All"), e("option", null, "Issued"), e("option", null, "Waiting"), e("option", null, "Revoked")
      ),
      e("div", { className: "acv2-drop" },
        e("button", { type: "button", className: "acv2-pri", disabled: !courseDone, title: courseDone ? "" : "Not eligible yet", onClick: () => { if (!courseDone) { setMsg("Not eligible yet"); return; } setBulkOpen((v) => !v); } }, "Issue to all eligible students"),
        bulkOpen ? e("div", { className: "acv2-menu", role: "menu" },
          e("button", { type: "button", onClick: issueEligible }, "Issue to all eligible students"),
          e("button", { type: "button", onClick: issueEnrolled }, "Issue to all enrolled students")
        ) : null
      )
    ),
    msg ? e("p", { className: "acv2-err", style: { color: "#0F2747" } }, msg) : null,
    e("div", { className: "acv2-stats" },
      e("div", { className: "acv2-stat" }, e("strong", null, String(enrolledN)), e("span", null, "Enrolled")),
      e("div", { className: "acv2-stat" }, e("strong", null, String(passedN)), e("span", null, "Passed"), e("div", { className: "acv2-note" }, "Pass mark " + passMark)),
      e("div", { className: "acv2-stat" }, e("strong", null, String(issuedN)), e("span", null, "Issued")),
      e("div", { className: "acv2-stat" }, e("strong", null, String(waitingN)), e("span", null, "Waiting")),
      e("div", { className: "acv2-stat" }, e("strong", null, String(revokedN)), e("span", null, "Revoked"))
    ),
    e(Boundary, { onRetry },
      e("div", { className: "acv2-card" },
        e("div", { className: "acv2-th" }, e("div", null, "#"), e("div", null, "Student"), e("div", null, "Average"), e("div", null, "Result"), e("div", null, "Certificate"), e("div", null, "Actions")),
        vis.length ? vis.map((r, i) => e("div", { className: "acv2-row", key: r.uid },
          e("div", null, String(i + 1)),
          e("div", null, e("span", { className: "acv2-name" }, r.name), e("span", { className: "acv2-sid" }, r.studentId || "—")),
          e("div", null, Number.isFinite(r.avg) ? formatGrade(r.avg) : "—"),
          e("div", null, e("span", { className: "acv2-pill " + (r.result === "Passed" ? "p" : r.result === "Failed" ? "f" : "ip") }, r.result === "In progress" ? "In progress" : r.result)),
          e("div", null,
            e("span", { className: "acv2-pill " + (r.cstat === "Issued" ? "iss" : r.cstat === "Revoked" ? "rev" : "wait") }, r.cstat),
            r.cert?.certificateId ? e("span", { className: "acv2-sub" }, r.cert.certificateId + (r.cstat === "Issued" && fmtShort(r.cert.issuedAt) ? " · " + fmtShort(r.cert.issuedAt) : "")) : null
          ),
          e("div", { className: "acv2-acts" },
            (r.cstat !== "Issued") ? e("button", { type: "button", className: "acv2-ico", title: r.cstat === "Revoked" ? "Re-issue" : "Issue", "aria-label": r.cstat === "Revoked" ? "Re-issue" : "Issue", onClick: () => doIssue(r) }, e(Ico, { d: "M12 5v14M5 12h14" })) : null,
            r.cert ? e("button", { type: "button", className: "acv2-ico", title: "View", "aria-label": "View", onClick: () => openCertTab(r, false) }, e(Ico, { d: "M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z M12 9a3 3 0 100 6 3 3 0 000-6z" })) : null,
            r.cert ? e("button", { type: "button", className: "acv2-ico", title: "Download", "aria-label": "Download", onClick: () => openCertTab(r, true) }, e(Ico, { d: "M12 3v12M7 11l5 5 5-5M5 21h14" })) : null,
            r.cstat === "Issued" ? e("button", { type: "button", className: "acv2-ico del", title: "Revoke", "aria-label": "Revoke", onClick: () => doRevoke(r) }, e(Ico, { d: "M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6", stroke: "#DC2626" })) : null
          )
        )) : e("p", { className: "acv2-empty" }, packLoading ? "Loading eligibility…" : "No certificates yet.")
      ),
      hasMore ? e("p", { style: { padding: "12px 0" } }, e("button", { type: "button", className: "acv2-pri", disabled: moreLoading, onClick: onMore }, moreLoading ? "Loading…" : "Load more")) : null,
      error ? e("p", { className: "acv2-err" }, String(error), " ", e("button", { type: "button", className: "acv2-pri", onClick: onRetry }, "Try again")) : null
    ),
    e(ConfirmDialog, {
      open: !!dlg,
      title: dlg?.title,
      message: dlg?.message,
      name: dlg?.name,
      tone: dlg?.tone,
      confirmLabel: dlg?.confirmLabel,
      inputLabel: dlg?.inputLabel,
      inputRequired: dlg?.inputRequired,
      onCancel: () => setDlg(null),
      onConfirm: dlg?.onConfirm
    })
  );
}

function Host() {
  const [courses, setCourses] = useState([]);
  const [courseId, setCourseId] = useState("");
  const [pack, setPack] = useState(null);
  const [certs, setCerts] = useState([]);
  const [trainers, setTrainers] = useState([]);
  const [usersMap, setUsersMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [packLoading, setPackLoading] = useState(false);
  const [error, setError] = useState(null);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [moreLoading, setMoreLoading] = useState(false);
  const paintT0 = (typeof performance !== "undefined" ? performance.now() : Date.now());
  const applyPage = (r, append) => {
    const docs = r.ok && r.res?.docs ? r.res.docs : [];
    const rows = docs.map(slimCert);
    setCerts((prev) => append ? prev.concat(rows) : rows);
    setCursor(docs.length ? docs[docs.length - 1] : null);
    setHasMore(docs.length >= 50);
    if (!r.ok) setError(fbErr(r.err));
    const shown = Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - paintT0);
    console.log("[ghz-perf] certs list shown", shown + "ms", "reads logged above");
  };
  const load = async (cid, { pageLoad } = {}) => {
    if (pageLoad) setLoading(true);
    setError(null);
    setPack(null);
    const [c, users] = await Promise.all([cachedCourses(), cachedUsers()]);
    if (c.ok) setCourses(c.rows);
    else setError(fbErr(c.err));
    setUsersMap(users || {});
    const id = cid || courseId || (c.rows.find((x) => /5G Network Engineering/i.test(x.title || "")) || c.rows[0] || {}).id || "";
    setCourseId(id);
    const course = (c.rows || []).find((x) => x.id === id) || null;
    const certR = await fetchCertPage({ courseId: id || undefined, pageSize: 50 });
    applyPage(certR, false);
    setLoading(false);
    resolveTrainerNames(course).then(setTrainers).catch(() => setTrainers([]));
    if (id) {
      setPackLoading(true);
      loadGradePack(id).then((p) => { setPack(p); if (p.err) setError(fbErr(p.err)); setPackLoading(false); }).catch((err) => { setError(fbErr(err)); setPackLoading(false); });
    }
  };
  const loadMore = async () => {
    if (!hasMore || moreLoading) return;
    setMoreLoading(true);
    const r = await fetchCertPage({ courseId, cursor, pageSize: 50 });
    applyPage(r, true);
    setMoreLoading(false);
  };
  const switchCourse = (id) => { setCourseId(id); setTrainers([]); load(id); };
  const [seedQ, setSeedQ] = useState("");
  useEffect(() => { load(undefined, { pageLoad: true }); }, []);
  useEffect(() => {
    const onOpen = (ev) => {
      const cid = String(ev.detail?.courseId || "");
      const q = String(ev.detail?.q || "");
      if (cid) switchCourse(cid);
      if (q) setSeedQ(q);
    };
    window.addEventListener("ghz-open-cert", onOpen);
    return () => window.removeEventListener("ghz-open-cert", onOpen);
  }, []);
  return e(App, { courses, courseId, setCourseId: switchCourse, pack, certs, trainers, loading, error, onRetry: () => load(courseId, { pageLoad: true }), reload: () => load(courseId), seedQ, usersMap, onMore: loadMore, hasMore, moreLoading, packLoading });
}

const roots = new WeakMap();
export function renderAdminCertificatesV2(host, opts = {}) {
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
    showSecErr(host, err, () => renderAdminCertificatesV2(host, opts));
  }
}
