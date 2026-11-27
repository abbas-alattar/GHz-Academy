import { formatGrade } from "./gradeCalc.js";
import { getStudentStore, getCourseResult } from "./student-dash-data.js?v=stu11";
import { db } from "./firebase-config.js?v=auth10";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { loadSeenBoxes, baselineStudentSeen, markResultSeen, seenResult, completionRound } from "./seenBoxes.js";

function atStamp(course) {
  return completionRound(course);
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

function paintBox(wrap, payload) {
  const unpublished = payload.status === "unpublished" || payload.unpublished;
  const loading = payload.status === "loading";
  const pass = !unpublished && !loading && !!payload.passed;
  const gradeTxt = unpublished || loading ? "" : formatGrade(payload.avg);
  const confetti = pass && !window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? Array.from({ length: 14 }, (_, i) => `<span class="rs-dot" style="left:${8 + i * 6}%;top:${4 + (i % 5) * 8}%;background:${["#FDE68A","#A7F3D0","#BFDBFE","#FBCFE8"][i % 4]}"></span>`).join("")
    : "";
  const ico = loading
    ? `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 8v4l3 2"/></svg>`
    : pass
    ? `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><circle cx="12" cy="8" r="6"/><path d="M8.5 13.5L7 22l5-2 5 2-1.5-8.5"/></svg>`
    : `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2zM22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></svg>`;
  const card = wrap.querySelector(".rs-card");
  if (!card) return;
  const headClass = loading ? "fail" : (pass ? "pass" : "fail");
  const h3 = loading ? "Loading results" : unpublished ? "Results not published yet" : (pass ? (firstName(payload.name) ? "Congratulations, " + firstName(payload.name) + "!" : "Congratulations!") : "Course completed");
  const p = loading ? "Fetching your published scores…" : unpublished ? "Your trainer has not published scores for " + payload.title + " yet." : (pass ? "You have successfully completed " + payload.title + "." : "You did not reach the pass mark for " + payload.title + " this time.");
  card.innerHTML = `<button type="button" class="rs-x" aria-label="Close">×</button>
    <div class="rs-head ${headClass}">${pass ? `<div class="rs-conf">${confetti}</div>` : ""}
      <div class="rs-ico">${ico}</div>
      <h3>${h3}</h3>
      <p>${p}</p>
    </div>
    <div class="rs-body">
      <div class="rs-row">
        <span class="rs-grade">${loading || unpublished ? "—" : gradeTxt + "%"}</span>
        ${loading ? `<span class="rs-pill no">Loading…</span>` : unpublished ? `<span class="rs-pill no">Results not published yet</span>` : `<span class="rs-pill ${pass ? "ok" : "no"}">${pass ? "Passed" : "Not passed"} · ${gradeTxt}% · Pass mark ${payload.pass}%</span>`}
      </div>
      <p class="rs-note">${loading ? "Please wait while we load the gradebook." : unpublished ? "Check back after your trainer publishes the gradebook." : (pass
        ? "Your certificate will be available in your Certificates section once it is issued."
        : "This is not the end. Review your grades to see where to improve, and contact your instructor or the academy to discuss your next steps.")}</p>
      <div class="rs-acts">
        ${!loading && !unpublished && pass ? (payload.hasCert
          ? `<button type="button" class="rs-btn rs-pri" data-rs="cert">View certificate</button>`
          : `<button type="button" class="rs-btn rs-pri" data-rs="certs">Go to Certificates</button>`) : ""}
        <button type="button" class="rs-btn ${loading || unpublished || !pass ? "rs-pri" : "rs-ghost"}" data-rs="grades">View my grades</button>
        ${loading || unpublished || !pass ? `<button type="button" class="rs-btn rs-ghost" data-rs="close">Close</button>` : ""}
      </div>
    </div>`;
}

export function showCourseResultBox(payload) {
  ensureCss();
  const wrap = document.createElement("div");
  wrap.className = "rs-dim";
  wrap.setAttribute("role", "dialog");
  wrap.setAttribute("aria-modal", "true");
  wrap.innerHTML = `<div class="rs-card"></div>`;
  document.body.appendChild(wrap);
  paintBox(wrap, payload);
  if (payload.uid && payload.courseId && payload.status !== "loading") markResultSeen(payload.uid, payload.courseId, Number(payload.at) || 0);
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
  wrap.addEventListener("click", (ev) => {
    const b = ev.target?.closest?.("[data-rs],.rs-x");
    if (!b) return;
    if (b.classList.contains("rs-x") || b.getAttribute("data-rs") === "close") close();
    else if (b.getAttribute("data-rs") === "grades") go("grades");
    else if (b.getAttribute("data-rs")) go("certificates");
  });
  wrap._paint = (p) => paintBox(wrap, { ...payload, ...p });
  wrap.querySelector(".rs-x")?.focus();
  return wrap;
}

let showing = false;
let watchBound = false;
export async function maybeShowCourseResult({ uid, name, forceCourseId } = {}) {
  try {
    if (!uid || (showing && !forceCourseId)) return;
    const store = getStudentStore();
    if (!store) return;
    const seen = await loadSeenBoxes(uid);
    if (!seen.ok && !forceCourseId) return;
    const ids = store.courseIds || [];
    if (seen.first && !forceCourseId) {
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
    showing = true;
    // Automatic popups wait until the result is ready, so students are never blocked by a
    // full-screen "Loading…" box. A popup the student opened themselves shows loading at once.
    const wrap = forceCourseId ? showCourseResultBox({
      uid, courseId: pick, name: name || store.name, title: store.courses?.[pick]?.title || "this course",
      status: "loading", avg: null, pass: null, passed: null, unpublished: false, hasCert: false,
      onClose: () => { showing = false; }
    }) : null;
    const rec = await getCourseResult(pick);
    if (!wrap && rec.status === "loading") { showing = false; return; }
    let hasCert = false;
    try {
      const snap = await getDoc(doc(db, "certificates", uid + "_" + pick));
      hasCert = snap.exists() && String(snap.data()?.status || "") !== "revoked";
    } catch (_) {
      hasCert = (getStudentStore()?.certificates || []).some((x) => (x.courseId === pick || x.id === uid + "_" + pick) && String(x.status) !== "revoked");
    }
    const payload = {
      uid, courseId: pick, at: atStamp(store.courses?.[pick] || rec.course), name: name || store.name, title: rec.title,
      avg: rec.avg, pass: rec.pass, passed: rec.passed, unpublished: rec.unpublished, status: rec.status, hasCert
    };
    if (wrap) wrap._paint?.(payload);
    else showCourseResultBox({ ...payload, onClose: () => { showing = false; } });
    if (rec.status !== "loading") markResultSeen(uid, pick, Number(payload.at) || 0);
    if (!watchBound && uid) {
      watchBound = true;
      window.addEventListener("ghz-course-meta", () => { maybeShowCourseResult({ uid, name }); });
    }
  } catch (_) { showing = false; }
}
export { getCourseResult };
