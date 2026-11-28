/** Saved notifications (Phase 1).
 *
 *  Each notification is a small document at users/{recipientUid}/notifications/{type~sourceId}.
 *  The id matches the id the bell already uses for the same event, so the bell can merge them
 *  without duplicates. Sending is fire-and-forget: it never blocks or breaks the action that
 *  triggered it, and if the database rules don't allow it yet, it silently does nothing.
 */
import { db, auth } from "./firebase-config.js?v=auth10";
import {
  collection, doc, getDoc, getDocs, query, where, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

const clip = (v, n) => String(v == null ? "" : v).slice(0, n);
const safeId = (v) => String(v || "").replace(/\//g, "_").slice(0, 300);

function me() { return auth?.currentUser || null; }
async function myName() {
  const u = me();
  if (!u) return "";
  try {
    const s = await getDoc(doc(db, "users", u.uid));
    const d = s.exists() ? s.data() : {};
    return clip(d.name || d.fullName || d.displayName || u.displayName || "", 120);
  } catch (_) { return clip(u.displayName || "", 120); }
}

/** Send one notification to each uid. Skips the sender and duplicates. */
export async function notifyUsers(uids, n) {
  try {
    const u = me();
    if (!u || !n || !n.type || !n.sourceId) return 0;
    const list = Array.from(new Set((uids || []).filter((x) => x && x !== u.uid)));
    if (!list.length) return 0;
    const actorName = await myName();
    if (n.courseId && !n.courseTitle) {
      try { const c = await getDoc(doc(db, "courses", n.courseId)); n = { ...n, courseTitle: c.exists() ? (c.data().title || "") : "" }; } catch (_) {}
    }
    const who = actorName || "A student";
    n = { ...n, title: String(n.title || "").replace("{actor}", who), message: String(n.message || "").replace("{actor}", who) };
    const id = safeId(n.type + "~" + n.sourceId);
    const payload = {
      type: clip(n.type, 40),
      title: clip(n.title, 200),
      message: clip(n.message, 1000),
      courseId: clip(n.courseId, 200),
      courseTitle: clip(n.courseTitle, 200),
      link: clip(n.link, 500),
      sourceId: clip(n.sourceId, 300),
      actorUid: u.uid,
      actorName,
      read: false,
      createdAt: serverTimestamp()
    };
    let sent = 0;
    // Small parallel groups; a refused write (e.g. already exists) never affects the others.
    for (let i = 0; i < list.length; i += 20) {
      const group = list.slice(i, i + 20);
      const res = await Promise.allSettled(group.map((uid) => setDoc(doc(db, "users", uid, "notifications", id), payload)));
      sent += res.filter((r) => r.status === "fulfilled").length;
    }
    return sent;
  } catch (e) {
    try { console.warn("[ghz-notify]", e?.code || e?.message || e); } catch (_) {}
    return 0;
  }
}

/** Students enrolled in a course (readable by its trainers and by admins). */
export async function studentsOf(courseId) {
  if (!courseId) return [];
  try {
    const snap = await getDocs(query(collection(db, "enrollments"), where("courseId", "==", courseId)));
    return snap.docs.map((d) => d.data().uid).filter(Boolean);
  } catch (_) { return []; }
}

/** Trainers assigned to a course. */
export async function trainersOf(courseId) {
  if (!courseId) return [];
  try {
    const s = await getDoc(doc(db, "courses", courseId));
    const t = s.exists() ? s.data().trainerIds : [];
    return Array.isArray(t) ? t : [];
  } catch (_) { return []; }
}

/** Admin uids, published by the admin portal in settings/notify (settings are readable by signed-in users). */
export async function adminUids() {
  try {
    const s = await getDoc(doc(db, "settings", "notify"));
    const a = s.exists() ? s.data().adminUids : [];
    return Array.isArray(a) ? a : [];
  } catch (_) { return []; }
}

/** Admin portal only: keep settings/notify.adminUids up to date so students can notify admins. */
export async function publishAdminList() {
  try {
    const snap = await getDocs(query(collection(db, "users"), where("role", "==", "admin")));
    const ids = snap.docs.filter((d) => d.data().active !== false).map((d) => d.id).sort();
    const cur = await adminUids();
    if (ids.length && ids.join(",") !== cur.slice().sort().join(",")) {
      await setDoc(doc(db, "settings", "notify"), { adminUids: ids, updatedAt: serverTimestamp() }, { merge: true });
    }
  } catch (_) {}
}

/** Everyone except admins (for academy-wide announcements; admin only). */
export async function allMembers() {
  try {
    const snap = await getDocs(collection(db, "users"));
    return snap.docs.filter((d) => ["student", "trainer"].includes(d.data().role) && d.data().active !== false).map((d) => d.id);
  } catch (_) { return []; }
}

// Returns a promise that always resolves, so callers that leave the page can wait for it briefly.
const fire = (p) => Promise.resolve(p).catch(() => 0);
/** Wait for a send to finish, but never longer than ms (for screens that navigate away right after). */
export function settle(p, ms = 2500) { return Promise.race([Promise.resolve(p).catch(() => 0), new Promise((r) => setTimeout(r, ms))]); }

// ---- Event helpers (call after the action has succeeded; they never throw) ----

export function notifyHomeworkPosted(a) {
  if (!a || !a.id || !a.courseId) return Promise.resolve(0);
  return fire(studentsOf(a.courseId).then((uids) => notifyUsers(uids, {
    type: "hwPosted", sourceId: a.id, courseId: a.courseId, courseTitle: a.courseTitle || "",
    title: "Homework posted", message: "New homework: " + (a.title || "Homework"),
    link: "./student.html#homework?item=" + encodeURIComponent(a.id)
  })));
}

export function notifyQuizPosted(q) {
  if (!q || !q.id || !q.courseId) return Promise.resolve(0);
  return fire(studentsOf(q.courseId).then((uids) => notifyUsers(uids, {
    type: "quizPosted", sourceId: q.id, courseId: q.courseId, courseTitle: q.courseTitle || "",
    title: "Quiz posted", message: "New quiz: " + (q.title || "Quiz"),
    link: "./student-quizzes.html?item=" + encodeURIComponent(q.id)
  })));
}

export function notifyHomeworkGraded({ submissionId, studentUid, assignmentId, assignmentTitle, courseId, courseTitle, grade, maxPoints }) {
  if (!submissionId || !studentUid) return Promise.resolve(0);
  const score = grade != null && grade !== "" ? " " + grade + (maxPoints ? "/" + maxPoints : "") : "";
  return fire(notifyUsers([studentUid], {
    type: "hwGraded", sourceId: submissionId, courseId, courseTitle,
    title: "Homework graded", message: (assignmentTitle ? '"' + assignmentTitle + '" was graded' : "Your homework was graded") + (score ? ":" + score : "."),
    link: "./student.html#homework/" + encodeURIComponent(assignmentId || "")
  }));
}

export function notifyQuizGraded({ attemptId, studentUid, quizId, quizTitle, courseId, courseTitle, score, maxPoints }) {
  if (!attemptId || !studentUid) return Promise.resolve(0);
  const s = score != null && score !== "" ? " " + score + (maxPoints ? "/" + maxPoints : "") : "";
  return fire(notifyUsers([studentUid], {
    type: "quizGraded", sourceId: attemptId, courseId, courseTitle,
    title: "Quiz graded", message: (quizTitle ? '"' + quizTitle + '" was graded' : "Your quiz was graded") + (s ? ":" + s : "."),
    link: "./student-quizzes.html?item=" + encodeURIComponent(quizId || attemptId)
  }));
}

/** Announcement: a course's students (and its trainers when posted by an admin), or everyone for "all". */
export function notifyAnnouncement({ id, courseId, courseTitle, title, body }) {
  if (!id) return Promise.resolve(0);
  const all = !courseId || courseId === "all";
  const who = all ? allMembers() : Promise.all([studentsOf(courseId), trainersOf(courseId)]).then(([s, t]) => [...s, ...t]);
  return fire(who.then((uids) => notifyUsers(uids, {
    type: "ann", sourceId: id, courseId: all ? "" : courseId, courseTitle: all ? "" : (courseTitle || ""),
    title: "Announcement", message: title || body || (all ? "Academy announcement" : "New announcement"),
    link: "./student-announcements.html?item=" + encodeURIComponent(id)
  })));
}

export function notifyEnrolled({ uid, courseId, courseTitle }) {
  if (!uid || !courseId) return Promise.resolve(0);
  return fire(notifyUsers([uid], {
    type: "enrolled", sourceId: uid + "_" + courseId, courseId, courseTitle,
    title: "Enrollment confirmed", message: "You're enrolled in " + (courseTitle || "your course") + ". Welcome!",
    link: "./student.html#courses?course=" + encodeURIComponent(courseId)
  }));
}

export function notifyRegistrationRejected({ regId, uid, courseId, courseTitle, note }) {
  if (!regId || !uid) return Promise.resolve(0);
  return fire(notifyUsers([uid], {
    type: "regRejected", sourceId: regId, courseId, courseTitle,
    title: "Registration not approved",
    message: "Your registration for " + (courseTitle || "the course") + " was not approved." + (note ? " Note: " + note : ""),
    link: "./student.html#regs?item=" + encodeURIComponent(regId)
  }));
}

export function notifyCertificateIssued({ certId, uid, courseId, courseTitle }) {
  if (!certId || !uid) return Promise.resolve(0);
  return fire(notifyUsers([uid], {
    type: "certIssued", sourceId: certId, courseId, courseTitle,
    title: "Certificate issued", message: "You received a certificate for " + (courseTitle || "your course") + ".",
    link: "./student.html#certificates"
  }));
}

/** Student → admins. */
export function notifyRegistrationReceived({ regId, courseId, courseTitle, studentName }) {
  if (!regId) return Promise.resolve(0);
  return fire(adminUids().then((uids) => notifyUsers(uids, {
    type: "regReceived", sourceId: regId, courseId, courseTitle,
    title: "New registration", message: (studentName || "{actor}") + " registered for " + (courseTitle || "a course"),
    link: "./admin.html#registrations"
  })));
}

export function notifyPaymentSubmitted({ regId, courseId, courseTitle, studentName }) {
  if (!regId) return Promise.resolve(0);
  return fire(adminUids().then((uids) => notifyUsers(uids, {
    type: "payReview", sourceId: regId, courseId, courseTitle,
    title: "Payment submitted", message: (studentName || "{actor}") + " submitted payment for " + (courseTitle || "a course"),
    link: "./admin.html#registrations"
  })));
}

/** Student → the course's trainers. */
export function notifyHomeworkSubmitted({ submissionId, courseId, courseTitle, assignmentTitle, studentName }) {
  if (!submissionId || !courseId) return Promise.resolve(0);
  return fire(trainersOf(courseId).then((uids) => notifyUsers(uids, {
    type: "hwSub", sourceId: submissionId, courseId, courseTitle,
    title: "Homework submitted", message: (studentName || "{actor}") + " submitted " + (assignmentTitle || "homework"),
    link: "./trainer.html#homework"
  })));
}

export function notifyQuizSubmitted({ attemptId, courseId, courseTitle, quizTitle, studentName }) {
  if (!attemptId || !courseId) return Promise.resolve(0);
  return fire(trainersOf(courseId).then((uids) => notifyUsers(uids, {
    type: "quizSub", sourceId: attemptId, courseId, courseTitle,
    title: "Quiz submitted", message: (studentName || "{actor}") + " submitted " + (quizTitle ? '"' + quizTitle + '"' : "a quiz"),
    link: "./trainer.html#quizzes"
  })));
}
