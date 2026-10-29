import { gradeCalc } from "./gradeCalc.js";
import { getStudentStore } from "./student-dash-data.js?v=stu7";
import { db } from "./firebase-config.js?v=auth8";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { loadSeenBoxes, baselineStudentSeen, markResultSeen, seenResult } from "./seenBoxes.js";

function atStamp(course) {
  const t = course?.completedAt;
  if (!t) return "0";
  try {
    if (typeof t.toMillis === "function") return String(t.toMillis());
    if (t.seconds) return String(t.seconds * 1000);
    const n = new Date(t).getTime();
    return Number.isFinite(n) ? String(n) : String(t);
  } catch { return "0"; }
}
export function markCourseResultSeen(uid, courseId, at) {
  markResultSeen(uid, courseId, Number(at) || 0);
}
export function clearCourseResultSeen() {}
function looksLikeUsername(s) {
  const t = String(s || "").trim();
  if (!t) return true;
  if (t.includes("@")) return true;
  if (/^[a-z0-9._-]+$/i.test(t) && (/[._]/.test(t) || /^\d+$/.test(t) || /skycastle/i.test(t))) return true;
  return false;
}
function firstName(n) {
  const t = String(n || "").trim();
  if (!t || looksLikeUsername(t)) return "";
  return t.split(/\s+/)[0];
}
function ensureCss() {
  if (document.getElementById("rs-css")) return;
  const l = document.createElement("link");
  l.id = "rs-css"; l.rel = "stylesheet"; l.href = "./CourseResultBox.css";
  document.head.appendChild(l);
}
function passMarkOf(scheme) {
  const n = Number(scheme?.passMark);
  return Number.isFinite(n) ? n : 60;
}
function resultFor(uid, courseId, store) {
  const course = store?.courses?.[courseId];
  if (!course || String(course.status || "").trim().toLowerCase() !== "completed") return null;
  const scheme = store.gradeSchemes?.[courseId];
  const comps = Array.isArray(scheme?.components) ? scheme.components : [];
  const raw = store.gradeScores?.[courseId] || {};
  const scores = raw.scores || raw;
  const pack = {
    attendance: (store.attendance || []).filter((a) => a.courseId === courseId),
    assignments: (store.assignments || []).filter((a) => a.courseId === courseId),
    submissions: store.submissions || [],
    quizzes: (store.quizzes || []).filter((q) => q.courseId === courseId),
    quizAttempts: store.quizAttempts || []
  };
  const g = gradeCalc({ id: courseId, pack: { ...pack, scheme } }, scheme, { uid, scores, pack: { ...pack, scheme } });
  const pass = passMarkOf(scheme);
  if (g.failed) return { course, avg: null, pass, passed: null, title: course.title || "this course" };
  return { course, avg: g.average, pass, passed: g.passed, title: course.title || "this course" };
}

