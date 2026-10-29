export const isCourseLocked = (course) => !!(course && course.status === "Completed");

export const completedDate = (course) => {
  try {
    const t = course && course.completedAt;
    const d = t && t.toDate ? t.toDate() : t ? new Date(t) : null;
    return d && !isNaN(d) ? d.toLocaleDateString() : "—";
  } catch {
    return "—";
  }
};

export const CompletedBanner = (course) => {
  if (!isCourseLocked(course)) return "";
  return `<div class="completed-banner" role="status">🔒 This course was completed on ${completedDate(course)}. It is read-only: you can view everything, but you can't make changes.</div>`;
};

export const lockBtn = (label, extra = "") =>
  `<button class="btn btn-sm lock-btn" type="button" disabled title="This course is completed and read-only." ${extra}>${label}</button>`;

export const refuseLocked = (course) => {
  if (!isCourseLocked(course)) return false;
  return true;
};

export const lockWriteMsg = (e) => {
  const c = e && (e.code || "");
  if (String(c).includes("permission-denied")) return "This course is completed and read-only.";
  return (e && (e.code || e.message)) || "Could not save.";
};
