import { createElement as e, useEffect, useMemo, useState, Component } from "https://esm.sh/react@18.3.1";
import { createRoot } from "https://esm.sh/react-dom@18.3.1/client";
import { db } from "./firebase-config.js?v=auth8";
import { collection, doc, getDoc, getDocs, query, serverTimestamp, updateDoc, where } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { homeworkBestN, homeworkFinal, publishedHomework, fmt1, bestNTip } from "./gradeCalc.js";
import { StatusBadge, CourseSelect } from "./TrainerHomeworkV2.js";
import { isCourseLocked } from "./course-lock.js";
import { exportAdminPdf, nameWithId } from "./AdminPdfExport.js";

function fbErr(er) { return String((er?.code || "") + " " + (er?.message || er)).trim(); }
function initials(n) {
  return String(n || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0].toUpperCase()).join("") || "?";
}
function id7(en) {
  const s = String(en?.studentId || en?.id7 || "").replace(/\D/g, "");
  return s ? s.padStart(7, "0").slice(-7) : "—";
}
function shortTitle(t) {
  const s = String(t || "HW");
  return s.length > 18 ? s.slice(0, 16) + "…" : s;
}
function dueMs(a) {
  const d = a?.dueDate ? Date.parse(String(a.dueDate).slice(0, 10) + "T" + (a.dueTime || "00:00")) : NaN;
  return Number.isFinite(d) ? d : 0;
}
function fmtDue(a) {
  if (!a?.dueDate) return "—";
  const d = new Date(String(a.dueDate).slice(0, 10) + "T12:00:00");
  if (isNaN(d)) return String(a.dueDate);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
function orderedHw(list, courseId) {
  return publishedHomework(list, courseId).slice().sort((a, b) => dueMs(a) - dueMs(b) || String(a.title || "").localeCompare(String(b.title || "")));
}
function ChartIco() {
  return e("svg", { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2 },
    e("path", { d: "M3 3v18h18" }), e("path", { d: "M7 14v4M12 9v9M17 11v7" }));
}

class Boundary extends Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err) { console.error("HomeworkAveragesV1", err); }
  render() {
    if (this.state.err) {
      return e("div", { className: "th2" }, e("p", { className: "th2-err" }, String(this.state.err?.message || this.state.err)),
        e("button", { type: "button", className: "th2-btn", onClick: () => this.setState({ err: null }) }, "Try again"));
    }
    return this.props.children;
  }
}

function Picker({ courses, go }) {
  const [cid, setCid] = useState(courses[0]?.id || "");
  return e("div", { className: "th2 th2-avg" },
    e("button", { type: "button", className: "th2-back", "data-nav": "homework", "aria-label": "Back to Homework" }, "← Homework"),
    e("div", { className: "th2-card", style: { padding: 24, maxWidth: 480 } },
      e("h2", { style: { margin: "0 0 8px" } }, "Homework averages"),
      e("p", { className: "th2-sub" }, "Choose a course"),
      e(CourseSelect, { courses, cid, hideAll: true, onPick: setCid }),
      e("button", { type: "button", className: "th2-create", style: { marginTop: 16 }, disabled: !cid, onClick: () => cid && go("homework-averages/" + cid) }, e(ChartIco), " Open averages")));
}