export function showCourseResultBox(payload) {
  ensureCss();
  const wrap = document.createElement("div");
  wrap.className = "rs-dim";
  wrap.setAttribute("role", "dialog");
  wrap.setAttribute("aria-modal", "true");
  const pass = !!payload.passed;
  const confetti = pass && !window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? Array.from({ length: 14 }, (_, i) => `<span class="rs-dot" style="left:${8 + i * 6}%;top:${4 + (i % 5) * 8}%;background:${["#FDE68A","#A7F3D0","#BFDBFE","#FBCFE8"][i % 4]}"></span>`).join("")
    : "";
  const ico = pass
    ? `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><circle cx="12" cy="8" r="6"/><path d="M8.5 13.5L7 22l5-2 5 2-1.5-8.5"/></svg>`
    : `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2zM22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></svg>`;
  wrap.innerHTML = `<div class="rs-card">
    <button type="button" class="rs-x" aria-label="Close">×</button>
    <div class="rs-head ${pass ? "pass" : "fail"}">${pass ? `<div class="rs-conf">${confetti}</div>` : ""}
      <div class="rs-ico">${ico}</div>
      <h3>${pass ? (firstName(payload.name) ? "Congratulations, " + firstName(payload.name) + "!" : "Congratulations!") : "Course completed"}</h3>
      <p>${pass ? "You have successfully completed " + payload.title + "." : "You did not reach the pass mark for " + payload.title + " this time."}</p>
    </div>
    <div class="rs-body">
      <div class="rs-row">
        <span class="rs-grade">${payload.avg}%</span>
        ${pass ? `<span class="rs-pill ok">Passed</span>` : `<span class="rs-pill no">Your grade ${payload.avg}% · Pass mark ${payload.pass}%</span>`}
      </div>
      <p class="rs-note">${pass
        ? "Your certificate will be available in your Certificates section once it is issued."
        : "This is not the end. Review your grades to see where to improve, and contact your instructor or the academy to discuss your next steps."}</p>
      <div class="rs-acts">
        ${pass ? (payload.hasCert
          ? `<button type="button" class="rs-btn rs-pri" data-rs="cert">View certificate</button>`
          : `<button type="button" class="rs-btn rs-pri" data-rs="certs">Go to Certificates</button>`) : ""}
        <button type="button" class="rs-btn ${pass ? "rs-ghost" : "rs-pri"}" data-rs="grades">View my grades</button>
        ${pass ? "" : `<button type="button" class="rs-btn rs-ghost" data-rs="close">Close</button>`}
      </div>
    </div>
  </div>`;
  document.body.appendChild(wrap);
  markResultSeen(payload.uid, payload.courseId, Number(payload.at) || 0);
  const close = () => {
    window.removeEventListener("keydown", onKey);
    wrap.remove();
    payload.onClose?.();
  };
  const go = (hash) => {
    close();
    try { window.__ghzShowView?.(hash === "certificates" ? "certificates" : "gradesv2"); } catch (_) {}
    try { location.hash = hash === "certificates" ? "certificates" : "grades"; } catch (_) {}
  };
  const onKey = (ev) => { if (ev.key === "Escape") close(); };
  window.addEventListener("keydown", onKey);
  wrap.addEventListener("click", (ev) => { if (ev.target === wrap) close(); });
  wrap.querySelector(".rs-x").onclick = close;
  wrap.querySelectorAll("[data-rs]").forEach((b) => {
    b.onclick = () => {
      const k = b.getAttribute("data-rs");
      if (k === "close") close();
      else if (k === "grades") go("grades");
      else go("certificates");
    };
  });
  wrap.querySelector(".rs-x").focus();
}

let showing = false;
export async function maybeShowCourseResult({ uid, name, forceCourseId } = {}) {
  try {
    if (!uid || (showing && !forceCourseId)) return;
    const store = getStudentStore();
    if (!store || store.status === "loading" || store.status === "error") return;
    const seen = await loadSeenBoxes(uid);
    if (!seen.ok) return;
    const ids = store.courseIds || [];
    if (seen.first) {
      await baselineStudentSeen(uid, store.courses || {});
      return;
    }
    const map = seen.map || {};
    const pick = forceCourseId || ids.find((id) => {
      const c = store.courses?.[id];
      const at = atStamp(c);
      return c && String(c.status || "").trim().toLowerCase() === "completed" && !seenResult(map, id, Number(at) || 0);
    });
    if (forceCourseId && store.courses?.[forceCourseId] && String(store.courses[forceCourseId].status || "").trim().toLowerCase() !== "completed") {
      return;
    }
    if (!pick) return;
    const rec = resultFor(uid, pick, store);
    if (!rec) return;
    let hasCert = false;
    try {
      const snap = await getDoc(doc(db, "certificates", uid + "_" + pick));
      hasCert = snap.exists() && String(snap.data()?.status || "") !== "revoked";
    } catch (_) {
      hasCert = (store.certificates || []).some((x) => (x.courseId === pick || x.id === uid + "_" + pick) && String(x.status) !== "revoked");
    }
    showing = true;
    showCourseResultBox({
      uid, courseId: pick, at: atStamp(rec.course), name: name || store.name, title: rec.title,
      avg: rec.avg, pass: rec.pass, passed: rec.passed, hasCert,
      onClose: () => { showing = false; }
    });
  } catch (_) {}
}
