import { db } from "./firebase-config.js?v=auth10";
import { collection, query, where, getDocs, getDoc, doc, updateDoc, limit } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { formatGrade, resultFromStored } from "./gradeCalc.js";
import { completionRound } from "./seenBoxes.js";
import {
  asArray, asObject, getStudentStore, getCompletedCourses,
  ensureEnrollments, ensureRegistrations, ensureAssignments, ensureQuizzes,
  ensureSubmissions, ensureQuizAttempts, ensureAnnouncements, ensureCertificates, ensureCatalog
} from "./student-dash-data.js?v=stu11";

const TTL = 60000;
const cache = new Map();
let lastUid = "";
let prefsCache = { uid: "", data: null };

function msOf(t) {
  if (!t) return 0;
  if (typeof t.toMillis === "function") return t.toMillis();
  if (t.seconds) return t.seconds * 1000;
  const n = new Date(t).getTime();
  return Number.isFinite(n) ? n : 0;
}
function rel(ms) {
  const d = Date.now() - ms;
  if (d < 60000) return "now";
  if (d < 3600000) return Math.floor(d / 60000) + "m";
  if (d < 86400000) return Math.floor(d / 3600000) + "h";
  return Math.floor(d / 86400000) + "d";
}
export const CAT = {
  hwPosted: "Homework", hwGraded: "Grades", quizPosted: "Quizzes", quizGraded: "Grades",
  finalGrade: "Grades", courseGrade: "Grades", ann: "Announcements",
  hwSub: "Homework", quizSub: "Quizzes",
  regReceived: "Courses", payReview: "Courses", enrolled: "Courses", regRejected: "Courses", courseDone: "Courses",
  assigned: "Courses", course_assigned: "Courses", course_reopened: "Courses", course_completed: "Courses", gradeDist: "Grades", coursePass: "Grades", courseFail: "Grades", certIssued: "Courses", certRevoked: "Courses"
};
// Stable id per event ("type~source"), so re-saving a record doesn't create a "new" notification.
function item(type, sourceId, time, title, message, courseTitle, link, extra) {
  if (!time) return null;
  return { id: type + "~" + sourceId, type, category: CAT[type] || "Courses", title, message, courseTitle: courseTitle || "", time, link, rel: rel(time), ...(extra || {}) };
}
async function settled(step, fn) {
  try { return await fn(); }
  catch (e) { console.error(step, e?.code || e?.message || e); return null; }
}
function rows(snap) { return snap && snap.docs ? snap.docs.map((d) => ({ id: d.id, ...d.data() })) : []; }

// Old ids were "type_source_time". Convert saved read/hidden ids to the new "type~source" form.
const TYPES = Object.keys(CAT).sort((a, b) => b.length - a.length);
function migrateId(id) {
  const s = String(id || "");
  if (!s || s.includes("~")) return s;
  const base = s.replace(/_\d{10,}$/, "");
  const t = TYPES.find((k) => base.startsWith(k + "_"));
  return t ? t + "~" + base.slice(t.length + 1) : s;
}
export function migrateIds(list) {
  return Array.from(new Set((Array.isArray(list) ? list : []).map(migrateId).filter(Boolean)));
}
function dedupeItems(list) {
  const byId = new Map();
  (list || []).forEach((n) => { if (n && (!byId.has(n.id) || n.time > byId.get(n.id).time)) byId.set(n.id, n); });
  return Array.from(byId.values());
}

export function clearNotifCache() { cache.clear(); lastUid = ""; prefsCache = { uid: "", data: null }; }

export async function loadNotifPrefs(uid, force) { return loadStudentPrefs(uid, force); }
async function loadStudentPrefs(uid, force) {
  if (!force && prefsCache.uid === uid && prefsCache.data) return prefsCache.data;
  const userSnap = await settled("users", () => getDoc(doc(db, "users", uid)));
  const profile = userSnap && userSnap.exists() ? userSnap.data() : {};
  const data = {
    seenAt: msOf(profile.notifSeenAt),
    firstRun: !profile.notifSeenAt,
    readIds: migrateIds(profile.notifReadIds),
    hiddenIds: migrateIds(profile.notifHiddenIds),
    muted: Array.isArray(profile.notifMuted) ? profile.notifMuted.slice() : []
  };
  prefsCache = { uid, data };
  return data;
}

