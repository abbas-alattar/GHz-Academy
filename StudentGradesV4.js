import { createElement as e, useEffect, useMemo, useState, Component } from "https://esm.sh/react@18.3.1";
import { createRoot } from "https://esm.sh/react-dom@18.3.1/client";
import { parseScore, computeAverage, fmt1, gradeCalc } from "./gradeCalc.js";
import { exportStudentGradesPdf } from "./AdminPdfExport.js";

const roots = new WeakMap();
const printState = { popup: "" };

class Boundary extends Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err) { console.error("StudentGradesV4", err?.code || err?.message || err); }
  render() {
    if (this.state.err) {
      const code = this.state.err?.code || this.state.err?.message || String(this.state.err);
      return e("div", { className: "sg4-load-fail" },
        e("p", { className: "banner" }, "Grades could not load"),
        e("p", { className: "banner" }, String(code)),
        e("button", { type: "button", className: "btn btn-sm", onClick: () => { this.setState({ err: null }); this.props.onRetry?.(); } }, "Try again"),);
    }
    return this.props.children;
  }
}

function passMarkOf(scheme) {
  const n = Number(scheme?.passMark);
  return Number.isFinite(n) ? n : 60;
}
function isCompleted(c) {
  const s = String(c?.status ?? c?.courseStatus ?? "").trim();
  return /^completed$/i.test(s);
}
function dateMs(raw) {
  if (raw == null || raw === "") return 0;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (raw && typeof raw.toMillis === "function") return raw.toMillis();
  if (raw && typeof raw.seconds === "number") return raw.seconds * 1000;
  const s = String(raw);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
  const n = Date.parse(s);
  return Number.isFinite(n) ? n : 0;
}
function icoPrint() {
  return e("svg", { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", "aria-hidden": true },
    e("path", { d: "M6 9V2h12v7" }),
    e("path", { d: "M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" }),
    e("path", { d: "M6 14h12v8H6z" }));
}
function icoLock() {
  return e("svg", { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", "aria-hidden": true },
    e("rect", { x: "5", y: "11", width: "14", height: "10", rx: "2" }),
    e("path", { d: "M8 11V8a4 4 0 018 0v3" }));
}
function studentMeta(opts) {
  const s = opts.student || {};
  const id = s.studentId || s.id7 || "";
  return {
    who: [s.name || "Student", id ? String(id).padStart(7, "0").slice(-7) : ""].filter(Boolean).join(" · ")
  };
}
function trainerLabel(c) {
  if (Array.isArray(c.trainerNames) && c.trainerNames.length) return c.trainerNames.filter(Boolean).join(", ");
  return c.trainerName || c.instructor || "—";
}
function tone(v) {
  if (v == null) return "na";
  if (v >= 70) return "hi";
  if (v >= 55) return "mid";
  return "lo";
}
function liveGrade(course) {
  const scheme = course.scheme;
  if (!scheme) return { avg: null, passed: false, values: course.vals || {} };
  const pack = course.pack || {};
  const g = gradeCalc({ id: course.id, pack: { ...pack, scheme } }, scheme, { uid: course.uid, scores: course.scores || {}, pack: { ...pack, scheme } });
  if (!g.failed) return { avg: g.average, passed: g.passed, values: g.values };
  const vals = course.vals || {};
  const avg = computeAverage(scheme, vals);
  return { avg, passed: avg != null && avg >= passMarkOf(scheme), values: vals };
}
function rowsForCourse(course) {
  const scheme = course.scheme;
  const comps = Array.isArray(scheme?.components) ? scheme.components : [];
  const live = liveGrade(course);
  const vals = live.values || course.vals || {};
  const pass = passMarkOf(scheme);
  const avg = live.avg;
  const passed = !!live.passed;
  const rows = comps.map((c) => {
    const w = Number(c.weight) || 0;
    const v = parseScore(vals[c.id]);
    const pts = ((v == null ? 0 : v) * w) / 100;
    return { section: c.title || "Section", weight: w + "%", score: v == null ? "—" : fmt1(v), weighted: fmt1(pts), result: fmt1(pts) };
  });
  rows.push({
    section: "Final average",
    weight: "100%",
    score: avg == null ? "—" : fmt1(avg),
    weighted: passed ? "Passed" : "Failed",
    result: passed ? "Passed" : "Failed"
  });
  return { rows, avg, passed, pass, comps };
}
async function printCourses(opts, list) {
  const preview = window.open("", "_blank");
  if (!preview) { printState.popup = "Allow popups to view the PDF"; return false; }
  printState.popup = "";
  try {
    preview.document.open();
    preview.document.write("<!DOCTYPE html><title>Preparing PDF...</title><body style=\"font-family:IBM Plex Sans,sans-serif;color:#0F2747;padding:40px\">Preparing PDF...</body>");
    preview.document.close();
  } catch (_) {}
  const meta = studentMeta(opts);
  const done = (list || []).filter(isCompleted);
  const courses = done.map((c) => {
    const pack = rowsForCourse(c);
    const comps = pack.rows.slice(0, -1).map((r) => ({ section: r.section, weight: r.weight, score: r.score, weighted: r.weighted }));
    comps.push({ section: "Final average", weight: "100%", score: pack.avg == null ? "—" : fmt1(pack.avg), weighted: pack.passed ? "Passed" : "Failed" });
    return { title: c.title || "Course", trainer: trainerLabel(c), rows: comps, avg: pack.avg, passed: pack.passed, pass: pack.pass };
  });
  const one = done.length === 1 ? done[0] : null;
  const filters = meta.who + (one ? " · " + (one.title || "") : " · All completed courses");
  try {
    await exportStudentGradesPdf({ courses, filters, preparedBy: meta.who, previewWin: preview });
  } catch (err) {
    printState.popup = String(err?.message || err);
    try { if (!preview.closed) preview.close(); } catch (_) {}
    return false;
  }
  return true;
}

function Tile({ name, weight, score, locked }) {
  const v = locked ? null : score;
  return e("div", { className: "sg4-tile" },
    e("div", { className: "t" }, e("span", null, name), e("span", null, weight + "%")),
    e("div", { className: "s " + (locked ? "na" : tone(v)) }, locked || v == null ? "—" : fmt1(v))
  );
}

class CardBound extends Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err) { console.error("StudentGradesV4 card", this.props.title, err?.code || err?.message || err); }
  render() {
    if (this.state.err) {
      return e("article", { className: "sg4-card" },
        e("h3", null, this.props.title || "Course"),
        e("p", { className: "sg4-err" }, "Could not load " + (this.state.err?.code || this.state.err?.message || String(this.state.err)))
      );
    }
    return this.props.children;
  }
}

