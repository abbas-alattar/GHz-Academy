import { createElement as e, useEffect, useRef, useState } from "https://esm.sh/react@18.3.1";
import { createPortal } from "https://esm.sh/react-dom@18.3.1";

function ensureCss() {
  if (document.getElementById("ghz-cd-css")) return;
  const link = document.createElement("link");
  link.id = "ghz-cd-css";
  link.rel = "stylesheet";
  link.href = "./ConfirmDialog.css";
  document.head.appendChild(link);
}

function Ico({ tone }) {
  const d = tone === "danger"
    ? "M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"
    : tone === "caution"
      ? "M12 9v4M12 17h.01M10.3 4.9L2.5 19h19L13.7 4.9a2 2 0 00-3.4 0z"
      : "M12 8v4M12 16h.01M12 21a9 9 0 110-18 9 9 0 010 18z";
  return e("svg", { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" }, e("path", { d }));
}

export function ConfirmDialog({
  open, title, message, name, tone = "info", confirmLabel = "Confirm",
  inputLabel, inputRequired, onCancel, onConfirm
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [val, setVal] = useState("");
  const first = useRef(null);
  const t = tone === "danger" ? "danger" : tone === "caution" ? "warn" : "info";
  useEffect(() => { ensureCss(); }, []);
  useEffect(() => {
    if (!open) { setBusy(false); setErr(""); setVal(""); return; }
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const prev = document.activeElement;
    setTimeout(() => first.current?.focus?.(), 20);
    const onKey = (ev) => {
      if (ev.key === "Escape") { ev.preventDefault(); if (!busy) onCancel?.(); }
      if (ev.key === "Enter" && ev.target?.tagName !== "TEXTAREA" && ev.target?.tagName !== "INPUT") {
        ev.preventDefault(); first.current?.click?.();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      try { prev?.focus?.(); } catch (_) {}
    };
  }, [open, busy, onCancel]);
  if (!open) return null;
  const go = async () => {
    if (busy) return;
    if (inputRequired && !String(val).trim()) { setErr((inputLabel || "This field") + " is required."); return; }
    setBusy(true); setErr("");
    try {
      await onConfirm?.(val);
    } catch (ex) {
      setErr(ex?.code || ex?.message || String(ex));
      setBusy(false);
      return;
    }
    setBusy(false);
  };
  return createPortal(e("div", { className: "ghz-cd-dim", onClick: () => { if (!busy) onCancel?.(); } },
    e("div", { className: "ghz-cd-card", role: "dialog", "aria-modal": "true", "aria-labelledby": "ghz-cd-title", onClick: (ev) => ev.stopPropagation() },
      e("div", { className: "ghz-cd-ico " + t }, e(Ico, { tone })),
      e("h3", { className: "ghz-cd-title", id: "ghz-cd-title" }, title),
      e("p", { className: "ghz-cd-msg" },
        name ? e("strong", null, name + " ") : null,
        message
      ),
      inputLabel ? e("input", { className: "ghz-cd-in", placeholder: inputLabel, value: val, onChange: (ev) => setVal(ev.target.value), "aria-label": inputLabel }) : null,
      err ? e("p", { className: "ghz-cd-err" }, err) : null,
      e("div", { className: "ghz-cd-acts" },
        e("button", { type: "button", className: "ghz-cd-btn ghz-cd-cancel", disabled: busy, onClick: () => onCancel?.() }, "Cancel"),
        e("button", { type: "button", className: "ghz-cd-btn ghz-cd-ok " + t, ref: first, disabled: busy, onClick: go },
          busy ? e("span", { className: "ghz-cd-spin", "aria-hidden": "true" }) : null,
          confirmLabel
        )
      )
    )
  ), document.body);
}

export function showConfirmDialog(opts) {
  ensureCss();
  return new Promise((resolve) => {
    const wrap = document.createElement("div");
    document.body.appendChild(wrap);
    const close = (ok, extra) => {
      wrap.remove();
      resolve({ ok, value: extra });
    };
    const tone = opts.tone === "danger" ? "danger" : opts.tone === "caution" ? "warn" : "info";
    wrap.innerHTML = `<div class="ghz-cd-dim"><div class="ghz-cd-card" role="dialog" aria-modal="true">
      <div class="ghz-cd-ico ${tone}"></div>
      <h3 class="ghz-cd-title"></h3>
      <p class="ghz-cd-msg"></p>
      ${opts.inputLabel ? `<input class="ghz-cd-in" />` : ""}
      <p class="ghz-cd-err" hidden></p>
      <div class="ghz-cd-acts">
        <button type="button" class="ghz-cd-btn ghz-cd-cancel">Cancel</button>
        <button type="button" class="ghz-cd-btn ghz-cd-ok ${tone}"></button>
      </div>
    </div></div>`;
    wrap.querySelector(".ghz-cd-title").textContent = opts.title || "Confirm";
    wrap.querySelector(".ghz-cd-msg").innerHTML = (opts.name ? "<strong></strong> " : "") + "";
    if (opts.name) wrap.querySelector(".ghz-cd-msg strong").textContent = opts.name;
    wrap.querySelector(".ghz-cd-msg").append(document.createTextNode(opts.message || ""));
    const okBtn = wrap.querySelector(".ghz-cd-ok");
    okBtn.textContent = opts.confirmLabel || "Confirm";
    const errEl = wrap.querySelector(".ghz-cd-err");
    const inp = wrap.querySelector(".ghz-cd-in");
    if (inp) inp.placeholder = opts.inputLabel || "";
    wrap.querySelector(".ghz-cd-dim").addEventListener("click", (ev) => { if (ev.target.classList.contains("ghz-cd-dim")) close(false); });
    wrap.querySelector(".ghz-cd-cancel").onclick = () => close(false);
    okBtn.onclick = async () => {
      if (opts.inputRequired && inp && !inp.value.trim()) {
        errEl.hidden = false; errEl.textContent = (opts.inputLabel || "This field") + " is required."; return;
      }
      okBtn.disabled = true;
      try {
        if (opts.onConfirm) await opts.onConfirm(inp ? inp.value : undefined);
        close(true, inp ? inp.value : undefined);
      } catch (ex) {
        errEl.hidden = false; errEl.textContent = ex?.code || ex?.message || String(ex);
        okBtn.disabled = false;
      }
    };
    const onKey = (ev) => {
      if (ev.key === "Escape") { window.removeEventListener("keydown", onKey); close(false); }
      if (ev.key === "Enter" && ev.target === okBtn) okBtn.click();
    };
    window.addEventListener("keydown", onKey);
    okBtn.focus();
  });
}

export function showLeaveGradesDialog() {
  ensureCss();
  return new Promise((resolve) => {
    const wrap = document.createElement("div");
    document.body.appendChild(wrap);
    wrap.innerHTML = `<div class="ghz-cd-dim"><div class="ghz-cd-card" role="dialog" aria-modal="true">
      <div class="ghz-cd-ico warn"></div>
      <h3 class="ghz-cd-title">You have unsaved grades</h3>
      <p class="ghz-cd-msg">Save them, discard, or stay?</p>
      <div class="ghz-cd-acts">
        <button type="button" class="ghz-cd-btn ghz-cd-cancel" data-a="stay">Stay</button>
        <button type="button" class="ghz-cd-btn ghz-cd-cancel" data-a="discard">Discard</button>
        <button type="button" class="ghz-cd-btn ghz-cd-ok" data-a="save">Save</button>
      </div>
    </div></div>`;
    const done = (v) => { wrap.remove(); resolve(v); };
    wrap.querySelector(".ghz-cd-dim").addEventListener("click", (ev) => { if (ev.target.classList.contains("ghz-cd-dim")) done("stay"); });
    wrap.querySelectorAll("[data-a]").forEach((b) => { b.onclick = () => done(b.getAttribute("data-a")); });
    const onKey = (ev) => { if (ev.key === "Escape") { window.removeEventListener("keydown", onKey); done("stay"); } };
    window.addEventListener("keydown", onKey);
  });
}

export function showNoticeDialog(opts) {
  ensureCss();
  return new Promise((resolve) => {
    const wrap = document.createElement("div");
    document.body.appendChild(wrap);
    const tone = opts.tone === "danger" ? "danger" : opts.tone === "ok" ? "ok" : "info";
    const retry = !!opts.retry;
    wrap.innerHTML = `<div class="ghz-cd-dim"><div class="ghz-cd-card ghz-cd-sm" role="dialog" aria-modal="true" aria-labelledby="ghz-cd-notice-title">
      <div class="ghz-cd-ico ${tone}"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${tone === "ok" ? '<path d="M20 6L9 17l-5-5"/>' : '<path d="M12 8v5M12 16h.01M12 21a9 9 0 110-18 9 9 0 010 18z"/>'}</svg></div>
      <h3 class="ghz-cd-title" id="ghz-cd-notice-title"></h3>
      <p class="ghz-cd-msg"></p>
      ${retry ? '<div class="ghz-cd-acts"><button type="button" class="ghz-cd-btn ghz-cd-ok danger">Try again</button></div>' : ""}
    </div></div>`;
    wrap.querySelector(".ghz-cd-title").textContent = opts.title || "Saved";
    wrap.querySelector(".ghz-cd-msg").textContent = opts.message || "";
    let done = false;
    const close = () => {
      if (done) return;
      done = true;
      window.removeEventListener("keydown", onKey);
      wrap.remove();
      resolve();
    };
    const onKey = (ev) => { if (ev.key === "Escape") { ev.preventDefault(); close(); } };
    window.addEventListener("keydown", onKey);
    wrap.querySelector(".ghz-cd-dim").addEventListener("click", close);
    wrap.querySelector(".ghz-cd-card").addEventListener("click", (ev) => {
      if (!retry) { ev.stopPropagation(); close(); }
      else ev.stopPropagation();
    });
    const tryBtn = wrap.querySelector(".ghz-cd-ok");
    if (tryBtn) tryBtn.onclick = () => { close(); opts.onRetry?.(); };
    if (!retry) {
      const ms = Number(opts.autoCloseMs);
      setTimeout(close, Number.isFinite(ms) ? ms : 1500);
    }
  });
}
