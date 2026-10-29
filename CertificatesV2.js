import { renderCertificate, CERT_CSS, codeOf, verifyUrl, whenCert, openCertificateTab } from "./renderCertificate.js";

const esc = (s) => String(s ?? "").replace(/&/g,"&"+"amp;").replace(/</g,"&"+"lt;").replace(/"/g,"&"+"quot;");
const state = { copied: "" };
const when = whenCert;

function issueParts(t) {
  try {
    const d = t && t.toDate ? t.toDate() : t ? new Date(t) : null;
    if (!d || Number.isNaN(d.getTime())) return { y: "", m: "" };
    return { y: String(d.getFullYear()), m: String(d.getMonth() + 1) };
  } catch { return { y: "", m: "" }; }
}
function linkedInUrl(c) {
  const p = issueParts(c.issuedAt);
  const q = new URLSearchParams({
    startTask: "CERTIFICATION_NAME",
    name: String(c.courseTitle || "Course"),
    organizationName: "GHz Academy",
    issueYear: p.y,
    issueMonth: p.m,
    certUrl: verifyUrl(c),
    certId: codeOf(c)
  });
  return "https://www.linkedin.com/profile/add?" + q.toString();
}
function lockSvg() {
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" stroke-width="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" stroke-width="2"/></svg>`;
}
function trophySvg() {
  return `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 5h8v4a4 4 0 0 1-8 0V5z" stroke="#C9A227" stroke-width="2"/><path d="M8 7H5a3 3 0 0 0 3 3M16 7h3a3 3 0 0 1-3 3M12 13v3M9 20h6" stroke="#C9A227" stroke-width="2" stroke-linecap="round"/></svg>`;
}

function previewHtml(c) {
  return `<div class="cv2-prev"><div class="cv2-scale"><style>${CERT_CSS}</style>${renderCertificate(c)}</div></div>`;
}

function openPrint(c, student, doPrint) {
  openCertificateTab(c, doPrint);
}

function earnedCard(c, student) {
  const copied = state.copied === codeOf(c);
  return `<article class="cv2-earn">
    ${previewHtml(c)}
    <div class="cv2-side">
      <h3>${esc(c.courseTitle || "Course")}</h3>
      <p>Issued ${esc(when(c.issuedAt) || "")}</p>
      <div><span class="cv2-ok"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12l5 5L19 7" stroke="currentColor" stroke-width="2"/></svg> Verified</span></div>
      <div class="cv2-code">${esc(codeOf(c))}
        <button type="button" class="cv2-copy" data-cv2-copy="${esc(codeOf(c))}">${copied ? "Copied" : "Copy"}</button>
      </div>
      <div class="cv2-acts">
        <button type="button" class="cv2-btn pri" data-cv2-view="${esc(c.id)}">View</button>
        <button type="button" class="cv2-btn out" data-cv2-pdf="${esc(c.id)}">Download PDF</button>
        <button type="button" class="cv2-btn out" data-cv2-link="${esc(c.id)}">Copy verify link</button>
        <a class="cv2-btn out" href="${esc(linkedInUrl(c))}" target="_blank" rel="noopener noreferrer">Share on LinkedIn</a>
      </div>
    </div>
  </article>`;
}

export function renderCertificatesV2(opts) {
  const host = opts?.host;
  if (!host) return false;
  try {
    if (opts.loading) {
      const wrap = document.createElement("div");
      wrap.className = "cv2-wrap";
      wrap.innerHTML = `<div class="cv2-skel"></div><div class="cv2-skel"></div>`;
      host.replaceChildren(wrap);
      return true;
    }
    const student = opts.student || {};
    const certs = Array.isArray(opts.certs) ? opts.certs : [];
    const enrolls = Array.isArray(opts.enrolls) ? opts.enrolls : [];
    const courses = opts.courses || {};
    const issued = certs.filter((c) => String(c.status || "issued") === "issued");
    const revoked = certs.filter((c) => String(c.status) === "revoked");
    const certCourse = new Set(certs.map((c) => c.courseId));
    const progress = enrolls.filter((e) => e.courseId && !certCourse.has(e.courseId)).map((e) => {
      const c = courses[e.courseId] || {};
      return {
        id: e.courseId,
        title: c.title || e.courseTitle || "Course",
        status: c.status || ""
      };
    });
    const wrap = document.createElement("div");
    wrap.className = "cv2-wrap";
    const nothing = !issued.length && !revoked.length && !progress.length;
    wrap.innerHTML = `
      <div class="cv2-head">
        <div><h2>Certificates</h2><p class="cv2-sub">Your achievements, verified</p></div>
        <span class="cv2-count">${issued.length} earned</span>
      </div>
      ${nothing ? `<div class="cv2-empty">${trophySvg()}<p>Your first certificate is waiting. Complete a course to earn it.</p></div>` : `
        ${issued.length ? `<h3 class="cv2-sec">Earned</h3>${issued.map((c) => earnedCard({ ...c, courseTitle: c.courseTitle || courses[c.courseId]?.title || c.courseId }, student)).join("")}` : ""}
        ${revoked.length ? `<h3 class="cv2-sec">Revoked</h3>${revoked.map((c) => `<article class="cv2-rev"><span class="cv2-bad">Revoked</span><h3>${esc(c.courseTitle || courses[c.courseId]?.title || "Course")}</h3><p>This certificate was revoked by the academy</p></article>`).join("")}` : ""}
        ${progress.length ? `<h3 class="cv2-sec">In progress</h3>${progress.map((p) => `<article class="cv2-prog"><div class="cv2-lock">${lockSvg()}</div><div><h3>${esc(p.title)}</h3><p>${String(p.status)==="Completed" ? "Awaiting issue by the academy" : "Certificate unlocks when the course is completed and passed"}</p></div></article>`).join("")}` : ""}
      `}
    `;
    wrap.addEventListener("click", async (e) => {
      const tEl = e.target;
      if (!tEl || !tEl.closest) return;
      const copy = tEl.closest("[data-cv2-copy]");
      const pdf = tEl.closest("[data-cv2-pdf]");
      const view = tEl.closest("[data-cv2-view]");
      const link = tEl.closest("[data-cv2-link]");
      if (copy) {
        const v = copy.getAttribute("data-cv2-copy") || "";
        try { await navigator.clipboard.writeText(v); } catch {}
        state.copied = v;
        renderCertificatesV2(opts);
        setTimeout(() => { if (state.copied === v) { state.copied = ""; renderCertificatesV2(opts); } }, 2000);
        return;
      }
      if (view) {
        const c = certs.find((x) => x.id === view.getAttribute("data-cv2-view"));
        if (c) openPrint({ ...c, courseTitle: c.courseTitle || courses[c.courseId]?.title }, student, false);
        return;
      }
      if (pdf) {
        const c = certs.find((x) => x.id === pdf.getAttribute("data-cv2-pdf"));
        if (c) openPrint({ ...c, courseTitle: c.courseTitle || courses[c.courseId]?.title }, student, true);
        return;
      }
      if (link) {
        const c = certs.find((x) => x.id === link.getAttribute("data-cv2-link"));
        if (!c) return;
        const url = verifyUrl(c);
        try { await navigator.clipboard.writeText(url); } catch {}
        state.copied = codeOf(c);
        renderCertificatesV2(opts);
        setTimeout(() => { if (state.copied === codeOf(c)) { state.copied = ""; renderCertificatesV2(opts); } }, 2000);
      }
    });
    host.replaceChildren(wrap);
    wrap.querySelectorAll(".cv2-prev").forEach((box) => {
      const inner = box.querySelector(".cv2-scale");
      if (!inner) return;
      const s = box.clientWidth / inner.offsetWidth;
      inner.style.transform = "scale(" + s + ")";
    });
    opts.onReady?.();
    return true;
  } catch (e) {
    const code = (e?.code || "error") + ": " + (e?.message || e);
    const box = document.createElement("div");
    box.className = "cv2-fail";
    const p = document.createElement("p");
    p.textContent = "Could not load certificates (" + code + ")";
    const b = document.createElement("button");
    b.className = "btn btn-sm";
    b.type = "button";
    b.textContent = "Use classic view";
    b.addEventListener("click", () => opts.onClassic?.());
    box.append(p, b);
    host.replaceChildren(box);
    return false;
  }
}
