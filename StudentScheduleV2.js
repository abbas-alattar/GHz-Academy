import { createElement as e, useEffect, useMemo, useRef, useState, memo, Component } from "https://esm.sh/react@18.3.1";
import { createRoot } from "https://esm.sh/react-dom@18.3.1/client";
import { db } from "./firebase-config.js?v=auth8";
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { getStudentStore, onDashData, loadStudentDash } from "./student-dash-data.js?v=stu7";

const roots = new WeakMap();
const COLORS = ["#D97706", "#2563EB", "#7C3AED", "#16A34A", "#0EA5E9"];
const WEEK = [
  { code: "Mon", letter: "M", name: "Monday" },
  { code: "Tue", letter: "T", name: "Tuesday" },
  { code: "Wed", letter: "W", name: "Wednesday" },
  { code: "Thu", letter: "T", name: "Thursday" },
  { code: "Fri", letter: "F", name: "Friday" },
  { code: "Sat", letter: "S", name: "Saturday" },
  { code: "Sun", letter: "S", name: "Sunday" }
];
const sessCache = Object.create(null);

class Boundary extends Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err) { console.error("StudentScheduleV2", err); }
  render() {
    if (this.state.err) {
      const code = this.state.err?.code || this.state.err?.message || "error";
      return e("div", null,
        e("p", { className: "banner" }, "Schedule could not load (" + String(code) + ")"),);
    }
    return this.props.children;
  }
}

function ymd(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function todayStr() { return ymd(new Date()); }
function parseYmd(s) {
  const m = String(s || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}
function parseHm(t) {
  const m = String(t || "").trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return { h: Number(m[1]), min: Number(m[2]) };
}
function localPartsMs(dateStr, timeStr) {
  const d = parseYmd(dateStr);
  const hm = parseHm(timeStr);
  if (!d || !hm) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), hm.h, hm.min, 0, 0).getTime();
}
function colorFor(id, courses) {
  const i = Math.max(0, (courses || []).findIndex((c) => c.id === id));
  return COLORS[i % COLORS.length];
}
function sessTitle(s) {
  const t = String(s?.title ?? s?.topic ?? s?.name ?? "").trim();
  if (!t || /^session$/i.test(t)) return "Class session";
  return t;
}
function validDate(s) { return !!parseYmd(s?.date); }
function hasTime(s) { return Boolean(parseHm(s?.startTime ?? s?.time)); }
function fmtTime(t) {
  const hm = parseHm(t);
  if (!hm) return "";
  return String(hm.h).padStart(2, "0") + ":" + String(hm.min).padStart(2, "0");
}
function durationLabel(s) {
  const a = parseHm(s?.startTime ?? s?.time);
  const b = parseHm(s?.endTime);
  if (!a || !b) return "";
  const mins = (b.h * 60 + b.min) - (a.h * 60 + a.min);
  if (!Number.isFinite(mins) || mins <= 0) return "";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h && m) return h + "h " + m + "m";
  if (h) return h + "h";
  return m + "m";
}
function mondayOf(offset) {
  const d = new Date();
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day + offset * 7);
  d.setHours(12, 0, 0, 0);
  return d;
}
function courseDays(c) {
  const raw = c?.days ?? c?.classDays ?? c?.weekDays ?? [];
  return Array.isArray(raw) ? raw.filter(Boolean) : [];
}
function courseTime(c) {
  return String(c?.sessionTime ?? c?.classTime ?? c?.time ?? "").trim();
}
function friendlyTz() {
  try {
    const z = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    if (/Beirut/i.test(z)) return "Beirut time";
    const city = z.split("/").pop() || "";
    return city ? city.replace(/_/g, " ") + " time" : "";
  } catch { return ""; }
}
function countdown(s, now) {
  if (!validDate(s) || !hasTime(s)) return "";
  const start = localPartsMs(s.date, s.startTime || s.time);
  const endHm = parseHm(s.endTime);
  const end = endHm ? localPartsMs(s.date, s.endTime) : (start != null ? start + 3600000 : null);
  if (start == null) return "";
  if (end != null && now >= start && now < end) return "LIVE NOW";
  if (end != null && now >= end) return "";
  const ms = start - now;
  const days = Math.floor(ms / 86400000);
  if (days >= 1) return "IN " + days + " DAY" + (days === 1 ? "" : "S");
  const hrs = Math.floor(ms / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  return "STARTS IN " + hrs + "H " + mins + "M";
}
function icsHref(s) {
  const start = localPartsMs(s.date, s.startTime || s.time) || Date.now();
  const dur = durationLabel(s);
  const end = localPartsMs(s.date, s.endTime) || start + 3600000;
  const fmt = (n) => {
    const d = new Date(n);
    const p = (x) => String(x).padStart(2, "0");
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "T" + p(d.getHours()) + p(d.getMinutes()) + "00";
  };
  const body = "BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nDTSTART:" + fmt(start) + "\nDTEND:" + fmt(dur ? end : start + 3600000) + "\nSUMMARY:" + sessTitle(s) + "\nEND:VEVENT\nEND:VCALENDAR";
  return "data:text/calendar;charset=utf-8," + encodeURIComponent(body);
}
function dayLabel(iso) {
  const t = todayStr();
  const tom = new Date(); tom.setDate(tom.getDate() + 1);
  if (iso === t) return "Today";
  if (iso === ymd(tom)) return "Tomorrow";
  const d = parseYmd(iso);
  if (!d) return iso;
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }).toUpperCase();
}
function splitSessions(all) {
  const t = todayStr();
  const dated = (all || []).filter(validDate);
  const upcoming = dated.filter((s) => String(s.date) >= t && s.status !== "Cancelled")
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.startTime || "").localeCompare(String(b.startTime || "")));
  const past = dated.filter((s) => String(s.date) < t).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return { upcoming, past, recentPast: past.slice(0, 1) };
}

