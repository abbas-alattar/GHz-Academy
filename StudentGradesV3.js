import { createElement as e, useMemo, useState, Component } from "https://esm.sh/react@18.3.1";
import { createRoot } from "https://esm.sh/react-dom@18.3.1/client";
import { parseScore, computeAverage } from "./gradeCalc.js";
import { exportStudentGradesPdf } from "./AdminPdfExport.js";

const roots = new WeakMap();
const printState = { popup: "" };

class Boundary extends Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err) { console.error("StudentGradesV3", err); }
  render() {
    if (this.state.err) {
      return e("div", { className: "sg3-fail" },
        e("p", { className: "banner" }, "Grades could not load"),);
    }
    return this.props.children;
  }
}

function passMarkOf(scheme) {
  const n = Number(scheme?.passMark);
  return Number.isFinite(n) ? n : 60;
}
function courseGroup(c) {
  return String(c?.status ?? "") === "Completed" ? "completed" : "active";
}
function courseAvg(course) {
  if (!course?.scheme) return null;
  return computeAverage(course.scheme, course.vals || {});
}
function coursePassed(course) {
  const avg = courseAvg(course);
  if (avg == null) return false;
  return Number(avg) >= passMarkOf(course.scheme);
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
function sortKey(c) {
  return dateMs(c.endDate || c.end || c.endOn) || dateMs(c.startDate || c.start || c.startOn) || dateMs(c.createdAt) || 0;
}
function icoPrint() {
  return e("svg", { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", "aria-hidden": true },
    e("path", { d: "M6 9V2h12v7" }),
    e("path", { d: "M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" }),
    e("path", { d: "M6 14h12v8H6z" }));
}
function studentMeta(opts) {
  const s = opts.student || {};
  const id = s.studentId || s.id7 || "";
  return {
    name: s.name || "Student",
    sid: id ? String(id).padStart(7, "0").slice(-7) : "—",
    who: [s.name || "Student", id ? String(id).padStart(7, "0").slice(-7) : ""].filter(Boolean).join(" · ")
  };
}
function trainerLabel(c) {
  if (Array.isArray(c.trainerNames) && c.trainerNames.length) return c.trainerNames.filter(Boolean).join(", ");
  return c.trainerName || c.instructor || "—";
}
function rowsForCourse(course) {
  const scheme = course.scheme;
  const comps = Array.isArray(scheme?.components) ? scheme.components : [];
  const vals = course.vals || {};
  const pass = passMarkOf(scheme);
  const avg = scheme ? computeAverage(scheme, vals) : null;
  const passed = avg != null && Number(avg) >= pass;
  const rows = comps.map((c) => {
    const w = Number(c.weight) || 0;
    const v = parseScore(vals[c.id]);
    const pts = ((v == null ? 0 : v) * w) / 100;
    return { section: c.title || "Section", weight: w + "%", score: v == null ? "—" : String(v), result: pts.toFixed(1) };
  });
  rows.push({ section: "Final average", weight: "100%", score: avg == null ? "—" : Number(avg).toFixed(1), result: passed ? "Passed" : "Failed" });
  return { rows, avg, passed, pass };
}
async function printCourses(opts, list) {
  const preview = window.open("", "_blank");
  if (!preview) {
    printState.popup = "Allow popups to view the PDF";
    return false;
  }
  printState.popup = "";
  try {
    preview.document.open();
    preview.document.write("<!DOCTYPE html><title>Preparing PDF...</title><body style=\"font-family:IBM Plex Sans,sans-serif;color:#0F2747;padding:40px\">Preparing PDF...</body>");
    preview.document.close();
  } catch (_) {}
  const meta = studentMeta(opts);
  const done = (list || []).filter((c) => courseGroup(c) === "completed");
  const courses = done.map((c) => {
    const pack = rowsForCourse(c);
    const comps = pack.rows.slice(0, -1).map((r) => ({
      section: r.section,
      weight: r.weight,
      score: r.score,
      weighted: r.result
    }));
    comps.push({
      section: "Final average",
      weight: "100%",
      score: pack.avg == null ? "—" : Number(pack.avg).toFixed(1),
      weighted: pack.passed ? "Passed" : "Failed"
    });
    return {
      title: c.title || "Course",
      trainer: trainerLabel(c),
      rows: comps,
      avg: pack.avg,
      passed: pack.passed,
      pass: pack.pass
    };
  });
  const one = done.length === 1 ? done[0] : null;
  const filters = meta.who + (one ? " · " + (one.title || "") + " · " + trainerLabel(one) : " · All completed courses");
  try {
    await exportStudentGradesPdf({
      courses,
      filters,
      preparedBy: meta.who,
      previewWin: preview
    });
  } catch (err) {
    printState.popup = String(err?.message || err);
    try { if (!preview.closed) preview.close(); } catch (_) {}
    return false;
  }
  return true;
}

function scoreTone(v) {
  if (v == null) return "mid";
  if (v >= 80) return "hi";
  if (v >= 60) return "mid";
  return "lo";
}

function Skeleton() {
  return e("div", { className: "sg3-wrap" },
    e("div", { className: "sg3-sk" }, e("div", { className: "sg3-sk-b" }), e("div", { className: "sg3-sk-b" }), e("div", { className: "sg3-sk-b" })),
    e("div", { className: "sg3-sk-l" })
  );
}

function Breakdown({ course }) {
  const scheme = course.scheme;
  const comps = Array.isArray(scheme?.components) ? scheme.components : [];
  const avg = courseAvg(course);
  const pass = passMarkOf(scheme);
  const passed = avg != null && Number(avg) >= pass;
  return e("div", { className: "sg3-break" },
    e("div", { className: "sg3-scroll" },
      e("table", { className: "sg3-table" },
        e("thead", null, e("tr", null,
          e("th", null, "Section"),
          e("th", { className: "num" }, "Weight"),
          e("th", { className: "num" }, "Score"),
          e("th", { className: "num" }, "Points"),
          e("th", { className: "num" }, "Out of")
        )),
        e("tbody", null,
          comps.map((c) => {
            const w = Number(c.weight) || 0;
            const v = parseScore((course.vals || {})[c.id]);
            const pts = ((v == null ? 0 : v) * w) / 100;
            return e("tr", { key: c.id || c.title },
              e("td", null, c.title || "Section"),
              e("td", { className: "num" }, e("span", { className: "sg3-w" }, w + "%")),
              e("td", { className: "num" }, e("span", { className: "sg3-sc " + scoreTone(v) }, v == null ? "—" : String(v))),
              e("td", { className: "num" }, pts.toFixed(1)),
              e("td", { className: "num" }, String(w))
            );
          }),
          e("tr", { className: "sg3-final " + (passed ? "ok" : "bad") },
            e("td", null, "Final average"),
            e("td", { className: "num" }, e("span", { className: "sg3-w" }, "100%")),
            e("td", { className: "num" }, avg == null ? "—" : avg.toFixed(1)),
            e("td", { className: "num" }, avg == null ? "—" : avg.toFixed(1)),
            e("td", { className: "num" }, "100")
          )
        )
      )
    )
  );
}

function App({ opts }) {
  const courses = Array.isArray(opts.courses) ? opts.courses : [];
  const done = useMemo(() => courses.filter((c) => courseGroup(c) === "completed")
    .sort((a, b) => (sortKey(b) - sortKey(a)) || String(a.title || "").localeCompare(String(b.title || ""))), [courses]);
  const active = useMemo(() => courses.filter((c) => courseGroup(c) !== "completed")
    .sort((a, b) => (sortKey(b) - sortKey(a)) || String(a.title || "").localeCompare(String(b.title || ""))), [courses]);
  const firstId = done[0]?.id || "";
  const [openId, setOpenId] = useState(firstId);
  const [popup, setPopup] = useState(printState.popup);

  let passed = 0, failed = 0, avgSum = 0, avgN = 0;
  for (const c of done) {
    if (!c.scheme) { failed++; continue; }
    const avg = computeAverage(c.scheme, c.vals || {});
    if (Number(avg) >= passMarkOf(c.scheme)) passed++; else failed++;
    avgSum += avg;
    avgN++;
  }
  const overall = avgN ? (Math.round((avgSum / avgN) * 10) / 10).toFixed(1) : "—";

  function row(course, locked) {
    const doneC = !locked;
    const avg = doneC ? courseAvg(course) : null;
    const ok = doneC && coursePassed(course);
    const pass = passMarkOf(course.scheme);
    const open = openId === course.id;
    const tile = locked
      ? e("div", { className: "sg3-tile lock" }, "🔒")
      : e("div", { className: "sg3-tile " + (ok ? "ok" : "bad") }, ok ? "✓" : "✕");
    const pill = locked
      ? e("span", { className: "sg3-pill gray" }, "In progress")
      : e("span", { className: "sg3-pill " + (ok ? "ok" : "bad") }, ok ? "Passed" : "Failed");
    const meta = locked
      ? (course.scheme ? "Locked until the course is completed" : "Grade distribution not set yet")
      : ("Completed · pass mark " + pass);
    const printBtn = locked
      ? e("button", { type: "button", className: "sg3-print-one is-off", disabled: true, title: "Available when the course is completed", "aria-label": "Available when the course is completed" }, icoPrint())
      : e("button", { type: "button", className: "sg3-print-one", title: "Print", "aria-label": "Print this course", onClick: async (ev) => { ev.stopPropagation(); const ok = await printCourses(opts, [course]); setPopup(printState.popup); if (!ok) return; } }, icoPrint());
    return e("div", { className: "sg3-row", key: course.id },
      e("button", {
        type: "button",
        className: "sg3-btn",
        disabled: locked,
        onClick: locked ? undefined : () => setOpenId(open ? "" : course.id)
      },
        tile,
        e("div", null,
          e("p", { className: "sg3-cname" }, course.title || "Course"),
          e("p", { className: "sg3-cmeta" }, meta)
        ),
        e("div", { className: "sg3-avgnum" }, doneC && avg != null ? avg.toFixed(1) : "—"),
        pill,
        printBtn,
        e("span", { className: "sg3-chev" + (open && !locked ? " open" : "") }, locked ? "" : "▾")
      ),
      locked ? e("p", { className: "sg3-locknote" }, course.scheme ? "Locked until the course is completed" : "Grade distribution not set yet") : null,
      !locked && open && course.scheme ? e(Breakdown, { course }) : null
    );
  }

  return e("div", { className: "sg3-wrap" },
    (opts.notes || []).map((n, i) => e("p", { className: "sg3-notes", key: i }, n)),
    popup ? e("p", { className: "sg3-popup" }, popup) : null,
    e("div", { className: "sg3-head" },
      e("div", null,
        e("h2", null, "My grades"),
        e("p", { className: "sg3-sub" }, "Your results by course"),),
      e("button", { type: "button", className: "sg3-print", onClick: async () => { const ok = await printCourses(opts, done); setPopup(printState.popup); if (!ok) return; } }, icoPrint(), " Print grades")
    ),
    e("div", { className: "sg3-cards" },
      e("div", { className: "sg3-card sg3-avg" }, e("div", { className: "n" }, overall), e("div", { className: "l" }, "Overall average")),
      e("div", { className: "sg3-card sg3-ok" }, e("div", { className: "n" }, String(passed)), e("div", { className: "l" }, "Passed")),
      e("div", { className: "sg3-card sg3-no" }, e("div", { className: "n" }, String(failed)), e("div", { className: "l" }, "Failed"))
    ),
    e("section", { className: "sg3-all" },
      e("h3", null, "All courses"),
      done.map((c) => row(c, false)),
      active.map((c) => row(c, true)),
      !done.length && !active.length ? e("p", { className: "sg3-locknote" }, "No enrolled courses.") : null
    )
  );
}

export function renderStudentGradesV3(opts = {}) {
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
      host.innerHTML = "<p class=\"banner\">This section could not load<br>" + String(err?.message || err) + "</p><button class=\"btn btn-sm\" type=\"button\" id=\"sg3Retry\">Retry</button>";
      document.getElementById("sg3Retry")?.addEventListener("click", () => renderStudentGradesV3(opts));
    } catch (_) {}
    return false;
  }
}
