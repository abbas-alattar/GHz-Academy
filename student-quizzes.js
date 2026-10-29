import { bootStudentNav } from "./student-nav.js";
import { protect } from "./auth-guard.js?v=auth8";
import { db } from "./firebase-config.js?v=auth8";
import { collection, query, where, getDocs, getDoc, doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { loadStudentDash, whenStudentStore } from "./student-dash-data.js?v=stu7";
import { renderQuizzesV2 } from "./QuizzesV2.js";
import { renderQuizResultV2, closeQuizResultV2 } from "./QuizResultV2.js";
import { renderQuizStartV2, renderQuizTakeV2, renderQuizDoneV2, updateQuizTakeClock } from "./QuizTakeV2.js";

const root = document.getElementById("quizRoot");
const fail = (step, e) => {
  console.error(step, e);
  if (root) root.innerHTML = `<p class="banner">This page could not load<br>${step}: ${(e && (e.code || e.message)) || e}</p>`;
};
const esc = (s) => String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/"/g,"&quot;");
const today = () => new Date().toISOString().slice(0, 10);
const fmtWhen = (v) => {
  if (!v) return "";
  try {
    const d = v.toDate ? v.toDate() : new Date(v);
    return d.toLocaleString();
  } catch { return ""; }
};

bootStudentNav("quizzes");
import("./StudentTheme.js").then((m) => { try { m.bootStudentTheme(); } catch (_) {} }).catch(() => {});
const quizTimer = setTimeout(() => {
  const host = document.getElementById("quizV2Root") || root;
  if (host && /Loading/.test(host.textContent || "")) {
    host.innerHTML = `<p class="banner">This page could not load<br>timeout</p><button class="btn btn-sm" type="button" id="qRetry">Retry</button>`;
    document.getElementById("qRetry")?.addEventListener("click", () => location.reload());
  }
}, 8000);
try {
  const { user, profile } = await protect("student");
  const studentName = (profile?.name || user.displayName || "").trim() || (user.email || "").split("@")[0];
  window.__ghzLiveName = studentName;
  try { const { healOwnNameOnce } = await import("./nameSync.js"); healOwnNameOnce(user.uid, studentName); } catch (_) {}
  const t0 = performance.now();
  loadStudentDash(true);
  const store = await whenStudentStore();
  const enrollments = store.enrollments || [];
  const courseDocs = enrollments.map((en) => {
    const c = store.courses?.[en.courseId];
    return c ? { ...c, id: c.id || en.courseId } : { id: en.courseId, title: en.courseTitle || en.courseId, status: "Open" };
  });
  const attempts = store.quizAttempts || [];
  const quizzes = (store.quizzes || []).map((q) => ({ ...q, courseTitle: store.courses?.[q.courseId]?.title || q.courseTitle }));
  try { console.log("[perf] Quizzes render", Math.round(performance.now() - t0) + "ms"); } catch {}

  const qCounts = {};
  let v2Ready = false;
  const v2Host = document.getElementById("quizV2Root");
  const classicRoot = root;
  const showClassic = () => {
    v2Ready = false;
    if (v2Host) v2Host.classList.add("hidden");
    classicRoot.classList.remove("hidden");
    showList();
  };
  const showV2 = () => {
    if (!v2Ready) return;
    classicRoot.classList.add("hidden");
    if (v2Host) v2Host.classList.remove("hidden");
  };

  const quizStatus = (q, att, closed) => {
    if (att && att.status === "graded") return { label: "Graded", cls: "badge-open" };
    if (att && att.status === "partial") return { label: "Partially graded", cls: "", style: "background:#7c3aed;color:#fff" };
    if (att) return { label: "Submitted", cls: "badge-soon" };
    if (closed) return { label: "Closed", cls: "badge-closed" };
    return { label: "Not started", cls: "badge-draft" };
  };
  const quizGrade = (att) => {
    if (!att || att.status !== "graded") return "—";
    const e = Number(att.score);
    const m = Number(att.maxScore);
    if (!Number.isFinite(e) || !Number.isFinite(m) || m <= 0) return "—";
    return Math.round((e / m) * 100) + "/100";
  };
  const showList = () => {
    const t = today();
    root.innerHTML = quizzes.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Quiz</th><th>Status</th><th>Grade</th><th></th></tr></thead><tbody>` +
      quizzes.map((q) => {
        const att = attempts.find((a) => a.quizId === q.id);
        const closed = q.dueDate && String(q.dueDate) < t && !att;
        const st = quizStatus(q, att, closed);
        const canStart = !att && !closed;
        const canRev = att && (att.status === "graded" || att.status === "partial");
        const act = canStart ? `<button class="btn btn-sm" type="button" data-start="${q.id}">Start</button>` : canRev ? `<button class="btn btn-sm" type="button" data-rev="${q.id}">Open</button>` : "";
        const badge = `<span class="badge ${st.cls}" ${st.style ? `style="${st.style}"` : ""}>${st.label}</span>`;
        return `<tr><td><strong>${esc(q.title)}</strong><p style="color:var(--muted);font-size:.85rem;margin-top:4px">due ${esc(q.dueDate || "—")}</p></td><td>${badge}</td><td>${quizGrade(att)}</td><td>${act}</td></tr>`;
      }).join("") +
      `</tbody></table></div>` : "<p>No quizzes yet.</p>";
    root.querySelectorAll("[data-start]").forEach((b) => b.onclick = () => confirmStart(quizzes.find((x) => x.id === b.dataset.start)));
    root.querySelectorAll("[data-rev]").forEach((b) => b.onclick = () => showReview(quizzes.find((x) => x.id === b.dataset.rev)));
  };

  const showReview = async (q) => {
    const att = attempts.find((a) => a.quizId === q.id);
    if (!att || (att.status !== "graded" && att.status !== "partial")) return;
    root.textContent = "Loading…";
    let qs = [];
    try {
      const qq = await getDocs(query(collection(db, "quizQuestions"), where("courseId", "==", q.courseId), where("quizId", "==", q.id)));
      qs = qq.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order || 0) - (b.order || 0));
    } catch (e) { root.innerHTML = `<p class="banner">quizQuestions: ${e.code || e.message}</p>`; return; }
    const scores = att.questionScores || {};
    const fb = typeof att.feedback === "string" ? att.feedback : "";
    root.innerHTML = `<p><button class="btn btn-sm btn-ghost" type="button" id="backRev">← Quizzes</button></p>
      <h3>${esc(q.title)}</h3>
      ${qs.map((qq, i) => {
        const ans = (att.answers || {})[qq.id];
        const pts = scores[qq.id];
        const max = Number(qq.points || 0);
        let shown = ans;
        if (qq.type === "mcq" && qq.options && ans != null) shown = qq.options[Number(ans)] ?? ans;
        let mark = "";
        if (qq.type === "mcq" && pts != null) mark = Number(pts) >= max && max > 0 ? `<span style="color:#16a34a">Correct</span>` : `<span style="color:#dc2626">Incorrect</span>`;
        return `<article class="kpi" style="margin-top:12px"><strong>${i + 1}. ${esc(qq.text)}</strong>
          <p>${esc(shown ?? "—")}</p><p>${pts == null ? "—" : pts}/${max} ${mark}</p></article>`;
      }).join("")}
      ${fb ? `<p><strong>Feedback</strong><br>${esc(fb)}</p>` : ""}`;
    document.getElementById("backRev").onclick = showList;
  };
  const classicStart = (q) => {
    root.innerHTML = `<article class="kpi">
      <h3>${esc(q.title)}</h3>
      <p>${esc(q.instructions || "")}</p>
      <p>Time limit: ${q.timeLimitMinutes ? q.timeLimitMinutes + " minutes" : "None"} · due ${esc(q.dueDate || "—")}</p>
      <p><button class="btn" type="button" id="beginQ">Begin</button>
      <button class="btn btn-ghost" type="button" id="cancelQ">Cancel</button></p>
    </article>`;
    document.getElementById("cancelQ").onclick = () => { if (v2Ready) { paintV2(); showV2(); } else showList(); };
    document.getElementById("beginQ").onclick = () => takeQuiz(q, true);
  };
  const confirmStart = (q) => {
    if (!q) return;
    if (attempts.find((a) => a.quizId === q.id)) { showList(); return; }
    classicRoot.classList.remove("hidden");
    if (v2Host) v2Host.classList.add("hidden");
    const ok = renderQuizStartV2({
      host: root,
      quiz: q,
      questionCount: Number(q.questionCount) || undefined,
      onBack: () => { if (v2Ready) { paintV2(); showV2(); } else showList(); },
      onBegin: () => takeQuiz(q, false),
      onClassic: () => classicStart(q)
    });
    if (!ok) classicStart(q);
  };

  const takeQuiz = async (q, forceClassic) => {
    if (attempts.find((a) => a.quizId === q.id)) { showList(); return; }
    classicRoot.classList.remove("hidden");
    if (v2Host) v2Host.classList.add("hidden");
    root.textContent = "Loading…";
    let qs = [];
    try {
      const qq = await getDocs(query(collection(db, "quizQuestions"), where("courseId", "==", q.courseId), where("quizId", "==", q.id)));
      qs = qq.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order || 0) - (b.order || 0));
    } catch (e) {
      root.innerHTML = `<p class="banner">quizQuestions: ${e.code || e.message}</p>`;
      return;
    }
    const answers = {};
    let left = q.timeLimitMinutes ? Number(q.timeLimitMinutes) * 60 : null;
    const totalSec = left;
    let warned = false;
    let tick = null;
    let useV2 = !forceClassic;
    let timesUp = false;
    let confirmOpen = false;
    let subErr = "";
    const answered = () => qs.filter((x) => answers[x.id] != null && answers[x.id] !== "").length;

    const paintClassic = () => {
      const n = answered();
      root.innerHTML = `
        <p id="qclock" style="font-weight:600">${left != null ? Math.floor(left / 60) + ":" + String(left % 60).padStart(2, "0") : ""}</p>
        <p id="qwarn" class="banner" ${left != null && left <= 60 && left > 0 ? "" : "hidden"}>1 minute left</p>
        <div style="height:8px;background:#e5e7eb;border-radius:99px;overflow:hidden;margin:10px 0"><div style="height:100%;width:${qs.length ? Math.round(n / qs.length * 100) : 0}%;background:#16a34a"></div></div>
        <p>${n} of ${qs.length} answered</p>
        ${qs.map((qq, i) => {
          if (qq.type === "mcq") {
            return `<article class="kpi" style="margin-top:12px"><strong>${i + 1}. ${esc(qq.text)}</strong>` +
              (qq.options || []).map((o, oi) => `<p><label><input type="radio" name="qa${qq.id}" value="${oi}" ${String(answers[qq.id]) === String(oi) ? "checked" : ""} /> ${esc(o)}</label></p>`).join("") +
              `</article>`;
          }
          return `<article class="kpi" style="margin-top:12px"><strong>${i + 1}. ${esc(qq.text)}</strong>
            <textarea data-sa="${qq.id}" style="width:100%;min-height:70px;padding:12px;border:1px solid var(--line);border-radius:10px;font:inherit">${esc(answers[qq.id] || "")}</textarea></article>`;
        }).join("")}
        <p id="qsuberr" class="banner" hidden></p>
        <p><button class="btn" type="button" id="subQuiz">Submit quiz</button></p>`;
      qs.forEach((qq) => {
        if (qq.type === "mcq") {
          root.querySelectorAll(`[name="qa${qq.id}"]`).forEach((r) => r.onchange = () => { answers[qq.id] = Number(r.value); paint(); });
        } else {
          const ta = root.querySelector(`[data-sa="${qq.id}"]`);
          if (ta) ta.oninput = () => { answers[qq.id] = ta.value; };
        }
      });
      const sub = document.getElementById("subQuiz");
      if (sub) sub.onclick = () => doSubmit(false);
    };
    const paintV2Take = () => {
      const missing = qs.length - answered();
      const ok = renderQuizTakeV2({
        host: root,
        quiz: q,
        questions: qs,
        answers,
        left,
        totalSec,
        timesUp,
        confirm: confirmOpen && missing > 0,
        missing,
        err: subErr,
        onAnswer: (id, oi) => { answers[id] = Number(oi); paint(); },
        onText: (id, val) => { answers[id] = val; },
        onSubmit: () => doSubmit(false),
        onReview: () => { confirmOpen = false; paint(); },
        onForce: () => doSubmit(true),
        onJump: (idx) => {
          const el = root.querySelector(`[data-qt2-q="${idx}"]`);
          if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
        },
        onClassic: () => { useV2 = false; paintClassic(); }
      });
      if (!ok) { useV2 = false; paintClassic(); }
    };
    const paint = () => { if (useV2) paintV2Take(); else paintClassic(); };

    const doSubmit = async (auto) => {
      const missing = qs.length - answered();
      if (!auto) {
        if (useV2 && missing > 0) { confirmOpen = true; paint(); return; }
        const msg = missing > 0
          ? `You have ${missing} unanswered question(s). Submit anyway?`
          : "Submit this quiz?";
        if (!confirm(msg)) return;
      }
      confirmOpen = false;
      try {
        const id = q.id + "_" + user.uid;
        await setDoc(doc(db, "quizAttempts", id), {
          quizId: q.id,
          courseId: q.courseId,
          uid: user.uid,
          studentName,
          answers,
          status: "submitted",
          submittedAt: serverTimestamp()
        });
        try { window.__ghzPingActivity?.(); } catch (_) {}
        if (tick) clearInterval(tick);
        attempts.push({ id, quizId: q.id, submittedAt: new Date() });
        const goHome = () => { if (v2Ready) { paintV2(); showV2(); } else showList(); };
        if (useV2) {
          renderQuizDoneV2({ host: root, onBack: goHome, onClassic: goHome });
        } else {
          root.innerHTML = `<p>Submitted. Your score will appear after your trainer grades it.</p>
            <p><button class="btn" type="button" id="backQ">Back to quizzes</button></p>`;
          document.getElementById("backQ").onclick = goHome;
        }
      } catch (e) {
        if (useV2) { subErr = "quizAttempts: " + (e.code || e.message); paint(); return; }
        const err = document.getElementById("qsuberr");
        if (err) {
          err.hidden = false;
          err.textContent = "quizAttempts: " + (e.code || e.message);
          let retry = document.getElementById("retrySub");
          if (!retry) {
            err.insertAdjacentHTML("afterend", `<p><button class="btn" type="button" id="retrySub">Try again</button></p>`);
            document.getElementById("retrySub").onclick = () => doSubmit(true);
          }
        } else {
          root.insertAdjacentHTML("afterbegin", `<p class="banner">quizAttempts: ${e.code || e.message}</p><p><button class="btn" type="button" id="retrySub">Try again</button></p>`);
          document.getElementById("retrySub").onclick = () => doSubmit(true);
        }
      }
    };

    paint();
    if (left != null) {
      tick = setInterval(() => {
        left -= 1;
        if (useV2) {
          if (left <= 0) { timesUp = true; paint(); clearInterval(tick); doSubmit(true); return; }
          updateQuizTakeClock(root, left, totalSec);
          return;
        }
        const clock = document.getElementById("qclock");
        if (clock) clock.textContent = Math.floor(Math.max(left, 0) / 60) + ":" + String(Math.max(left, 0) % 60).padStart(2, "0");
        if (left <= 60 && left > 0 && !warned) {
          warned = true;
          const w = document.getElementById("qwarn");
          if (w) w.hidden = false;
        }
        if (left <= 0) { clearInterval(tick); doSubmit(true); }
      }, 1000);
    }
  };

  const paintV2 = () => {
    if (!v2Host) return;
    const ok = renderQuizzesV2({
      host: v2Host,
      courses: courseDocs,
      quizzes,
      attempts,
      onStart: (id) => {
        classicRoot.classList.remove("hidden");
        if (v2Host) v2Host.classList.add("hidden");
        confirmStart(quizzes.find((x) => x.id === id));
      },
      onView: (id) => {
        const q = quizzes.find((x) => x.id === id);
        const att = attempts.find((a) => a.quizId === id);
        const course = courseDocs.find((c) => c.id === q?.courseId) || { title: q?.courseTitle };
        renderQuizResultV2({ host: document.getElementById("qr2Root"), quiz: q, attempt: att, course });
      },
      onClassic: showClassic,
      onReady: () => { v2Ready = true; showV2(); }
    });
    if (!ok) showClassic();
  };
  try { paintV2(); } catch (e) { showClassic(); }
  if (!v2Ready) showList();
} catch (e) {
  fail("quizzes page", e);
}