function CompletedCard({ course, opts, onPopup }) {
  const [open, setOpen] = useState(false);
  const pack = rowsForCourse(course);
  const avg = pack.avg;
  const pass = pack.pass;
  const ok = !!pack.passed;
  const delta = avg == null ? null : Math.round((Number(avg) - pass) * 10) / 10;
  const deltaTxt = delta == null ? "" : (delta >= 0 ? delta + " points above pass mark" : Math.abs(delta) + " points below pass mark");
  const comps = pack.comps;
  return e("article", { className: "sg4-card " + (ok ? "sg4-pass" : "sg4-fail") },
    e("div", { className: "sg4-top" },
      e("div", { style: { flex: 1, minWidth: 0 } },
        e("h3", null, course.title || "Course"),
        e("p", { className: "sg4-meta" }, "Completed · pass mark " + pass)
      ),
      e("span", { className: "sg4-pill " + (ok ? "sg4-pill-pass" : "sg4-pill-fail") }, ok ? "Passed" : "Failed"),
      e("button", { type: "button", className: "sg4-print", title: "Print", "aria-label": "Print this course", onClick: async () => { const okp = await printCourses(opts, [course]); onPopup(printState.popup); if (!okp) return; } }, icoPrint())
    ),
    course.schemeErr ? e("p", { className: "sg4-err" }, "Could not load " + course.schemeErr) : null,
    avg != null ? e("div", { className: "sg4-avg " + (ok ? "sg4-pass" : "sg4-fail") }, fmt1(avg), e("span", null, "/ 100 · " + deltaTxt)) : null,
    comps.length ? e("div", { className: "sg4-tiles" }, comps.map((c, i) => e(Tile, { key: String(c.id || c.title || i), name: c.title || "Section", weight: Number(c.weight) || 0, score: parseScore((course.vals || {})[c.id]) }))) : null,
    e("button", { type: "button", className: "sg4-more", onClick: () => setOpen(!open) }, open ? "Hide breakdown" : "View full breakdown ›"),
    open ? e("table", { className: "sg4-table" },
      e("thead", null, e("tr", null, e("th", null, "Section"), e("th", null, "Weight"), e("th", null, "Score"), e("th", null, "Points"), e("th", null, "Out of"))),
      e("tbody", null, comps.map((c, i) => {
        const w = Number(c.weight) || 0;
        const v = parseScore((course.vals || {})[c.id]);
        const pts = ((v == null ? 0 : v) * w) / 100;
        return e("tr", { key: String(c.id || c.title || i) }, e("td", null, c.title || "Section"), e("td", null, w + "%"), e("td", null, v == null ? "—" : fmt1(v)), e("td", null, fmt1(pts)), e("td", null, String(w)));
      }))
    ) : null
  );
}