function arr(x) { return asArray ? asArray(x) : (Array.isArray(x) ? x : []); }
function obj(x) { return asObject ? asObject(x) : (x && typeof x === "object" && !Array.isArray(x) ? x : {}); }

function buildStudentItemsFromStore(uid, store) {
  const items = [];
  const keep = (n) => { if (n && n.time) items.push(n); };
  const st = store || getStudentStore() || {};
  const regs = arr(st.registrations);
  const ensRaw = arr(st.enrollments);
  const closed = new Set(regs.filter((r) => r.status === "cancelled" || r.status === "rejected").map((r) => r.courseId));
  const ens = ensRaw.filter((e) => e.courseId && !closed.has(e.courseId));
  const enrolledCourses = new Set(ens.map((e) => e.courseId).filter(Boolean));
  const ids = [...new Set(ens.map((e) => e.courseId).filter(Boolean))];
  const titles = {};
  const courses = obj(st.courses);
  const catalog = arr(st.catalog);
  catalog.forEach((c) => { if (c.id) titles[c.id] = c.title || titles[c.id]; });
  Object.keys(courses).forEach((id) => { titles[id] = courses[id]?.title || titles[id]; });
  ens.forEach((e) => { titles[e.courseId] = titles[e.courseId] || e.courseTitle || e.courseId; });
  const completedList = typeof getCompletedCourses === "function" ? getCompletedCourses(st) : [];
  const completed = new Set(completedList.map((c) => c.id || c.courseId).filter(Boolean));
  ids.forEach((id) => {
    const c = courses[id];
    if (c && String(c.status || "") === "Completed") completed.add(id);
  });
  const scores = obj(st.gradeScores);
  const schemes = obj(st.gradeSchemes);

  regs.forEach((r) => {
    const t = r.courseTitle || titles[r.courseId] || r.courseId || "course";
    const rid = encodeURIComponent(r.id);
    const stt = String(r.status || "");
    if (enrolledCourses.has(r.courseId) || stt === "confirmed" || r.confirmedAt) return;
    if (stt === "pending_payment" || stt === "pending") {
      keep(item("regReceived", r.id, msOf(r.createdAt), "Registration received", "Registration received for " + t + ". Complete your payment to confirm your seat.", t, "./student.html#regs?item=" + rid, { courseId: r.courseId, regId: r.id }));
    } else if (stt === "payment_submitted") {
      keep(item("payReview", r.id, msOf(r.paymentDate || r.updatedAt || r.createdAt), "Payment under review", "We received your payment details for " + t + ". The academy is confirming them.", t, "./student.html#regs?item=" + rid, { courseId: r.courseId, regId: r.id }));
    } else if (stt === "rejected") {
      keep(item("regRejected", r.id, msOf(r.updatedAt || r.rejectedAt || r.cancelledAt || r.createdAt), "Registration not approved", "Your registration for " + t + " was not approved.", t, "./student.html#regs?item=" + rid, { courseId: r.courseId, regId: r.id, tone: "red" }));
    } else if (stt === "cancelled") {
      keep(item("regRejected", r.id, msOf(r.cancelledAt || r.updatedAt || r.createdAt), "Registration cancelled", "Your registration for " + t + " was cancelled", t, "./student.html#regs?item=" + rid, { courseId: r.courseId, regId: r.id, tone: "red" }));
    }
  });
  ens.forEach((e) => {
    const t = titles[e.courseId] || e.courseTitle || e.courseId || "course";
    keep(item("enrolled", e.id, msOf(e.enrolledAt || e.createdAt), "Enrollment confirmed", "You're enrolled in " + t + ". Welcome!", t, "./student.html#courses?course=" + encodeURIComponent(e.courseId || ""), { courseId: e.courseId, celebrate: true }));
  });
  completed.forEach((cid) => {
    const c = courses[cid] || catalog.find((x) => x.id === cid) || {};
    if (String(c.status || "") !== "Completed") return;
    const round = completionRound(c);
    const when = msOf(c.completedAt) || Date.now();
    const t = c.title || titles[cid] || cid;
    const gs = scores[cid] || scores[uid + "_" + cid] || {};
    const scheme = schemes[cid] || {};
    let passed = false, failed = false, avgTxt = "";
    try {
      const g = resultFromStored(scheme, gs, "Completed");
      if (g && Number.isFinite(g.avg)) {
        passed = g.passed === true;
        failed = g.passed === false;
        avgTxt = " · Average " + formatGrade(g.avg);
      }
    } catch (_) {}
    const src = cid + "_r" + round;
    const verdict = passed ? "Passed" : (failed ? "Failed" : "Completed");
    keep(item(passed ? "coursePass" : (failed ? "courseFail" : "courseDone"), src, when, "Course completed: " + t, "Course completed: " + t + " · " + verdict + avgTxt, t, "./student.html#grades", { courseId: cid, pin: true, celebrate: passed, tone: failed ? "red" : undefined }));
  });
  arr(st.assignments).forEach((a) => {
    if (a.status && a.status !== "Published") return;
    const t = titles[a.courseId] || a.courseTitle || a.courseId || "course";
    keep(item("hwPosted", a.id, msOf(a.publishedAt || a.createdAt), "Homework posted", "New homework: " + (a.title || "Homework"), t, "./student.html#homework?item=" + encodeURIComponent(a.id)));
  });
  arr(st.quizzes).forEach((q) => {
    if (q.status && q.status !== "Published") return;
    const t = titles[q.courseId] || q.courseTitle || q.courseId || "course";
    keep(item("quizPosted", q.id, msOf(q.publishedAt || q.createdAt), "Quiz posted", "New quiz: " + (q.title || "Quiz"), t, "./student-quizzes.html?item=" + encodeURIComponent(q.id)));
  });
  arr(st.submissions).filter((s) => s.status === "graded").forEach((s) => {
    const t = titles[s.courseId] || s.courseTitle || s.courseId || "course";
    const title = s.assignmentTitle || "Homework";
    const msg = s.grade != null ? (title + " graded: " + s.grade + "/100") : (title + " graded");
    keep(item("hwGraded", s.id, msOf(s.gradedAt), "Homework graded", msg, t, "./student.html#homework/" + encodeURIComponent(s.assignmentId || "")));
  });
  arr(st.quizAttempts).filter((s) => s.status === "graded" || s.status === "partial").forEach((s) => {
    const t = titles[s.courseId] || s.courseTitle || s.courseId || "course";
    const msg = s.maxScore ? "Your quiz was graded: " + (s.score ?? "—") + "/" + s.maxScore : "Your quiz was graded";
    keep(item("quizGraded", s.id, msOf(s.gradedAt), "Quiz graded", msg, t, "./student-quizzes.html?item=" + encodeURIComponent(s.quizId || s.id)));
  });
  arr(st.announcements).forEach((a) => {
    const all = a.courseId === "all";
    const t = all ? "All courses" : (titles[a.courseId] || a.courseTitle || a.courseId || "course");
    keep(item("ann", a.id, msOf(a.createdAt), "Announcement", a.title || a.body || (all ? "Academy announcement" : "New announcement"), t, "./student-announcements.html?item=" + encodeURIComponent(a.id)));
  });
  arr(st.certificates).forEach((c) => {
    const t = c.courseTitle || titles[c.courseId] || c.courseId || "your course";
    const link = "./student-certificates.html?item=" + encodeURIComponent(c.id);
    if (String(c.status) === "revoked") {
      const when = msOf(c.revokedAt || c.updatedAt || c.issuedAt || c.createdAt);
      keep(item("certRevoked", c.id, when, "Certificate revoked", "Your certificate for " + t + " was revoked." + (c.revokeReason ? " Reason: " + c.revokeReason : ""), t, link, { courseId: c.courseId, pin: true, tone: "red" }));
    } else {
      const when = msOf(c.issuedAt || c.createdAt);
      keep(item("certIssued", c.id, when, "Certificate issued", "You received a certificate for " + t + ".", t, link, { courseId: c.courseId, pin: true, celebrate: true }));
    }
  });
  items.sort((a, b) => b.time - a.time);
  return items;
}

