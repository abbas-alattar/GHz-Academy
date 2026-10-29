import { createElement as e, useEffect, useRef, useState } from "https://esm.sh/react@18.3.1";
import { createRoot } from "https://esm.sh/react-dom@18.3.1/client";
import { createPortal } from "https://esm.sh/react-dom@18.3.1";
import { db } from "./firebase-config.js?v=auth8";
import { collection, doc, getDocs, query, serverTimestamp, setDoc, where } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { statusBadgeHtml } from "./portal-status.js";

function fbErr(er) { return String((er?.code || "") + " " + (er?.message || er)).trim(); }

function clock(sec) {
  if (sec == null) return "—";
  const s = Math.max(0, Number(sec) || 0);
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}

function dueChip(q) {
  const d = String(q?.dueDate ?? "").trim();
  if (!d) return "Due —";
  try {
    const dt = new Date(d.length <= 10 ? d + "T12:00:00" : d);
    if (Number.isNaN(dt.getTime())) return "Due " + d;
    return "Due " + dt.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  } catch { return "Due " + d; }
}

function isTF(qq) {
  const opts = (qq?.options || []).map((x) => String(x).trim().toLowerCase());
  return qq?.type === "mcq" && opts.length === 2 && opts.includes("true") && opts.includes("false");
}

function Icon({ d }) {
  return e("svg", { viewBox: "0 0 24 24", width: 14, height: 14, fill: "none", stroke: "currentColor", strokeWidth: 2 },
    e("path", { d, strokeLinecap: "round", strokeLinejoin: "round" }));
}