function ProgressCard({ course }) {
  const comps = Array.isArray(course.scheme?.components) ? course.scheme.components : [];
  const pass = passMarkOf(course.scheme);
  return e("article", { className: "sg4-card sg4-dim" },
    e("div", { className: "sg4-top" },
      e("span", { style: { color: "#94A3B8", marginTop: 2 } }, icoLock()),
      e("div", { style: { flex: 1, minWidth: 0 } },
        e("h3", null, course.title || "Course"),
        e("p", { className: "sg4-meta" }, course.scheme ? ("In progress · pass mark " + pass) : "In progress")
      ),
      e("span", { className: "sg4-pill sg4-pill-mid" }, "In progress"),
      e("button", { type: "button", className: "sg4-print is-off", disabled: true, title: "Available when the course is completed" }, icoPrint())
    ),
    course.schemeErr ? e("p", { className: "sg4-err" }, "Could not load " + course.schemeErr) : null,
    comps.length ? e("div", { className: "sg4-tiles", style: { marginTop: 12 } }, comps.map((c, i) => e(Tile, { key: String(c.id || c.title || i), name: c.title || "Section", weight: Number(c.weight) || 0, locked: true }))) : null,
    e("p", { className: "sg4-lock" }, icoLock(), comps.length ? "Your results unlock when the course is completed." : "Grade distribution not set yet.")
  );
}

