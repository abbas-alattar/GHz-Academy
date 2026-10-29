import { createElement as e, useEffect, useRef, useState, Component } from "https://esm.sh/react@18.3.1";
import { createRoot } from "https://esm.sh/react-dom@18.3.1/client";
import { getTrainerStore, loadTrainerStore, refreshTrainerStore, subscribeTrainerStore } from "./TrainerStore.js";
import { formatCourseDate } from "./courseDates.js";
import { getBootSteps, isDebugBoot } from "./bootTrace.js";
import { getBoxDebugSnap } from "./TrainerResultBox.js";
import { courseStatusLabel, statusChipShort } from "./courseStatusLabel.js";

class Boundary extends Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err) { console.error("TrainerCoursesV2", err); }
  render() {
    if (this.state.err) {
      return e("div", { className: "tr2" },
        e("p", { className: "tr2-err" }, String(this.state.err?.message || this.state.err),
          e("button", { type: "button", className: "tr2-btn", onClick: () => this.setState({ err: null }) }, "Try again")));
    }
    return this.props.children;
  }
}

function stKey(c) {
  const s = String(c?.status || "");
  if (s === "Open") return "open";
  if (s === "Closed") return "closed";
  if (s === "Completed") return "done";
  return "soon";
}
function isActive(c) { const s = c?.status; return s === "Open" || s === "Closed"; }
function isDone(c) { return c?.status === "Completed"; }
function StatusBadge({ status, course }) {
  const c = course || { status };
  const k = String(c.status || "");
  const cls = k === "Open" ? "tr2-open" : k === "Closed" ? "tr2-closed" : k === "Completed" ? "tr2-done" : "tr2-soon";
  return e("span", { className: "tr2-sb " + cls, title: courseStatusLabel(c) }, k === "Completed" ? "🔒 " : "", statusChipShort(c));
}
function Svg({ d, size, extra }) {
  return e("svg", { width: size || 22, height: size || 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, "aria-hidden": true }, extra || e("path", { d }));
}
const IC = {
  cap: "M22 10l-10-5L2 10l10 5 10-5zm-10 6.5l-6-3V17c0 1.7 2.7 3 6 3s6-1.3 6-3v-3.5l-6 3z",
  users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  clip: "M9 11l3 3L22 4M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5",
  cal: "M8 7V3m8 4V3M3 11h18M5 7h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z",
  clock: "M12 6v6l4 2M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18z",
  book: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 4.5A2.5 2.5 0 0 1 6.5 7H20v13H6.5A2.5 2.5 0 0 1 4 17.5z",
  chart: "M3 3v18h18M7 14l4-4 4 4 5-6",
  check: "M8 7V3m8 4V3M3 11h18M9 16l2 2 4-4"
};
function KpiIco({ kind }) {
  return e("span", { className: "tr2-ico" }, e(Svg, { d: IC[kind] }));
}
function Wm({ kind }) {
  return e("svg", { className: "tr2-wm", viewBox: "0 0 24 24", fill: "currentColor", "aria-hidden": true }, e("path", { d: IC[kind] }));
}
function Mini({ kind, tone }) {
  return e("span", { className: "tr2-mi " + tone }, e(Svg, { d: IC[kind], size: 14 }));
}
function initials(name) {
  return String(name || "?").split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
}
function dayLine(c) {
  const raw = Array.isArray(c.deliveryDays) ? c.deliveryDays : String(c.schedule || c.days || "").split(/[,/]/);
  const days = raw.map((x) => String(x).trim()).filter(Boolean).join(" · ");
  const time = [c.startTime, c.endTime].filter(Boolean).join(" – ") || c.time || "";
  return { days, time };
}

