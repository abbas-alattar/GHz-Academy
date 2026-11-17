/** Display + logic for class sessions. Stored status stays except Cancelled / Completed write on attendance save. */

const BEIRUT = "Asia/Beirut";

function toDate(v) {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v) ? null : v;
  try {
    if (typeof v.toDate === "function") return v.toDate();
  } catch {}
  if (typeof v.seconds === "number") return new Date(v.seconds * 1000);
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t) : null;
}

function ymdBeirut(d) {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: BEIRUT, year: "numeric", month: "2-digit", day: "2-digit"
    }).formatToParts(d);
    const y = parts.find((p) => p.type === "year")?.value;
    const m = parts.find((p) => p.type === "month")?.value;
    const day = parts.find((p) => p.type === "day")?.value;
    if (!y || !m || !day) return "";
    return y + "-" + m + "-" + day;
  } catch {
    return "";
  }
}

function hmBeirut(d) {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: BEIRUT, hour: "2-digit", minute: "2-digit", hour12: false
    }).formatToParts(d);
    const h = parts.find((p) => p.type === "hour")?.value;
    const m = parts.find((p) => p.type === "minute")?.value;
    return (h || "00") + ":" + (m || "00");
  } catch {
    return "00:00";
  }
}

function nowBeirutParts(now) {
  const d = now instanceof Date ? now : new Date();
  return { ymd: ymdBeirut(d), hm: hmBeirut(d), ms: d.getTime() };
}

function parseHm(t) {
  const s = String(t || "").trim();
  const m = s.match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return String(m[1]).padStart(2, "0") + ":" + m[2];
}

export function sessionDateYmd(s) {
  const v = s && (s.date || s.sessionDate || s.startDate);
  if (!v) return "";
  if (typeof v === "string") {
    const m = v.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
  }
  const d = toDate(v);
  return d ? ymdBeirut(d) : "";
}

export function sessionHasAttendance(s, pack) {
  if (!s) return false;
  if (s.attendanceSaved || s.marked || s.markedCount > 0) return true;
  const atts = pack && (pack.attendance || pack.marks);
  if (!Array.isArray(atts)) return false;
  const id = s.id;
  return atts.some((a) => a && a.sessionId === id && a.status);
}

function startHm(s) {
  return parseHm(s.startTime || s.start || s.from) || "00:00";
}
function endHm(s) {
  return parseHm(s.endTime || s.end || s.to) || startHm(s);
}

/**
 * Derived session status (Beirut wall clock).
 * Cancelled if stored Cancelled.
 * Completed if attendance saved OR end time passed.
 * Upcoming if start in the future.
 * In progress between start and end.
 */
export function sessionStatus(s, now, pack) {
  const st = String((s && s.status) || "");
  if (st === "Cancelled") return "Cancelled";
  if (sessionHasAttendance(s, pack)) return "Completed";
  const ymd = sessionDateYmd(s);
  const n = nowBeirutParts(now);
  if (!ymd) {
    if (st === "Completed") return "Completed";
    return "Upcoming";
  }
  const start = ymd + "T" + startHm(s);
  const end = ymd + "T" + endHm(s);
  const nowKey = n.ymd + "T" + n.hm;
  if (nowKey > end) return "Completed";
  if (nowKey < start) return "Upcoming";
  return "In progress";
}

export function sessionStatusLabel(s, now, pack) {
  return sessionStatus(s, now, pack);
}

export function isSessionCancelled(s) {
  return String((s && s.status) || "") === "Cancelled";
}

export function isSessionUpcoming(s, now, pack) {
  return sessionStatus(s, now, pack) === "Upcoming";
}

export function isSessionPastWithoutAttendance(s, now, pack) {
  if (isSessionCancelled(s)) return false;
  if (sessionHasAttendance(s, pack)) return false;
  const ymd = sessionDateYmd(s);
  if (!ymd) return false;
  const n = nowBeirutParts(now);
  const end = ymd + "T" + endHm(s);
  const nowKey = n.ymd + "T" + n.hm;
  return nowKey > end;
}

export function needsManualQuizGrade(attempt) {
  if (!attempt) return false;
  const st = String(attempt.status || "");
  if (st === "graded") return false;
  if (st === "partial") return true;
  const answers = attempt.answers || attempt.questionAnswers || [];
  const scores = attempt.questionScores;
  const hasText = Array.isArray(answers) && answers.some((a) => {
    const t = String(a?.type || a?.kind || "").toLowerCase();
    return t === "text" || t === "short" || t === "essay" || t === "open";
  });
  if (hasText && st && st !== "graded") return true;
  if (st === "submitted" && scores && typeof scores === "object") {
    return Object.values(scores).some((v) => v == null || v === "");
  }
  if (st === "submitted" && hasText) return true;
  return false;
}

if (typeof window !== "undefined") {
  window.sessionStatus = sessionStatus;
  window.sessionStatusLabel = sessionStatusLabel;
}
