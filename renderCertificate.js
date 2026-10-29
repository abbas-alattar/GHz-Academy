const esc = (s) => String(s ?? "").replace(/&/g, "&" + "amp;").replace(/</g, "&" + "lt;").replace(/"/g, "&" + "quot;");

export function logoAbs() {
  try { return new URL("./logo.png", window.location.href).href; }
  catch { return "./logo.png"; }
}
export function whenCert(t) {
  try {
    const d = t && t.toDate ? t.toDate() : t ? new Date(t) : null;
    if (!d || Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  } catch { return ""; }
}
export function codeOf(c) {
  return String(c?.certificateId || c?.code || c?.id || "").trim();
}
export function verifyUrl(c) {
  try {
    return new URL("./verify.html?code=" + encodeURIComponent(codeOf(c)), window.location.href).href;
  } catch {
    return "./verify.html?code=" + encodeURIComponent(codeOf(c));
  }
}
function qrSvg(url) {
  const u = encodeURIComponent(url || "");
  return `<img class="cv2-qr" width="83" height="83" alt="Verify QR" src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=0&data=${u}" />`;
}

export const CERT_CSS = `
  @page { size: A4 landscape; margin: 0; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; box-sizing: border-box; }
  html, body { margin: 0; background: #F1F5F9; }
  .cv2-stage { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; background: #F1F5F9; }
  .cv2-page { width: 297mm; height: 210mm; overflow: hidden; background: #FFFFFF; display: flex; font-family: Inter, Arial, sans-serif; color: #0F2747; box-shadow: 0 18px 40px rgba(15,39,71,.14); }
  .cv2-rail { width: 22mm; flex: 0 0 22mm; height: 100%; background: linear-gradient(180deg, #0F2747, #2563EB); border-right: 1px solid #C9A227; position: relative; }
  .cv2-wave { position: absolute; left: 0; right: 0; bottom: 0; width: 100%; height: 28mm; }
  .cv2-main { flex: 1; padding: 18mm 22mm; display: flex; flex-direction: column; justify-content: space-between; position: relative; }
  .cv2-top { display: flex; justify-content: space-between; align-items: flex-start; }
  .cv2-brand { display: flex; align-items: center; gap: 8px; color: #0F2747; }
  .cv2-brand svg { width: 40px; height: 22px; flex-shrink: 0; }
  .cv2-ghz { font-family: Inter, Arial, sans-serif; font-weight: 700; font-size: 22px; letter-spacing: -0.03em; color: #0F2747; }
  .cv2-acad { font-family: Inter, Arial, sans-serif; font-weight: 700; font-size: 22px; letter-spacing: -0.03em; color: #06B6D4; }
  .cv2-idbox { text-align: right; }
  .cv2-idl, .cv2-sl { margin: 0; font-size: 9px; letter-spacing: .08em; text-transform: uppercase; color: #64748B; }
  .cv2-idv { font-family: ui-monospace, Menlo, monospace; font-size: 11px; margin-top: 4px; }
  .cv2-mid { text-align: left; }
  .cv2-lab { margin: 0 0 8px; letter-spacing: .22em; text-transform: uppercase; font-size: 12px; font-weight: 600; color: #2563EB; }
  .cv2-g { margin: 6px 0; font-size: 14px; color: #64748B; }
  .cv2-nm { margin: 4px 0 0; font-family: "Playfair Display", Georgia, serif; font-size: 54px; line-height: 1.05; color: #0F2747; }
  .cv2-uline { width: 40mm; height: 3px; margin: 8px 0 10px; background: linear-gradient(90deg, #06B6D4, #2563EB); }
  .cv2-course { margin: 4px 0 8px; font-size: 26px; font-weight: 700; color: #0F2747; max-width: 170mm; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .cv2-bot { display: flex; justify-content: space-between; align-items: flex-end; }
  .cv2-sig { width: 46mm; border-top: 1px solid #0F2747; margin-bottom: 6px; }
  .cv2-qrwrap { text-align: center; }
  .cv2-qr { width: 22mm; height: 22mm; display: block; margin: 0 auto 4px; }
  .cv2-dright { text-align: right; }
  .cv2-dv { margin: 4px 0 0; font-weight: 600; }
  .cv2-foot { margin: 0; text-align: center; font-size: 9px; color: #64748B; }
  @media print { html, body, .cv2-stage { background: #FFFFFF; padding: 0; min-height: 0; } .cv2-page { box-shadow: none; } }
`;

export function renderCertificate(certData) {
  const c = certData || {};
  const name = String(c.studentName || "Student");
  const title = String(c.courseTitle || "Course");
  const code = codeOf(c);
  const date = whenCert(c.issuedAt);
  const vurl = verifyUrl(c);
  return `<div class="cv2-page">
    <aside class="cv2-rail">
      <svg class="cv2-wave" viewBox="0 0 88 80" preserveAspectRatio="none" aria-hidden="true"><path d="M0 40 Q22 10 44 40 T88 40 V80 H0Z" fill="none" stroke="#06B6D4" stroke-width="3" opacity=".45"/></svg>
    </aside>
    <div class="cv2-main">
      <div class="cv2-top">
        <div class="cv2-brand" aria-label="GHz Academy">
          <svg viewBox="0 0 40 22" fill="none" aria-hidden="true"><path d="M2 11c3-8 7-8 10 0s7 8 10 0 7-8 10 0 4 6 6 0" stroke="#06B6D4" stroke-width="2.6" stroke-linecap="round"/></svg>
          <span class="cv2-ghz">GHz</span> <span class="cv2-acad">Academy</span>
        </div>
        <div class="cv2-idbox"><div class="cv2-idl">Certificate ID</div><div class="cv2-idv">${esc(code)}</div></div>
      </div>
      <div class="cv2-mid">
        <p class="cv2-lab">Certificate of Completion</p>
        <p class="cv2-g">This is to certify that</p>
        <p class="cv2-nm">${esc(name)}</p>
        <div class="cv2-uline"></div>
        <p class="cv2-g">has successfully completed the course</p>
        <p class="cv2-course">${esc(title)}</p>
        <p class="cv2-g">Awarded on ${esc(date)} by GHz Academy</p>
      </div>
      <div class="cv2-bot">
        <div><div class="cv2-sig"></div><p class="cv2-sl">Academy Director</p></div>
        <div class="cv2-qrwrap">${qrSvg(vurl)}<p class="cv2-sl">Scan to verify</p></div>
        <div class="cv2-dright"><p class="cv2-sl">Date of issue</p><p class="cv2-dv">${esc(date)}</p></div>
      </div>
      <p class="cv2-foot">Verify at ghz-academy.web.app/verify</p>
    </div>
  </div>`;
}

export function printCertificateHtml(c, doPrint) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Certificate</title>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
<style>${CERT_CSS}</style></head><body>
  <div class="cv2-stage">${renderCertificate(c)}</div>
  <script>
    function go(){ ${doPrint ? "try { window.print(); } catch(e) {}" : ""} }
    function wait(){
      var fonts = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
      fonts.then(function(){ setTimeout(go, 50); });
    }
    window.onload = wait;
  <\/script>
</body></html>`;
}

export function openCertificateTab(c, doPrint) {
  const w = window.open("", "_blank");
  if (!w) return null;
  w.document.open();
  w.document.write(printCertificateHtml(c, doPrint));
  w.document.close();
  return w;
}
