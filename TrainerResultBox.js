import { subscribeTrainerStore, getTrainerStore } from "./TrainerStore.js";
import { db } from "./firebase-config.js?v=auth8";
import { collection, doc, getDoc, getDocs, query, where } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { gradeCalc, fmt1 } from "./gradeCalc.js";
import { loadSeenBoxes, baselineTrainerSeen, markAssignedSeen, markCompletedSeen, markReopenedSeen, dropAssignedSeen, seenAssigned, seenCompleted, seenReopened, reopenEventId } from "./seenBoxes.js";
import { courseStatusLabel, statusChipShort } from "./courseStatusLabel.js";


function msOf(t) {
  if (!t) return 0;
  try {
    if (typeof t.toMillis === "function") return t.toMillis();
    if (typeof t.seconds === "number") return t.seconds * 1000;
    const n = Number(t);
    if (Number.isFinite(n) && n > 1e11) return n;
    const d = new Date(t).getTime();
    return Number.isFinite(d) ? d : 0;
  } catch { return 0; }
}
function fmtMs(t) {
  const n = msOf(t);
  if (!n) return "none";
  return new Date(n).toISOString().replace("T", " ").slice(0, 19) + " UTC · " + n;
}
function seenVal(map, k) {
  const v = map?.[k];
  if (v == null || v === "") return "none";
  return fmtMs(v);
}
function courseDocId(c) { return String(c?.id || ""); }
function assignedStamp(c, uid) {
  const m = c?.trainerAssigned || {};
  return m[uid] || m[String(uid)] || null;
}
export function explainBoxes(uid, courses, map) {
  const list = courses || [];
  const pending = [];
  const rows = list.map((c) => {
    const id = courseDocId(c);
    const teachesIt = teaches(c, uid);
    const st = String(c.status || "");
    const aAt = assignedStamp(c, uid);
    const rAt = c.reopenedAt;
    const dAt = c.completedAt;
    const seenA = seenVal(map, "assigned_" + id);
    const seenR = seenVal(map, "reopened_" + id);
    const seenC = seenVal(map, "completed_" + id);
    const reasons = [];
    const types = [];
    if (!teachesIt) reasons.push("not a trainer of the course");
    const rid = reopenEventId(c);
    if (st === "Completed") {
      if (!dAt && dAt !== 0) reasons.push("store field missing: completedAt");
      else if (seenCompleted(map, id, msOf(dAt))) reasons.push("already seen completed");
      else if (teachesIt) types.push("completed");
    } else {
      if (!rid) reasons.push("no reopenedAt");
      else if (seenReopened(map, id, rid)) reasons.push("already seen reopened");
      else if (teachesIt) types.push("reopened");
      if (seenAssigned(map, id)) reasons.push("already seen assigned");
      else if (teachesIt) types.push("assigned");
    }
    types.forEach((type) => pending.push({ id, title: c.title || id, type }));
    return {
      id, title: c.title || id, status: st || "—",
      teaches: teachesIt ? "yes" : "no",
      assignedAt: fmtMs(aAt),
      trainerAssignedUid: fmtMs(aAt),
      reopenedAt: fmtMs(rAt),
      reopenId: rid ? String(rid) : "none",
      completedAt: fmtMs(dAt),
      seenAssigned: seenA, seenReopened: seenR, seenCompleted: seenC,
      pending: types.join(", ") || "—",
      reason: types.length ? "pending: " + types.join(", ") : (reasons.join("; ") || "older than baseline")
    };
  });
  return { rows, pending };
}
let lastBoxSnap = { uid: "", rows: [], pending: [] };
export function getBoxDebugSnap() { return lastBoxSnap; }
function fmtDate(v) {
  if (!v) return "—";
  const s = String(v).slice(0, 10);
  const d = new Date(s + "T12:00:00");
  if (isNaN(d)) return s;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
function looksLikeUsername(s) {
  const t = String(s || "").trim();
  if (!t) return true;
  if (t.includes("@")) return true;
  if (/^[a-z0-9._-]+$/i.test(t) && (/[._]/.test(t) || /^\d+$/.test(t) || /skycastle/i.test(t))) return true;
  return false;
}
export function displayFirstName(raw) {
  const t = String(raw || "").trim();
  if (!t || looksLikeUsername(t)) return "";
  return t.split(/\s+/)[0];
}
async function resolveTrainerName(uid, passed) {
  const bar = document.getElementById("userName")?.textContent;
  const tryN = [passed, bar];
  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (snap.exists()) {
      const d = snap.data() || {};
      tryN.unshift(d.name, d.fullName);
    }
  } catch (_) {}
  for (const n of tryN) {
    const f = displayFirstName(n);
    if (f) return f;
  }
  return "";
}
function greetLine(first, courseTitle) {
  const t = courseTitle || "this course";
  if (first) return "Thank you for training at GHz Academy, " + first + "! " + t + " has been completed.";
  return "Thank you for training at GHz Academy! " + t + " has been completed.";
}

