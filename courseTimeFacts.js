const BEIRUT = "Asia/Beirut";

const WORDS = {
  1: "Once a week",
  2: "Twice a week",
  3: "Three times a week",
  4: "Four times a week",
  5: "Five times a week"
};

export function sessionsPerWeekLabel(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return "To be announced";
  const k = Math.round(v);
  if (WORDS[k]) return WORDS[k];
  return k + " times a week";
}

export function sessionsPerWeekFromCourse(course) {
  const n = Number(course?.sessionsPerWeek);
  if (Number.isFinite(n) && n > 0) return n;
  const days = course?.days;
  if (Array.isArray(days) && days.filter(Boolean).length) return days.filter(Boolean).length;
  return 0;
}

export function durationWithSessions(weeksText, perWeek) {
  const w = String(weeksText || "").replace(/,?\s*\d+\s+sessions?\s+a week/i, "").replace(/·.*/g, "").trim();
  const sess = sessionsPerWeekLabel(perWeek);
  if (!w || /^to be announced$/i.test(w) || w === "—") {
    return sess === "To be announced" ? "" : sess;
  }
  if (sess === "To be announced") return w;
  return w + " · " + sess;
}

function pad(n) { return String(n).padStart(2, "0"); }

function parseClock(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  const m = s.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/i);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] || 0);
  const ap = (m[3] || "").toUpperCase();
  if (ap === "PM" && h < 12) h += 12;
  if (ap === "AM" && h === 12) h = 0;
  if (!Number.isFinite(h) || h > 23) return null;
  return { h, min };
}

function prettyClock(h, min) {
  const ap = h >= 12 ? "PM" : "AM";
  let hh = h % 12;
  if (!hh) hh = 12;
  return hh + ":" + pad(min) + " " + ap;
}

export function parseBeirutRange(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  const m = s.match(/(\d{1,2}(?::\d{2})?\s*(?:AM|PM)?)\s*[-–—]\s*(\d{1,2}(?::\d{2})?\s*(?:AM|PM)?)/i);
  if (!m) {
    const one = parseClock(s);
    return one ? { from: one, to: null } : null;
  }
  return { from: parseClock(m[1]), to: parseClock(m[2]) };
}

export function formatBeirutTimeLine(raw) {
  const r = parseBeirutRange(raw);
  if (!r || !r.from) return "";
  const a = prettyClock(r.from.h, r.from.min);
  const b = r.to ? prettyClock(r.to.h, r.to.min) : "";
  return b ? a + " – " + b : a;
}

function visitorZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch { return ""; }
}

function zoneCityLabel(z) {
  if (!z) return "";
  if (/Asia\/Beirut/i.test(z)) return "Beirut time";
  const city = z.split("/").pop() || "";
  return city.replace(/_/g, " ") + " time";
}

function beirutOffsetMinutes(date) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: BEIRUT, hour: "2-digit", minute: "2-digit", hour12: false, timeZoneName: "shortOffset"
    }).formatToParts(date);
    const off = parts.find((p) => p.type === "timeZoneName")?.value || "";
    const m = off.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/i);
    if (!m) return 120;
    const sign = m[1] === "-" ? -1 : 1;
    return sign * (Number(m[2]) * 60 + Number(m[3] || 0));
  } catch { return 120; }
}

function visitorOffsetMinutes(date, zone) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: zone, hour: "2-digit", minute: "2-digit", hour12: false, timeZoneName: "shortOffset"
    }).formatToParts(date);
    const off = parts.find((p) => p.type === "timeZoneName")?.value || "";
    const m = off.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/i);
    if (!m) return 0;
    const sign = m[1] === "-" ? -1 : 1;
    return sign * (Number(m[2]) * 60 + Number(m[3] || 0));
  } catch { return 0; }
}

export function localRangeFromBeirut(raw) {
  const r = parseBeirutRange(raw);
  if (!r || !r.from) return "";
  const zone = visitorZone();
  if (!zone || /Asia\/Beirut/i.test(zone)) return "";
  const now = new Date();
  const delta = visitorOffsetMinutes(now, zone) - beirutOffsetMinutes(now);
  const shift = (clock) => {
    let mins = clock.h * 60 + clock.min + delta;
    mins = ((mins % 1440) + 1440) % 1440;
    return prettyClock(Math.floor(mins / 60), mins % 60);
  };
  const a = shift(r.from);
  const b = r.to ? shift(r.to) : "";
  return b ? a + " – " + b : a;
}

export function timePopoverText(raw) {
  const zone = visitorZone();
  if (!zone || /Asia\/Beirut/i.test(zone)) return "Times are in Beirut time.";
  const local = localRangeFromBeirut(raw);
  const name = zoneCityLabel(zone);
  if (!local) return "Times are in Beirut time (Asia/Beirut).";
  return "Times are in Beirut time (Asia/Beirut). In your time zone: " + local + (name ? " (" + name + ")" : "");
}

export function timeInfoButton(raw) {
  let t = "Times are in Beirut time.";
  try { t = timePopoverText(raw) || t; } catch (e) {}
  const safe = String(t).split('"').join('').split('<').join('');
  return '<button type="button" class="ghz-tz-info" aria-label="Time zone info" data-tz-tip="' + safe + '">i</button>';
}

export function bindTimePopovers(root) {
  const host = root || document;
  if (host.__ghzTzBound) return;
  host.__ghzTzBound = true;
  const close = () => document.querySelectorAll(".ghz-tz-pop").forEach((n) => n.remove());
  host.addEventListener("click", (ev) => {
    const btn = ev.target.closest?.(".ghz-tz-info");
    if (!btn) {
      if (!ev.target.closest?.(".ghz-tz-pop")) close();
      return;
    }
    ev.preventDefault();
    ev.stopPropagation();
    const existing = btn.parentElement?.querySelector(".ghz-tz-pop");
    close();
    if (existing) return;
    const pop = document.createElement("div");
    pop.className = "ghz-tz-pop";
    pop.setAttribute("role", "tooltip");
    pop.textContent = btn.getAttribute("data-tz-tip") || "Times are in Beirut time.";
    const wrap = btn.closest(".ghz-tz-wrap") || btn.parentElement || document.body;
    wrap.style.position = wrap.style.position || "relative";
    wrap.appendChild(pop);
    const r = pop.getBoundingClientRect();
    if (r.right > window.innerWidth - 8) pop.style.left = "auto", pop.style.right = "0";
    if (r.bottom > window.innerHeight - 8) pop.style.top = "auto", pop.style.bottom = "28px";
  });
}