function App({ opts }) {
  const [popup, setPopup] = useState(printState.popup);
  const courses = Array.isArray(opts.courses) ? opts.courses : [];
  const done = useMemo(() => {
    const rank = (c) => {
      const t = String(c.title || "").toLowerCase();
      if (/antenna/.test(t)) return 0;
      if (/fiber/.test(t)) return 1;
      if (/microwave/.test(t)) return 2;
      return 10;
    };
    return courses.filter(isCompleted).slice().sort((a, b) => rank(a) - rank(b) || dateMs(b.endDate || b.end || b.endOn) - dateMs(a.endDate || a.end || a.endOn));
  }, [courses]);
  const open = useMemo(() => courses.filter((c) => !isCompleted(c)).slice().sort((a, b) => dateMs(a.startDate || a.start || a.startOn) - dateMs(b.startDate || b.start || b.startOn)), [courses]);
  const avgs = done.map((c) => liveGrade(c).avg).filter((n) => n != null);
  const overall = avgs.length ? Math.round((avgs.reduce((s, n) => s + n, 0) / avgs.length) * 10) / 10 : null;
  const passedN = done.filter((c) => liveGrade(c).passed).length;
  const failedN = done.length - passedN;
  const mismatch = done.length !== passedN + failedN;
  useEffect(() => {
    courses.forEach((c) => {
      const completed = isCompleted(c);
      const avg = liveGrade(c).avg;
      const result = !completed ? "in-progress" : (avg == null ? "no-average" : (avg >= passMarkOf(c.scheme) ? "Passed" : "Failed"));
      console.log("[sg4]", c.id, c.title, c.status, "scheme=" + !!c.scheme, "scores=" + !!c.scoresLoaded, "avg=" + (avg == null ? "null" : avg), result, "card=" + true);
    });
    const antenna = courses.find((c) => /antenna/i.test(String(c.title || "")));
    if (antenna) console.log("[sg4 antenna]", antenna.id, antenna.title, antenna.status, "completed=" + isCompleted(antenna), "scheme=" + !!antenna.scheme, "scores=" + !!antenna.scoresLoaded);
    else console.log("[sg4 antenna] not in enrollments list");
  }, [courses]);

  if (opts.loading) {
    return e("div", { className: "sg4" },
      e("div", { className: "sg4-head" }, e("div", null, e("h2", null, "Grades"), e("p", { className: "sg4-sub" }, "Your results per course"))),
      e("div", { className: "sg4-kpis" }, e("div", { className: "sg4-kpi hero" }), e("div", { className: "sg4-kpi" }), e("div", { className: "sg4-kpi" }), e("div", { className: "sg4-kpi" })),
      e("div", { className: "sg4-card-grid" }, e("div", { className: "sg4-sk" }), e("div", { className: "sg4-sk" }))
    );
  }

  return e("div", { className: "sg4" },
    e("div", { className: "sg4-head" },
      e("div", null, e("h2", null, "Grades"), e("p", { className: "sg4-sub" }, "Your results per course")),
      e("div", { className: "sg4-head-actions" },
        e("button", { type: "button", className: "sg4-print-all", disabled: !done.length, title: done.length ? "Print all grades" : "Available when a course is completed", onClick: async () => { const okp = await printCourses(opts, done); setPopup(printState.popup); if (!okp) return; } }, icoPrint(), " Print all grades"),)
    ),
    popup ? e("p", { className: "banner" }, popup) : null,
    mismatch ? e("p", { className: "sg4-warn", role: "status" }, "Completed cards (" + done.length + ") do not match Passed + Failed (" + passedN + " + " + failedN + ").") : null,
    e("div", { className: "sg4-kpis" },
      e("div", { className: "sg4-kpi hero" }, e("div", { className: "n" }, overall == null ? "—" : fmt1(overall)), e("div", { className: "l" }, "Overall average · " + done.length + " completed course" + (done.length === 1 ? "" : "s"))),
      e("div", { className: "sg4-kpi pass" }, e("div", { className: "n" }, String(passedN)), e("div", { className: "l" }, "Passed")),
      e("div", { className: "sg4-kpi fail" }, e("div", { className: "n" }, String(failedN)), e("div", { className: "l" }, "Failed")),
      e("div", { className: "sg4-kpi prog" }, e("div", { className: "n" }, String(open.length)), e("div", { className: "l" }, "In progress"))
    ),
    e("div", { className: "sg4-sec" }, "Completed courses", e("span", { className: "sg4-count" }, String(done.length))),
    e("div", { className: "sg4-card-grid" }, done.length ? done.map((c, i) => e(CardBound, { key: "done-" + String(c.id || "") + "-" + i, title: c.title }, e(CompletedCard, { course: c, opts, onPopup: setPopup }))) : e("p", { className: "sg4-sub" }, "No completed courses yet.")),
    e("div", { className: "sg4-sec" }, "In progress", e("span", { className: "sg4-count" }, String(open.length))),
    e("div", { className: "sg4-card-grid" }, open.length ? open.map((c, i) => e(CardBound, { key: "open-" + i + "-" + (c.id || c.title || "x"), title: c.title }, e(ProgressCard, { course: c }))) : e("p", { className: "sg4-sub" }, "No courses in progress."))
  );
}

export function renderStudentGradesV4(opts = {}) {
  const host = opts?.host;
  if (!host) return false;
  try {
    let root = roots.get(host);
    if (!root) { root = createRoot(host); roots.set(host, root); }
    root.render(e(Boundary, null, e(App, { opts })));
    opts.onReady?.();
    return true;
  } catch (err) {
    console.error("StudentGradesV4", err?.code || err?.message || err);
    try {
      host.innerHTML = "<p class=\"banner\">Grades could not load<br>" + String(err?.code || err?.message || err) + "</p><button class=\"btn btn-sm\" type=\"button\" id=\"sg4Retry\">Retry</button>";
      document.getElementById("sg4Retry")?.addEventListener("click", () => opts?.onRetry?.());
    } catch (_) {}
    return false;
  }
}
