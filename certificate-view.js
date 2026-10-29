import { db } from "./firebase-config.js?v=auth8";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { renderCertificate, CERT_CSS } from "./renderCertificate.js";

const root = document.getElementById("root");
const fail = (step, e) => {
  console.error(step, e);
  root.innerHTML = `<p style="font-family:Inter,sans-serif;padding:24px;color:#DC2626">${step}: ${(e && (e.code || e.message)) || e}</p>`;
};

const params = new URLSearchParams(location.search);
const id = params.get("id");
const code = params.get("code");
const printMode = params.get("print") === "1" || params.get("download") === "1";

try {
  if (!id && !code) { root.innerHTML = `<p style="font-family:Inter,sans-serif;padding:24px">Missing certificate.</p>`; throw new Error("missing"); }
  let data = null;
  if (id) {
    const snap = await getDoc(doc(db, "certificates", id));
    if (!snap.exists()) { root.innerHTML = `<p style="font-family:Inter,sans-serif;padding:24px">No certificate found.</p>`; throw new Error("missing"); }
    data = { id: snap.id, ...snap.data() };
  } else {
    const snap = await getDoc(doc(db, "certificateVerify", code));
    if (!snap.exists()) { root.innerHTML = `<p style="font-family:Inter,sans-serif;padding:24px">No certificate found.</p>`; throw new Error("missing"); }
    data = { certificateId: code, ...snap.data() };
  }
  if (data.status === "revoked") {
    root.innerHTML = `<p style="font-family:Inter,sans-serif;padding:24px">This certificate was revoked.</p>`;
  } else {
    document.title = "Certificate — " + (data.studentName || "GHz Academy");
    const style = document.createElement("style");
    style.textContent = CERT_CSS;
    document.head.appendChild(style);
    root.innerHTML = `<div class="cv2-stage">${renderCertificate(data)}</div>`;
    if (printMode) {
      const fonts = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
      fonts.then(() => setTimeout(() => { try { window.print(); } catch (_) {} }, 80));
    }
  }
} catch (e) {
  if (String(e.message) !== "missing") fail("certificate", e);
}
