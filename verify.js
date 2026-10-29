import { db } from "./firebase-config.js?v=auth8";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

const root = document.getElementById("root");
const input = document.getElementById("code");
const fail = (step, e) => {
  console.error(step, e);
  root.innerHTML = `<p class="banner">${step}: ${(e && (e.code || e.message)) || e}</p>`;
};
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const when = (t) => {
  try {
    const d = t && t.toDate ? t.toDate() : t ? new Date(t) : null;
    return d ? d.toLocaleDateString() : "—";
  } catch { return "—"; }
};

const codeFromUrl = () => {
  const q = new URLSearchParams(location.search).get("code");
  if (q) return q.trim();
  const hash = (location.hash || "").replace(/^#/, "").trim();
  if (hash) return decodeURIComponent(hash);
  const parts = location.pathname.split("/").filter(Boolean);
  const i = parts.findIndex((p) => p === "verify");
  if (i >= 0 && parts[i + 1] && parts[i + 1] !== "index.html") return decodeURIComponent(parts[i + 1]);
  return "";
};

const lookup = async (raw) => {
  const code = String(raw || "").trim();
  if (!code) { root.innerHTML = `<p class="banner">Enter a certificate code.</p>`; return; }
  root.textContent = "Checking…";
  try {
    const snap = await getDoc(doc(db, "certificateVerify", code));
    if (!snap.exists()) {
      root.innerHTML = `<article class="kpi" style="margin-top:16px;background:#f1f5f9"><strong>No certificate found for this code</strong></article>`;
      return;
    }
    const d = snap.data();
    if (d.status === "revoked") {
      root.innerHTML = `<article class="kpi" style="margin-top:16px;background:#fee2e2"><strong style="color:#b91c1c">This certificate has been revoked</strong>
        <p>${esc(d.studentName || "")} · ${esc(d.courseTitle || "")}</p></article>`;
      return;
    }
    root.innerHTML = `<article class="kpi" style="margin-top:16px;background:#dcfce7"><strong style="color:#15803d">Valid certificate</strong>
      <p>${esc(d.studentName || "")}</p>
      <p>${esc(d.courseTitle || "")}</p>
      <p>Issued ${when(d.issuedAt)}</p></article>`;
  } catch (e) {
    fail("certificateVerify", e);
  }
};

document.getElementById("go").onclick = () => lookup(input.value);
input.addEventListener("keydown", (e) => { if (e.key === "Enter") lookup(input.value); });
const initial = codeFromUrl();
if (initial) { input.value = initial; lookup(initial); }
