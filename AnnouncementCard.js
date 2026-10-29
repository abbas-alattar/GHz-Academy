import { createElement as e, useState } from "https://esm.sh/react@18.3.1";

export function titleOf(id, courses) {
  if (!id || id === "all") return "Everyone";
  if (Array.isArray(courses)) return (courses.find((c) => c.id === id)?.title) || id;
  return (courses && courses[id]) || id;
}
export function when(t) {
  try {
    const d = t?.toDate ? t.toDate() : t ? new Date(t) : null;
    return d && !isNaN(d) ? d.toLocaleString() : "—";
  } catch { return "—"; }
}
function Ico({ d, stroke = "currentColor" }) {
  return e("svg", { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke, strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true }, e("path", { d }));
}

export function AnnouncementCard({ a, courses, unread, onOpen, onEdit, onPin, onDel, controls }) {
  const [open, setOpen] = useState(false);
  const long = String(a.body || "").split("\n").length > 3 || String(a.body || "").length > 180;
  const everyone = !a.courseId || a.courseId === "all";
  const role = String(a.authorRole || "").toLowerCase();
  const isTrainer = role === "trainer";
  const click = () => {
    setOpen(true);
    if (onOpen) onOpen(a);
  };
  return e("article", {
    className: "aanv2-card" + (a.pinned ? " pin" : "") + (unread ? " aanv2-unread" : ""),
    onClick: click,
    role: "button",
    tabIndex: 0,
    onKeyDown: (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); click(); } }
  },
    e("div", null,
      e("div", { className: "aanv2-ttl" },
        unread ? e("span", { className: "aanv2-dot", "aria-hidden": true }) : null,
        e("strong", { className: unread ? "aanv2-bold" : "" }, a.title || "Untitled"),
        a.pinned ? e("span", { className: "aanv2-pill pinlab" }, "Pinned") : null,
        e("span", { className: "aanv2-pill " + (everyone ? "all" : "course") }, titleOf(a.courseId, courses)),
        e("span", { className: "aanv2-pill " + (isTrainer ? "trlab" : "adlab") }, isTrainer ? "Trainer" : "Admin")
      ),
      e("p", { className: "aanv2-body" + (long && !open ? " clamp" : "") }, a.body || ""),
      long ? e("button", { type: "button", className: "aanv2-more", onClick: (ev) => { ev.stopPropagation(); setOpen((v) => !v); if (!open && onOpen) onOpen(a); } }, open ? "Show less" : "Read more") : null,
      e("p", { className: "aanv2-meta" }, [a.authorName || (isTrainer ? "Trainer" : "Admin"), isTrainer ? "trainer" : "admin", when(a.createdAt)].join(" · "))
    ),
    controls ? e("div", { className: "aanv2-acts", onClick: (ev) => ev.stopPropagation() },
      onEdit ? e("button", { type: "button", className: "aanv2-ico edit", title: "Edit", "aria-label": "Edit", onClick: () => onEdit(a) },
        e(Ico, { d: "M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z" })) : null,
      onPin ? e("button", { type: "button", className: "aanv2-ico pinbtn" + (a.pinned ? " on" : ""), title: a.pinned ? "Unpin" : "Pin", "aria-label": a.pinned ? "Unpin" : "Pin", onClick: () => onPin(a) },
        e(Ico, { d: "M12 17v5M9 3h6l-1 7h4l-6 6-6-6h4L9 3z", stroke: a.pinned ? "#B45309" : "currentColor" })) : null,
      onDel ? e("button", { type: "button", className: "aanv2-ico del", title: "Delete", "aria-label": "Delete", onClick: () => onDel(a) },
        e(Ico, { d: "M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6", stroke: "#DC2626" })) : null
    ) : null
  );
}