const CountChip = memo(function CountChip({ next }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);
  const chip = next ? countdown(next, now) : "";
  return e("div", { className: "ss2-chipn" }, e("span", { className: "ss2-dotg" }), "NEXT CLASS · " + (chip || "UPCOMING"));
});

function weekStripSkel() {
  const d = new Date();
  const day = (d.getDay() + 6) % 7;
  const mon = new Date(d);
  mon.setDate(d.getDate() - day);
  return e("div", { className: "ss2-week" },
    [...Array(7)].map((_, i) => {
      const x = new Date(mon);
      x.setDate(mon.getDate() + i);
      const on = i === day;
      return e("div", { key: i, className: "ss2-day" + (on ? " on" : "") },
        e("div", { className: "wd" }, WEEK[i].code.toUpperCase()),
        e("div", { className: "dn" }, String(x.getDate())),
        e("div", { className: "ss2-dots" }, e("span", { style: { background: on ? "#93C5FD" : "#E2E8F0" } }))
      );
    })
  );
}

function Skeleton() {
  return e("div", { className: "ss2-wrap ss2-skelwrap" },
    e("div", { className: "ss2-head" }, e("h2", null, "Schedule"), e("div", { className: "ss2-seg" }, e("button", { className: "on" }, "Agenda"), e("button", null, "Week"), e("button", null, "Month"))),
    weekStripSkel(),
    e("div", { className: "ss2-skel" }), e("div", { className: "ss2-skel" })
  );
}

function withTimeout(p, ms) {
  return Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error("timeout"), { code: "timeout" })), ms))
  ]);
}

async function loadSessionsParallel(ids, titles) {
  const parts = await Promise.allSettled(ids.map((id) => withTimeout(
    getDocs(query(collection(db, "sessions"), where("courseId", "==", id))),
    10000
  )));
  const out = [];
  const errors = [];
  parts.forEach((p, i) => {
    if (p.status === "rejected") {
      errors.push((p.reason?.code || p.reason?.message || "error") + " (" + ids[i] + ")");
      return;
    }
    p.value.docs.forEach((d) => out.push({ id: d.id, ...d.data(), courseTitle: titles[ids[i]] || "" }));
  });
  return { out, errors };
}

