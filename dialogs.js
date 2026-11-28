/** Site-styled replacements for the browser's confirm(), prompt() and alert() boxes.
 *  No framework needed; uses the same look as ConfirmDialog (ConfirmDialog.css).
 *    if (!(await ask("Delete this quiz?"))) return;
 *    const note = await askText("Rejection note for the student:");   // null when cancelled
 *    tell("Could not download receipt.");
 */
function ensureCss() {
  if (document.getElementById("ghz-cd-css")) return;
  const link = document.createElement("link");
  link.id = "ghz-cd-css";
  link.rel = "stylesheet";
  link.href = "./ConfirmDialog.css";
  document.head.appendChild(link);
}

const DANGER = /^(delete|remove|cancel|deactivate|archive|revoke|reject|allow this student to retake)/i;
const ICONS = {
  danger: "M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6",
  warn: "M12 9v4M12 17h.01M10.3 4.9L2.5 19h19L13.7 4.9a2 2 0 00-3.4 0z",
  info: "M12 8v4M12 16h.01M12 21a9 9 0 110-18 9 9 0 010 18z",
  ok: "M20 6L9 17l-5-5"
};

function normalize(opts) {
  const o = typeof opts === "string" ? { title: opts } : { ...(opts || {}) };
  // A long single sentence reads better as title + message.
  if (!o.message && o.title && o.title.length > 70) {
    const cut = o.title.search(/[?.!]\s/);
    if (cut > 0) { o.message = o.title.slice(cut + 2); o.title = o.title.slice(0, cut + 1); }
  }
  if (!o.tone) o.tone = DANGER.test(o.title || "") ? "danger" : "info";
  return o;
}

function open(o, { input, okOnly } = {}) {
  ensureCss();
  return new Promise((resolve) => {
    const prevFocus = document.activeElement;
    const wrap = document.createElement("div");
    const tone = o.tone === "danger" ? "danger" : o.tone === "caution" || o.tone === "warn" ? "warn" : o.tone === "ok" ? "ok" : "info";
    wrap.innerHTML = `<div class="ghz-cd-dim"><div class="ghz-cd-card" role="${okOnly ? "alertdialog" : "dialog"}" aria-modal="true" aria-labelledby="ghz-dlg-t">
      <div class="ghz-cd-ico ${tone}"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICONS[tone]}"/></svg></div>
      <h3 class="ghz-cd-title" id="ghz-dlg-t"></h3>
      <p class="ghz-cd-msg"></p>
      ${input ? `<textarea class="ghz-cd-in" rows="3" style="width:100%;box-sizing:border-box;resize:vertical;font:inherit"></textarea>` : ""}
      <p class="ghz-cd-err" hidden></p>
      <div class="ghz-cd-acts">
        ${okOnly ? "" : `<button type="button" class="ghz-cd-btn ghz-cd-cancel"></button>`}
        <button type="button" class="ghz-cd-btn ghz-cd-ok ${tone}"></button>
      </div>
    </div></div>`;
    document.body.appendChild(wrap);
    wrap.querySelector(".ghz-cd-title").textContent = o.title || (okOnly ? "Notice" : "Please confirm");
    const msg = wrap.querySelector(".ghz-cd-msg");
    if (o.message) msg.textContent = o.message; else msg.remove();
    const ok = wrap.querySelector(".ghz-cd-ok");
    ok.textContent = o.confirmLabel || (okOnly ? "OK" : tone === "danger" ? "Yes, continue" : "Confirm");
    const cancel = wrap.querySelector(".ghz-cd-cancel");
    if (cancel) cancel.textContent = o.cancelLabel || "Cancel";
    const field = wrap.querySelector(".ghz-cd-in");
    const err = wrap.querySelector(".ghz-cd-err");
    if (field) { field.placeholder = o.placeholder || ""; field.value = o.defaultValue || ""; }
    const done = (value) => {
      window.removeEventListener("keydown", onKey, true);
      wrap.remove();
      try { prevFocus && prevFocus.focus && prevFocus.focus(); } catch (_) {}
      resolve(value);
    };
    const accept = () => {
      if (field) {
        const v = field.value.trim();
        if (o.required && !v) { err.hidden = false; err.textContent = "Please fill this in."; field.focus(); return; }
        done(v);
      } else done(true);
    };
    const onKey = (ev) => {
      if (ev.key === "Escape") { ev.preventDefault(); done(okOnly ? true : (field ? null : false)); }
      else if (ev.key === "Enter" && !ev.shiftKey && (!field || document.activeElement !== field || !o.multiline)) {
        if (document.activeElement === cancel) return;
        ev.preventDefault(); accept();
      }
    };
    window.addEventListener("keydown", onKey, true);
    ok.onclick = accept;
    if (cancel) cancel.onclick = () => done(field ? null : false);
    wrap.querySelector(".ghz-cd-dim").addEventListener("click", (ev) => {
      if (ev.target.classList.contains("ghz-cd-dim")) done(okOnly ? true : (field ? null : false));
    });
    (field || ok).focus();
  });
}

/** Yes/No question. Resolves true or false. */
export function ask(opts) { return open(normalize(opts)); }

/** Ask for a short text. Resolves the text, or null when cancelled. */
export function askText(opts) {
  const o = normalize(opts);
  if (o.tone === "danger" && !opts?.tone) o.tone = "warn";
  return open(o, { input: true });
}

/** Message with an OK button. Resolves when closed. */
export function tell(opts) {
  const o = normalize(opts);
  if (!opts?.tone && typeof opts === "string") o.tone = /could not|failed|error|not available|must be|over \d|allow popups/i.test(opts) ? "warn" : "info";
  return open(o, { okOnly: true });
}

try { window.ghzDialogs = { ask, askText, tell }; } catch (_) {}