function Page({ uid, go, courseId, courses }) {
  const course = (courses || []).find((c) => c.id === courseId);
  const locked = isCourseLocked(course);
  const [loading, setLoading] = useState(true);
  const [assigns, setAssigns] = useState([]);
  const [subs, setSubs] = useState([]);
  const [ens, setEns] = useState([]);
  const [scheme, setScheme] = useState(null);
  const [schemeExists, setSchemeExists] = useState(false);
  const [errs, setErrs] = useState({});
  const [nDraft, setNDraft] = useState(1);
  const [busy, setBusy] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [q, setQ] = useState("");

  const load = async () => {
    if (!courseId) return;
    setLoading(true); setSaveMsg("");
    const jobs = {
      assignments: getDocs(query(collection(db, "assignments"), where("courseId", "==", courseId), where("status", "==", "Published"))),
      submissions: getDocs(query(collection(db, "submissions"), where("courseId", "==", courseId))),
      enrollments: getDocs(query(collection(db, "enrollments"), where("courseId", "==", courseId))),
      scheme: getDoc(doc(db, "gradeSchemes", courseId))
    };
    const keys = Object.keys(jobs);
    const settled = await Promise.allSettled(keys.map((k) => jobs[k]));
    const nextErr = {};
    settled.forEach((p, i) => {
      const k = keys[i];
      if (p.status === "rejected") nextErr[k] = fbErr(p.reason);
    });
    const row = (i) => settled[i].status === "fulfilled" ? settled[i].value : null;
    const aSnap = row(0);
    const sSnap = row(1);
    const eSnap = row(2);
    const schSnap = row(3);
    const as = aSnap ? aSnap.docs.map((d) => ({ id: d.id, ...d.data() })) : [];
    const ss = sSnap ? sSnap.docs.map((d) => ({ id: d.id, ...d.data() })) : [];
    const es = eSnap ? eSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((en) => String(en.status || "").toLowerCase() !== "cancelled") : [];
    es.sort((a, b) => String(a.studentName || "").localeCompare(String(b.studentName || "")));
    let sch = null, exists = false;
    if (schSnap && schSnap.exists()) { sch = schSnap.data(); exists = true; }
    const pub = orderedHw(as, courseId);
    const n = homeworkBestN(sch, pub.length);
    setAssigns(as); setSubs(ss); setEns(es); setScheme(sch); setSchemeExists(exists);
    setNDraft(n || Math.max(1, pub.length)); setErrs(nextErr); setLoading(false);
  };
  useEffect(() => { load(); }, [courseId]);

  const pub = useMemo(() => orderedHw(assigns, courseId), [assigns, courseId]);
  const total = pub.length;
  const n = homeworkBestN({ homeworkBest: nDraft }, total);
  const packCourse = { id: courseId, assignments: pub, submissions: subs, scheme: { ...(scheme || {}), homeworkBest: n } };

  const rows = useMemo(() => ens.map((en, i) => {
    const pcts = pub.map((a) => {
      const s = subs.find((x) => x.uid === en.uid && x.assignmentId === a.id);
      const graded = s && s.status === "graded";
      const cap = Number(a.maxPoints) || 0;
      const pct = graded && cap ? Math.max(0, Math.min(100, ((Number(s.grade) || 0) / cap) * 100)) : 0;
      const shown = graded ? fmt1(pct) : "—";
      return { id: a.id, pct, shown, graded, submitted: !!(s && s.status !== "not_submitted") };
    });
    const ranked = pcts.slice().sort((a, b) => b.pct - a.pct);
    const keep = new Set(ranked.slice(0, n).map((x) => x.id));
    const submittedN = pcts.filter((x) => x.submitted).length;
    const fin = homeworkFinal(packCourse, en);
    const counted = pcts.filter((x) => keep.has(x.id)).map((x) => x.pct);
    const tip = bestNTip(counted, counted.length);
    return { i: i + 1, en, pcts, keep, submittedN, fin, tip };
  }), [ens, pub, subs, n, courseId]);

  const vis = rows.filter((r) => {
    const hay = ((r.en.studentName || "") + " " + id7(r.en)).toLowerCase();
    return !q || hay.includes(q.toLowerCase());
  });
  const finals = vis.map((r) => r.fin).filter((x) => x != null);
  const classAvg = finals.length ? Math.round((finals.reduce((a, b) => a + b, 0) / finals.length) * 10) / 10 : "—";
  const highest = finals.length ? Math.max(...finals) : "—";

  const saveN = async () => {
    if (locked || !schemeExists) return;
    setBusy(true); setSaveMsg("");
    try {
      await updateDoc(doc(db, "gradeSchemes", courseId), {
        homeworkBest: n,
        homeworkBestBy: uid,
        homeworkBestAt: serverTimestamp()
      });
      setScheme({ ...(scheme || {}), homeworkBest: n });
      setSaveMsg("Saved");
    } catch (er) { setSaveMsg(fbErr(er)); }
    setBusy(false);
  };

  const csv = () => {
    const head = ["Name (ID)", "ID", ...pub.map((a) => a.title || "Homework"), "Submitted", "Final homework grade"];
    const body = vis.map((r) => [
      nameWithId(r.en.studentName, id7(r.en)).label,
      id7(r.en),
      ...r.pcts.map((p) => p.shown),
      r.submittedN + " / " + total,
      r.fin == null ? "—" : fmt1(r.fin)
    ]);
    body.push(["Final grade = average of the best " + n + " of " + total + " homework"]);
    const blob = new Blob([[head, ...body].map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "homework-averages.csv";
    a.click();
  };
  const pdf = async () => {
    const columns = [
      { key: "name", label: "Student" },
      ...pub.map((a, i) => ({ key: "hw" + i, label: shortTitle(a.title) })),
      { key: "sub", label: "Submitted" },
      { key: "fin", label: "Final homework grade" }
    ];
    const pdfRows = vis.map((r) => {
      const o = { name: nameWithId(r.en.studentName, id7(r.en)).label, sub: r.submittedN + " / " + total, fin: r.fin == null ? "—" : fmt1(r.fin) };
      r.pcts.forEach((p, i) => { o["hw" + i] = p.shown; });
      return o;
    });
    await exportAdminPdf({
      page: (course?.title || "Course") + " · Homework averages",
      columns,
      rows: pdfRows,
      filters: (Array.isArray(course?.trainerNames) ? course.trainerNames.join(", ") : "") || "",
      summary: "Final grade = average of the best " + n + " of " + total + " homework",
      preparedBy: document.getElementById("userName")?.textContent || "Trainer"
    });
  };

  if (!courseId) return e(Picker, { courses, go });
  if (!course) {
    return e("div", { className: "th2 th2-avg" },
      e("button", { type: "button", className: "th2-back", "data-nav": "homework", "aria-label": "Back to Homework" }, "← Homework"),
      e("p", { className: "th2-err" }, "Course not found."));
  }

  const errBlock = (k) => errs[k] ? e("p", { className: "th2-err", key: k }, k + ": " + errs[k], " ", e("button", { className: "th2-btn", onClick: load }, "Try again")) : null;

  return e("div", { className: "th2 th2-avg" },
    e("button", { type: "button", className: "th2-back", "data-nav": "homework", "aria-label": "Back to Homework" }, "← Homework"),
    e("div", { className: "th2-hero" },
      e("div", { className: "th2-avg-top" },
        e("div", null,
          e("h2", { style: { margin: 0 } }, course.title || "Course"),
          e("div", { className: "th2-optrow", style: { marginTop: 8 } }, e(StatusBadge, { course }),
            e("span", { className: "th2-sub" }, Array.isArray(course.trainerNames) && course.trainerNames.length ? course.trainerNames.join(", ") : (course.trainerName || "")))),
        e("div", { className: "th2-avg-acts" },
          e("button", { type: "button", className: "th2-btn", onClick: pdf }, "View PDF"),
          e("button", { type: "button", className: "th2-btn", onClick: csv }, "Export CSV"))
      ),
      e("div", { className: "th2-stats" },
        [["Published homework", loading ? "…" : total], ["Counted for final grade", loading ? "…" : n], ["Class average", loading ? "…" : (classAvg === "—" ? "—" : fmt1(classAvg))], ["Highest average", loading ? "…" : (highest === "—" ? "—" : fmt1(highest))]].map(([l, v]) =>
          e("div", { className: "th2-tile", key: l }, e("span", null, l), e("b", null, String(v)))))
    ),
    Object.keys(errs).map(errBlock),
    e("div", { className: "th2-card th2-avg-ctrl" },
      schemeExists ? e("div", { className: "th2-avg-step" },
        e("span", null, "Count the best"),
        e("button", { type: "button", className: "th2-btn", disabled: locked || nDraft <= 1, onClick: () => setNDraft(Math.max(1, nDraft - 1)) }, "−"),
        e("strong", null, String(n)),
        e("span", null, "of"),
        e("strong", null, String(total)),
        e("span", null, "homework"),
        e("button", { type: "button", className: "th2-btn", disabled: locked || nDraft >= Math.max(1, total), onClick: () => setNDraft(Math.min(Math.max(1, total), nDraft + 1)) }, "+"),
        e("button", { type: "button", className: "th2-btn pri", disabled: locked || busy || !total, onClick: saveN }, busy ? "Saving…" : "Save"),
        saveMsg ? e("span", { className: saveMsg === "Saved" ? "th2-oknote" : "th2-err", style: { margin: 0, padding: "6px 10px" } }, saveMsg) : null,
        locked ? e("span", { className: "th2-sub" }, "Completed · read only") : null
      ) : e("p", { className: "th2-err", style: { margin: 0 } }, "The admin has not set up the grade scheme for this course yet"),
      e("p", { className: "th2-sub", style: { margin: "8px 0 0" } }, "The student's final homework grade is the average of their N highest homework grades.")
    ),
    e("div", { className: "th2-card" },
      e("div", { className: "th2-avg-tools" }, e("input", { type: "search", placeholder: "Search students", value: q, onChange: (ev) => setQ(ev.target.value) })),
      loading ? e("div", { className: "th2-skline", style: { margin: 16, height: 160 } }) :
      e("div", { className: "ha1-wrap" },
        e("table", { className: "ha1-table" },
          e("colgroup", null,
            e("col", { className: "ha1-c-num" }),
            e("col", { className: "ha1-c-stu" }),
            pub.map((a) => e("col", { key: a.id, className: "ha1-c-hw" })),
            e("col", { className: "ha1-c-sub" }),
            e("col", { className: "ha1-c-fin" })
          ),
          e("thead", null, e("tr", null,
            e("th", { className: "ha1-sticky-l" }, "#"),
            e("th", { className: "ha1-sticky-l2" }, "Student"),
            pub.map((a) => e("th", { key: a.id, className: "ha1-hwth", title: a.title },
              e("span", { className: "ha1-htt" }, a.title || "Homework"),
              e("span", { className: "ha1-htd" }, fmtDue(a) + " · /" + (Number(a.maxPoints) || 100))
            )),
            e("th", { className: "ha1-subth" }, "Submitted"),
            e("th", { className: "ha1-sticky-r" }, "Final homework grade")
          )),
          e("tbody", null, vis.map((r) =>
            e("tr", { key: r.en.uid || r.en.id },
              e("td", { className: "ha1-sticky-l ha1-num" }, String(r.i)),
              e("td", { className: "ha1-sticky-l2" },
                e("div", { className: "ha1-stu" },
                  e("span", { className: "ha1-av" }, initials(r.en.studentName)),
                  e("span", { className: "ha1-stun" }, e("b", null, r.en.studentName || "Student"), e("span", { className: "ha1-id" }, id7(r.en))))),
              pub.map((a, hi) => {
                const p = r.pcts[hi];
                const keep = p && r.keep.has(a.id);
                const miss = !p || !p.graded;
                return e("td", { key: a.id, className: "ha1-g" },
                  e("span", { className: "ha1-pill" + (miss ? " miss" : keep ? " keep" : " skip"), title: !miss && !keep ? "Not counted (lowest)" : (miss ? "" : p.shown) },
                    miss ? "—" : p.shown,
                    !miss && keep ? e("span", { className: "ha1-tick" }, "✓") : null
                  )
                );
              }),
              e("td", { className: "ha1-sub" }, r.submittedN + " / " + total),
              e("td", { className: "ha1-sticky-r ha1-fin", title: r.tip || "" },
                e("strong", null, r.fin == null ? "—" : fmt1(r.fin) + " / 100"),
                e("i", { className: "ha1-bar" }, e("b", { style: { width: (r.fin || 0) + "%" } })))
            )
          ))
        )
      )
    )
  );
}

let root;
export function renderHomeworkAveragesV1(host, props) {
  if (!host) return false;
  try {
    if (!root) root = createRoot(host);
    root.render(e(Boundary, null, e(Page, props)));
    return true;
  } catch (err) {
    host.innerHTML = `<p class="th2-err">${String(err?.message || err)} <button type="button" class="th2-btn" id="hav1r">Try again</button></p>`;
    host.querySelector("#hav1r")?.addEventListener("click", () => renderHomeworkAveragesV1(host, props));
    return false;
  }
}