function teaches(c, uid) {
  const ids = c?.trainerIds || [];
  return ids.includes(uid) || c?.trainerId === uid;
}
function ensureCss() {
  if (document.getElementById("rs-css")) return;
  const l = document.createElement("link");
  l.id = "rs-css"; l.rel = "stylesheet"; l.href = "./CourseResultBox.css";
  document.head.appendChild(l);
  if (!document.getElementById("rs-tr-css")) {
    const l2 = document.createElement("link");
    l2.id = "rs-tr-css"; l2.rel = "stylesheet"; l2.href = "./TrainerResultBox.css";
    document.head.appendChild(l2);
  }
}
function statusHtml(st, course) {
  const c = course || { status: st };
  const k = String(c.status || "—");
  const cls = k === "Open" ? "open" : k === "Closed" ? "closed" : k === "Completed" ? "done" : "soon";
  return `<span class="rs-sb ${cls}" title="${courseStatusLabel(c)}">${statusChipShort(c)}</span>`;
}
function studentLabel(n) {
  if (n === 1) return "1 student";
  return n + " students";
}
function storeStudentCount(courseId) {
  const st = getTrainerStore();
  if (!st || st.loading) return null;
  const c = st.counts;
  if (c && Object.prototype.hasOwnProperty.call(c, courseId)) {
    const n = Number(c[courseId]);
    return Number.isFinite(n) ? n : null;
  }
  const ens = st.enrollments;
  if (Array.isArray(ens) && ens.length) {
    return ens.filter((e) => e.courseId === courseId && String(e.status || "").toLowerCase() !== "cancelled").length;
  }
  return null;
}
async function fetchStudentCount(courseId) {
  const known = storeStudentCount(courseId);
  if (known != null) return { ok: true, n: known };
  try {
    const snap = await getDocs(query(collection(db, "enrollments"), where("courseId", "==", courseId)));
    const n = snap.docs.filter((d) => String((d.data() || {}).status || "").toLowerCase() !== "cancelled").length;
    return { ok: true, n };
  } catch {
    return { ok: false, n: null };
  }
}
function paintStudentEl(el, res) {
  if (!el) return;
  el.classList.remove("rs-skel");
  if (!res.ok) { el.textContent = "—"; return; }
  el.textContent = studentLabel(res.n);
}
function bindStudentCount(wrap, courseId) {
  const el = wrap.querySelector("[data-rs-students]");
  if (!el) return;
  const known = storeStudentCount(courseId);
  if (known != null) {
    paintStudentEl(el, { ok: true, n: known });
    return;
  }
  el.classList.add("rs-skel");
  el.textContent = "";
  fetchStudentCount(courseId).then((res) => paintStudentEl(el, res));
}
function closeWrap(wrap, onKey) {
  window.removeEventListener("keydown", onKey);
  wrap.remove();
}
function bindClose(wrap, onClose) {
  const onKey = (ev) => { if (ev.key === "Escape") { closeWrap(wrap, onKey); onClose?.(); } };
  window.addEventListener("keydown", onKey);
  wrap.addEventListener("click", (ev) => { if (ev.target === wrap) { closeWrap(wrap, onKey); onClose?.(); } });
  wrap.querySelector(".rs-x")?.addEventListener("click", () => { closeWrap(wrap, onKey); onClose?.(); });
  return onKey;
}

