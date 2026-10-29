const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatCourseDate(v) {
  if (v == null || v === "" || v === "—" || v === "-") return "";
  try {
    if (v && typeof v.toDate === "function") {
      const d = v.toDate();
      if (d && !Number.isNaN(d.getTime())) return d.getUTCDate() + " " + MONTHS[d.getUTCMonth()] + " " + d.getUTCFullYear();
    }
  } catch {}
  const s = String(v).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const y = Number(m[1]), mo = Number(m[2]), day = Number(m[3]);
    if (mo >= 1 && mo <= 12 && day >= 1 && day <= 31) return day + " " + MONTHS[mo - 1] + " " + y;
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime()) && /\d{4}/.test(s) && !/invalid/i.test(String(d))) {
    return d.getUTCDate() + " " + MONTHS[d.getUTCMonth()] + " " + d.getUTCFullYear();
  }
  return "";
}

export function courseStartLabel(c, fallback) {
  const t = formatCourseDate(c?.startDate);
  return t || fallback || "";
}

export function courseEndLabel(c, lastSession, fallback) {
  const t = formatCourseDate(c?.endDate) || formatCourseDate(lastSession);
  return t || fallback || "";
}

export function startsEndsLine(c, lastSession) {
  const a = formatCourseDate(c?.startDate);
  const b = courseEndLabel(c, lastSession, "");
  const parts = [];
  if (a) parts.push("Starts " + a);
  if (b) parts.push("Ends " + b);
  return parts.join(" · ");
}
