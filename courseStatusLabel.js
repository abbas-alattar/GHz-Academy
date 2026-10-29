/** Display-only. Stored Firestore status values stay unchanged. */

const BEIRUT = "Asia/Beirut";

function ymdInBeirut(d) {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: BEIRUT,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(d);
    const y = parts.find((p) => p.type === "year")?.value;
    const m = parts.find((p) => p.type === "month")?.value;
    const day = parts.find((p) => p.type === "day")?.value;
    if (!y || !m || !day) return null;
    return y + "-" + m + "-" + day;
  } catch {
    return null;
  }
}

function startYmd(course) {
  const v = course && (course.startDate ?? course.start);
  if (v == null || v === "") return "";
  try {
    if (typeof v.toDate === "function") return ymdInBeirut(v.toDate()) || "";
  } catch {}
  if (v && typeof v.seconds === "number") {
    try { return ymdInBeirut(new Date(v.seconds * 1000)) || ""; } catch {}
  }
  const s = String(v);
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const t = Date.parse(s);
  if (Number.isFinite(t)) return ymdInBeirut(new Date(t)) || "";
  return "";
}

function startDateInFuture(course, now) {
  const start = startYmd(course);
  if (!start) return false;
  const today = ymdInBeirut(now instanceof Date ? now : new Date()) || "";
  return !!today && start > today;
}

function storedStatus(course) {
  const c = course && typeof course === "object" ? course : { status: course };
  return String(c.status || "");
}

export function statusLabel(course, now) {
  const c = course && typeof course === "object" ? course : { status: course };
  const st = String(c.status || "");
  const n = now instanceof Date ? now : new Date();
  const future = startDateInFuture(c, n);
  if (st === "Draft") return "Draft";
  if (st === "Completed") return "Completed";
  if (st === "Archived") return "Archived";
  if (st === "Coming soon") return "Scheduled · Open for registration";
  if (st === "Open") {
    if (future) return "Scheduled · Open for registration";
    return "On going";
  }
  if (st === "Closed") return "On going · Registration closed";
  return st || "—";
}

export function courseStatusLabel(statusOrCourse, now) {
  if (statusOrCourse && typeof statusOrCourse === "object") return statusLabel(statusOrCourse, now);
  return statusLabel({ status: statusOrCourse }, now);
}

export function courseStatusChipLabel(statusOrCourse, now) {
  return courseStatusLabel(statusOrCourse, now);
}

/** Compact chip for tables/admin lists. Landing/cards keep statusLabel(). */
export function statusChipShort(course, now) {
  const lab = statusLabel(course, now);
  if (lab.indexOf("Scheduled") === 0) return "Scheduled";
  if (lab.indexOf("On going") === 0) return "On going";
  if (lab === "Completed" || lab === "Draft" || lab === "Archived") return lab;
  return lab;
}

export function statusChipKind(course, now) {
  const lab = statusLabel(course, now);
  if (lab === "Scheduled · Open for registration") return "sched-open";
  if (lab === "On going") return "ongoing";
  if (lab === "On going · Registration closed") return "closed";
  if (lab === "Completed") return "completed";
  if (lab === "Archived") return "archived";
  if (lab === "Draft") return "draft";
  return "draft";
}

/** Registration follows stored status only — never dates. */
export function canRegisterForCourse(statusOrCourse) {
  const st = storedStatus(statusOrCourse);
  return st === "Open" || st === "Coming soon";
}

export function registrationOpenLabel(statusOrCourse) {
  const st = storedStatus(statusOrCourse);
  if (st === "Closed") return "Registration closed";
  if (st === "Open" || st === "Coming soon") return "Registration open";
  return "";
}

export function adminCourseTabLabel(tab) {
  const t = String(tab || "");
  if (t === "Active") return "Active";
  if (t === "All") return "All";
  if (t === "Coming soon" || t === "Scheduled") return "Scheduled";
  if (t === "Open" || t === "On going") return "On going";
  if (t === "Closed") return "On going · Registration closed";
  if (t === "Completed") return "Completed";
  if (t === "Archived") return "Archived";
  return t;
}

export function matchesAdminCourseTab(courseOrStatus, tab, now) {
  const t = String(tab || "Active");
  const c = courseOrStatus && typeof courseOrStatus === "object" ? courseOrStatus : { status: courseOrStatus };
  const st = String(c.status || "");
  if (t === "All") return true;
  if (t === "Active") return st === "Open" || st === "Closed";
  const lab = statusLabel(c, now);
  if (t === "Scheduled" || t === "Coming soon") return lab.indexOf("Scheduled") === 0;
  if (t === "On going" || t === "Open") return lab === "On going" || lab === "On going · Registration closed";
  if (t === "Closed") return st === "Closed";
  if (t === "Completed") return st === "Completed";
  if (t === "Archived") return st === "Archived";
  return st === t;
}

if (typeof window !== "undefined") {
  window.statusLabel = statusLabel;
  window.courseStatusLabel = courseStatusLabel;
  window.adminCourseTabLabel = adminCourseTabLabel;
  window.canRegisterForCourse = canRegisterForCourse;
  window.statusChipKind = statusChipKind;
  window.registrationOpenLabel = registrationOpenLabel;
  window.statusChipShort = statusChipShort;
}