function markBoxNotif(type, courseId) {
  try {
    window.dispatchEvent(new CustomEvent("ghz-mark-assigned", { detail: { courseId, type } }));
  } catch (_) {}
}

export function showAssignedBox({ course, uid, students, go, onClose }) {
  ensureCss();
  const title = course.title || "this course";
  const days = Array.isArray(course.deliveryDays) ? course.deliveryDays.join(", ") : (course.schedule || "—");
  const time = [course.startTime, course.endTime].filter(Boolean).join(" – ") || "—";
  const names = (course.trainerNames || []).filter((n) => n);
  const co = names.length ? names.join(", ") : (course.trainerName || "—");
  const wrap = document.createElement("div");
  wrap.className = "rs-dim";
  wrap.setAttribute("role", "dialog");
  wrap.setAttribute("aria-modal", "true");
  wrap.innerHTML = `<div class="rs-card">
    <button type="button" class="rs-x" aria-label="Close">×</button>
    <div class="rs-head rs-assign">
      <div class="rs-ico"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M22 10l-10-5L2 10l10 5 10-5z"/><path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5"/></svg></div>
      <h3>New course assigned</h3>
      <p>You have been assigned to ${title}</p>
    </div>
    <div class="rs-body">
      <div class="rs-mini">
        <div><span>Status</span>${statusHtml(course.status, course)}</div>
        <div><span>Start</span><strong>${fmtDate(course.startDate)}</strong></div>
        <div><span>End</span><strong>${fmtDate(course.endDate)}</strong></div>
        <div><span>Schedule</span><strong>${days}${time !== "—" ? " · " + time : ""}</strong></div>
        <div><span>Trainers</span><strong>${co}</strong></div>
        <div><span>Students</span><strong data-rs-students></strong></div>
      </div>
      <div class="rs-acts">
        <button type="button" class="rs-btn rs-pri" data-rs="view">View course</button>
        <button type="button" class="rs-btn rs-ghost" data-rs="later">Later</button>
      </div>
    </div>
  </div>`;
  document.body.appendChild(wrap);
  bindStudentCount(wrap, course.id);
  markAssignedSeen(uid, course.id);
  markBoxNotif("course_assigned", course.id);
  const finish = () => onClose?.();
  const onKey = bindClose(wrap, finish);
  wrap.querySelector("[data-rs=later]").onclick = () => { closeWrap(wrap, onKey); finish(); };
  wrap.querySelector("[data-rs=view]").onclick = () => {
    closeWrap(wrap, onKey);
    try { go?.("#course/" + course.id); } catch (_) {}
    finish();
  };
}

export function showReopenedBox({ course, uid, name, students, go, onClose }) {
  ensureCss();
  const title = course.title || "this course";
  const first = displayFirstName(name);
  const wrap = document.createElement("div");
  wrap.className = "rs-dim";
  wrap.setAttribute("role", "dialog");
  wrap.setAttribute("aria-modal", "true");
  wrap.innerHTML = `<div class="rs-card">
    <button type="button" class="rs-x" aria-label="Close">×</button>
    <div class="rs-head rs-reopen">
      <div class="rs-ico"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg></div>
      <h3>Course reopened</h3>
      <p>Hello${first ? " " + first : ""}, ${title} has been reopened. You can edit grades, homework, quizzes and attendance again.</p>
    </div>
    <div class="rs-body">
      <div class="rs-mini">
        <div><span>Status</span>${statusHtml(course.status, course)}</div>
        <div><span>Start</span><strong>${fmtDate(course.startDate)}</strong></div>
        <div><span>End</span><strong>${fmtDate(course.endDate)}</strong></div>
        <div><span>Students</span><strong data-rs-students></strong></div>
      </div>
      <div class="rs-acts">
        <button type="button" class="rs-btn rs-pri" data-rs="view">View course</button>
        <button type="button" class="rs-btn rs-ghost" data-rs="later">Later</button>
      </div>
    </div>
  </div>`;
  document.body.appendChild(wrap);
  bindStudentCount(wrap, course.id);
  markReopenedSeen(uid, course.id, reopenEventId(course));
  markBoxNotif("course_reopened", course.id);
  const finish = () => onClose?.();
  const onKey = bindClose(wrap, finish);
  wrap.querySelector("[data-rs=later]").onclick = () => { closeWrap(wrap, onKey); finish(); };
  wrap.querySelector("[data-rs=view]").onclick = () => {
    closeWrap(wrap, onKey);
    try { go?.("#course/" + course.id); } catch (_) {}
    finish();
  };
}

