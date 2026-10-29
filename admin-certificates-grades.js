import { protect } from "./auth-guard.js?v=auth8";
import { db } from "./firebase-config.js?v=auth8";
import { collection, query, where, getDocs, getDoc, doc, writeBatch, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { computeAverage, computeStatus, gradeCalc } from "./gradeCalc.js";
import { mountPdfButton, fmtPdfDate } from "./AdminPdfExport.js";

const root = document.getElementById("root");
const esc = (s) => String(s ?? "").replace(/&/g,"&"+"amp;").replace(/</g,"&"+"lt;").replace(/"/g,"&"+"quot;");
const fail = (step, e) => {
  const code = (e && (e.code || e.message)) || e;
  if (root) root.innerHTML = `<p class="banner">This page could not load<br>${esc(step)}: ${esc(code)}</p>`;
};
const ALPHA = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const makeCode = async () => {
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
};
const fmtDate = (v) => {
  try {
    const d = v && v.toDate ? v.toDate() : v ? new Date(v) : null;
    return d && !isNaN(d) ? d.toLocaleDateString() : "—";
  } catch { return "—"; }
};

try {
  const { user } = await protect("admin");
  let courses = [];
  try {
    courses = (await getDocs(collection(db, "courses"))).docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((c) => c.status === "Open" || c.status === "Closed" || c.status === "Completed");
  } catch (e) { fail("courses", e); throw e; }

  root.innerHTML = `
    <div class="toolbar">
      <select id="cid">${courses.map((c,i)=>`<option value="${esc(c.id)}" ${i===0?"selected":""}>${esc(c.title||c.id)}${c.status==="Completed"?" (Completed)":""}</option>`).join("") || `<option value="">No courses</option>`}</select>
      <button class="btn btn-sm" type="button" id="issueAll">Issue to all passed students</button>
    </div>
    <p id="toast" class="toast" hidden></p>
    <div id="box">${courses.length ? "Loading…" : "No Active or Completed courses."}</div>`;

  const toast = (m, k="ok") => { const t=document.getElementById("toast"); t.hidden=false; t.className="toast "+k; t.textContent=m; };
  const box = document.getElementById("box");
  const sel = document.getElementById("cid");
  let lastRows = [];
  let lastCourse = null;

  const issueOne = async (row, course, overrideReason) => {
    const existing = row.cert;
    const code = existing && existing.certificateId ? existing.certificateId : await makeCode();
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
      attendance: row.att ?? null,
      issuedAt: serverTimestamp(),
      issuedBy: user.uid
    };
    if (overrideReason) payload.overrideReason = overrideReason;
    batch.set(certRef, payload, { merge: true });
    batch.set(verRef, {
      studentName: row.name,
      courseTitle: course.title || course.id,
      issuedAt: serverTimestamp(),
      status: "issued"
    });
    await batch.commit();
  };

  const load = async () => {
    const cid = sel?.value;
    const course = courses.find((c) => c.id === cid);
    if (!course) { box.innerHTML = "<p>No Active or Completed courses.</p>"; return; }
    box.textContent = "Loading…";
    let schemeSnap;
    try { schemeSnap = await getDoc(doc(db, "gradeSchemes", cid)); }
    catch (e) { box.innerHTML = `<p class="banner">gradeSchemes: ${esc((e&&(e.code||e.message))||e)}</p>`; return; }
    if (!schemeSnap.exists()) {
      box.innerHTML = `<p>No grade distribution set for this course.</p>`;
      return;
    }
    const scheme = schemeSnap.data() || {};
    const components = Array.isArray(scheme.components) ? scheme.components : [];
    let passMark = Number(scheme.passMark);
    if (!Number.isFinite(passMark)) passMark = 60;

    let ens = [], certs = [], scoreMap = {};
    try {
      ens = (await getDocs(query(collection(db,"enrollments"), where("courseId","==",cid)))).docs.map((d)=>({id:d.id,...d.data()}));
    } catch (e) { box.innerHTML = `<p class="banner">enrollments: ${esc((e&&(e.code||e.message))||e)}</p>`; return; }
    try {
      const ss = await getDocs(query(collection(db,"gradeScores"), where("courseId","==",cid)));
      ss.docs.forEach((d) => { const data = d.data(); scoreMap[data.uid] = data.scores || {}; });
    } catch (e) { box.innerHTML = `<p class="banner">gradeScores: ${esc((e&&(e.code||e.message))||e)}</p>`; return; }
    try {
      certs = (await getDocs(query(collection(db,"certificates"), where("courseId","==",cid)))).docs.map((d)=>({id:d.id,...d.data()}));
    } catch (e) { box.innerHTML = `<p class="banner">certificates: ${esc((e&&(e.code||e.message))||e)}</p>`; return; }
    const loadCol = async (name) => {
      try {
        return (await getDocs(query(collection(db, name), where("courseId", "==", cid)))).docs.map((d) => ({ id: d.id, ...d.data() }));
      } catch (e) {
        box.innerHTML = `<p class="banner">${name}: ${esc((e && (e.code || e.message)) || e)}</p>`;
        throw e;
      }
    };
    let autoPack;
    try {
      autoPack = {
        assignments: await loadCol("assignments"),
        quizzes: await loadCol("quizzes"),
        attendance: await loadCol("attendance"),
        submissions: await loadCol("submissions"),
        quizAttempts: await loadCol("quizAttempts")
      };
    } catch { return; }

    const rows = ens.map((en) => {
      const scores = { ...(scoreMap[en.uid] || {}) };
      const g = gradeCalc({ id: cid, pack: { ...autoPack, scheme } }, scheme, { uid: en.uid, scores, pack: { ...autoPack, scheme } });
      const vals = g.values || {};
      const avg = g.average;
      const st = g.failed ? { label: "—", avg: null } : computeStatus({ components }, vals, passMark);
      const cert = certs.find((c) => c.uid === en.uid);
      const issued = cert && cert.status === "issued";
      return { uid: en.uid, name: en.studentName || en.studentEmail || en.uid, avg, st, cert, issued, att: null };
    });
    lastRows = rows;
    lastCourse = course;
    const passed = rows.filter((r) => r.st.label === "P").length;
    const issuedN = rows.filter((r) => r.issued).length;
    const waiting = rows.filter((r) => r.st.label === "P" && !r.issued).length;

    const certCell = (r) => {
      if (r.issued) return `Issued ${fmtDate(r.cert.issuedAt)} · ${esc(r.cert.certificateId || "")}`;
      if (r.cert && r.cert.status === "revoked") return "Not issued (revoked)";
      return "Not issued";
    };
    const actionCell = (r) => {
      if (r.issued) {
        return `<button class="btn btn-sm btn-ghost" type="button" data-view="${esc(r.uid)}">View</button>
          <button class="btn btn-sm btn-warn" type="button" data-rev="${esc(r.uid)}">Revoke</button>`;
      }
      if (r.st.label === "P") {
        return `<button class="btn btn-sm" type="button" data-issue="${esc(r.uid)}">Issue certificate</button>`;
      }
      return `<button class="btn btn-sm" type="button" disabled title="Student has not passed">Issue certificate</button>
        <a href="#" data-anyway="${esc(r.uid)}" style="font-size:.8rem;margin-left:8px">Issue anyway</a>`;
    };

    box.innerHTML = `
      <div class="kpis" style="grid-template-columns:repeat(3,1fr);margin:8px 0 16px">
        <div class="kpi"><span>Passed</span><strong style="color:#166534">${passed}</strong></div>
        <div class="kpi"><span>Issued</span><strong>${issuedN}</strong></div>
        <div class="kpi"><span>Waiting to be issued</span><strong>${waiting}</strong></div>
      </div>
      <p style="color:var(--muted);margin:0 0 12px">Pass mark: <strong>${passMark}/100</strong></p>
      <div class="table-wrap"><table class="data"><thead><tr>
        <th>Student</th><th>Average</th><th>Status</th><th>Certificate</th><th></th>
      </tr></thead><tbody>
      ${rows.length ? rows.map((r)=>`<tr>
        <td>${esc(r.name)}</td>
        <td style="font-weight:700">${r.avg.toFixed(1)}/100</td>
        <td><span class="badge" style="background:${r.st.bg};color:${r.st.color}">${esc(r.st.label)}</span></td>
        <td>${certCell(r)}</td>
        <td>${actionCell(r)}</td>
      </tr>`).join("") : `<tr><td colspan="5">No enrolled students.</td></tr>`}
      </tbody></table></div>`;

    let pdfHost = document.getElementById("certPdf");
    if (!pdfHost) { pdfHost = document.createElement("span"); pdfHost.id = "certPdf"; box.prepend(pdfHost); }
    mountPdfButton(pdfHost, () => ({
      page: "Certificates",
      filters: "Course: " + (course.title || ""),
      columns: [{ key: "student", label: "Student" }, { key: "course", label: "Course" }, { key: "issued", label: "Issued on" }, { key: "code", label: "Code" }, { key: "status", label: "Status" }],
      rows: rows.map((r) => ({
        student: r.name, course: course.title || "",
        issued: r.issued ? fmtPdfDate(r.cert?.issuedAt) : "—",
        code: r.issued ? (r.cert?.certificateId || "—") : "—",
        status: r.issued ? "Issued" : (r.cert?.status === "revoked" ? "Revoked" : "Not issued")
      }))
    }), "Certificates");
    box.querySelectorAll("[data-view]").forEach((b) => {
      b.onclick = () => { location.href = `./certificate-view.html?id=${encodeURIComponent(b.dataset.view + "_" + cid)}`; };
    });
    box.querySelectorAll("[data-issue]").forEach((b) => {
      b.onclick = async () => {
        const row = rows.find((x) => x.uid === b.dataset.issue);
        try { await issueOne(row, course); toast("Issued."); await load(); }
        catch (e) { box.innerHTML = `<p class="banner">issueCertificate: ${esc((e&&(e.code||e.message))||e)}</p>`; }
      };
    });
    box.querySelectorAll("[data-anyway]").forEach((a) => {
      a.onclick = async (ev) => {
        ev.preventDefault();
        const row = rows.find((x) => x.uid === a.dataset.anyway);
        if (!confirm("This student has not passed. Issue anyway?")) return;
        try { await issueOne(row, course, "Issue anyway"); toast("Issued."); await load(); }
        catch (e) { box.innerHTML = `<p class="banner">issueCertificate: ${esc((e&&(e.code||e.message))||e)}</p>`; }
      };
    });
    box.querySelectorAll("[data-rev]").forEach((b) => {
      b.onclick = async () => {
        const row = rows.find((x) => x.uid === b.dataset.rev);
        if (!confirm("Revoke this certificate?")) return;
        const reason = prompt("Revoke reason (required)") || "";
        if (!reason.trim()) { toast("A reason is required.", "err"); return; }
        try {
          const batch = writeBatch(db);
          const certRef = doc(db, "certificates", `${row.uid}_${cid}`);
          const verRef = doc(db, "certificateVerify", row.cert.certificateId);
          batch.set(certRef, { status: "revoked", revokedAt: serverTimestamp(), revokedBy: user.uid, revokeReason: reason.trim() }, { merge: true });
          batch.set(verRef, { status: "revoked" }, { merge: true });
          await batch.commit();
          toast("Revoked.");
          await load();
        } catch (e) {
          box.innerHTML = `<p class="banner">revokeCertificate: ${esc((e&&(e.code||e.message))||e)}</p>`;
        }
      };
    });
  };

  document.getElementById("issueAll").onclick = async () => {
    const course = lastCourse;
    if (!course) return;
    const waiting = lastRows.filter((r) => r.st.label === "P" && !r.issued);
    if (!waiting.length) { toast("No passed students waiting."); return; }
    if (!confirm(`Issue certificates for ${waiting.length} passed student(s)?`)) return;
    try {
      for (const row of waiting) await issueOne(row, course);
      toast("Issued to all passed students.");
      await load();
    } catch (e) {
      box.innerHTML = `<p class="banner">issueAllEligible: ${esc((e&&(e.code||e.message))||e)}</p>`;
    }
  };

  if (sel) sel.onchange = load;
  if (courses.length) await load();
} catch (e) {
  fail("boot", e);
}
