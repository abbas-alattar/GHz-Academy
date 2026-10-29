import { db } from "./firebase-config.js?v=auth8";
import { collection, query, where, getDocs, getDoc, doc, updateDoc, limit } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { gradeCalc } from "./gradeCalc.js";

const TTL = 60000;
const cache = new Map();
let lastUid = "";

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
function item(type, sourceId, time, title, message, courseTitle, link, extra) {
  if (!time) return null;
  return { id: type + "_" + sourceId + "_" + time, type, category: CAT[type] || "Courses", title, message, courseTitle: courseTitle || "", time, link, rel: rel(time), ...(extra || {}) };
}
async function settled(step, fn) {
  try { return await fn(); }
  catch (e) { console.error(step, e?.code || e?.message || e); return null; }
}
function rows(snap) { return snap && snap.docs ? snap.docs.map((d) => ({ id: d.id, ...d.data() })) : []; }

export function clearNotifCache() { cache.clear(); lastUid = ""; }

export async function loadNotifications({ role, uid, force }) {
  if (!uid) return { items: [], seenAt: 0, readIds: [], hiddenIds: [], muted: [] };
  if (lastUid && lastUid !== uid) cache.clear();
  lastUid = uid;
  const hit = cache.get(uid);
  if (!force && hit && Date.now() - hit.at < TTL) return hit.data;
  const userSnap = await settled("users", () => getDoc(doc(db, "users", uid)));
  const profile = userSnap && userSnap.exists() ? userSnap.data() : {};
  let seenAt = msOf(profile.notifSeenAt);
  const firstRun = !profile.notifSeenAt;
  let readIds = Array.isArray(profile.notifReadIds) ? profile.notifReadIds.slice() : [];
  let hiddenIds = Array.isArray(profile.notifHiddenIds) ? profile.notifHiddenIds.slice() : [];
  let muted = Array.isArray(profile.notifMuted) ? profile.notifMuted.slice() : [];
  const items = [];
  const keep = (n) => { if (n && n.time) items.push(n); };

  if (role === "student") {
    const ensRaw = rows(await settled("enrollments", () => getDocs(query(collection(db, "enrollments"), where("uid", "==", uid)))));
    const regs = rows(await settled("registrations", () => getDocs(query(collection(db, "registrations"), where("uid", "==", uid)))));
    const closed = new Set(regs.filter((r) => r.status === "cancelled" || r.status === "rejected").map((r) => r.courseId));
    const ens = ensRaw.filter((e) => !closed.has(e.courseId));
    const enrolledCourses = new Set(ens.map((e) => e.courseId).filter(Boolean));
    const ids = [...new Set(ens.map((e) => e.courseId).filter(Boolean))];
    const titles = {};
    ens.forEach((e) => { titles[e.courseId] = e.courseTitle || e.courseId; });
    const courseSnaps = await Promise.all(ids.map((id) => settled("course/" + id, () => getDoc(doc(db, "courses", id)))));
    const completed = new Set();
    courseSnaps.forEach((s, i) => {
      if (s && s.exists()) {
        const c = s.data();
        titles[ids[i]] = c.title || titles[ids[i]];
        if (c.status === "Completed") completed.add(ids[i]);
      }
    });
    const jobs = [];
    regs.forEach((r) => {
      const t = r.courseTitle || titles[r.courseId] || r.courseId || "course";
      const rid = encodeURIComponent(r.id);
      const st = String(r.status || "");
      if (enrolledCourses.has(r.courseId) || st === "confirmed" || r.confirmedAt) return;
      if (st === "pending_payment" || st === "pending") {
        keep(item("regReceived", r.id, msOf(r.createdAt), "Registration received", "Registration received for " + t + ". Complete your payment to confirm your seat.", t, "./student.html#regs?item=" + rid, { courseId: r.courseId, regId: r.id }));
      } else if (st === "payment_submitted") {
        keep(item("payReview", r.id, msOf(r.paymentDate || r.updatedAt || r.createdAt), "Payment under review", "We received your payment details for " + t + ". The academy is confirming them.", t, "./student.html#regs?item=" + rid, { courseId: r.courseId, regId: r.id }));
      } else if (st === "rejected") {
        keep(item("regRejected", r.id, msOf(r.updatedAt || r.rejectedAt || r.cancelledAt || r.createdAt), "Registration not approved", "Your registration for " + t + " was not approved.", t, "./student.html#regs?item=" + rid, { courseId: r.courseId, regId: r.id, tone: "red" }));
      } else if (st === "cancelled") {
        keep(item("regRejected", r.id, msOf(r.cancelledAt || r.updatedAt || r.createdAt), "Registration cancelled", "Your registration for " + t + " was cancelled", t, "./student.html#regs?item=" + rid, { courseId: r.courseId, regId: r.id, tone: "red" }));
      }
    });
    ens.forEach((e) => {
      const t = titles[e.courseId] || e.courseTitle || e.courseId || "course";
      keep(item("enrolled", e.id, msOf(e.enrolledAt || e.createdAt), "Enrollment confirmed", "You're enrolled in " + t + ". Welcome!", t, "./student.html#courses?course=" + encodeURIComponent(e.courseId || ""), { courseId: e.courseId, celebrate: true }));
    });
    courseSnaps.forEach((s, i) => {
      if (!s || !s.exists()) return;
      const c = s.data();
      if (c.status !== "Completed") return;
      const when = msOf(c.completedAt || c.updatedAt);
      if (!when) return;
      const t = c.title || titles[ids[i]] || ids[i];
      jobs.push(settled("passFail/" + ids[i], async () => {
        const gs = await getDoc(doc(db, "gradeScores", uid + "_" + ids[i]));
        const sch = await getDoc(doc(db, "gradeSchemes", ids[i]));
        const scores = gs.exists() ? (gs.data().scores || gs.data()) : {};
        const scheme = sch.exists() ? sch.data() : {};
        const cid = ids[i];
        const names = ["assignments", "submissions", "quizzes", "quizAttempts", "attendance", "sessions"];
        const pack = { courseId: cid, scheme, errors: {} };
        await Promise.all(names.map(async (n) => {
          try {
            const snap = await getDocs(query(collection(db, n), where("courseId", "==", cid)));
            pack[n] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          } catch { pack[n] = []; pack.errors[n] = true; }
        }));
        const g = gradeCalc({ id: cid, pack }, scheme, { uid, scores, pack });
        const passed = !g.failed && g.passed;
        const failed = !g.failed && !g.passed;
        if (passed) {
          keep(item("coursePass", ids[i] + "_" + when, when, "Congratulations", "Congratulations for passing the " + t + " course", t, "./student-grades.html?course=" + encodeURIComponent(ids[i]), { courseId: ids[i], pin: true, celebrate: true }));
        } else if (failed) {
          keep(item("courseFail", ids[i] + "_" + when, when, "Course not passed", "You did not pass the " + t + " course", t, "./student-grades.html?course=" + encodeURIComponent(ids[i]), { courseId: ids[i], pin: true, tone: "red" }));
        } else {
          keep(item("courseDone", ids[i] + "_" + when, when, "Course completed", t + " was marked completed. Your final grade is available.", t, "./student-grades.html?course=" + encodeURIComponent(ids[i]), { courseId: ids[i], pin: true }));
        }
      }));
    });
    ids.forEach((cid) => {
      const t = titles[cid] || cid;
      jobs.push(settled("assignments/" + cid, async () => {
        const snap = await getDocs(query(collection(db, "assignments"), where("courseId", "==", cid), where("status", "==", "Published")));
        rows(snap).forEach((a) => keep(item("hwPosted", a.id, msOf(a.publishedAt || a.createdAt), "Homework posted", "New homework: " + (a.title || "Homework"), t, "./student.html#homework?item=" + encodeURIComponent(a.id))));
      }));
      jobs.push(settled("quizzes/" + cid, async () => {
        const snap = await getDocs(query(collection(db, "quizzes"), where("courseId", "==", cid), where("status", "==", "Published")));
        rows(snap).forEach((q) => keep(item("quizPosted", q.id, msOf(q.publishedAt || q.createdAt), "Quiz posted", "New quiz: " + (q.title || "Quiz"), t, "./student-quizzes.html?item=" + encodeURIComponent(q.id))));
      }));
      jobs.push(settled("submissions/" + cid, async () => {
        const snap = await getDocs(query(collection(db, "submissions"), where("uid", "==", uid), where("courseId", "==", cid)));
        rows(snap).filter((s) => s.status === "graded").forEach((s) => {
          const title = s.assignmentTitle || "Homework";
          const msg = s.grade != null ? (title + " graded: " + s.grade + "/100") : (title + " graded");
          keep(item("hwGraded", s.id, msOf(s.gradedAt), "Homework graded", msg, t, "./student.html#homework/" + encodeURIComponent(s.assignmentId || "")));
        });
      }));
      jobs.push(settled("quizAttempts/" + cid, async () => {
        const snap = await getDocs(query(collection(db, "quizAttempts"), where("uid", "==", uid), where("courseId", "==", cid)));
        rows(snap).filter((s) => s.status === "graded" || s.status === "partial").forEach((s) => {
          const msg = s.maxScore ? "Your quiz was graded: " + (s.score ?? "—") + "/" + s.maxScore : "Your quiz was graded";
          keep(item("quizGraded", s.id, msOf(s.gradedAt), "Quiz graded", msg, t, "./student-quizzes.html?item=" + encodeURIComponent(s.quizId || s.id)));
        });
      }));
      jobs.push(settled("ann/" + cid, async () => {
        const snap = await getDocs(query(collection(db, "announcements"), where("courseId", "==", cid)));
        rows(snap).forEach((a) => keep(item("ann", a.id, msOf(a.createdAt), "Announcement", a.title || a.body || "New announcement", t, "./student-announcements.html?item=" + encodeURIComponent(a.id))));
      }));
      if (completed.has(cid)) {
        jobs.push(settled("gradeScores/" + cid, async () => {
          const gs = await getDoc(doc(db, "gradeScores", uid + "_" + cid));
          if (gs.exists()) keep(item("finalGrade", gs.id, msOf(gs.data().updatedAt), "Final grade updated", "Your course grade was updated", t, "./student-grades.html?course=" + encodeURIComponent(cid)));
        }));
      }
    });
    jobs.push(settled("certificates", async () => {
      const snap = await getDocs(query(collection(db, "certificates"), where("uid", "==", uid)));
      rows(snap).forEach((c) => {
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
    }));
    jobs.push(settled("annAll", async () => {
      const snap = await getDocs(query(collection(db, "announcements"), where("courseId", "==", "all")));
      rows(snap).forEach((a) => keep(item("ann", a.id, msOf(a.createdAt), "Announcement", a.title || a.body || "Academy announcement", "All courses", "./student-announcements.html?item=" + encodeURIComponent(a.id))));
    }));
    await Promise.allSettled(jobs);
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

  items.sort((a, b) => b.time - a.time);
  const slim = items;
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
