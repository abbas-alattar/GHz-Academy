import { protect } from "./auth-guard.js?v=auth8";
import { auth, db } from "./firebase-config.js?v=auth8";
import { collection, query, where, getDocs, getDoc, addDoc, updateDoc, deleteDoc, doc, setDoc, serverTimestamp, deleteField } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { isCourseLocked, CompletedBanner, lockBtn, lockWriteMsg } from "./course-lock.js";

const root = document.getElementById("quizRoot");
const fail = (step, e) => {
  console.error(step, e);
  if (root) root.innerHTML = `<p class="banner">This page could not load<br>${step}: ${(e && (e.code || e.message)) || e}</p>`;
};

try {
  const { user } = await protect("trainer");
  const esc = (s) => String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/"/g,"&quot;");
  const badge = (s) => s === "Published"
    ? `<span class="badge badge-open">Published</span>`
    : `<span class="badge badge-draft">Draft</span>`;

  let courses = [];
  try {
    const cs = await getDocs(query(collection(db, "courses"), where("trainerIds", "array-contains", user.uid)));
    courses = cs.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    fail("courses", e);
    throw e;
  }

  const renderShell = () => {
    root.innerHTML = `
      <div id="quizLockBanner"></div>
      <div class="toolbar">
        <select id="quizCourse">${courses.map((c) => `<option value="${c.id}">${esc(c.title)}</option>`).join("") || `<option value="">No courses</option>`}</select>
        <button class="btn btn-sm" type="button" id="newQuiz">New quiz</button>
      </div>
      <p id="quizToast" class="toast" hidden></p>
      <div id="quizList"></div>
      <div id="quizEditor" class="hidden"></div>
      <div id="quizAttempts" class="hidden"></div>`;
  };
  renderShell();
  const listEl = () => document.getElementById("quizList");
  const edEl = () => document.getElementById("quizEditor");
  const sel = () => document.getElementById("quizCourse");
  const currentCourse = () => courses.find((c) => c.id === sel()?.value);
  const locked = () => isCourseLocked(currentCourse());

  const loadList = async () => {
    const box = listEl();
    const cid = sel()?.value;
    edEl().classList.add("hidden");
    const attEl = document.getElementById("quizAttempts");
    if (attEl) attEl.classList.add("hidden");
    box.classList.remove("hidden");
    const ban = document.getElementById("quizLockBanner");
    if (ban) ban.innerHTML = CompletedBanner(currentCourse());
    const nq = document.getElementById("newQuiz");
    if (nq) {
      if (locked()) { nq.disabled = true; nq.classList.add("lock-btn"); nq.title = "This course is completed and read-only."; }
      else { nq.disabled = false; nq.classList.remove("lock-btn"); nq.title = ""; }
    }
    if (!cid) { box.innerHTML = "<p>No courses are assigned to you yet.</p>"; return; }
    box.textContent = "Loading…";
    let quizzes = [];
    try {
      const qs = await getDocs(query(collection(db, "quizzes"), where("courseId", "==", cid)));
      quizzes = qs.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (e) {
      box.innerHTML = `<p class="banner">quizzes: ${e.code || e.message}</p>`;
      return;
    }
    const counts = {};
    for (const q of quizzes) {
      try {
        const qq = await getDocs(query(collection(db, "quizQuestions"), where("courseId", "==", cid), where("quizId", "==", q.id)));
        counts[q.id] = qq.size;
      } catch (e) {
        box.innerHTML = `<p class="banner">quizQuestions: ${e.code || e.message}</p>`;
        return;
      }
    }
    box.innerHTML = quizzes.length ? quizzes.map((q) => `
      <article class="kpi" style="margin-top:12px">
        <strong>${esc(q.title)}</strong> ${badge(q.status)}
        <p>Due ${esc(q.dueDate || "—")} · ${counts[q.id] || 0} questions</p>
        <button class="btn btn-sm" type="button" data-open="${q.id}">Attempts</button>
        ${locked() ? lockBtn("Edit") + lockBtn(q.status === "Published" ? "Unpublish" : "Publish") + lockBtn("Delete") : `<button class="btn btn-sm btn-ghost" type="button" data-edit="${q.id}">Edit</button>
        <button class="btn btn-sm" type="button" data-pub="${q.id}">${q.status === "Published" ? "Unpublish" : "Publish"}</button>
        <button class="btn btn-sm btn-warn" type="button" data-del="${q.id}">Delete</button>`}
      </article>`).join("") : "<p>No quizzes yet.</p>";

    box.querySelectorAll("[data-open]").forEach((b) => b.onclick = () => openAttempts(quizzes.find((x) => x.id === b.dataset.open)));
    box.querySelectorAll("[data-edit]").forEach((b) => b.onclick = () => openEditor(quizzes.find((x) => x.id === b.dataset.edit)));
    box.querySelectorAll("[data-pub]").forEach((b) => b.onclick = async () => {
      if (locked()) { toast("This course is completed and read-only."); return; }
      const q = quizzes.find((x) => x.id === b.dataset.pub);
      try {
        await updateDoc(doc(db, "quizzes", q.id), { status: q.status === "Published" ? "Draft" : "Published" });
        loadList();
      } catch (e) {
        box.insertAdjacentHTML("afterbegin", `<p class="banner">publish: ${lockWriteMsg(e)}</p>`);
      }
    });
    box.querySelectorAll("[data-del]").forEach((b) => b.onclick = async () => {
      if (locked()) { toast("This course is completed and read-only."); return; }
      const qid = b.dataset.del;
      const cid2 = sel().value;
      try {
        const { quizHasAttempts, blockedMsg, unpublishQuiz, deleteQuizCascade, showUnpublishPrompt } = await import("./trainer-delete-guard.js");
        const has = await quizHasAttempts(cid2, qid);
        if (has) {
          showUnpublishPrompt(box, blockedMsg("quiz"), async () => {
            try { await unpublishQuiz(qid); loadList(); }
            catch (e) { box.insertAdjacentHTML("afterbegin", `<p class="banner">unpublish: ${lockWriteMsg(e)}</p>`); }
          });
          return;
        }
        if (!confirm("Delete this quiz?")) return;
        await deleteQuizCascade(cid2, qid);
        loadList();
      } catch (e) {
        box.insertAdjacentHTML("afterbegin", `<p class="banner">delete quiz: ${lockWriteMsg(e)}</p>`);
      }
    });
  };

  const openEditor = async (quiz = {}) => {
    const cid = sel().value;
    if (!cid) return;
    listEl().classList.add("hidden");
    const editor = edEl();
    editor.classList.remove("hidden");
    let questions = [];
    let keys = {};
    if (quiz.id) {
      try {
        const qq = await getDocs(query(collection(db, "quizQuestions"), where("courseId", "==", cid), where("quizId", "==", quiz.id)));
        questions = qq.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order || 0) - (b.order || 0));
      } catch (e) {
        editor.innerHTML = `<p class="banner">quizQuestions: ${e.code || e.message}</p>`;
        return;
      }
      try {
        const kd = await getDocs(query(collection(db, "quizKeys"), where("courseId", "==", cid)));
        const hit = kd.docs.find((d) => d.id === quiz.id);
        if (hit) keys = hit.data().answers || {};
      } catch (e) {
        editor.innerHTML = `<p class="banner">quizKeys: ${e.code || e.message}</p><div id="edRest"></div>`;
      }
    }
    if (!questions.length) questions = [{ type: "mcq", text: "", options: ["", ""], points: 1, correct: 0 }];
    questions.forEach((q) => {
      if (q.id && keys[q.id] != null) q.correct = keys[q.id];
      if (q.correct == null) q.correct = 0;
      if (!q.options) q.options = ["", ""];
    });

    const paint = () => {
      if (locked()) {
        editor.innerHTML = `
          <p><button class="btn btn-sm btn-ghost" type="button" id="backQz">← Quizzes</button></p>
          <h3>${esc(quiz.title)}</h3>
          <p>${esc(quiz.instructions)}</p>
          <p>Time ${quiz.timeLimitMinutes ?? "—"} min · Due ${esc(quiz.dueDate || "—")}</p>
          ${questions.map((q, i) => {
            const opts = q.type === "mcq" ? (q.options || []).map((o, oi) => `<p>${esc(o)}${Number(q.correct) === oi ? " (correct)" : ""}</p>`).join("") : "<p>Short answer — graded later</p>";
            return `<article class="kpi" style="margin-bottom:10px"><strong>Q${i + 1}</strong> · ${q.points || 1} pts<p>${esc(q.text)}</p>${opts}</article>`;
          }).join("")}`;
        document.getElementById("backQz").onclick = () => { editor.classList.add("hidden"); listEl().classList.remove("hidden"); loadList(); };
        return;
      }
      editor.innerHTML = `
        <p><button class="btn btn-sm btn-ghost" type="button" id="backQz">← Quizzes</button></p>
        <label>Title</label><input id="qtitle" value="${esc(quiz.title)}" />
        <label>Instructions</label><textarea id="qinstr" style="width:100%;min-height:70px;padding:12px;border:1px solid var(--line);border-radius:10px;font:inherit">${esc(quiz.instructions)}</textarea>
        <label>Time limit (minutes, optional)</label><input id="qtime" type="number" value="${quiz.timeLimitMinutes ?? ""}" />
        <label>Due date</label><input id="qdue" type="date" value="${esc(quiz.dueDate)}" />
        <h3 style="margin:16px 0 8px">Questions</h3>
        <div id="qrows"></div>
        <p><button class="btn btn-sm" type="button" id="addQ">Add question</button>
        <button class="btn" type="button" id="saveQ">Save quiz</button></p>
        <p id="qerr" class="banner" hidden></p>`;
      const rows = document.getElementById("qrows");
      rows.innerHTML = questions.map((q, i) => {
        const opts = q.type === "mcq"
          ? (q.options || ["", ""]).map((o, oi) => `<p><label><input type="radio" name="corr${i}" ${Number(q.correct) === oi ? "checked" : ""} data-corr="${i}" value="${oi}" /> Option ${oi + 1}</label>
              <input data-opt="${i}_${oi}" value="${esc(o)}" /></p>`).join("") +
            ( (q.options || []).length < 6 ? `<button class="btn btn-sm btn-ghost" type="button" data-addopt="${i}">Add option</button>` : "")
          : `<p style="color:var(--muted);font-size:.9rem">Short answer — graded later</p>`;
        return `<article class="kpi" style="margin-bottom:10px"><strong>Q${i + 1}</strong>
          <select data-type="${i}"><option value="mcq" ${q.type === "mcq" ? "selected" : ""}>Multiple choice</option><option value="text" ${q.type === "text" ? "selected" : ""}>Short answer</option></select>
          <input data-text="${i}" placeholder="Question" value="${esc(q.text)}" />
          <label>Points</label><input type="number" data-pts="${i}" value="${q.points || 1}" />
          ${opts}
          <p><button class="btn btn-sm btn-ghost" type="button" data-up="${i}">Up</button>
          <button class="btn btn-sm btn-ghost" type="button" data-dn="${i}">Down</button>
          <button class="btn btn-sm btn-warn" type="button" data-rm="${i}">Delete</button></p></article>`;
      }).join("");

      const readForm = () => {
        quiz.title = document.getElementById("qtitle").value;
        quiz.instructions = document.getElementById("qinstr").value;
        const tm = document.getElementById("qtime").value;
        quiz.timeLimitMinutes = tm === "" ? null : Number(tm);
        quiz.dueDate = document.getElementById("qdue").value;
        questions.forEach((q, i) => {
          q.type = editor.querySelector(`[data-type="${i}"]`).value;
          q.text = editor.querySelector(`[data-text="${i}"]`).value;
          q.points = Number(editor.querySelector(`[data-pts="${i}"]`).value || 1);
          if (q.type === "mcq") {
            editor.querySelectorAll(`[data-corr="${i}"]`).forEach((r) => { if (r.checked) q.correct = Number(r.value); });
            q.options = [...editor.querySelectorAll(`[data-opt^="${i}_"]`)].map((inp) => inp.value);
            if (q.options.length < 2) q.options = ["", ""];
            if (q.options.length > 6) q.options = q.options.slice(0, 6);
          }
        });
      };
      document.getElementById("backQz").onclick = () => { editor.classList.add("hidden"); listEl().classList.remove("hidden"); loadList(); };
      document.getElementById("addQ").onclick = () => { readForm(); questions.push({ type: "mcq", text: "", options: ["", ""], points: 1, correct: 0 }); paint(); };
      editor.querySelectorAll("[data-type]").forEach((s) => s.onchange = () => { readForm(); questions[Number(s.dataset.type)].type = s.value; paint(); });
      editor.querySelectorAll("[data-addopt]").forEach((b) => b.onclick = () => { readForm(); const q = questions[Number(b.dataset.addopt)]; q.options = q.options || []; if (q.options.length < 6) q.options.push(""); paint(); });
      editor.querySelectorAll("[data-rm]").forEach((b) => b.onclick = () => { readForm(); questions.splice(Number(b.dataset.rm), 1); paint(); });
      editor.querySelectorAll("[data-up]").forEach((b) => b.onclick = () => { readForm(); const i = Number(b.dataset.up); if (i) { [questions[i - 1], questions[i]] = [questions[i], questions[i - 1]]; paint(); } });
      editor.querySelectorAll("[data-dn]").forEach((b) => b.onclick = () => { readForm(); const i = Number(b.dataset.dn); if (i < questions.length - 1) { [questions[i + 1], questions[i]] = [questions[i], questions[i + 1]]; paint(); } });
      document.getElementById("saveQ").onclick = async () => {
        if (locked()) { toast("This course is completed and read-only."); return; }
        readForm();
        const err = document.getElementById("qerr");
        err.hidden = true;
        const payload = {
          courseId: cid,
          title: quiz.title.trim(),
          instructions: quiz.instructions.trim(),
          timeLimitMinutes: quiz.timeLimitMinutes,
          dueDate: quiz.dueDate,
          status: quiz.status || "Draft",
          createdBy: user.uid
        };
        try {
          let qid = quiz.id;
          if (qid) await updateDoc(doc(db, "quizzes", qid), payload);
          else {
            const ref = await addDoc(collection(db, "quizzes"), { ...payload, createdAt: serverTimestamp() });
            qid = ref.id;
            quiz.id = qid;
          }
          const old = await getDocs(query(collection(db, "quizQuestions"), where("courseId", "==", cid), where("quizId", "==", qid)));
          for (const d of old.docs) await deleteDoc(d.ref);
          const answers = {};
          for (let i = 0; i < questions.length; i++) {
            const q = questions[i];
            const body = { quizId: qid, courseId: cid, order: i, type: q.type, text: q.text, points: Number(q.points || 1) };
            if (q.type === "mcq") body.options = (q.options || []).slice(0, 6);
            const ref = await addDoc(collection(db, "quizQuestions"), body);
            if (q.type === "mcq") answers[ref.id] = Number(q.correct || 0);
          }
          await setDoc(doc(db, "quizKeys", qid), { courseId: cid, answers });
          loadList();
        } catch (e) {
          err.hidden = false;
          err.textContent = "save quiz: " + lockWriteMsg(e);
        }
      };
    };
    paint();
  };

  const toast = (m) => {
    const t = document.getElementById("quizToast");
    if (!t) return;
    t.hidden = false; t.className = "toast ok"; t.textContent = m;
  };
  const stBadge = (at) => {
    if (!at) return `<span class="badge badge-draft">Not taken</span>`;
    if (at.status === "graded") {
      const pct = at.maxScore ? Math.round(Number(at.score) / Number(at.maxScore) * 100) : null;
      return `<span class="badge badge-open">Graded ${pct==null?"—":pct+"/100"}</span>`;
    }
    if (at.status === "partial") return `<span class="badge" style="background:#7c3aed;color:#fff">Partial</span>`;
    return `<span class="badge badge-soon">Submitted</span>`;
  };
  const openAttempts = async (quiz) => {
    if (!quiz) return;
    const cid = sel().value;
    listEl().classList.add("hidden");
    edEl().classList.add("hidden");
    const box = document.getElementById("quizAttempts");
    box.classList.remove("hidden");
    box.textContent = "Loading…";
    let ens = [], atts = [], questions = [];
    try {
      const es = await getDocs(query(collection(db, "enrollments"), where("courseId", "==", cid)));
      ens = es.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (e) { box.innerHTML = `<p class="banner">enrollments: ${e.code || e.message}</p>`; return; }
    try {
      const as = await getDocs(query(collection(db, "quizAttempts"), where("courseId", "==", cid)));
      atts = as.docs.map((d) => ({ id: d.id, ...d.data() })).filter((a) => a.quizId === quiz.id);
    } catch (e) { box.innerHTML = `<p class="banner">quizAttempts: ${e.code || e.message}</p>`; return; }
    try {
      const qq = await getDocs(query(collection(db, "quizQuestions"), where("courseId", "==", cid), where("quizId", "==", quiz.id)));
      questions = qq.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order || 0) - (b.order || 0));
    } catch (e) { box.innerHTML = `<p class="banner">quizQuestions: ${e.code || e.message}</p>`; return; }
    const maxAll = questions.reduce((s, q) => s + Number(q.points || 0), 0);
    const graded = atts.filter((a) => a.status === "graded");
    const avg = graded.length ? Math.round(graded.reduce((s, a) => s + Number(a.score || 0), 0) / graded.length * 10) / 10 : 0;
    const drawTable = () => {
      box.innerHTML = `<p><button class="btn btn-sm btn-ghost" type="button" id="backAtt">← Quizzes</button></p>
        <h3>${esc(quiz.title)}</h3>
        <p>Average score ${avg} · Graded ${graded.length}/${ens.length}</p>
        <p>${locked() ? lockBtn("Auto-grade multiple choice") : `<button class="btn btn-sm" type="button" id="autoGrade">Auto-grade multiple choice</button>`}</p>
        <p id="attErr" class="banner" hidden></p>
        <div class="table-wrap"><table class="data"><thead><tr><th>Student</th><th>Status</th><th></th></tr></thead><tbody>` +
        ens.map((en) => {
          const at = atts.find((a) => a.uid === en.uid);
          return `<tr><td>${esc(en.studentName || en.studentEmail || en.uid)}</td><td>${stBadge(at)}</td><td>${at ? `<button class="btn btn-sm" type="button" data-rev="${at.id}">Review</button> ${locked() ? lockBtn("Allow retake") : `<button class="btn btn-sm btn-ghost" type="button" data-retake="${at.id}">Allow retake</button>`}` : ""}</td></tr>`;
        }).join("") + `</tbody></table></div><div id="revPanel"></div>`;
      document.getElementById("backAtt").onclick = () => { box.classList.add("hidden"); loadList(); };
      const ag = document.getElementById("autoGrade"); if (ag) ag.onclick = async () => {
        if (locked()) { toast("This course is completed and read-only."); return; }
        const err = document.getElementById("attErr");
        err.hidden = true;
        let key = {};
        try {
          const kd = await getDoc(doc(db, "quizKeys", quiz.id));
          key = kd.exists() ? (kd.data().answers || {}) : {};
        } catch (e) { err.hidden = false; err.textContent = "quizKeys: " + (e.code || e.message); return; }
        const hasText = questions.some((q) => q.type === "text");
        let n = 0;
        try {
          for (const at of atts.filter((a) => a.status === "submitted")) {
            const questionScores = { ...(at.questionScores || {}) };
            for (const q of questions) {
              if (q.type !== "mcq") continue;
              const chosen = (at.answers || {})[q.id];
              questionScores[q.id] = Number(chosen) === Number(key[q.id]) ? Number(q.points || 0) : 0;
            }
            const score = Object.values(questionScores).reduce((s, v) => s + Number(v || 0), 0);
            const allScored = questions.every((q) => questionScores[q.id] != null);
            await updateDoc(doc(db, "quizAttempts", at.id), {
              questionScores, score: Number(score), maxScore: Number(maxAll),
              gradedBy: user.uid, gradedAt: serverTimestamp(),
              status: hasText ? "partial" : "graded"
            });
            at.questionScores = questionScores; at.score = score; at.maxScore = maxAll; at.status = hasText ? "partial" : "graded";
            n++;
          }
          toast("Graded " + n + " attempts");
          openAttempts(quiz);
        } catch (e) { err.hidden = false; err.textContent = "auto-grade: " + lockWriteMsg(e); }
      };
      box.querySelectorAll("[data-retake]").forEach((b) => b.onclick = async () => {
        if (locked()) { toast("This course is completed and read-only."); return; }
        if (!confirm("Allow this student to retake? This deletes their attempt.")) return;
        try { await deleteDoc(doc(db, "quizAttempts", b.dataset.retake)); openAttempts(quiz); }
        catch (e) { document.getElementById("attErr").hidden = false; document.getElementById("attErr").textContent = lockWriteMsg(e); }
      });
      const openReview = async (idx) => {
        const withAtt = ens.map((en) => ({ en, at: atts.find((a) => a.uid === en.uid) })).filter((x) => x.at);
        if (!withAtt.length) return;
        const cur = Math.max(0, Math.min(idx, withAtt.length - 1));
        const { en, at } = withAtt[cur];
        let key = {};
        try {
          const kd = await getDoc(doc(db, "quizKeys", quiz.id));
          key = kd.exists() ? (kd.data().answers || {}) : {};
        } catch (e) { document.getElementById("revPanel").innerHTML = `<p class="banner">quizKeys: ${e.code || e.message}</p>`; return; }
        const scores = { ...(at.questionScores || {}) };
        const comments = { ...(at.feedback || {}) };
        const pane = document.getElementById("revPanel");
        const ro = locked();
        pane.innerHTML = `<article class="kpi" style="margin-top:16px"><h3>${esc(en.studentName || en.uid)} (${cur + 1}/${withAtt.length})</h3>
          ${questions.map((q) => {
            const ans = (at.answers || {})[q.id];
            if (q.type === "mcq") {
              const chosen = q.options?.[Number(ans)] ?? ans;
              const correct = q.options?.[Number(key[q.id])] ?? key[q.id];
              return `<p><strong>${esc(q.text)}</strong><br>Student: ${esc(chosen ?? "—")}<br>Correct: ${esc(correct ?? "—")}<br>Points: ${scores[q.id] ?? 0}/${q.points || 0}</p>`;
            }
            if (ro) {
              const pts = scores[q.id];
              return `<p><strong>${esc(q.text)}</strong><br>${esc(ans ?? "—")}<br>${pts == null ? "Not graded. The course is completed." : `Points: ${pts}/${q.points || 0}`}<br>${esc(typeof comments === "string" ? "" : (comments[q.id] || ""))}</p>`;
            }
            return `<p><strong>${esc(q.text)}</strong><br>${esc(ans ?? "—")}<br>
              <label>Points (0–${q.points || 0})</label><input type="number" min="0" max="${q.points || 0}" data-pts="${q.id}" value="${scores[q.id] ?? ""}" />
              <label>Comment</label><input data-fb="${q.id}" value="${esc(typeof comments === "string" ? "" : (comments[q.id] || ""))}" /></p>`;
          }).join("")}
          ${ro ? `<p>${at.status === "graded" ? esc(typeof at.feedback === "string" ? at.feedback : "") : (at.status === "graded" ? "" : "Not graded. The course is completed.")}</p>` : `<label>Overall feedback</label><textarea id="ovFb" style="width:100%;min-height:60px;padding:12px;border:1px solid var(--line);border-radius:10px;font:inherit">${esc(typeof at.feedback === "string" ? at.feedback : "")}</textarea>`}
          <p>${ro ? lockBtn("Save grade") + lockBtn("Remove grade") : `<button class="btn" type="button" id="saveGr">Save grade</button>`}
          <button class="btn btn-ghost" type="button" id="prevSt">Previous</button>
          <button class="btn btn-ghost" type="button" id="nextSt">Next</button>
          ${ro ? "" : `<button class="btn btn-warn" type="button" id="rmGr">Remove grade</button>`}</p>
          <p id="grErr" class="banner" hidden></p></article>`;
        document.getElementById("prevSt").onclick = () => openReview(cur - 1);
        document.getElementById("nextSt").onclick = () => openReview(cur + 1);
        const sg = document.getElementById("saveGr"); if (sg) sg.onclick = async () => {
          if (locked()) { toast("This course is completed and read-only."); return; }
          const err = document.getElementById("grErr"); err.hidden = true;
          const questionScores = { ...(at.questionScores || {}) };
          for (const q of questions) {
            if (q.type === "text") {
              const inp = pane.querySelector(`[data-pts="${q.id}"]`);
              let v = Number(inp?.value);
              if (Number.isNaN(v)) continue;
              const max = Number(q.points || 0);
              if (v > max) v = max;
              if (v < 0) v = 0;
              questionScores[q.id] = v;
            }
          }
          const score = questions.reduce((s, q) => s + Number(questionScores[q.id] || 0), 0);
          const all = questions.every((q) => questionScores[q.id] != null);
          const fb = document.getElementById("ovFb").value;
          try {
            await updateDoc(doc(db, "quizAttempts", at.id), {
              questionScores, score: Number(score), maxScore: Number(maxAll),
              gradedBy: user.uid, gradedAt: serverTimestamp(),
              feedback: fb, status: all ? "graded" : "partial"
            });
            at.questionScores = questionScores; at.score = score; at.maxScore = maxAll; at.status = all ? "graded" : "partial"; at.feedback = fb;
            openAttempts(quiz);
          } catch (e) { err.hidden = false; err.textContent = "save grade: " + lockWriteMsg(e); }
        };
        const rg = document.getElementById("rmGr"); if (rg) rg.onclick = async () => {
          if (locked()) { toast("This course is completed and read-only."); return; }
          if (!confirm("Remove this grade?")) return;
          try {
            await updateDoc(doc(db, "quizAttempts", at.id), {
              status: "submitted",
              score: deleteField(), maxScore: deleteField(), questionScores: deleteField(),
              gradedBy: deleteField(), gradedAt: deleteField(), feedback: deleteField()
            });
            openAttempts(quiz);
          } catch (e) { document.getElementById("grErr").hidden = false; document.getElementById("grErr").textContent = lockWriteMsg(e); }
        };
      };
      box.querySelectorAll("[data-rev]").forEach((b) => b.onclick = () => {
        const withAtt = ens.map((en) => ({ en, at: atts.find((a) => a.uid === en.uid) })).filter((x) => x.at);
        const i = withAtt.findIndex((x) => x.at.id === b.dataset.rev);
        openReview(i < 0 ? 0 : i);
      });
    };
    drawTable();
  };

  document.getElementById("newQuiz").onclick = () => { if (locked()) { toast("This course is completed and read-only."); return; } openEditor({ title: "", instructions: "", timeLimitMinutes: null, dueDate: "", status: "Draft" }); }
  sel().onchange = loadList;
  await loadList();
} catch (e) {
  fail("quizzes page", e);
}
