import { bootStudentNav } from "./student-nav.js";
import { protect } from "./auth-guard.js?v=auth8";
import { db } from "./firebase-config.js?v=auth8";
import { collection, query, where, getDocs, getDoc, doc } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { parseScore, computeAverage, computeStatus, gradeCalc } from "./gradeCalc.js";
import { renderStudentGradesV3 } from "./StudentGradesV3.js";
import { waveLoader } from "./WaveLoader.js";
import { bootPageMotion } from "./PageTransition.js";
try { bootPageMotion(document.body); } catch (_) {}

bootStudentNav("grades");
import("./StudentTheme.js").then((m) => { try { m.bootStudentTheme(); } catch (_) {} }).catch(() => {});
const root = document.getElementById("root");
const v2Host = document.getElementById("gradesV2Root");
const gradeTimer = setTimeout(() => {
  const host = v2Host || root;
  if (host && /Loading/.test(host.textContent || "")) {
    host.innerHTML = `<p class="banner">This page could not load<br>timeout</p><button class="btn btn-sm" type="button" id="gRetry">Retry</button>`;
    document.getElementById("gRetry")?.addEventListener("click", () => location.reload());
  }
}, 8000);
const esc = (s) => String(s ?? "").replace(/&/g,"&"+"amp;").replace(/</g,"&"+"lt;").replace(/"/g,"&"+"quot;");
const errCode = (e) => String((e && (e.code || e.message)) || e || "error");

const notes = [];
const noteFail = (step, e) => {
  notes.push(`step: ${step} - ${errCode(e)}`);
};

const lockCell = () => `<td style="color:var(--muted)">—</td>`;

const schemeTable = (title, scheme, opts) => {
  if (!scheme) {
    return `<article class="kpi" style="margin-bottom:18px"><h3>${esc(title)}</h3><p style="color:var(--muted);margin-top:8px">Grade distribution not set yet.</p></article>`;
  }
  const components = Array.isArray(scheme.components) ? scheme.components : [];
  let passMark = Number(scheme.passMark);
  if (!Number.isFinite(passMark)) passMark = 60;
  const heads = components.map((c) => `<th>${esc(c.title || "")} ${Number(c.weight) || 0}%</th>`).join("");
  let cells;
  let avgCell;
  let statusCell;
  let note = "";
  if (opts.locked) {
    cells = components.map(() => lockCell()).join("");
    avgCell = lockCell();
    statusCell = lockCell();
    note = `<p style="color:var(--muted);margin:8px 0 0">Your grades will be visible once the course is completed.</p>`;
  } else {
    const vals = opts.vals || {};
    const avg = computeAverage(scheme, vals);
    const st = computeStatus(scheme, vals, passMark);
    cells = components.map((c) => {
      const v = parseScore(vals[c.id]);
      const auto = c.source === "attendance" || c.source === "homework" || c.source === "quiz";
      return `<td>${v == null ? "—" : v + "/100"}${auto ? ` <span class="badge badge-open">Auto</span>` : ""}</td>`;
    }).join("");
    avgCell = `<td style="font-weight:700">${avg.toFixed(1)}/100</td>`;
    statusCell = `<td><span class="badge" style="background:${st.bg};color:${st.color}">${esc(st.label)}</span></td>`;
  }
  return `<article class="kpi" style="margin-bottom:18px">
    <h3>${esc(title)}</h3>
    <p style="color:var(--muted);margin:8px 0 12px">Pass mark: <strong>${passMark}/100</strong></p>
    <div class="table-wrap"><table class="data"><thead><tr>
      ${heads}<th>Average</th><th>Status</th>
    </tr></thead><tbody><tr>
      ${cells}${avgCell}${statusCell}
    </tr></tbody></table></div>
    ${note}
  </article>`;
};

try {
  const { user } = await protect("student");
  const uid = user.uid;
  let ens = [];
  try {
    ens = (await getDocs(query(collection(db, "enrollments"), where("uid", "==", uid)))).docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    noteFail("enrollments", e);
    ens = [];
  }

  const active = [];
  const done = [];
  const v2Courses = [];
  const student = { name: user.displayName || user.email || "Student", email: user.email || "" };
  if (v2Host) {
    v2Host.innerHTML = waveLoader("page");
    renderStudentGradesV3({ host: v2Host, loading: true, onClassic: () => {} });
  }

  const rows = (snap) => (snap && snap.docs ? snap.docs.map((d) => ({ id: d.id, ...d.data() })) : []);
  const loadOne = async (en) => {
    const courseId = en.courseId;
    if (!courseId) return null;
    let title = en.courseTitle || courseId;
    let status = en.courseStatus || "";
    try {
      const cs = await getDoc(doc(db, "courses", courseId));
      if (cs.exists()) {
        const c = cs.data();
        title = c.title || title;
        status = c.status || status;
      }
    } catch (e) { noteFail("courses/" + courseId, e); }
    let scheme = null;
    try {
      const ss = await getDoc(doc(db, "gradeSchemes", courseId));
      if (ss.exists()) scheme = ss.data();
    } catch (e) { noteFail("gradeSchemes/" + courseId, e); }
    if (status !== "Completed") {
      return { kind: "active", html: schemeTable(title, scheme, { locked: true }), course: { id: courseId, title, status, scheme, vals: {} } };
    }
    const pack = { assignments: [], quizzes: [], sessions: [], attendance: [], submissions: [], quizAttempts: [] };
    let scores = {};
    const parts = await Promise.allSettled([
      getDoc(doc(db, "gradeScores", uid + "_" + courseId)),
      getDocs(query(collection(db, "assignments"), where("courseId", "==", courseId), where("status", "==", "Published"))),
      getDocs(query(collection(db, "quizzes"), where("courseId", "==", courseId), where("status", "==", "Published"))),
      getDocs(query(collection(db, "sessions"), where("courseId", "==", courseId))),
      getDocs(query(collection(db, "attendance"), where("uid", "==", uid), where("courseId", "==", courseId))),
      getDocs(query(collection(db, "submissions"), where("uid", "==", uid), where("courseId", "==", courseId))),
      getDocs(query(collection(db, "quizAttempts"), where("uid", "==", uid), where("courseId", "==", courseId)))
    ]);
    const labels = ["gradeScores", "assignments", "quizzes", "sessions", "attendance", "submissions", "quizAttempts"];
    parts.forEach((p, i) => {
      if (p.status === "rejected") { noteFail(labels[i] + "/" + courseId, p.reason); return; }
      if (i === 0) { if (p.value.exists()) scores = p.value.data().scores || {}; return; }
      pack[labels[i]] = rows(p.value);
    });
    const vals = scheme ? (gradeCalc({ id: courseId, pack: { ...pack, scheme } }, scheme, { uid, scores, pack: { ...pack, scheme } }).values || {}) : {};
    return { kind: "done", html: schemeTable(title, scheme, { locked: false, vals }), course: { id: courseId, title, status, scheme, vals } };
  };
  const loaded = await Promise.allSettled(ens.map(loadOne));
  loaded.forEach((p) => {
    if (p.status !== "fulfilled" || !p.value) {
      if (p.status === "rejected") noteFail("course", p.reason);
      return;
    }
    if (p.value.kind === "active") active.push(p.value.html);
    else done.push(p.value.html);
    v2Courses.push(p.value.course);
  });

  const noteHtml = notes.length
    ? notes.map((n) => `<p style="color:#6b7280;font-size:12px;margin:0 0 8px">${esc(n)}</p>`).join("")
    : "";

  if (!active.length && !done.length) {
    root.innerHTML = noteHtml + "<p>No enrolled courses.</p>";
  } else {
    root.innerHTML = noteHtml + active.join("") + (done.length ? `<h2 style="margin:24px 0 12px;font-size:1.15rem;color:var(--navy)">Completed</h2>` + done.join("") : "");
  }
  const showClassic = () => {
    if (v2Host) v2Host.classList.add("hidden");
    if (root) root.classList.remove("hidden");
  };
  const showV2 = () => {
    if (root) root.classList.add("hidden");
    if (v2Host) v2Host.classList.remove("hidden");
  };
  try {
    const ok = v2Host && renderStudentGradesV3({
      host: v2Host,
      courses: v2Courses,
      student,
      notes,
      onClassic: showClassic,
      onReady: showV2
    });
    clearTimeout(gradeTimer);
    if (!ok) showClassic();
  } catch (ve) {
    clearTimeout(gradeTimer);
    if (v2Host) {
      v2Host.innerHTML = `<p class="banner">grades: ${esc(errCode(ve))}</p><button class="btn btn-sm" type="button" id="g2ClassicBtn">Use classic view</button>`;
      document.getElementById("g2ClassicBtn")?.addEventListener("click", showClassic);
    }
    showClassic();
  }
} catch (e) {
  if (root) {
    root.classList.remove("hidden");
    root.innerHTML = `<p class="banner">This page could not load<br>step: grades page - ${esc(errCode(e))}</p>`;
  }
  if (v2Host) {
    v2Host.innerHTML = `<p class="banner">step: grades page - ${esc(errCode(e))}</p><button class="btn btn-sm" type="button" id="g2ClassicBtn">Use classic view</button>`;
    document.getElementById("g2ClassicBtn")?.addEventListener("click", () => {
      v2Host.classList.add("hidden");
      if (root) root.classList.remove("hidden");
    });
  }
}