function App({ opts }) {
  const [view, setView] = useState("agenda");
  const [pastOpen, setPastOpen] = useState(false);
  const [weekOff, setWeekOff] = useState(0);
  const [monthOff, setMonthOff] = useState(0);
  const [pickDay, setPickDay] = useState("");
  const [store, setStore] = useState(() => getStudentStore());
  const [sessions, setSessions] = useState(() => {
    if (Array.isArray(opts.sessions) && opts.sessions.length) return opts.sessions;
    const st = getStudentStore();
    return Array.isArray(st?.sessions) ? st.sessions : [];
  });
  const [err, setErr] = useState("");
  const [ready, setReady] = useState(() => {
    const st = getStudentStore();
    return !!(opts.sessions?.length) || (st?.status === "ready" && Array.isArray(st.sessions));
  });
  const [retryN, setRetryN] = useState(0);
  const dayRefs = useRef({});
  const splitMemo = useRef(null);
  const splitKey = useRef("");

  useEffect(() => onDashData((d) => {
    setStore(d);
    if (d?.status === "ready" && Array.isArray(d.sessions) && d.sessions.length) {
      setSessions((prev) => prev.length ? prev : d.sessions);
      setReady(true);
    }
  }), []);

  const enrollments = store?.enrollments || [];
  const courseMap = store?.courses || {};
  const courses = useMemo(() => {
    if (Array.isArray(opts.courses) && opts.courses.length) return opts.courses;
    const ids = [...new Set(enrollments.map((x) => x.courseId).filter(Boolean))];
    return ids.map((id) => courseMap[id] ? { id, ...courseMap[id] } : { id, title: enrollments.find((x) => x.courseId === id)?.courseTitle || id });
  }, [opts.courses, enrollments, courseMap]);

  useEffect(() => {
    const uid = store?.user?.uid || opts.uid;
    const titles = {};
    courses.forEach((c) => { titles[c.id] = c.title; });
    const hit = uid ? sessCache[uid] : null;
    const fromStore = store?.sessions;
    if (hit && hit.length) {
      setSessions(hit);
      setReady(true);
    } else if (fromStore && (store.status === "ready" || fromStore.length)) {
      const named = fromStore.map((s) => ({ ...s, courseTitle: s.courseTitle || titles[s.courseId] || "" }));
      setSessions(named);
      setReady(true);
    }
    const ids = courses.map((c) => c.id).filter(Boolean);
    if (!ids.length) {
      if (store?.status === "ready") setReady(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { out, errors } = await loadSessionsParallel(ids, titles);
        if (cancelled) return;
        if (errors.length && !out.length) {
          setErr(errors[0]);
          setReady(true);
          return;
        }
        if (out.length) {
          if (uid) sessCache[uid] = out;
          setSessions(out);
          setErr(errors[0] || "");
        } else if (!hit && !(fromStore && fromStore.length)) setErr(errors[0] || "");
        setReady(true);
      } catch (e) {
        if (!cancelled) { setErr(e?.code || e?.message || "error"); setReady(true); }
      }
    })();
    return () => { cancelled = true; };
  }, [store?.user?.uid, store?.status, courses.map((c) => c.id).join(","), retryN]);

  const t = todayStr();
  const sk = sessions.map((s) => s.id + ":" + s.date + ":" + (s.startTime || "")).join("|");
  if (splitKey.current !== sk) {
    splitMemo.current = splitSessions(sessions);
    splitKey.current = sk;
  }
  const { upcoming, past, recentPast } = splitMemo.current || { upcoming: [], past: [], recentPast: [] };
  const shownPast = pastOpen ? past : recentPast;
  const next = upcoming[0] || null;
  const byDay = {};
  for (const s of upcoming) (byDay[s.date] = byDay[s.date] || []).push(s);
  const mon = mondayOf(0);
  const weekDays = [...Array(7)].map((_, i) => { const d = new Date(mon); d.setDate(mon.getDate() + i); return d; });

  function dotsFor(iso) {
    const wd = WEEK[(parseYmd(iso)?.getDay() + 6) % 7]?.code;
    const ids = new Set();
    sessions.filter((s) => validDate(s) && s.date === iso).forEach((s) => ids.add(s.courseId));
    courses.forEach((c) => { if (courseDays(c).includes(wd)) ids.add(c.id); });
    return [...ids];
  }
  function scrollTo(iso) {
    const n = dayRefs.current[iso];
    if (n && n.scrollIntoView) n.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const nextDur = next ? durationLabel(next) : "";
  const nextEnd = next && hasTime(next) ? fmtTime(next.endTime) : "";
  const nextStart = next && hasTime(next) ? fmtTime(next.startTime || next.time) : "";
  const nextDate = next && parseYmd(next.date)
    ? parseYmd(next.date).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }).toUpperCase()
    : "";

  if (!ready && !sessions.length) return e(Skeleton);

  const hero = next ? e("div", { className: "ss2-hero" },
    e("svg", { className: "ss2-wave", viewBox: "0 0 600 70", preserveAspectRatio: "none" },
      e("path", { d: "M0 40c40-20 80-20 120 0s80 20 120 0 80-20 120 0 80 20 120 0 80-20 120 0v30H0z", fill: "#FFFFFF" })
    ),
    e("div", { style: { position: "relative", zIndex: 1 } },
      e(CountChip, { next }),
      e("h3", null, sessTitle(next)),
      e("p", null, next.courseTitle || ""),
      e("div", { className: "ss2-acts" },
        e("a", { className: "ss2-cal", href: icsHref(next), download: "class.ics" }, "Add to calendar"),
        e("a", { className: "ss2-open", href: "./student.html#courses" }, "Open course")
      )
    ),
    e("div", { className: "ss2-glass" },
      e("div", { className: "d" }, nextDate),
      e("div", { className: "t" }, nextStart || e("span", { className: "ss2-tba" }, "Time TBA")),
      e("div", { className: "e" }, nextEnd ? ("to " + nextEnd + (nextDur ? " · " + nextDur : "")) : (nextDur || ""))
    )
  ) : e("div", { className: "ss2-hero" }, e("div", null, e("h3", null, "No upcoming class")));

  const strip = e("div", { className: "ss2-week" },
    weekDays.map((d) => {
      const iso = ymd(d);
      const on = iso === t;
      return e("button", { key: iso, type: "button", className: "ss2-day" + (on ? " on" : ""), onClick: () => scrollTo(iso) },
        e("div", { className: "wd" }, WEEK[(d.getDay() + 6) % 7].code.toUpperCase()),
        e("div", { className: "dn" }, String(d.getDate())),
        e("div", { className: "ss2-dots" }, dotsFor(iso).map((id) => e("span", { key: id, style: { background: colorFor(id, courses) } })))
      );
    })
  );

  const dayKeys = Object.keys(byDay).sort();
  const agenda = e("div", null,
    err ? e("div", { className: "banner" }, "sessions: " + err, " ", e("button", { type: "button", className: "btn btn-sm", onClick: () => { setErr(""); setRetryN((n) => n + 1); } }, "Try again")) : null,
    dayKeys.length ? e("div", { className: "ss2-tl" },
      dayKeys.map((iso) => e("div", { key: iso, className: "ss2-group", ref: (n) => { dayRefs.current[iso] = n; } },
        e("div", { className: "ss2-dlrow" }, e("div", { className: "ss2-dl" }, dayLabel(iso))),
        byDay[iso].map((s) => {
          const col = colorFor(s.courseId, courses);
          const tba = !hasTime(s);
          const dur = durationLabel(s);
          const end = fmtTime(s.endTime);
          const today = s.date === t;
          return e("div", { key: s.id, className: "ss2-row" },
            e("div", { className: "ss2-tm" },
              tba ? e("div", { className: "ss2-tba" }, "Time TBA") : e("div", { className: "st" }, fmtTime(s.startTime || s.time)),
              e("div", { className: "en" }, tba ? "" : ((end ? end : "") + (dur ? " · " + dur : "")))
            ),
            e("div", { className: "ss2-rail" }, e("div", { className: "ss2-rd", style: { background: col, color: col } })),
            e("div", { className: "ss2-sc" + (today ? " today" : "") },
              e("h4", null, sessTitle(s), today ? e("span", { className: "ss2-todayb" }, "Today") : null),
              e("div", { className: "ss2-sc-bot" },
                e("span", { className: "ss2-pill", style: { background: col }, title: s.courseTitle || "" }, s.courseTitle || ""),
                today ? e("a", { className: "ss2-open", href: "./student.html#courses" }, "Open course") : null
              )
            )
          );
        })
      ))
    ) : e("p", { className: "ss2-empty" }, "No upcoming classes."),
    e("button", { type: "button", className: "ss2-past", onClick: () => setPastOpen(!pastOpen) }, "Past sessions (" + past.length + ")"),
    pastOpen ? past.map((s) => e("div", { key: s.id, className: "ss2-sc", style: { marginTop: 8 } }, sessTitle(s) + " · " + s.date)) : null
  );

  const tz = friendlyTz();
  const side = e("aside", { className: "ss2-side" },
    e("h3", null, "Weekly schedule"),
    courses.map((c) => {
      const col = colorFor(c.id, courses);
      const days = courseDays(c);
      const tm = courseTime(c);
      const start = fmtTime(c.sessionStart || (tm.split("-")[0] || tm.split("–")[0]));
      const end = fmtTime(c.sessionEnd || "");
      let line = tm;
      if (start && end) line = start + " – " + end;
      else if (start) line = start;
      if (line && tz) line += " · " + tz;
      return e("div", { key: c.id, className: "ss2-cblk" },
        e("div", { className: "nm" }, e("span", { className: "ss2-sq", style: { background: col } }), e("span", { className: "ss2-cname" }, c.title || "Course")),
        days.length
          ? e("div", { className: "ss2-circs" }, WEEK.map((d) => e("span", { key: d.code, className: days.includes(d.code) ? "on" : "", style: days.includes(d.code) ? { background: col } : {} }, d.letter)))
          : e("p", { className: "ss2-ctime" }, "No weekly days set"),
        days.length ? e("p", { className: "ss2-ctime" }, line || "Time TBA") : null
      );
    })
  );

  let body = null;
  if (view === "week") {
    const m = mondayOf(weekOff);
    const days = [...Array(7)].map((_, i) => { const d = new Date(m); d.setDate(m.getDate() + i); return ymd(d); });
    body = e("div", null,
      e("div", { className: "ss2-bar" },
        e("button", { type: "button", onClick: () => setWeekOff(weekOff - 1) }, "‹"),
        e("strong", null, dayLabel(days[0]) + " – " + dayLabel(days[6])),
        e("button", { type: "button", onClick: () => setWeekOff(weekOff + 1) }, "›")
      ),
      e("div", { className: "ss2-weekgrid" }, days.map((iso) => e("div", { key: iso, className: "ss2-wcol" + (iso === t ? " on" : "") },
        e("h4", null, dayLabel(iso)),
        sessions.filter((s) => s.date === iso).map((s) => e("div", { key: s.id, className: "ss2-blk", style: { background: colorFor(s.courseId, courses) } }, (hasTime(s) ? fmtTime(s.startTime || s.time) : "Time TBA") + " " + sessTitle(s)))
      )))
    );
  } else if (view === "month") {
    const base = new Date(); base.setDate(1); base.setMonth(base.getMonth() + monthOff);
    const y = base.getFullYear(); const mo = base.getMonth();
    const startPad = (new Date(y, mo, 1).getDay() + 6) % 7;
    const daysIn = new Date(y, mo + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < startPad; i++) cells.push(e("div", { key: "p" + i }));
    for (let day = 1; day <= daysIn; day++) {
      const iso = y + "-" + String(mo + 1).padStart(2, "0") + "-" + String(day).padStart(2, "0");
      const list = sessions.filter((s) => s.date === iso);
      cells.push(e("button", { key: iso, type: "button", className: "ss2-cell" + (pickDay === iso ? " on" : ""), onClick: () => setPickDay(iso) },
        day,
        e("div", { className: "ss2-dots" }, list.map((s) => e("span", { key: s.id, style: { background: colorFor(s.courseId, courses) } })))
      ));
    }
    body = e("div", null,
      e("div", { className: "ss2-bar" },
        e("button", { type: "button", onClick: () => setMonthOff(monthOff - 1) }, "‹"),
        e("strong", null, base.toLocaleString("en-GB", { month: "long", year: "numeric" })),
        e("button", { type: "button", onClick: () => setMonthOff(monthOff + 1) }, "›")
      ),
      e("div", { className: "ss2-month" }, cells)
    );
  } else {
    body = e("div", { className: "ss2-layout" }, e("div", null, agenda), side);
  }

  return e("div", { className: "ss2-wrap ss2-ready" },
    e("div", { className: "ss2-head" },
      e("h2", null, "Schedule"),
      e("div", { className: "ss2-head-r" },
        e("div", { className: "ss2-seg" },
          ["agenda", "week", "month"].map((v) => e("button", { key: v, type: "button", className: view === v ? "on" : "", onClick: () => setView(v) }, v[0].toUpperCase() + v.slice(1)))
        )
      )
    ),
    view === "agenda" ? hero : null,
    view === "agenda" ? strip : null,
    body
  );
}

export function renderStudentScheduleV2(opts = {}) {
  const host = opts?.host;
  if (!host) return false;
  try {
    let root = roots.get(host);
    if (!root) { root = createRoot(host); roots.set(host, root); }
    if (opts.loading) {
      root.render(e(Boundary, null, e(Skeleton)));
      return true;
    }
    root.render(e(Boundary, null, e(App, { opts })));
    opts.onReady?.();
    return true;
  } catch (err) {
    console.error(err);
    try {
      host.innerHTML = "<p class=\"banner\">This section could not load<br>" + String(err?.message || err) + "</p><button class=\"btn btn-sm\" type=\"button\" id=\"ss2Retry\">Retry</button>";
      document.getElementById("ss2Retry")?.addEventListener("click", () => renderStudentScheduleV2(opts));
    } catch (_) {}
    return false;
  }
}
