import { bootStudentNav } from "./student-nav.js";
import { protect } from "./auth-guard.js?v=auth8";
import { db } from "./firebase-config.js?v=auth8";
import { getDoc, doc } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { loadStudentDash, whenStudentStore } from "./student-dash-data.js?v=stu7";
import { esc, attPct, ring } from "./grades-shell.js";
import { homeworkGradeItem, quizGradeItem, courseAverageResolved, getParent } from "./student-grade-math.js";
import { studentGradeDistributionHtml } from "./student-grade-distribution.js";
const root = document.getElementById("root");
const fail = (step, e) => { console.error(step, e); root.innerHTML = `<p class="banner">This page could not load<br>${step}: ${(e&&(e.code||e.message))||e}</p>`; };
bootStudentNav("grades");
try {
  const { user } = await protect("student");
  const t0 = performance.now();
  loadStudentDash(true);
  const store = await whenStudentStore();
  const ens = store.enrollments || [];
  let subs = store.submissions || [];
  let atts = store.quizAttempts || [];
  let attRecs = store.attendance || [];
  const today = new Date().toISOString().slice(0,10);
  const need = [];
  const activeCards = [];
  const doneCards = [];
  const courseCache = new Map(Object.entries(store.courses || {}).map(([id,c]) => [id, c]));
  const loadCourse = async (id) => {
    if (courseCache.has(id)) return courseCache.get(id);
    try {
      const snap = await getDoc(doc(db, "courses", id));
      const c = snap.exists() ? { id: snap.id, ...snap.data() } : { id, title: id };
      courseCache.set(id, c);
      return c;
    } catch (e) {
      console.warn(e.code || e, "courses/" + id);
      const c = { id, title: id };
      courseCache.set(id, c);
      return c;
    }
  };
  try { console.log("[perf] Grades render", Math.round(performance.now() - t0) + "ms"); } catch {}
  for (const en of ens) {
    const course = await loadCourse(en.courseId);
    let assigns = (store.assignments || []).filter((a) => a.courseId === en.courseId);
    let quizzes = (store.quizzes || []).filter((q) => q.courseId === en.courseId);
    const items = [];
    const pack = { submissions: subs.filter(s=>s.courseId===en.courseId), quizAttempts: atts.filter(s=>s.courseId===en.courseId) };
    const seenHw = new Set();
    const seenQz = new Set();
    for (const a of assigns) {
      const s = subs.find(x=>x.assignmentId===a.id);
      seenHw.add(a.id);
      const parent = await getParent("assignments", a.id);
      const asg = parent.doc || a;
      let st="Not submitted", kind="missing", score="—", p=null;
      const gi = homeworkGradeItem(s, asg, parent);
      if (gi) { st="Graded"; kind="ok"; score=gi.display; p=gi.pct; }
      else if (s) { st="Submitted"; kind="sub"; }
      const late = a.dueDate && String(a.dueDate)<today && (!s || s.status!=="graded");
      if (late && !s) { st="Late"; kind="late"; need.push(`${a.title} (${en.courseTitle||en.courseId})`); }
      items.push({type:"Homework", title: asg.title || a.title, due:a.dueDate, score, p, st, kind});
    }
    for (const s of subs.filter(x=>x.courseId===en.courseId && x.status==="graded" && !seenHw.has(x.assignmentId))) {
      const parent = await getParent("assignments", s.assignmentId);
      const gi = homeworkGradeItem(s, parent.doc, parent);
      if (gi) items.push({type:"Homework", title:gi.title, due:"—", score:gi.display, p:gi.pct, st:"Graded", kind:"ok"});
    }
    for (const q of quizzes) {
      const s = atts.find(x=>x.quizId===q.id);
      seenQz.add(q.id);
      const parent = await getParent("quizzes", q.id);
      const quiz = parent.doc || q;
      let st="Not submitted", kind="missing", score="—", p=null;
      const gi = quizGradeItem(s, quiz, parent);
      if (gi) { st="Graded"; kind="ok"; score=gi.display; p=gi.pct; }
      else if (s?.status==="partial") { st="Partial"; kind="partial"; }
      else if (s) { st="Submitted"; kind="sub"; }
      if (q.dueDate && String(q.dueDate)<today && !s) { st="Late"; kind="late"; need.push(`${q.title} (${en.courseTitle||en.courseId})`); }
      items.push({type:"Quiz", title: quiz.title || q.title, due:q.dueDate, score, p, st, kind});
    }
    for (const s of atts.filter(x=>x.courseId===en.courseId && x.status==="graded" && !seenQz.has(x.quizId))) {
      const parent = await getParent("quizzes", s.quizId);
      const gi = quizGradeItem(s, parent.doc, parent);
      if (gi) items.push({type:"Quiz", title:gi.title, due:"—", score:gi.display, p:gi.pct, st:"Graded", kind:"ok"});
    }
    const avgPack = await courseAverageResolved(en.courseId, pack);
    const avg = avgPack.pct;
    const gradedN = avgPack.count;
    const total = assigns.length + quizzes.length;
    const ap = attPct(attRecs.filter(r=>r.courseId===en.courseId));
    const badge = (it) => {
      const map = {Graded:"badge-open", Partial:"", Submitted:"badge-soon", "Not submitted":"badge-draft", Late:""};
      const extra = it.st==="Partial" ? `style="background:#7c3aed;color:#fff"` : it.st==="Late" ? `style="background:#ea580c;color:#fff"` : "";
      return `<span class="badge ${map[it.st]||"badge-draft"}" ${extra}>${it.st}</span>`;
    };
    let dist = "";
    try { dist = await studentGradeDistributionHtml(user.uid, en.courseId); }
    catch (e) {
      const step = e.step || "gradeSchemes";
      const code = (e && (e.code || e.message)) || e;
      dist = `<p class="banner">${step}: ${code}</p>`;
    }
    const html = `<article class="kpi" style="margin-bottom:18px"><h3>${esc(course.title||en.courseTitle||en.courseId)}</h3>
      <div style="display:flex;gap:24px;align-items:center;flex-wrap:wrap">${ring(avg)}<div><p>Attendance ${ap==null?"—":ap+"%"}</p><p>Graded ${gradedN} of ${total} items</p></div></div>
      ${dist}
      <div class="table-wrap" style="margin-top:12px"><table class="data"><thead><tr><th>Type</th><th>Title</th><th>Due</th><th>Score</th><th>%</th><th>Status</th></tr></thead><tbody>`+
      items.map(it=>`<tr><td>${it.type}</td><td>${esc(it.title)}</td><td>${esc(it.due||"—")}</td><td>${it.score}</td><td>${it.p==null?"—":it.p+"%"}</td><td>${badge(it)}</td></tr>`).join("")+
      `</tbody></table></div></article>`;
    if (course.status === "Completed") doneCards.push(html); else activeCards.push(html);
  }
  root.innerHTML = (need.length?`<p class="banner">Needs attention: ${need.map(esc).join("; ")}</p>`:"") +
    (activeCards.join("") || "") +
    (doneCards.length ? `<h2 style="margin:24px 0 12px;font-size:1.15rem;color:var(--navy)">Completed courses</h2>` + doneCards.join("") : "") +
    ((!activeCards.length && !doneCards.length) ? "<p>No enrolled courses.</p>" : "");
} catch(e){ fail("grades page", e); }
