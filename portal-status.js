import { statusLabel } from "./courseStatusLabel.js";

export const completedOn = (course) => {
  try {
    const t = course && course.completedAt;
    const d = t && t.toDate ? t.toDate() : t ? new Date(t) : null;
    return d && !isNaN(d) ? d.toLocaleDateString() : "—";
  } catch {
    return "—";
  }
};

export const portalStatus = (course) => {
  const st = course && course.status;
  const label = statusLabel(course);
  if (st === "Completed") {
    return {
      label,
      color: "done",
      group: "completed",
      className: "badge badge-done",
      tooltip: "",
      completedLine: `Completed on ${completedOn(course)}`
    };
  }
  if (st === "Archived") {
    return { label, color: "gray", group: "active", className: "badge badge-arch", tooltip: "", completedLine: "" };
  }
  if (st === "Draft") {
    return { label, color: "gray", group: "active", className: "badge badge-draft", tooltip: "", completedLine: "" };
  }
  if (label === "Scheduled · Open for registration") {
    return { label, color: "green", group: "active", className: "badge badge-sched-open", tooltip: "", completedLine: "" };
  }
  if (label === "Scheduled · Registration closed") {
    return { label, color: "green", group: "active", className: "badge badge-sched-closed", tooltip: "", completedLine: "" };
  }
  if (label === "On going · Registration closed") {
    return {
      label,
      color: "green",
      group: "active",
      className: "badge badge-open",
      tooltip: "Registration is closed, the course is in progress.",
      completedLine: ""
    };
  }
  return { label, color: "green", group: "active", className: "badge badge-open", tooltip: "", completedLine: "" };
};

export const statusBadgeHtml = (course) => {
  const p = portalStatus(course);
  const lock = p.group === "completed" ? "🔒 " : "";
  const tip = p.tooltip ? ` title="${p.tooltip}"` : "";
  return `<span class="${p.className}"${tip}>${lock}${p.label}</span>`;
};
