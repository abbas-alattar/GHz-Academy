import { bootStudentNav } from "./student-nav.js";
import { protect } from "./auth-guard.js?v=auth8";
import { db } from "./firebase-config.js?v=auth8";
import { collection, query, where, getDocs, getDoc, doc } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { renderCertificatesV2 } from "./CertificatesV2.js";

bootStudentNav("certificates");
import("./StudentTheme.js").then((m) => { try { m.bootStudentTheme(); } catch (_) {} }).catch(() => {});
const root = document.getElementById("root");
const v2 = document.getElementById("certV2Root");
const fail = (step, e) => {
  console.error(step, e);
  const msg = `<p class="banner">This page could not load<br>${step}: ${(e && (e.code || e.message)) || e}</p>`;
  if (v2) v2.innerHTML = msg + `<button class="btn btn-sm" type="button" id="certClassicBtn">Use classic view</button>`;
  if (root) root.innerHTML = msg;
  document.getElementById("certClassicBtn")?.addEventListener("click", () => {
    if (v2) v2.classList.add("hidden");
    if (root) root.classList.remove("hidden");
  });
};
const esc = (s) => String(s ?? "").replace(/&/g,"&"+"amp;").replace(/</g,"&"+"lt;").replace(/"/g,"&"+"quot;");
const when = (t) => {
  try {
    const d = t && t.toDate ? t.toDate() : t ? new Date(t) : null;
    return d ? d.toLocaleDateString() : "—";
  } catch { return "—"; }
};

try {
  const { user, profile } = await protect("student");
  renderCertificatesV2({ host: v2, loading: true });

  let enrolls = [];
  try {
    enrolls = (await getDocs(query(collection(db, "enrollments"), where("uid", "==", user.uid)))).docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) { fail("enrollments", e); throw e; }

  let certs = [];
  try {
    certs = (await getDocs(query(collection(db, "certificates"), where("uid", "==", user.uid)))).docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) { fail("certificates", e); throw e; }

  const courses = {};
  const ids = [...new Set(enrolls.map((e) => e.courseId).concat(certs.map((c) => c.courseId)).filter(Boolean))];
  for (const cid of ids) {
    try {
      const snap = await getDoc(doc(db, "courses", cid));
      if (snap.exists()) courses[cid] = { id: cid, ...snap.data() };
    } catch (_) {}
  }

  const cards = [];
  for (const en of enrolls) {
    const cid = en.courseId;
    const cert = certs.find((c) => c.courseId === cid);
    const title = courses[cid]?.title || en.courseTitle || cid;
    if (cert && cert.status === "issued") {
      cards.push(`<article class="kpi" style="margin-top:12px">
        <strong>${esc(title)}</strong>
        <p>Issued ${when(cert.issuedAt)}</p>
        <p>Code ${esc(cert.certificateId)}</p>
        <a class="btn btn-sm" href="./certificate-view.html?id=${encodeURIComponent(cert.id)}">View</a>
        <a class="btn btn-sm btn-ghost" href="./certificate-view.html?id=${encodeURIComponent(cert.id)}&print=1">Download PDF</a>
      </article>`);
      continue;
    }
    if (cert && cert.status === "revoked") {
      cards.push(`<article class="kpi" style="margin-top:12px"><strong>${esc(title)}</strong><p>This certificate was revoked</p></article>`);
      continue;
    }
    const st = courses[cid]?.status || "";
    cards.push(`<article class="kpi" style="margin-top:12px"><strong>${esc(title)}</strong><p>${st === "Completed" ? "Awaiting issue by the academy" : "Certificate unlocks when the course is completed and passed"}</p></article>`);
  }
  root.innerHTML = cards.join("") || "<p>No enrolled courses yet.</p>";

  const showClassic = () => { if (v2) v2.classList.add("hidden"); if (root) root.classList.remove("hidden"); };
  try {
    renderCertificatesV2({
      host: v2,
      student: { name: (profile?.name || user.displayName || "").trim(), email: user.email || "" },
      certs,
      enrolls,
      courses,
      onClassic: showClassic,
      onReady: () => { if (root) root.classList.add("hidden"); if (v2) v2.classList.remove("hidden"); }
    });
  } catch (e) {
    fail("certificatesV2", e);
  }
} catch (e) {
  fail("boot", e);
}