function HeaderCard({ quiz, course, qs, limOk, lim, onBack }) {
  const pts = qs.reduce((n, x) => n + (Number(x.points) || 0), 0);
  return e("div", { className: "sq2-head" },
    e("button", { type: "button", className: "sq2-back", onClick: onBack }, "← Quizzes"),
    e("h1", null, quiz.title || "Quiz"),
    e("div", { className: "sq2-course" },
      e("span", null, course?.title || quiz.courseTitle || ""),
      e("span", { dangerouslySetInnerHTML: { __html: statusBadgeHtml(course || {}) } })
    ),
    e("div", { className: "sq2-chips" },
      e("span", { className: "sq2-chip" }, e(Icon, { d: "M12 8v4l3 3M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20z" }), limOk ? lim + " min" : "No limit"),
      e("span", { className: "sq2-chip" }, e(Icon, { d: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" }), qs.length + " questions"),
      e("span", { className: "sq2-chip" }, e(Icon, { d: "M12 8l2 6 6 .5-4.5 4 1.5 6-5-3-5 3 1.5-6L4 14.5 10 14z" }), pts + " pts"),
      e("span", { className: "sq2-chip" }, e(Icon, { d: "M8 7V3m8 4V3M3 11h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" }), dueChip(quiz))
    ),
    quiz.instructions ? e("div", { className: "sq2-inst" }, quiz.instructions) : null
  );
}

function TakeApp({ quiz, course, uid, studentName, onBack, onSubmitted }) {
  const [phase, setPhase] = useState("load");
  const [qs, setQs] = useState([]);
  const [err, setErr] = useState("");
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState({});
  const [left, setLeft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [subErr, setSubErr] = useState("");
  const [timesUp, setTimesUp] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [score, setScore] = useState(null);
  const tick = useRef(null);
  const answersRef = useRef({});
  const qsRef = useRef([]);
  answersRef.current = answers;
  qsRef.current = qs;
  const lim = Number(quiz?.timeLimitMinutes);
  const limOk = Number.isFinite(lim) && lim > 0;

  const loadQs = async () => {
    setPhase("load"); setErr("");
    try {
      if (String(quiz?.status || "") !== "Published") {
        setQs([]); setPhase("unavailable"); return;
      }
      const now = Date.now();
      const sAt = quiz?.startAt?.toDate ? quiz.startAt.toDate().getTime() : (quiz?.startAt ? new Date(quiz.startAt).getTime() : 0);
      const eAt = quiz?.endAt?.toDate ? quiz.endAt.toDate().getTime() : (quiz?.endAt ? new Date(quiz.endAt).getTime() : 0);
      if ((sAt && now < sAt) || (eAt && now > eAt)) { setQs([]); setPhase("unavailable"); return; }
      const snap = await getDocs(query(
        collection(db, "quizQuestions"),
        where("quizId", "==", quiz.id),
        where("courseId", "==", quiz.courseId)
      ));
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order || 0) - (b.order || 0));
      setQs(rows);
      setPhase(rows.length ? "confirm" : "unavailable");
    } catch (er) {
      setErr("quizQuestions: " + fbErr(er));
      setPhase("error");
    }
  };
  useEffect(() => { loadQs(); return () => { if (tick.current) clearInterval(tick.current); }; }, [quiz?.id]);

  const startBtn = useRef(null);
  useEffect(() => {
    if (phase !== "confirm") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    setTimeout(() => startBtn.current?.focus?.(), 20);
    const onKey = (ev) => { if (ev.key === "Escape") onBack?.(); };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [phase, onBack]);

  const begin = () => {
    const now = Date.now();
    const eAt = quiz?.endAt?.toDate ? quiz.endAt.toDate().getTime() : (quiz?.endAt ? new Date(quiz.endAt).getTime() : 0);
    const untilEnd = eAt ? Math.max(1, Math.floor((eAt - now) / 1000)) : null;
    const tLim = limOk ? lim * 60 : null;
    const t = tLim != null && untilEnd != null ? Math.min(tLim, untilEnd) : (tLim != null ? tLim : untilEnd);
    setLeft(t); setPhase("take"); setIdx(0);
    if (t != null) {
      if (tick.current) clearInterval(tick.current);
      tick.current = setInterval(() => {
        setLeft((n) => {
          if (n == null) return n;
          if (n <= 1) {
            clearInterval(tick.current);
            setTimesUp(true);
            submit(true);
            return 0;
          }
          return n - 1;
        });
      }, 1000);
    }
  };

  const answeredN = () => qs.filter((x) => answers[x.id] != null && answers[x.id] !== "").length;
  const missingList = () => qsRef.current.filter((x) => answersRef.current[x.id] == null || answersRef.current[x.id] === "");

  const gradeAuto = (list, ans) => {
    let earned = 0, max = 0, auto = true;
    list.forEach((q) => {
      const pts = Number(q.points) || 0;
      max += pts;
      if (q.type !== "mcq" || q.correctIndex == null) { auto = false; return; }
      if (String(ans[q.id]) === String(q.correctIndex)) earned += pts;
    });
    if (!auto || !list.length) return null;
    return { e: earned, m: max, pct: max ? Math.round(earned / max * 100) : 0 };
  };

  const submit = async (auto) => {
    if (busy) return;
    const list = qsRef.current;
    const ans = answersRef.current;
    const missing = list.filter((x) => ans[x.id] == null || ans[x.id] === "");
    if (!auto && missing.length) { setConfirm(true); return; }
    setBusy(true); setSubErr(""); setConfirm(false);
    try {
      const id = quiz.id + "_" + uid;
      await setDoc(doc(db, "quizAttempts", id), {
        quizId: quiz.id,
        courseId: quiz.courseId,
        uid,
        studentName: studentName || "",
        answers: ans,
        status: "submitted",
        submittedAt: serverTimestamp()
      });
      if (tick.current) clearInterval(tick.current);
      setScore(gradeAuto(list, ans));
      setPhase("done");
      onSubmitted?.();
    } catch (er) {
      setSubErr("quizAttempts: " + fbErr(er));
    }
    setBusy(false);
  };

  if (phase === "load") {
    return e("div", { className: "sq2" }, e("div", { className: "sq2-head", style: { minHeight: 120 } }));
  }
  if (phase === "error") {
    return e("div", { className: "sq2 sq2-fail" },
      e("button", { type: "button", className: "sq2-back", onClick: onBack }, "← Quizzes"),
      e("p", { className: "banner" }, err),
      e("button", { type: "button", className: "sq2-btn pri", onClick: loadQs }, "Try again"));
  }
  if (phase === "unavailable") {
    return e("div", { className: "sq2" },
      e("button", { type: "button", className: "sq2-back", onClick: onBack }, "← Quizzes"),
      e("div", { className: "sq2-head" }, e("p", null, "This quiz is not available yet")));
  }
  if (phase === "confirm") {
    const pts = qs.reduce((n, x) => n + (Number(x.points) || 0), 0);
    const svg = (d) => e("svg", { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" }, e("path", { d }));
    const modal = createPortal(
      e("div", { className: "sq2-veil", role: "dialog", "aria-modal": "true", "aria-labelledby": "sq2Ready" },
        e("div", { className: "sq2-modal" },
          e("div", { className: "sq2-play", "aria-hidden": true }, svg("M8 5v14l11-7z")),
          e("h2", { id: "sq2Ready" }, "Ready to start?"),
          e("p", { className: "sq2-modtitle" }, quiz.title || "Quiz"),
          e("div", { className: "sq2-chips", style: { justifyContent: "center", marginBottom: 12 } },
            e("span", { className: "sq2-chip" }, limOk ? lim + " min" : "No limit"),
            e("span", { className: "sq2-chip" }, qs.length + " questions"),
            e("span", { className: "sq2-chip" }, pts + " pts")
          ),
          e("p", null, limOk
            ? ("You have " + lim + " minutes. The timer starts now and cannot be paused.")
            : "There is no time limit. Once you start, you can submit when you are ready."),
          e("ul", { className: "sq2-rules" },
            e("li", null, e("span", { className: "sq2-ruleico" }, svg("M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z")), " One attempt only"),
            e("li", null, e("span", { className: "sq2-ruleico" }, svg("M12 8v4l3 3M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20z")), " Auto-submit when time ends"),
            e("li", null, e("span", { className: "sq2-ruleico" }, svg("M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2zM17 21v-8H7v8M7 3v5h8")), " Answers are saved as you go")
          ),
          e("div", { className: "sq2-modal-acts" },
            e("button", { type: "button", className: "sq2-btn ghost", onClick: onBack }, "Cancel"),
            e("button", { type: "button", className: "sq2-btn pri sq2-start", ref: startBtn, onClick: begin }, svg("M8 5v14l11-7z"), " Start quiz")
          )
        )
      ),
      document.body
    );
    return e("div", { className: "sq2" }, e(HeaderCard, { quiz, course, qs, limOk, lim, onBack }), modal);
  }
  if (phase === "done") {
    return e("div", { className: "sq2" },
      e("div", { className: "sq2-done" },
        e("div", { className: "sq2-ok" }, "✓"),
        e("h2", null, "Quiz submitted"),
        score
          ? e("p", null, score.e + " / " + score.m + " (" + score.pct + "%)")
          : e("p", null, "Your trainer will review your answers"),
        e("p", { style: { marginTop: 18 } },
          e("button", { className: "sq2-btn pri", type: "button", onClick: onBack }, "Back to quizzes"))
      )
    );
  }

  const qq = qs[idx] || qs[0];
  const nAns = answeredN();
  const tone = left == null ? "" : left <= 30 ? " red" : left <= 120 ? " amber" : "";
  const curAns = qq ? answers[qq.id] : null;
  const tf = qq && isTF(qq);
  const textLen = typeof curAns === "string" ? curAns.length : 0;
  const missing = missingList();

  return e("div", { className: "sq2" },
    e("div", { className: "sq2-bar" },
      e("div", { className: "sq2-bar-row" },
        e("h2", null, quiz.title || "Quiz"),
        e("span", { className: "sq2-timer" + tone }, clock(left))
      ),
      e("div", { className: "sq2-prog" },
        e("span", null, nAns + " of " + qs.length + " answered"),
        e("div", { className: "sq2-pbar" }, e("i", { style: { width: (qs.length ? Math.round(nAns / qs.length * 100) : 0) + "%" } }))
      )
    ),
    qq ? e("article", { className: "sq2-q" },
      e("div", { className: "sq2-qtop" },
        e("span", { className: "sq2-badge" }, String(idx + 1)),
        e("span", { className: "sq2-pts" }, (Number(qq.points) || 0) + " pts")
      ),
      e("p", null, qq.text || ""),
      tf
        ? e("div", { className: "sq2-tf" }, (qq.options || []).map((o, oi) =>
            e("button", { key: oi, type: "button", className: String(curAns) === String(oi) ? "sel" : "", onClick: () => setAnswers({ ...answers, [qq.id]: oi }) }, o)))
        : qq.type === "mcq"
          ? (qq.options || []).map((o, oi) => e("button", { key: oi, type: "button", className: "sq2-opt" + (String(curAns) === String(oi) ? " sel" : ""), onClick: () => setAnswers({ ...answers, [qq.id]: oi }) },
            e("span", { className: "sq2-radio" }), e("span", null, o)))
          : e("div", null,
              e("textarea", { className: "sq2-ta", value: curAns || "", maxLength: 4000, onChange: (ev) => setAnswers({ ...answers, [qq.id]: ev.target.value }) }),
              e("div", { className: "sq2-count" }, textLen + " / 4000")
            )
    ) : null,
    e("div", { className: "sq2-dots" }, qs.map((x, i) => e("button", {
      key: x.id, type: "button", "aria-label": "Question " + (i + 1),
      className: "sq2-dot" + (answers[x.id] != null && answers[x.id] !== "" ? " on" : "") + (i === idx ? " cur" : ""),
      onClick: () => setIdx(i)
    }))),
    subErr ? e("p", { className: "banner" }, subErr) : null,
    e("div", { className: "sq2-nav" },
      e("button", { type: "button", className: "sq2-btn ghost", disabled: idx <= 0, onClick: () => setIdx(Math.max(0, idx - 1)) }, "Previous"),
      idx < qs.length - 1
        ? e("button", { type: "button", className: "sq2-btn pri", onClick: () => setIdx(Math.min(qs.length - 1, idx + 1)) }, "Next")
        : e("button", { type: "button", className: "sq2-btn pri", disabled: busy, onClick: () => submit(false) }, busy ? "Submitting…" : "Submit quiz")
    ),
    timesUp ? createPortal(e("div", { className: "sq2-over" }, "Time's up, submitting your answers…"), document.body) : null,
    confirm ? createPortal(e("div", { className: "sq2-confirm" },
      e("div", { className: "box" },
        e("p", null, "You have " + missing.length + " unanswered question" + (missing.length === 1 ? "" : "s")),
        e("p", { style: { color: "#64748b", fontSize: ".9rem" } }, "Unanswered: " + missing.map((x) => qs.indexOf(x) + 1).join(", ")),
        e("div", { className: "sq2-modal-acts", style: { marginTop: 16 } },
          e("button", { type: "button", className: "sq2-btn ghost", onClick: () => setConfirm(false) }, "Review"),
          e("button", { type: "button", className: "sq2-btn pri", onClick: () => submit(true) }, "Submit anyway")
        )
      )
    ), document.body) : null
  );
}

let root;
export function renderStudentQuizTake(host, opts = {}) {
  if (!host) return false;
  try {
    if (!root) root = createRoot(host);
    root.render(e(TakeApp, opts || {}));
    return true;
  } catch (er) {
    host.innerHTML = `<p class="banner">${er.message || er}</p><button class="btn btn-sm" type="button" id="sqtRetry">Retry</button>`;
    host.querySelector("#sqtRetry")?.addEventListener("click", () => renderStudentQuizTake(host, opts));
    return false;
  }
}
export function unmountStudentQuizTake() {
  try { root?.unmount?.(); root = null; } catch {}
}
