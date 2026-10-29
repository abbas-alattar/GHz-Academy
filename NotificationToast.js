import { h, create } from "./nv2-h.js";
import { toneFor } from "./NotificationPanel.js";

function shownSet() {
  try { return new Set(JSON.parse(sessionStorage.getItem("ghz-toast-shown") || "[]")); } catch { return new Set(); }
}
function remember(id) {
  try {
    const s = shownSet();
    s.add(id);
    sessionStorage.setItem("ghz-toast-shown", JSON.stringify([...s].slice(-200)));
  } catch (_) {}
}
function edge(n) {
  if (n?.type === "courseDone" || n?.type === "coursePass" || n?.celebrate) return "ok";
  if (n?.tone === "red" || n?.type === "courseFail" || n?.type === "regRejected") return "err";
  if (n?.type === "ann" || /warn/i.test(n?.title || "")) return "warn";
  return "info";
}
function typeIco(n) {
  const t = toneFor(n);
  return h("span", { className: "nt2-ico", style: { background: t.bg, color: t.fg } },
    h("svg", { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: t.fg, "stroke-width": "1.8" },
      h("path", { d: t.d, "stroke-linecap": "round", "stroke-linejoin": "round" })
    )
  );
}

let stack = [];
let host = null;
const timers = new Map();

function ensureHost() {
  if (host && document.body.contains(host)) return host;
  host = document.getElementById("nv2-toast-host");
  if (!host) {
    host = document.createElement("div");
    host.id = "nv2-toast-host";
    host.className = "nv2-toast-host";
    document.body.appendChild(host);
  }
  return host;
}
function paintStack() {
  const el = ensureHost();
  const hdr = document.querySelector(".top, header, .portal-top");
  const top = (hdr ? hdr.getBoundingClientRect().bottom : 68) + 12;
  el.style.top = top + "px";
  const tree = h("div", { className: "nv2-toast-stack nt2-toast-stack" },
    ...stack.slice(0, 3).map((t) =>
      h("div", {
        className: "nv2-toast nt2-toast nv2-toast-" + t.kind,
        key: t.id,
        onMouseEnter: () => pause(t.id),
        onMouseLeave: () => resume(t.id),
        onClick: () => t.onView?.(t.n)
      },
        typeIco(t.n),
        h("div", { className: "nv2-toast-body" },
          h("strong", null, t.n.title || "Notification"),
          h("p", null, t.n.message || ""),
          h("small", null, "Just now")
        ),
        h("button", { type: "button", className: "nv2-x", "aria-label": "Close", onClick: (e) => { e.stopPropagation(); dismiss(t.id, false); } }, "×"),
        h("span", { className: "nv2-toast-bar" })
      )
    )
  );
  el.replaceChildren(create(tree));
}
function pause(id) { const t = timers.get(id); if (t) { clearTimeout(t.tid); t.paused = true; } }
function resume(id) {
  const t = timers.get(id);
  if (t && t.paused) { t.tid = setTimeout(() => dismiss(id, false), 2500); t.paused = false; }
}
function dismiss(id, viaView) {
  const t = timers.get(id);
  if (t) clearTimeout(t.tid);
  timers.delete(id);
  stack = stack.filter((x) => x.id !== id);
  paintStack();
  if (viaView) return;
}

export function pushNotificationToast(n, { onView } = {}) {
  if (!n?.id) return;
  const shown = shownSet();
  if (shown.has(n.id)) return;
  if (stack.some((x) => x.id === n.id)) return;
  remember(n.id);
  const kind = edge(n);
  const rec = { id: n.id, n, kind, onView: (item) => { dismiss(n.id, true); onView?.(item); } };
  stack = [rec, ...stack].slice(0, 3);
  paintStack();
  timers.set(n.id, { tid: setTimeout(() => dismiss(n.id, false), 6000), paused: false });
}

export function NotificationToast({ toast, onView, onClose }) {
  if (toast) pushNotificationToast(toast, { onView: (n) => { onView?.(n); onClose?.(); } });
  return null;
}