export function showCompletedBox({ course, uid, name, stats, go, onClose }) {
  ensureCss();
  const title = course.title || "this course";
  const confetti = !window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? Array.from({ length: 14 }, (_, i) => `<span class="rs-dot" style="left:${8 + i * 6}%;top:${4 + (i % 5) * 8}%;background:${["#FDE68A","#A7F3D0","#BFDBFE","#FBCFE8"][i % 4]}"></span>`).join("")
    : "";
  const wrap = document.createElement("div");
  wrap.className = "rs-dim";
  wrap.setAttribute("role", "dialog");
  wrap.setAttribute("aria-modal", "true");
  wrap.innerHTML = `<div class="rs-card">
    <button type="button" class="rs-x" aria-label="Close">×</button>
    <div class="rs-head rs-thanks">
      <div class="rs-conf">${confetti}</div>
      <div class="rs-ico"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><circle cx="12" cy="8" r="6"/><path d="M8.5 13.5L7 22l5-2 5 2-1.5-8.5"/></svg></div>
      <h3>Course completed</h3>
      <p>${greetLine(name, title)}</p>
    </div>
    <div class="rs-body">
      <div class="rs-strip">
        <div><strong data-rs-students>${stats.students}</strong><span>Students</span></div>
        <div><strong>${stats.passed}</strong><span>Passed</span></div>
        <div><strong>${stats.failed}</strong><span>Failed</span></div>
        <div><strong>${stats.avg}</strong><span>Average grade</span></div>
      </div>
      <p class="rs-note">Your dedication helps our students grow. We appreciate your work.</p>
      <p class="rs-lock">Grades, homework and attendance are now locked.</p>
      <div class="rs-acts">
        <button type="button" class="rs-btn rs-pri" data-rs="grades">View grades</button>
        <button type="button" class="rs-btn rs-ghost" data-rs="close">Close</button>
      </div>
    </div>
  </div>`;
  document.body.appendChild(wrap);
  const stEl = wrap.querySelector("[data-rs-students]");
  if (stats.students === "—" || stats.students == null) {
    bindStudentCount(wrap, course.id);
  } else if (typeof stats.students === "number") {
    paintStudentEl(stEl, { ok: true, n: stats.students });
  }
  markCompletedSeen(uid, course.id, msOf(course.completedAt) || 0);
  markBoxNotif("courseDone", course.id);
  const finish = () => onClose?.();
  const onKey = bindClose(wrap, finish);
  wrap.querySelector("[data-rs=close]").onclick = () => { closeWrap(wrap, onKey); finish(); };
  wrap.querySelector("[data-rs=grades]").onclick = () => {
    closeWrap(wrap, onKey);
    try { go?.("#grades/" + course.id); } catch (_) {}
    finish();
  };
}

