import { createElement as e, useEffect, useMemo, useState, Component } from "https://esm.sh/react@18.3.1";
import { createRoot } from "https://esm.sh/react-dom@18.3.1/client";
import { onDashData, loadStudentDash } from "./student-dash-data.js?v=stu7";
import { getReadSet, unreadCount, onAnnouncementReads, loadAnnouncementReads, annTimeAgo } from "./announcementReads.js?v=stu7";
import { db } from "./firebase-config.js?v=auth8";
import { getDoc, doc, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { attendancePct, gradeCalc } from "./gradeCalc.js";

class Boundary extends Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err) { console.error("DashboardV3", err?.code || err?.message || err); }
  render() {
    if (this.state.err) {
      const code = this.state.err?.code || this.state.err?.message || String(this.state.err);
      return e("div", { className: "dv3-fail" },
        e("p", { className: "banner" }, "Dashboard could not load"),
        e("p", { className: "banner" }, String(code)),
        e("button", { type: "button", className: "btn btn-sm", onClick: () => { this.setState({ err: null }); try { loadStudentDash(true); } catch (_) {} } }, "Try again"),
        e("button", { type: "button", className: "btn btn-sm", onClick: this.props.onClassic }, "Use classic view")
      );
    }
    return this.props.children;
  }
}

const firstName = (n) => String(n || "student").split(" ")[0];
const greet = (d) => { const h = d.getHours(); return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; };
const fmtDate = (d) => d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
const titleOf = (data, id) => (data.courses && data.courses[id]?.title) || data.enrollments.find((x) => x.courseId === id)?.courseTitle || id;
const hue = (s) => {
  let h = 0; String(s || "").split("").forEach((c) => { h = (h * 31 + c.charCodeAt(0)) % 360; });
  return `linear-gradient(145deg, hsl(${h},70%,38%), hsl(${(h+40)%360},80%,52%))`;
};
function ico(d) {
  return e("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "#FFFFFF", "stroke-width": "1.8", width: "22", height: "22" },
    e("path", { d, "stroke-linecap": "round", "stroke-linejoin": "round" })
  );
}
function localYmd(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function dueLocal(raw) {
  const s = String(raw || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
  return s;
}
function localPartsMs(dateStr, timeStr) {
  const d = String(dateStr || "").slice(0, 10);
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return NaN;
  const t = String(timeStr || "00:00").trim();
  const parts = (t.length >= 5 ? t : "00:00").split(":");
  const hh = Number(parts[0]) || 0;
  const mm = Number(parts[1]) || 0;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), hh, mm, 0).getTime();
}
function colonTime(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  if (/^\d{1,2}:\d{2}/.test(s)) {
    const [h, m] = s.split(":");
    return String(Number(h) || 0).padStart(2, "0") + ":" + String(m).slice(0, 2).padStart(2, "0");
  }
  const digits = s.replace(/\D/g, "");
  if (digits.length >= 3 && digits.length <= 4) {
    const p = digits.padStart(4, "0");
    return p.slice(0, 2) + ":" + p.slice(2);
  }
  return s;
}
function pad2(n) { return String(Math.max(0, Math.floor(n))).padStart(2, "0"); }
function fmtClassWhen(dateStr, timeStr) {
  const d = String(dateStr || "").slice(0, 10);
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const t = colonTime(timeStr);
  if (!m) return t;
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
  const day = dt.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  return t ? day + ", " + t : day;
}
function ClockCd({ startMs, endMs, nowMs }) {
  if (!Number.isFinite(startMs)) return null;
  const end = Number.isFinite(endMs) && endMs > startMs ? endMs : startMs + 90 * 60000;
  if (nowMs >= startMs && nowMs < end) return e("div", { className: "dv3-cd-live" }, "Live now");
  const left = startMs - nowMs;
  if (left <= 0 || left < 60000) return e("div", { className: "dv3-cd-live" }, "Starting now");
  const days = Math.floor(left / 86400000);
  const hours = Math.floor((left % 86400000) / 3600000);
  const mins = Math.floor((left % 3600000) / 60000);
  const box = (v, lab) => e("b", null, v, e("span", null, lab));
  const colon = e("i", { className: "dv3-cd-colon", "aria-hidden": "true" }, ":");
  if (days < 1) {
    return e("div", { className: "dv3-cd", "aria-label": "Hours / Min" }, box(pad2(hours), "Hours"), colon, box(pad2(mins), "Min"));
  }
  return e("div", { className: "dv3-cd", "aria-label": "Days Hours Min" }, box(String(days), "Days"), colon, box(pad2(hours), "Hours"), colon, box(pad2(mins), "Min"));
}
function getPendingHomework(data, now) {
  const today = localYmd(now);
  const activeIds = new Set(Object.values(data.courses || {}).filter((c) => c.status !== "Completed").map((c) => c.id));
  const submitted = new Set((data.submissions || []).map((s) => s.assignmentId));
  const open = (data.assignments || []).filter((a) => {
    if (String(a.status || "Published") !== "Published") return false;
    if (!activeIds.has(a.courseId)) return false;
    if (submitted.has(a.id)) return false;
    return true;
  });
  const pending = open.filter((a) => {
    const d = dueLocal(a.dueDate);
    return !d || d >= today;
  }).sort((a, b) => dueLocal(a.dueDate).localeCompare(dueLocal(b.dueDate)));
  const overdue = open.filter((a) => {
    const d = dueLocal(a.dueDate);
    return d && d < today;
  });
  const weekEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7);
  const weekKey = localYmd(weekEnd);
  const thisWeek = pending.filter((a) => {
    const d = dueLocal(a.dueDate);
    return d && d >= today && d <= weekKey;
  });
  return { pending, overdue, thisWeek };
}
function getPendingQuizzes(data, now) {
  const today = localYmd(now);
  const activeIds = new Set(Object.values(data.courses || {}).filter((c) => c.status !== "Completed").map((c) => c.id));
  const taken = new Set((data.quizAttempts || []).map((a) => a.quizId));
  return (data.quizzes || []).filter((q) => {
    if (String(q.status || "Published") !== "Published") return false;
    if (!activeIds.has(q.courseId)) return false;
    if (taken.has(q.id)) return false;
    const close = dueLocal(q.closeDate || q.dueDate || q.closesAt);
    if (close && close < today) return false;
    return true;
  }).sort((a, b) => dueLocal(a.dueDate || a.closeDate).localeCompare(dueLocal(b.dueDate || b.closeDate)));
}
function Count({ value, suffix }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (value === "—" || value == null) { setN(value); return; }
    const t = Number(value); if (!Number.isFinite(t)) { setN(value); return; }
    const t0 = performance.now();
    let raf;
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / 800);
      setN(Math.round(t * p));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return e("strong", null, n == null || n === "—" ? n : String(n) + (suffix || ""));
}

