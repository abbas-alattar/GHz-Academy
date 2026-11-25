const WEEK = [
  { code: "Mon", letter: "M", name: "Monday", n: 1 },
  { code: "Tue", letter: "T", name: "Tuesday", n: 2 },
  { code: "Wed", letter: "W", name: "Wednesday", n: 3 },
  { code: "Thu", letter: "T", name: "Thursday", n: 4 },
  { code: "Fri", letter: "F", name: "Friday", n: 5 },
  { code: "Sat", letter: "S", name: "Saturday", n: 6 },
  { code: "Sun", letter: "S", name: "Sunday", n: 0 }
];

const MAP = {
  mon: "Mon", monday: "Mon", m: "Mon", "1": "Mon",
  tue: "Tue", tues: "Tue", tuesday: "Tue", tu: "Tue", "2": "Tue",
  wed: "Wed", wednesday: "Wed", w: "Wed", "3": "Wed",
  thu: "Thu", thur: "Thu", thurs: "Thu", thursday: "Thu", th: "Thu", "4": "Thu",
  fri: "Fri", friday: "Fri", f: "Fri", "5": "Fri",
  sat: "Sat", saturday: "Sat", sa: "Sat", "6": "Sat",
  sun: "Sun", sunday: "Sun", su: "Sun", "0": "Sun", "7": "Sun"
};