export function studentNotifsFromStore(uid, store) {
  return dedupeItems(buildStudentItemsFromStore(uid, store));
}

export async function loadNotifications({ role, uid, force }) {
  if (!uid) return { items: [], seenAt: 0, readIds: [], hiddenIds: [], muted: [] };
  if (lastUid && lastUid !== uid) cache.clear();
  lastUid = uid;
  const hit = cache.get(uid);
  if (!force && hit && Date.now() - hit.at < TTL) return hit.data;
  const prefs = await loadStudentPrefs(uid, force);
  let seenAt = prefs.seenAt;
  const firstRun = prefs.firstRun;
  let readIds = prefs.readIds.slice();
  let hiddenIds = prefs.hiddenIds.slice();
  let muted = prefs.muted.slice();
  const items = [];
  const keep = (n) => { if (n && n.time) items.push(n); };

  if (role === "student") {
    await Promise.all([
      ensureEnrollments(), ensureRegistrations(), ensureCatalog(),
      ensureAssignments(), ensureQuizzes(), ensureSubmissions(),
      ensureQuizAttempts(), ensureAnnouncements(), ensureCertificates()
    ]);
    buildStudentItemsFromStore(uid, getStudentStore()).forEach(keep);
  } else if (role === "trainer") {
    const cs = rows(await settled("courses", () => getDocs(query(collection(db, "courses"), where("trainerIds", "array-contains", uid)))));
    cs.forEach((c) => {
      const t = c.title || c.id;
      const when = msOf(c.trainerAssigned?.[uid]);
      if (when) {
        keep(item("course_assigned", c.id + "_" + when, when, "New course assigned", "You were assigned to " + t, t, "./trainer.html#course/" + encodeURIComponent(c.id), { courseId: c.id, pin: true }));
      }
      const reopenWhen = msOf(c.reopenedAt) || (String(c.status) !== "Completed" ? msOf(c.completedAt) : 0);
      if (reopenWhen && String(c.status) !== "Completed") {
        keep(item("course_reopened", c.id + "_" + reopenWhen, reopenWhen, "Course reopened", t + " was reopened by the admin. Grades, homework, quizzes and attendance are editable again.", t, "./trainer.html#course/" + encodeURIComponent(c.id), { courseId: c.id, pin: true }));
      }
      const doneWhen = msOf(c.completedAt);
      if (String(c.status) === "Completed" && doneWhen) {
        keep(item("course_completed", c.id + "_" + doneWhen, doneWhen, "Course completed", t + " was completed. Thank you for training at GHz Academy.", t, "./trainer.html#grades/" + encodeURIComponent(c.id), { courseId: c.id, pin: true }));
      }
    });
    const jobs = [];
    cs.forEach((c) => {
      const t = c.title || c.id;
      jobs.push(settled("gradeScheme/" + c.id, async () => {
        const gs = await getDoc(doc(db, "gradeSchemes", c.id));
        if (gs.exists()) {
          const g = gs.data();
          const when = msOf(g.updatedAt);
          if (when) keep(item("gradeDist", c.id, when, "Grade distribution", (g.createdAt ? "Grade distribution updated for " : "Grade distribution set for ") + t, t, "./trainer-grades.html?course=" + encodeURIComponent(c.id), { courseId: c.id }));
        }
      }));
      jobs.push(settled("ann/" + c.id, async () => {
        const snap = await getDocs(query(collection(db, "announcements"), where("courseId", "==", c.id)));
        rows(snap).filter((a) => a.createdBy !== uid && a.authorId !== uid).forEach((a) => {
          const isAdmin = a.createdByRole === "admin" || a.authorRole === "admin";
          keep(item("ann", a.id, msOf(a.createdAt), "Announcement", a.title || "New announcement", t, "./trainer-announcements.html?item=" + encodeURIComponent(a.id), { fromAdmin: isAdmin }));
        });
      }));
      jobs.push(settled("sub/" + c.id, async () => {
        const snap = await getDocs(query(collection(db, "submissions"), where("courseId", "==", c.id)));
        rows(snap).filter((s) => s.status === "submitted").forEach((s) => keep(item("hwSub", s.id, msOf(s.submittedAt), "Homework submitted", (s.studentName || "A student") + " submitted " + (s.assignmentTitle || "homework"), t, "./trainer.html#homework?course=" + encodeURIComponent(c.id) + "&item=" + encodeURIComponent(s.id))));
      }));
      jobs.push(settled("qa/" + c.id, async () => {
        const snap = await getDocs(query(collection(db, "quizAttempts"), where("courseId", "==", c.id)));
        rows(snap).filter((s) => s.status === "submitted").forEach((s) => keep(item("quizSub", s.id, msOf(s.submittedAt || s.createdAt), "Quiz submitted", (s.studentName || "A student") + " submitted a quiz", t, "./trainer.html#quizzes?course=" + encodeURIComponent(c.id) + "&item=" + encodeURIComponent(s.id))));
      }));
    });
    jobs.push(settled("annAll", async () => {
      const snap = await getDocs(query(collection(db, "announcements"), where("courseId", "==", "all")));
      rows(snap).filter((a) => a.createdBy !== uid && a.authorId !== uid).forEach((a) => keep(item("ann", a.id, msOf(a.createdAt), "Announcement", a.title || "Academy announcement", "All courses", "./trainer-announcements.html?item=" + encodeURIComponent(a.id))));
    }));
    await Promise.allSettled(jobs);
  } else if (role === "admin") {
    const jobs = [];
    jobs.push(settled("regs", async () => {
      const snap = await getDocs(collection(db, "registrations"));
      rows(snap).forEach((r) => {
        const t = r.courseTitle || r.courseId || "course";
        const st = String(r.status || "");
        const who = r.studentName || r.name || r.email || "A student";
        if (st === "pending_payment" || st === "pending" || st === "payment_submitted") {
          keep(item("regReceived", r.id, msOf(r.createdAt || r.updatedAt), "New registration", who + " registered for " + t, t, "./admin.html#registrations", { courseId: r.courseId }));
        }
        if (st === "payment_submitted") {
          keep(item("payReview", r.id, msOf(r.paymentDate || r.updatedAt || r.createdAt), "Payment submitted", who + " submitted payment for " + t, t, "./admin.html#registrations", { courseId: r.courseId }));
        }
        if (st === "confirmed" || st === "enrolled") {
          keep(item("enrolled", r.id, msOf(r.confirmedAt || r.enrolledAt || r.updatedAt), "Payment confirmed", who + " is confirmed for " + t, t, "./admin.html#registrations", { courseId: r.courseId }));
        }
        if (st === "rejected") {
          keep(item("regRejected", r.id, msOf(r.rejectedAt || r.updatedAt), "Registration rejected", who + " was rejected for " + t, t, "./admin.html#registrations", { courseId: r.courseId, tone: "red" }));
        }
      });
    }));
    jobs.push(settled("gradeScores", async () => {
      const snap = await getDocs(collection(db, "gradeScores"));
      const list = rows(snap);
      const trainerIds = [...new Set(list.map((g) => g.updatedBy).filter(Boolean))];
      const names = {};
      await Promise.allSettled(trainerIds.map(async (id) => {
        const u = await getDoc(doc(db, "users", id));
        if (u.exists()) names[id] = u.data().name || id;
      }));
      list.forEach((g) => {
        const by = g.updatedBy;
        if (!by || by === uid) return;
        const trainer = names[by] || "Trainer";
        keep(item("courseGrade", g.id, msOf(g.updatedAt), "Course grade saved", trainer + " saved a grade for " + (g.studentName || "a student"), g.courseTitle || g.courseId || "", "./admin.html#grades?course=" + encodeURIComponent(g.courseId || ""), { courseId: g.courseId }));
      });
    }));
    jobs.push(settled("gradeSchemes", async () => {
      const snap = await getDocs(collection(db, "gradeSchemes"));
      rows(snap).forEach((g) => {
        const when = msOf(g.updatedAt || g.createdAt);
        if (!when) return;
        const t = g.courseTitle || g.courseId || g.id;
        keep(item("gradeDist", g.id, when, "Grade distribution", "Grade distribution updated for " + t, t, "./admin.html#grades?course=" + encodeURIComponent(g.courseId || g.id), { courseId: g.courseId || g.id }));
      });
    }));
    jobs.push(settled("annTrainer", async () => {
      const snap = await getDocs(collection(db, "announcements"));
      rows(snap).filter((a) => {
        const roleA = String(a.authorRole || a.createdByRole || "").toLowerCase();
        return roleA === "trainer" || (a.createdBy && a.createdBy !== uid && roleA !== "admin");
      }).forEach((a) => {
        const course = a.courseTitle || a.courseId || "course";
        keep(item("ann", a.id, msOf(a.createdAt), "Announcement by " + (a.authorName || "Trainer"), a.body || a.title || "", course, "./admin.html#announcements", { courseId: a.courseId, announcementId: a.id }));
      });
    }));
    jobs.push(settled("hwSub", async () => {
      const snap = await getDocs(collection(db, "submissions"));
      rows(snap).filter((s) => s.status === "submitted").forEach((s) => {
        const t = s.courseTitle || s.courseId || "course";
        keep(item("hwSub", s.id, msOf(s.submittedAt || s.createdAt), "Homework submitted", (s.studentName || "A student") + " submitted " + (s.assignmentTitle || "homework"), t, "./admin.html#grades?course=" + encodeURIComponent(s.courseId || ""), { courseId: s.courseId }));
      });
    }));
    jobs.push(settled("quizSub", async () => {
      const snap = await getDocs(collection(db, "quizAttempts"));
      rows(snap).filter((s) => s.status === "submitted" || s.status === "in_review").forEach((s) => {
        const t = s.courseTitle || s.courseId || "course";
        keep(item("quizSub", s.id, msOf(s.submittedAt || s.createdAt), "Quiz submitted", (s.studentName || "A student") + " submitted a quiz", t, "./admin.html#grades?course=" + encodeURIComponent(s.courseId || ""), { courseId: s.courseId }));
      });
    }));
    jobs.push(settled("courses", async () => {
      const snap = await getDocs(collection(db, "courses"));
      rows(snap).forEach((c) => {
        const t = c.title || c.id;
        const st = String(c.status || "");
        if (st === "Completed") {
          keep(item("courseDone", c.id, msOf(c.completedAt || c.updatedAt), "Course completed", t + " was marked completed", t, "./admin.html#courses", { courseId: c.id }));
        } else if (c.completedAt && st !== "Completed") {
          keep(item("assigned", c.id + "_reopen", msOf(c.updatedAt || c.completedAt), "Course reopened", t + " was reopened", t, "./admin.html#courses", { courseId: c.id }));
        }
      });
    }));
    await Promise.allSettled(jobs);
  }

  const slim = dedupeItems(items).sort((a, b) => b.time - a.time);
  const liveIds = new Set(slim.map((x) => x.id));
  readIds = readIds.filter((id) => liveIds.has(id)).slice(0, 300);
  const data = { items: slim, seenAt, readIds, hiddenIds, muted, firstRun };
  cache.set(uid, { at: Date.now(), data });
  return data;
}

export async function saveSeen(uid, seenAt, readIds, extra) {
  try {
    const patch = { notifSeenAt: seenAt, notifReadIds: (readIds || []).slice(0, 300) };
    if (extra && extra.hiddenIds) patch.notifHiddenIds = extra.hiddenIds.slice(0, 300);
    if (extra && extra.muted) patch.notifMuted = extra.muted;
    await updateDoc(doc(db, "users", uid), patch);
  } catch (e) { console.error("users/notif", e?.code || e); }
}