function Dash({ onClassic }) {
  const [data, setData] = useState(null);
  const [now, setNow] = useState(() => new Date());
  const [avg, setAvg] = useState({ pct: null, n: 0, byId: {} });
  const [certs, setCerts] = useState([]);
  const [, setReadTick] = useState(0);
  useEffect(() => onDashData(setData), []);
  useEffect(() => { loadStudentDash(false); }, []);
  useEffect(() => {
    const uid0 = data?.user?.uid || data?.user?.id;
    if (uid0) loadAnnouncementReads(uid0);
  }, [data?.user?.uid || data?.user?.id]);
  useEffect(() => onAnnouncementReads(() => setReadTick((n) => n + 1)), []);
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!data?.user || data.status !== "ready") return;
    (async () => {
      const uid = data.user.uid;
      try {
        const snap = await getDocs(query(collection(db, "certificates"), where("uid", "==", uid)));
        setCerts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (_) { setCerts([]); }
      const avgs = [];
      const byId = {};
      const courses = data.courses || {};
      for (const id of Object.keys(courses)) {
        const c = courses[id];
        if (c.status !== "Completed") continue;
        try {
          const ss = await getDoc(doc(db, "gradeSchemes", id));
          if (!ss.exists()) { byId[id] = { pending: true }; continue; }
          const scheme = ss.data();
          let scores = {};
          const gs = await getDoc(doc(db, "gradeScores", uid + "_" + id));
          if (gs.exists()) scores = gs.data().scores || {};
          const pack = {
            courseId: id,
            assignments: data.assignments.filter((a) => a.courseId === id),
            quizzes: data.quizzes.filter((q) => q.courseId === id),
            attendance: data.attendance.filter((a) => a.courseId === id),
            sessions: (data.sessions || []).filter((s) => s.courseId === id),
            submissions: data.submissions.filter((s) => s.courseId === id),
            quizAttempts: data.quizAttempts.filter((a) => a.courseId === id),
            scheme
          };
          const g = gradeCalc({ id, pack }, scheme, { uid, scores, pack });
          if (g.failed) { byId[id] = { pending: true }; continue; }
          byId[id] = { pending: false, avg: g.average, passed: g.passed };
          avgs.push(g.average);
        } catch (_) { byId[id] = { pending: true }; }
      }
      setAvg({ pct: avgs.length ? Math.round((avgs.reduce((a, b) => a + b, 0) / avgs.length) * 10) / 10 : null, n: avgs.length, byId });
    })();
  }, [data]);

  if (!data || data.status !== "ready") {
    return e("div", { className: "dv3" },
      e("h2", { style: { margin: "0 0 16px", fontSize: "28px" } }, "Dashboard"),
      e("div", { className: "stu-shimmer", style: { minHeight: "88px", borderRadius: "16px", marginBottom: "12px" } }),
      e("div", { className: "dv3-stats" },
        e("div", { className: "stu-shimmer", style: { minHeight: "88px", borderRadius: "16px" } }),
        e("div", { className: "stu-shimmer", style: { minHeight: "88px", borderRadius: "16px" } }),
        e("div", { className: "stu-shimmer", style: { minHeight: "88px", borderRadius: "16px" } }),
        e("div", { className: "stu-shimmer", style: { minHeight: "88px", borderRadius: "16px" } })
      ),
      e("div", { className: "stu-shimmer", style: { minHeight: "180px", borderRadius: "16px", marginTop: "16px" } })
    );
  }

  const subIds = new Set(data.submissions.map((s) => s.assignmentId));
  const attIds = new Set(data.quizAttempts.map((a) => a.quizId));
  const hw = getPendingHomework(data, now);
  const qzOpen = getPendingQuizzes(data, now);
  const hwOpen = hw.pending;
  const weekDue = hw.thisWeek.length;
  const uid = data.user?.uid || data.user?.id;
  const coursesMap = data.courses || {};
  const activeForAtt = Object.values(coursesMap).filter((c) => String(c.status) !== "Completed");
  const activeAttIds = new Set(activeForAtt.map((c) => c.id));
  const attRecs = (data.attendance || []).filter((a) => a.status && activeAttIds.has(a.courseId));
  const attAuto = attendancePct("", uid, { attendance: attRecs, sessions: data.sessions }).pct;
  const attPct = attAuto == null ? "—" : Math.round(attAuto);
  const recs = attRecs;
  const den = recs.filter((r) => r.status !== "excused").length;
  const courseIds = data.courseIds || Object.keys(data.courses || {});
  const unreadN = unreadCount(uid, data.announcements, courseIds);
  const latestAnn = [...(data.announcements || [])].sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))[0];
  const latestAgo = latestAnn?.createdAt?.toMillis ? annTimeAgo(latestAnn.createdAt.toMillis()) : "";
  const nextHw = hwOpen.filter((a) => a.dueDate).sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)))[0];
  const nextQz = qzOpen.filter((q) => q.dueDate).sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)))[0];
  const nextHwDay = nextHw ? new Date(nextHw.dueDate).toLocaleDateString(undefined, { weekday: "long" }) : "—";
  const qzDays = nextQz ? Math.max(0, Math.ceil((new Date(nextQz.dueDate) - now) / 86400000)) : null;

  const sessions = data.sessions.filter((s) => s.status !== "Cancelled")
    .map((s) => ({ s, t: localPartsMs(s.date, s.startTime) }))
    .filter((x) => Number.isFinite(x.t) && x.t >= now.getTime() - 15 * 60000)
    .sort((a, b) => a.t - b.t);
  const nextClass = sessions[0];

  const courses = data.courses || {};
  const active = Object.values(courses).filter((c) => c.status !== "Completed");
  const done = Object.values(courses).filter((c) => c.status === "Completed");
  const att100 = den > 0 && attPct === 100;
  const firstDone = done.length >= 1;
  const onTime = hwOpen.length === 0 && data.assignments.length > 0;

  const goHash = (hash) => (ev) => { if (ev) { ev.preventDefault(); ev.stopPropagation(); } location.hash = hash; };

  const spark = recs.slice(-8).map((r, i) => e("i", { key: i, style: { height: (r.status === "present" ? 20 : r.status === "late" ? 12 : 6) + "px" } }));

  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  const todayKey = localYmd(now);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const key = localYmd(d);
    const cl = data.sessions.some((s) => String(s.date || "").slice(0, 10) === key && s.status !== "Cancelled");
    const hwDot = hw.pending.some((a) => dueLocal(a.dueDate) === key);
    const qz = data.quizzes.some((q) => String(q.dueDate || "").slice(0, 10) === key);
    return { d, key, cl, hw: hwDot, qz, on: key === todayKey };
  });

  const clock = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const c = 2 * Math.PI * 54;
  const dash = avg.pct == null ? 0 : (Math.min(100, Math.max(0, avg.pct)) / 100) * c;

  return e("div", { className: "dv3" },
    e("section", { className: "dv3-hero" },
      e("span", { className: "dv3-orb dv3-orb-a", "aria-hidden": "true" }),
      e("span", { className: "dv3-orb dv3-orb-b", "aria-hidden": "true" }),
      e("span", { className: "dv3-wave", "aria-hidden": "true" }),
      e("div", { className: "dv3-hero-l" },
        e("p", { className: "dv3-live" }, e("i"), " Live ", clock),
        e("h2", { style: { color: "#FFFFFF", fontSize: "38px", fontWeight: 700 } }, greet(now) + ", " + firstName(data.name)),
        e("p", { className: "dv3-sub" }, fmtDate(now) + " · " + (weekDue ? weekDue + " homework" + (weekDue === 1 ? "" : "s") + " due this week" : (hwOpen.length ? hwOpen.length + " homework" + (hwOpen.length === 1 ? "" : "s") + " to submit" : "You're all caught up"))),
        e("div", { className: "dv3-chips" },
          att100 ? e("span", { className: "dv3-chip" }, "100% attendance") : null,
          firstDone ? e("span", { className: "dv3-chip" }, "First course completed") : null,
          onTime ? e("span", { className: "dv3-chip" }, "All homework on time") : null
        )
      ),
      e("div", { className: "dv3-hero-r" },
        e("div", { className: "dv3-glass" },
          e("p", null, "Next class"),
          nextClass
            ? e("div", null,
                e("h3", null, (() => { const t = String(nextClass.s.title || "").trim(); return t && !/^session$/i.test(t) ? t : (titleOf(data, nextClass.s.courseId) || "Class session"); })()),
                e("div", { className: "when" }, fmtClassWhen(nextClass.s.date, nextClass.s.startTime) + (nextClass.s.endTime ? " – " + colonTime(nextClass.s.endTime) : "")),
                e(ClockCd, { startMs: nextClass.t, endMs: localPartsMs(nextClass.s.date, nextClass.s.endTime), nowMs: now.getTime() }),
                e("a", { className: "dv3-btn", href: "#schedule", onClick: goHash("#schedule") }, "View schedule")
              )
            : e("h3", null, "No upcoming classes")
        )
      )
    ),
    e("div", { className: "dv3-stats" },
      e("a", { className: "dv3-stat", href: "#homework", onClick: goHash("#homework") },
        e("div", { className: "dv3-ico hw" }, ico("M14 3H6v18h12V8l-4-5z M14 3v5h5") ),
        e("div", null, e("span", null, "Homework due"), e(Count, { value: hwOpen.length }), nextHw ? e("em", null, "Next: " + nextHwDay) : null, hw.overdue.length ? e("em", { style: { color: "#DC2626" } }, hw.overdue.length + " overdue") : null)
      ),
      e("a", { className: "dv3-stat", href: "#quizzes", onClick: goHash("#quizzes") },
        e("div", { className: "dv3-ico qz" }, ico("M12 17h.01 M9.1 9a3 3 0 115.8 1c0 2-3 2-3 4 M12 21a9 9 0 110-18 9 9 0 010 18z")),
        e("div", null, e("span", null, "Quizzes to take"), e(Count, { value: qzOpen.length }), e("em", null, qzDays == null ? "No open quiz" : "Closes in " + qzDays + " days"))
      ),
      e("a", { className: "dv3-stat", href: "#attendance", onClick: goHash("#attendance") },
        e("div", { className: "dv3-ico at" }, ico("M9 12l2 2 4-4 M12 21a9 9 0 110-18 9 9 0 010 18z")),
        e("div", null, e("span", null, "Attendance"), e(Count, { value: attPct, suffix: attPct === "—" ? "" : "%" }), e("em", null, "Overall attendance"), den >= 3 ? e("div", { className: "dv3-spark" }, spark) : null)
      ),
      e("a", { className: "dv3-stat", href: "#announcements", onClick: goHash("#announcements") },
        e("div", { className: "dv3-ico an" }, ico("M3 11v2h2l8 5V6L5 11H3z M18 8a4 4 0 010 8")),
        e("div", null, e("span", null, "Unread announcements"), e(Count, { value: unreadN }), e("em", null, unreadN ? (latestAgo ? "Latest " + latestAgo : "") : "You're all caught up"))
      )
    ),
    e("div", { className: "dv3-grid" },
      e("div", { className: "dv3-card" },
        e("div", { className: "dv3-h" }, e("h3", null, "Continue learning"), e("a", { href: "#courses", onClick: goHash("#courses") }, "All my courses")),
        e("div", { className: "dv3-learn" },
          active.length ? active.map((c) => {
            const cid = c.id;
            const pubHw = (data.assignments || []).filter((a) => a.courseId === cid && String(a.status || "Published") === "Published");
            const pubQz = (data.quizzes || []).filter((q) => q.courseId === cid && String(q.status || "Published") === "Published");
            const totalItems = pubHw.length + pubQz.length;
            const doneHw = pubHw.filter((a) => subIds.has(a.id)).length;
            const doneQz = pubQz.filter((q) => attIds.has(q.id)).length;
            const doneItems = doneHw + doneQz;
            const emptyWork = totalItems === 0;
            const prog = emptyWork ? null : Math.round((doneItems / totalItems) * 100);
            const ringLen = 2 * Math.PI * 28;
            const attC = data.attendance.filter((a) => a.courseId === cid && a.status);
            const attDen = attC.filter((a) => a.status !== "excused").length;
            const attG = attC.filter((a) => a.status === "present" || a.status === "late").length;
            const attCourse = attDen ? Math.round((attG / attDen) * 100) : null;
            const nowMs = now.getTime();
            const nextSess = data.sessions.filter((s) => s.courseId === cid && s.status !== "Cancelled")
              .map((s) => ({ s, t: localPartsMs(s.date, s.startTime) }))
              .filter((x) => Number.isFinite(x.t) && x.t >= nowMs - 15 * 60000)
              .sort((a, b) => a.t - b.t)[0];
            const nextHwItem = hw.pending.filter((a) => a.courseId === cid).sort((a, b) => dueLocal(a.dueDate).localeCompare(dueLocal(b.dueDate)))[0];
            const nextQzItem = data.quizzes.filter((q) => q.courseId === cid && !attIds.has(q.id) && String(q.status || "Published") === "Published").sort((a, b) => dueLocal(a.dueDate || a.closeDate).localeCompare(dueLocal(b.dueDate || b.closeDate)))[0];
            let nextLine = "No upcoming item";
            const sessMs = nextSess ? nextSess.t : Infinity;
            const hwMs = nextHwItem ? localPartsMs(dueLocal(nextHwItem.dueDate), "23:59") : Infinity;
            const qzMs = nextQzItem ? localPartsMs(dueLocal(nextQzItem.dueDate || nextQzItem.closeDate), "23:59") : Infinity;
            const soon = Math.min(sessMs, hwMs, qzMs);
            if (Number.isFinite(soon) && soon < Infinity) {
              if (soon === sessMs) {
                const sessTitle = String(nextSess.s.title || "").trim();
                const label = !sessTitle || /^session$/i.test(sessTitle) ? "Class session" : sessTitle;
                nextLine = "Next class: " + fmtClassWhen(nextSess.s.date, nextSess.s.startTime) + " · " + label;
              } else if (soon === hwMs) {
                const dd = dueLocal(nextHwItem.dueDate);
                nextLine = (nextHwItem.title || "Homework") + " due " + (dd ? fmtClassWhen(dd, "") : "");
              } else {
                const dd = dueLocal(nextQzItem.dueDate || nextQzItem.closeDate);
                nextLine = (nextQzItem.title || "Quiz") + " due " + (dd ? fmtClassWhen(dd, "") : "");
              }
            }
            const caption = emptyWork ? "No homework or quizzes yet" : ("Work completed: " + doneItems + " of " + totalItems + " items");
            return e("div", { className: "dv3-course", key: cid },
              e("div", { className: "dv3-cover", style: { background: hue(c.title) } },
                e("span", null, "In progress"),
                e("div", { className: "dv3-ringwrap", title: "Homework submitted and quizzes taken in this course" },
                  e("svg", { className: "dv3-ring", viewBox: "0 0 72 72" },
                    e("circle", { cx: "36", cy: "36", r: "28", fill: "none", stroke: "rgba(255,255,255,.25)", "stroke-width": "6" }),
                    e("circle", { cx: "36", cy: "36", r: "28", fill: "none", stroke: "#FFFFFF", "stroke-width": "6", "stroke-linecap": "round",
                      "stroke-dasharray": (emptyWork ? 0 : (prog / 100) * ringLen) + " " + ringLen, transform: "rotate(-90 36 36)" }),
                    e("text", { x: "36", y: "41", "text-anchor": "middle", fill: "#FFFFFF", "font-size": "14", "font-weight": "700" }, emptyWork ? "–" : (prog + "%"))
                  ),
                  e("i", { className: "dv3-ringinfo", "aria-label": "Homework submitted and quizzes taken in this course" }, "i")
                )
              ),
              e("div", null,
                e("h4", null, c.title || "Course"),
                e("p", { className: "dv3-workcap" }, caption),
                attCourse != null ? e("span", { className: "dv3-mini" }, "Attendance " + attCourse + "%") : null,
                e("p", null, nextLine)
              ),
              e("a", { className: "dv3-btn", href: "#course/" + cid, onClick: goHash("#course/" + cid) }, "Open course")
            );
          }) : e("div", { className: "dv3-empty" }, e("i"), e("p", null, "No active courses yet.")),
          done.length ? e("p", { className: "dv3-seclabel" }, "Completed") : null,
          done.map((c) => {
            const cert = certs.find((x) => x.courseId === c.id || x.id === (data.user.uid + "_" + c.id));
            const revoked = cert && (String(cert.status) === "revoked" || cert.revoked === true);
            const issued = cert && !revoked;
            const grade = avg.byId[c.id] || { pending: true };
            let badge = "Result pending";
            let kind = "pend";
            let note = "";
            let btn = null;
            if (revoked) {
              badge = "Certificate revoked"; kind = "no"; note = "This certificate was revoked by the academy";
            } else if (grade.pending) {
              badge = "Result pending"; kind = "pend";
            } else if (!issued) {
              badge = "Awaiting certificate"; kind = "pend";
            } else if (grade.passed) {
              badge = "Course passed"; kind = "ok";
              btn = e("a", { className: "dv3-btn", href: "#certificates", onClick: goHash("#certificates") }, "View certificate");
            } else {
              badge = "Course failed"; kind = "no";
              btn = e("a", { className: "dv3-btn", href: "#certificates", onClick: goHash("#certificates") }, "View certificate");
            }
            return e("div", { className: "dv3-done", key: c.id },
              e("i", { className: "dv3-doneico " + (revoked ? "bad" : "ok") }, revoked ? "!" : "✓"),
              e("div", { className: "dv3-donetxt" },
                e("h4", null, c.title || "Course"),
                note ? e("p", null, note) : null
              ),
              e("span", { className: "dv3-badge " + kind }, badge),
              btn
            );
          })
        )
      ),
      e("div", { style: { display: "grid", gap: "16px" } },
        e("div", { className: "dv3-card" },
          e("div", { className: "dv3-h" }, e("h3", null, "This week"), e("span", { style: { fontSize: "13px", color: "#64748B" } }, days[0].d.toLocaleDateString(undefined, { day: "numeric", month: "short" }) + " – " + days[6].d.toLocaleDateString(undefined, { day: "numeric", month: "short" }))),
          e("div", { className: "dv3-week" }, days.map((d) => e("div", { className: "dv3-day" + (d.on ? " on" : ""), key: d.key, onClick: goHash("#schedule"), role: "button" },
            e("b", null, d.d.toLocaleDateString(undefined, { weekday: "short" })),
            e("strong", null, d.d.getDate()),
            e("div", { className: "dv3-dots" },
              d.cl ? e("i", { className: "cl" }) : null,
              d.hw ? e("i", { className: "hw" }) : null,
              d.qz ? e("i", { className: "qz" }) : null
            )
          ))),
          e("div", { className: "dv3-leg" },
            e("span", null, e("i", { className: "cl", style: { background: "#2563EB" } }), " Class"),
            e("span", null, e("i", { className: "hw", style: { background: "#D97706" } }), " Homework"),
            e("span", null, e("i", { className: "qz", style: { background: "#7C3AED" } }), " Quiz")
          )
        ),
        e("div", { className: "dv3-card dv3-avg" },
          e("div", { className: "dv3-h" }, e("h3", null, "Overall average"), e("a", { href: "#grades", onClick: goHash("#grades") }, "Open grades")),
          e("svg", { viewBox: "0 0 140 140" },
            e("circle", { cx: "70", cy: "70", r: "54", fill: "none", stroke: "#E5EAF1", "stroke-width": "12" }),
            e("circle", { cx: "70", cy: "70", r: "54", fill: "none", stroke: "#2563EB", "stroke-width": "12", "stroke-linecap": "round",
              "stroke-dasharray": dash + " " + c, transform: "rotate(-90 70 70)" }),
            e("text", { x: "70", y: "76", "text-anchor": "middle", "font-size": "22", "font-weight": "700", fill: "#0F2747" }, avg.pct == null ? "–" : String(avg.pct))
          ),
          e("p", { style: { color: "#64748B", fontSize: "13px" } }, avg.n ? ("From " + avg.n + " completed course" + (avg.n === 1 ? "" : "s") + ", same as Grades.") : "Shows after a course is completed.")
        ),
        e("div", { className: "dv3-card" },
          e("div", { className: "dv3-h" }, e("h3", null, "Announcements"), e("a", { href: "#announcements", onClick: goHash("#announcements") }, "See all")),
          e("div", { className: "dv3-ann" },
            data.announcements.length ? [...data.announcements].sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)).slice(0, 4).map((a) =>
              e("div", { className: "dv3-ann-row", key: a.id, onClick: goHash("#announcements"), role: "button" },
                e("div", { className: "dv3-ann-ico" }, ico("M3 11v2h2l8 5V6L5 11H3z")),
                e("div", null, e("p", null, a.title || "Announcement"), e("span", null, (a.authorName || a.authorRole || "Admin") + " · " + (a.createdAt?.toMillis ? annTimeAgo(a.createdAt.toMillis()) : ""))),
                getReadSet(uid).has(String(a.id)) ? null : e("i", { className: "dv3-dot" })
              )
            ) : e("div", { className: "dv3-empty" }, e("i"), e("p", null, "No announcements yet."))
          )
        )
      )
    ),
    e("p", { style: { fontSize: "12px", color: "#94A3B8" } }, e("button", { type: "button", className: "btn btn-sm", onClick: onClassic, style: { width: "auto" } }, "Use classic view"))
  );
}

export function bootDashboardV3(host, onClassic) {
  if (!host) return false;
  try {
    createRoot(host).render(e(Boundary, { onClassic }, e(Dash, { onClassic })));
    return true;
  } catch (err) {
    console.error("DashboardV3 boot", err);
    try {
      host.innerHTML = '<div class="dv3-fail"><p class="banner">Dashboard could not load</p><p class="banner"></p><button type="button" class="btn btn-sm" id="dv3-retry">Retry</button></div>';
      const p = host.querySelector("p.banner:nth-of-type(2)");
      if (p) p.textContent = String(err?.message || err);
      const b = host.querySelector("#dv3-retry");
      if (b) b.onclick = () => { try { bootDashboardV3(host, onClassic); } catch (e2) { console.error(e2); } };
    } catch (_) {}
    return false;
  }
}

export function decorateDashboardHero() {}
