import { createElement as e, useEffect, useLayoutEffect, useRef, useState } from "https://esm.sh/react@18.3.1";
import { createPortal } from "https://esm.sh/react-dom@18.3.1";

function Ico({ d }) {
  return e("svg", { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, "aria-hidden": true }, e("path", { d }));
}
const ICONS = {
  review: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z M12 12m-3 0a3 3 0 106 0 3 3 0 10-6 0",
  edit: "M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z",
  publish: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z",
  unpublish: "M17.94 17.94A10.94 10.94 0 0112 20c-5 0-9.27-3.11-11-8 1.02-2.86 2.9-5.17 5.24-6.61M1 1l22 22",
  dup: "M8 8h12v12H8z M4 16V4h12",
  del: "M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14",
  lock: "M7 11V7a5 5 0 0110 0v4M6 11h12v10H6z"
};

export function RowMenu({ items, locked }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btn = useRef(null);
  const menu = useRef(null);
  const [hi, setHi] = useState(0);
  const place = () => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const w = 200, h = Math.min(280, (items?.length || 4) * 40 + 16);
    let top = r.bottom + 6;
    if (top + h > window.innerHeight - 8) top = r.top - h - 6;
    if (top < 8) top = 8;
    let left = r.right - w;
    if (left < 8) left = 8;
    if (left + w > window.innerWidth - 8) left = window.innerWidth - w - 8;
    setPos({ top, left });
  };
  useLayoutEffect(() => { if (open) place(); }, [open]);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onDown = (ev) => {
      if (menu.current?.contains(ev.target) || btn.current?.contains(ev.target)) return;
      close();
    };
    const onKey = (ev) => {
      if (ev.key === "Escape") { close(); return; }
      if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
        ev.preventDefault();
        const btns = menu.current?.querySelectorAll("button:not(:disabled)") || [];
        if (!btns.length) return;
        const i = Array.from(btns).indexOf(document.activeElement);
        const n = ev.key === "ArrowDown" ? (i + 1) % btns.length : (i <= 0 ? btns.length - 1 : i - 1);
        btns[n]?.focus();
        setHi(n);
      }
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("hashchange", close);
    requestAnimationFrame(() => menu.current?.querySelector("button")?.focus());
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("hashchange", close);
    };
  }, [open]);
  const pop = open ? createPortal(
    e("div", { ref: menu, className: "th2-fly", role: "menu", style: { top: pos.top + "px", left: pos.left + "px" } },
      (items || []).map((it, i) => {
        const dis = !!(locked && it.lockWhenDone);
        return e("button", {
          type: "button", role: "menuitem", key: it.label, disabled: dis, className: "th2-flyi" + (it.danger ? " danger" : "") + (hi === i ? " on" : ""),
          title: dis ? "Course is completed" : it.label,
          onClick: () => { if (dis) return; setOpen(false); it.onClick?.(); }
        }, e(Ico, { d: dis ? ICONS.lock : (ICONS[it.icon] || ICONS.edit) }), it.label);
      })
    ), document.body) : null;
  return e("span", { className: "th2-menuhost" },
    e("button", { type: "button", ref: btn, className: "th2-dots", "aria-label": "More actions", "aria-haspopup": "menu", "aria-expanded": open,
      onClick: (ev) => { ev.stopPropagation(); setOpen((o) => !o); },
      onKeyDown: (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); setOpen(true); } }
    }, "⋯"),
    pop
  );
}