async function col(name, cid) {
  const snap = await getDocs(query(collection(db, name), where("courseId", "==", cid)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
async function statsFor(course) {
  const cid = course.id;
  let ens = [];
  try {
    ens = (await col("enrollments", cid)).filter((e) => String(e.status || "").toLowerCase() !== "cancelled");
  } catch (_) {
    return { students: "—", passed: "—", failed: "—", avg: "—" };
  }
  const students = ens.length;
  let scheme = {};
  let scoresMap = {};
  const errors = {};
  try {
    const s = await getDoc(doc(db, "gradeSchemes", cid));
    if (s.exists()) scheme = s.data();
  } catch (_) {
    return { students, passed: "—", failed: "—", avg: "—" };
  }
  try {
    const snap = await getDocs(query(collection(db, "gradeScores"), where("courseId", "==", cid)));
    snap.docs.forEach((d) => { const x = d.data() || {}; scoresMap[x.uid || String(d.id).split("_")[0]] = x.scores || {}; });
  } catch (_) { errors.scores = true; }
  const names = ["assignments", "submissions", "quizzes", "quizAttempts", "attendance", "sessions"];
  const pack = { courseId: cid, scheme, errors: {} };
  await Promise.all(names.map(async (n) => {
    try { pack[n] = await col(n, cid); }
    catch (_) { pack[n] = []; pack.errors[n] = true; }
  }));
  let passed = 0, failed = 0, avgs = [];
  for (const en of ens) {
    const g = gradeCalc({ id: cid, pack }, scheme, { uid: en.uid, scores: scoresMap[en.uid] || {}, pack });
    if (g.failed || g.average == null) return { students, passed: "—", failed: "—", avg: "—" };
    if (g.passed) passed += 1; else failed += 1;
    avgs.push(g.average);
  }
  const avg = avgs.length ? fmt1(avgs.reduce((a, b) => a + b, 0) / avgs.length) + "%" : "—";
  return { students, passed, failed, avg };
}

let busy = false;
let lastSig = "";

async function consider(uid, name, go) {
  if (busy || !uid) return;
  const store = getTrainerStore();
  if (!store || store.loading || store.err) return;
  const seen = await loadSeenBoxes(uid);
  if (!seen.ok) return;
  const courses = store.courses || [];
  const mine = courses.filter((c) => teaches(c, uid));
  if (seen.first) {
    await baselineTrainerSeen(uid, mine);
    const again = await loadSeenBoxes(uid);
    if (again.first) return;
    seen.map = again.map || {};
    seen.first = false;
  }
  const map = seen.map || {};
  lastBoxSnap = { uid, ...explainBoxes(uid, courses, map) };
  try { window.dispatchEvent(new CustomEvent("ghz-box-debug")); } catch (_) {}
  document.getElementById("ghz-box-debug")?.remove();
  const mineIds = new Set(mine.map((c) => c.id));
  const idsReady = courses.some((c) => Array.isArray(c.trainerIds) && c.trainerIds.length);
  if (idsReady) {
    Object.keys(map).forEach((k) => {
      if (k.startsWith("assigned_")) {
        const id = k.slice("assigned_".length);
        if (id && !mineIds.has(id)) dropAssignedSeen(uid, id);
      }
    });
  }
  const pendingReopen = mine.filter((c) => String(c.status) !== "Completed" && reopenEventId(c) && !seenReopened(map, c.id, reopenEventId(c)));
  const pendingAssign = mine.filter((c) => String(c.status) !== "Completed" && !seenAssigned(map, c.id));
  const pendingDone = mine.filter((c) => String(c.status) === "Completed" && !seenCompleted(map, c.id, msOf(c.completedAt) || 0));
  const next = pendingReopen[0] || pendingAssign[0] || pendingDone[0];
  if (!next) return;
  const kind = pendingReopen[0] === next ? "r" : pendingAssign[0] === next ? "a" : "d";
  const sig = next.id + ":" + kind + ":" + (kind === "r" ? reopenEventId(next) : msOf(next.completedAt));
  if (sig === lastSig) return;
  lastSig = sig;
  busy = true;
  try {
    const realName = await resolveTrainerName(uid, name);
    if (kind === "r") {
      showReopenedBox({ course: next, uid, name: realName, go, onClose: () => { busy = false; lastSig = ""; setTimeout(() => consider(uid, name, go), 200); } });
    } else if (kind === "d") {
      let stats = { students: "—", passed: "—", failed: "—", avg: "—" };
      try { stats = await statsFor(next); } catch (_) {}
      showCompletedBox({ course: next, uid, name: realName, stats, go, onClose: () => { busy = false; lastSig = ""; setTimeout(() => consider(uid, name, go), 200); } });
    } else {
      showAssignedBox({
        course: next,
        uid,
        go,
        onClose: () => { busy = false; lastSig = ""; setTimeout(() => consider(uid, name, go), 200); }
      });
    }
  } catch (_) {
    busy = false;
    lastSig = "";
  }
}

export function bootTrainerResultBoxes({ uid, name, go }) {
  if (!uid) return;
  consider(uid, name, go);
  subscribeTrainerStore(() => { consider(uid, name, go); });
}