function Page({ uid, go }) {
  const [pack, setPack] = useState(getTrainerStore());
  const [tab, setTab] = useState("active");
  const [slow, setSlow] = useState(false);
  const [trace, setTrace] = useState(getBootSteps());
  const [boxSnap, setBoxSnap] = useState(getBoxDebugSnap());
  const ind = useRef(null);
  const row = useRef(null);
  useEffect(() => subscribeTrainerStore(setPack), []);
  useEffect(() => { if (uid) loadTrainerStore(uid); }, [uid]);
  useEffect(() => {
    const on = () => setTrace(getBootSteps());
    const onBox = () => setBoxSnap(getBoxDebugSnap());
    window.addEventListener("ghz-boot", on);
    window.addEventListener("ghz-box-debug", onBox);
    const id = setInterval(() => { on(); onBox(); }, 400);
    return () => { window.removeEventListener("ghz-boot", on); window.removeEventListener("ghz-box-debug", onBox); clearInterval(id); };
  }, []);
  useEffect(() => {
    if (pack && pack.loading === false) { setSlow(false); return; }
    const t = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(t);
  }, [pack]);
  useEffect(() => {
    const on = row.current?.querySelector(".tr2-tab.on");
    if (on && ind.current) {
      ind.current.style.left = on.offsetLeft + "px";
      ind.current.style.width = on.offsetWidth + "px";
    }
  });
  const courses = pack?.courses || [];
  const active = courses.filter(isActive);
  const done = courses.filter(isDone);
  const list = tab === "active" ? active : tab === "done" ? done : courses;
  const counts = pack?.counts || {};
  const pending = pack?.pendingHw;
  const next = pack?.nextSession;
  const students = active.reduce((n, c) => n + (counts[c.id] || 0), 0);
  const nextCourse = next ? (courses.find((c) => c.id === next.courseId)?.title || "") : "";
  let nextDay = "No upcoming session", nextSub = "";
  if (next) {
    const d = next.date ? new Date(String(next.date) + "T12:00:00") : null;
    nextDay = d && !isNaN(d) ? d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }) : (next.date || "Session");
    nextSub = [next.startTime, nextCourse].filter(Boolean).join(" · ");
  }
  const retry = () => refreshTrainerStore(uid);
  const steps = (trace && trace.length ? trace : getBootSteps());
  const bootList = e("ul", { className: "tr2-boot" }, steps.map((s, i) => e("li", { key: s.label + i, className: s.status === "fail" ? "fail" : s.status === "pending" ? "pend" : "ok" }, e("b", null, s.label), " · ", s.status, s.detail ? " · " + s.detail : "", e("span", null, " +" + s.t + "ms"))));
  const actions = e("div", { className: "tr2-timeout-acts" },
    e("button", { type: "button", className: "tr2-btn pri", onClick: () => { setSlow(false); retry(); } }, "Try again"),
    e("a", { href: "#", onClick: (ev) => { ev.preventDefault(); document.getElementById("logoutBtn")?.click(); } }, "Log out"));
  const stuck = slow && (!pack || pack.loading !== false);
  if (!pack && !slow) {
    return e("div", { className: "tr2-courses" }, e("div", { className: "tr2-sk" }), e("div", { className: "tr2-sk", style: { height: 80 } }));
  }
  if (stuck) {
    return e("div", { className: "tr2-courses" },
      e("div", { className: "tr2-timeout" },
        e("h3", null, "Could not load courses"),
        e("p", null, pack?.err || "Taking longer than expected"),
        bootList, actions));
  }

  return e("div", { className: "tr2-courses tr2-fade" },
    e("div", null, e("h2", { className: "tr2-h" }, "My courses"), e("p", { className: "tr2-sub" }, "Courses assigned to you")),
    isDebugBoot() ? e("div", { className: "tr2-timeout tr2-boxdbg" },
      e("h3", null, "Load status"), bootList,
      e("h3", { className: "tr2-boxh" }, "Boxes"),
      e("div", { className: "tr2-boxtbl-wrap" },
        e("table", { className: "tr2-boxtbl" },
          e("thead", null, e("tr", null,
            e("th", null, "Course"), e("th", null, "Status"), e("th", null, "trainerIds has me"),
            e("th", null, "trainerAssigned.<uid>"), e("th", null, "reopenedAt"), e("th", null, "reopen id used"), e("th", null, "completedAt"),
            e("th", null, "seen assigned_"), e("th", null, "seen reopened_"), e("th", null, "seen completed_")
          )),
          e("tbody", null, (boxSnap.rows || []).map((r) => e("tr", { key: r.id },
            e("td", null, r.title, e("div", { className: "tr2-id" }, r.id)),
            e("td", null, r.status), e("td", null, r.teaches),
            e("td", null, r.trainerAssignedUid || r.assignedAt), e("td", null, r.reopenedAt), e("td", null, r.reopenId || "none"), e("td", null, r.completedAt),
            e("td", null, r.seenAssigned), e("td", null, r.seenReopened), e("td", null, r.seenCompleted)
          )))
        )
      ),
      e("p", { className: "tr2-pend" }, "Pending boxes: ", (boxSnap.pending || []).length
        ? (boxSnap.pending || []).map((p) => p.title + " (" + p.id + ") · " + p.type).join("; ")
        : "none"),
      e("ul", { className: "tr2-why" }, (boxSnap.rows || []).filter((r) => r.pending === "—").map((r) =>
        e("li", { key: "w" + r.id }, r.title + " · " + r.reason)))
    ) : null,
    pack.err ? e("p", { className: "tr2-err" }, pack.err, e("button", { type: "button", className: "tr2-btn", onClick: retry }, "Try again")) : null,
    e("div", { className: "tr2-kpis" },
      e("div", { className: "tr2-kpi blue" }, e(KpiIco, { kind: "cap" }), e("div", null, e("span", null, "Active courses"), e("strong", null, String(active.length))), e(Wm, { kind: "cap" })),
      e("div", { className: "tr2-kpi violet" }, e(KpiIco, { kind: "users" }), e("div", null, e("span", null, "Students"), e("strong", null, pack.extrasReady ? String(students) : e("i", { className: "tr2-sk tr2-mini" }))), e(Wm, { kind: "users" })),
      e("div", { className: "tr2-kpi amber" }, e(KpiIco, { kind: "clip" }), e("div", null, e("span", null, "Pending homework to grade"), e("strong", null, pack.extrasReady ? String(pending || 0) : e("i", { className: "tr2-sk tr2-mini" }))), pending > 0 ? e("i", { className: "tr2-dot" }) : null, e(Wm, { kind: "clip" })),
      e("div", { className: "tr2-kpi teal" }, e(KpiIco, { kind: "cal" }), e("div", { className: "tr2-next" }, e("span", null, "Next session"),
          pack.extrasReady ? e("strong", null, nextDay) : e("i", { className: "tr2-sk tr2-mini" }),
          pack.extrasReady && nextSub ? e("div", { className: "tr2-next-sub", title: nextSub }, nextSub) : null), e(Wm, { kind: "cal" }))
    ),
    e("div", { className: "tr2-tabs", ref: row },
      e("button", { type: "button", className: "tr2-tab" + (tab === "active" ? " on" : ""), onClick: () => setTab("active") }, "Active (" + active.length + ")"),
      e("button", { type: "button", className: "tr2-tab" + (tab === "done" ? " on" : ""), onClick: () => setTab("done") }, "Completed (" + done.length + ")"),
      e("button", { type: "button", className: "tr2-tab" + (tab === "all" ? " on" : ""), onClick: () => setTab("all") }, "All (" + courses.length + ")"),
      e("i", { className: "tr2-ind", ref: ind })
    ),
    !list.length ? e("div", { className: "tr2-empty" },
      e("div", { className: "tr2-empty-ico", "aria-hidden": "true" }, e("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8 }, e("path", { d: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20" }), e("path", { d: "M4 4.5A2.5 2.5 0 0 1 6.5 7H20v13H6.5A2.5 2.5 0 0 1 4 17.5z" }))),
      e("h3", null, tab === "active" ? "No active courses assigned to you" : "No courses in this list"),
      e("p", null, tab === "active" ? "Completed courses stay in the Completed tab." : "When a course is assigned to you, it will show up here."),
      tab === "active" ? e("button", { type: "button", className: "tr2-btn pri", onClick: () => setTab("done") }, "See Completed") : null
    ) : e("div", { className: "tr2-grid" }, list.map((c) => {
      const n = counts[c.id];
      const sess = (pack.sessions || []).filter((s) => s.courseId === c.id);
      const doneS = sess.filter((s) => String(s.status || "").toLowerCase() === "completed").length;
      const pct = sess.length ? Math.round((doneS / sess.length) * 100) : 0;
      const nameList = Array.isArray(c.trainerNames) ? c.trainerNames.filter(Boolean) : (c.trainerName ? [c.trainerName] : []);
      const { days, time } = dayLine(c);
      const completed = isDone(c);
      const nLab = n === 1 ? "1 student" : (n == null ? "—" : n + " students");
      const sk = stKey(c);
      const sessErr = pack.sessErr || "";
      const refreshIco = e("button", { type: "button", className: "tr2-refresh", title: sessErr || pack.enrErr || pack.extraErr || "Retry", onClick: (ev) => { ev.stopPropagation(); retry(); }, "aria-label": "Retry" },
        e("svg", { width: 14, height: 14, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2 }, e("path", { d: "M21 12a9 9 0 1 1-2.6-6.3" }), e("path", { d: "M21 3v6h-6" })));
      const stop = (ev) => ev.stopPropagation();
      return e("article", { className: "tr2-card", key: c.id, onClick: () => go("course/" + c.id) },
        e("div", { className: "tr2-band " + sk }, e("h3", null, c.title), e(StatusBadge, { status: c.status })),
        e("div", { className: "tr2-card-b" },
          e("div", { className: "tr2-meta" }, e(Mini, { kind: "users", tone: "violet" }),
            e("span", { className: "tr2-avs" }, nameList.slice(0, 3).map((nm) => e("span", { className: "tr2-av", key: nm }, initials(nm)))),
            nameList.join(", ") || "—"),
          e("div", { className: "tr2-meta" }, e(Mini, { kind: "clock", tone: "blue" }), (days || "—") + (time ? " · " + time : "")),
          e("div", { className: "tr2-meta" }, e(Mini, { kind: "cal", tone: "teal" }), (formatCourseDate(c.startDate) || "—") + " – " + (formatCourseDate(c.endDate) || "—")),
          e("div", { className: "tr2-meta" }, e(Mini, { kind: "users", tone: "violet" }), pack.extrasReady ? (pack.enrErr ? e("span", null, "— ", refreshIco) : nLab) : e("i", { className: "tr2-sk tr2-mini" })),
          pack.extrasReady
            ? (sessErr
              ? e("div", { className: "tr2-prog" }, e("span", { className: "tr2-prog-lab" }, "—"), refreshIco)
              : e("div", { className: "tr2-prog" }, e("div", { className: "tr2-bar " + sk }, e("i", { style: { width: (sess.length ? pct : 0) + "%" } })), e("span", { className: "tr2-prog-lab" }, sess.length ? doneS + " of " + sess.length + " sessions · " + pct + "%" : "No sessions yet")))
            : e("div", { className: "tr2-sk" }),
          e("div", { className: "tr2-acts", onClick: stop },
            e("button", { type: "button", className: "tr2-btn pri", onClick: () => go("roster/" + c.id) }, e(Svg, { d: IC.users, size: 14 }), completed ? "View roster" : "Roster"),
            completed ? null : e("button", { type: "button", className: "tr2-btn ghost", onClick: () => go("course/" + c.id) }, e(Svg, { d: IC.book, size: 14 }), "Course content"),
            e("button", { type: "button", className: "tr2-btn ghost", onClick: () => go("grades?course=" + c.id) }, e(Svg, { d: IC.chart, size: 14 }), "Grades"),
            completed ? null : e("button", { type: "button", className: "tr2-btn ghost", onClick: () => go("attendance?course=" + c.id) }, e(Svg, { d: IC.check, size: 14 }), "Attendance")
          )
        )
      );
    }))
  );
}

let root;
export function renderTrainerCoursesV2(host, props) {
  if (!host) return false;
  try {
    if (!root) root = createRoot(host);
    root.render(e(Boundary, null, e(Page, props)));
    return true;
  } catch (err) {
    console.error("TrainerCoursesV2", err);
    host.innerHTML = `<p class="tr2-err">${String(err?.message || err)} <button type="button" class="tr2-btn" id="tr2retry">Try again</button></p>`;
    host.querySelector("#tr2retry")?.addEventListener("click", () => renderTrainerCoursesV2(host, props));
    return false;
  }
}
