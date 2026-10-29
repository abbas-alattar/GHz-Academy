import { h } from "./nv2-h.js";

const BELL_HTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0F2747" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`;

export function NotificationBell({ badge, open, onToggle, shake }) {
  const n = badge > 99 ? "99+" : String(badge);
  const unread = Number(badge) > 0;
  return h("button", {
    type: "button",
    className: "nv2-bell" + (shake ? " shake" : "") + (unread ? " nv2-unread" : ""),
    "aria-label": "Notifications",
    "aria-expanded": open ? "true" : "false",
    onClick: (e) => { e.preventDefault(); e.stopPropagation(); onToggle(e); },
    dangerouslySetInnerHTML: { __html: BELL_HTML + (unread ? `<span class="nv2-badge">${n}</span>` : "") }
  });
}