const esc = (s) => String(s ?? "").replace(/&/g,"&"+"amp;").replace(/</g,"&"+"lt;").replace(/"/g,"&"+"quot;");

function tokenToCode(raw) {
  if (raw == null) return "";
  if (typeof raw === "object") {
    const v = raw.code || raw.day || raw.name || raw.id || raw.value;
    return tokenToCode(v);
  }
  const t = String(raw).trim();
  if (!t) return "";
  return MAP[t.toLowerCase()] || "";
}

function tokensFromDays(days) {
  if (days == null || days === "") return { codes: [], invalidLetterString: false };
  if (Array.isArray(days)) {
    const codes = [];
    days.forEach((item) => {
      const c = tokenToCode(item);
      if (c && !codes.includes(c)) codes.push(c);
    });
    return { codes, invalidLetterString: false };
  }
  const s = String(days).trim();
  if (!s) return { codes: [], invalidLetterString: false };
  if (/^[MTWFSmtwfs]{7}$/.test(s.replace(/\s/g, "")) || /^MTWTFSS$/i.test(s.replace(/[^A-Za-z]/g, ""))) {
    const compact = s.replace(/[^A-Za-z]/g, "");
    if (compact.length >= 7 && compact.length <= 8) {
      return { codes: [], invalidLetterString: true, raw: s };
    }
  }
  if (/^[A-Za-z]{5,8}$/.test(s) && !MAP[s.toLowerCase()]) {
    return { codes: [], invalidLetterString: true, raw: s };
  }
  const parts = s.split(/[,/|;]+|\s+/).map((p) => p.trim()).filter(Boolean);
  const codes = [];
  parts.forEach((p) => {
    const c = tokenToCode(p);
    if (c && !codes.includes(c)) codes.push(c);
  });
  return { codes, invalidLetterString: false };
}

export function parseCourseDays(course) {
  return tokensFromDays(course?.days);
}

function formatTimeRange(raw) {
  const s = String(raw || "").trim();
  if (!s) return { time: "", zone: "" };
  const m = s.match(/(\d{1,2}:\d{2}\s*(?:AM|PM)?)\s*[-–—]\s*(\d{1,2}:\d{2}\s*(?:AM|PM)?)/i);
  let time = s.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
  if (m) {
    const a = m[1].replace(/\s+/g, " ").toUpperCase().replace(/AM/g, "AM").replace(/PM/g, "PM");
    const b = m[2].replace(/\s+/g, " ").toUpperCase().replace(/AM/g, "AM").replace(/PM/g, "PM");
    const fa = a.replace(/([AP]M)/, " $1").replace(/\s+/g, " ").trim();
    const fb = b.replace(/([AP]M)/, " $1").replace(/\s+/g, " ").trim();
    time = fa + " – " + fb;
  } else {
    time = time.replace(/\s*-\s*/g, " – ");
  }
  const zone = /beirut/i.test(s) || !s ? "Beirut time" : (/utc/i.test(s) ? "UTC" : "");
  const zoneLabel = /beirut/i.test(s) || true ? "Beirut time" : zone;
  return { time, zone: zoneLabel };
}

export function formatSchedule(course) {
  try {
    const { codes, invalidLetterString, raw } = tokensFromDays(course?.days);
    const { time, zone } = formatTimeRange(course?.sessionTime);
    const order = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const daysLine = codes.length ? order.filter((d) => codes.includes(d)).join(" · ") : "";
    return {
      daysLine,
      timeLine: time,
      zone,
      invalidLetterString: !!invalidLetterString,
      rawDays: raw || course?.days,
      codes
    };
  } catch (e) {
    return { daysLine: "", timeLine: "", zone: "Beirut time", invalidLetterString: false, rawDays: "", codes: [] };
  }
}

export function sessionsPerWeekWords(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return "To be announced";
  const k = Math.round(v);
  if (k === 1) return "Once a week";
  if (k === 2) return "Twice a week";
  if (k === 3) return "Three times a week";
  if (k === 4) return "Four times a week";
  if (k === 5) return "Five times a week";
  return k + " times a week";
}

export function formatDuration(course) {
  const d = String(course?.duration || "").trim().replace(/,\s*\d+\s+sessions?\s+a week/i, "").trim();
  const codes = tokensFromDays(course?.days).codes || [];
  const n = Number(course?.sessionsPerWeek) || codes.length || 0;
  const sess = n ? sessionsPerWeekWords(n) : "";
  let weeks = d;
  if (!weeks || /^to be announced$/i.test(weeks) || weeks === "—") {
    weeks = "";
    const a = course?.startDate, b = course?.endDate;
    const ms = (v) => {
      try { if (v && typeof v.toDate === "function") return v.toDate().getTime(); } catch {}
      const t = Date.parse(v || "");
      return Number.isFinite(t) ? t : NaN;
    };
    const x = ms(a), y = ms(b);
    if (Number.isFinite(x) && Number.isFinite(y) && y > x) {
      const w = Math.max(1, Math.round((y - x) / (7 * 24 * 3600 * 1000)));
      weeks = w + (w === 1 ? " week" : " weeks");
    }
  }
  if (weeks && sess) return weeks + " · " + sess;
  return weeks || sess || "";
}

export function formatPrice(course) {
  const n = Number(course?.price);
  if (!Number.isFinite(n) || n <= 0) return "";
  const cur = String(course?.currency || "USD").toUpperCase();
  const sym = cur === "USD" ? "$" : cur === "EUR" ? "€" : cur === "GBP" ? "£" : cur === "LBP" ? "L£" : "";
  if (sym) return sym + (Number.isInteger(n) ? String(n) : n.toFixed(0));
  return n + " " + cur;
}

export function deliveryDaysHtml(course, opts = {}) {
  try {
    const sch = formatSchedule(course);
    const emptyMode = opts.emptyMode || "announce";
    if (sch.invalidLetterString || !sch.daysLine) {
      if (emptyMode === "hide" && !sch.timeLine) return "";
      if (!sch.daysLine && !sch.timeLine) {
        if (emptyMode === "hide") return "";
        return `<div class="dd-wrap dd-empty">Schedule to be announced</div>`;
      }
    }
    const cal = `<svg class="dd-ico" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M8 3v4M16 3v4M3 10h18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
    const clk = `<svg class="dd-ico" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.8"/><path d="M12 8v5l3 2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
    const dayRow = sch.daysLine
      ? `<div class="dd-line">${cal}<span>${esc(sch.daysLine)}</span></div>`
      : "";
    const timeRow = sch.timeLine
      ? `<div class="dd-line ghz-tz-wrap">${clk}<span class="ghz-tz-stack"><span class="ghz-tz-main">${esc((sch.daysLine || "").replace(/ · /g, ", ") + (sch.daysLine && sch.timeLine ? " · " : "") + sch.timeLine)}</span><span class="ghz-tz-sub">Beirut time</span></span><button type="button" class="ghz-tz-info" aria-label="Time zone info">i</button></div>`
      : "";
    return `<div class="dd-wrap dd-sched">${dayRow}${timeRow}</div>`;
  } catch {
    return "";
  }
}
