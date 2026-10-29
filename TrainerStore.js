import { db } from "./firebase-config.js?v=auth8";
import { collection, getDocs, onSnapshot, query, where } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { bootPending, bootOk, bootFail } from "./bootTrace.js";

const CACHE_KEY = "ghz-trainer-store-v2";
let cache = null;
let inflight = null;
const listeners = new Set();
let token = 0;
let autoTried = false;
let unsubCourses = null;
let liveUid = "";

function withTimeout(p, ms, label) {
  return Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(new Error((label || "Load") + " timed out")), ms))
  ]);
}
function readDisk() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (!o || o.v !== 2 || !o.uid) { sessionStorage.removeItem(CACHE_KEY); return null; }
    return o;
  } catch { try { sessionStorage.removeItem(CACHE_KEY); } catch {} return null; }
}
function writeDisk(o) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({
      v: 2, uid: o.uid, courses: (o.courses || []).map((c) => ({ id: c.id, title: c.title, status: c.status, startDate: c.startDate, endDate: c.endDate, trainerNames: c.trainerNames, trainerName: c.trainerName, deliveryDays: c.deliveryDays, startTime: c.startTime, endTime: c.endTime, schedule: c.schedule, trainerIds: c.trainerIds, trainerId: c.trainerId, trainerAssigned: c.trainerAssigned, reopenedAt: c.reopenedAt, reopenCount: c.reopenCount, completedAt: c.completedAt })), at: Date.now()
    }));
  } catch {}
}
export function clearTrainerStoreCache() {
  cache = null; inflight = null;
  try { if (unsubCourses) unsubCourses(); } catch {}
  unsubCourses = null; liveUid = "";
  try { sessionStorage.removeItem(CACHE_KEY); } catch {}
}

function emit() {
  listeners.forEach((fn) => { try { fn(cache); } catch (e) { console.error("TrainerStore", e); } });
  try { window.dispatchEvent(new CustomEvent("ghz-trainer-courses", { detail: { uid: cache?.uid, courses: cache?.courses || [] } })); } catch (_) {}
}
function msg(e) { return (e?.code || "") + " " + (e?.message || e); }

export function subscribeTrainerStore(fn) {
  listeners.add(fn);
  if (cache) fn(cache);
  return () => listeners.delete(fn);
}

export function getTrainerStore() { return cache; }

function applyLiveCourses(uid, courses) {
  const base = cache && cache.uid === uid ? cache : empty(uid);
  cache = { ...base, courses, err: "", at: Date.now(), loading: false };
  writeDisk(cache);
  emit();
}
function startLiveCourses(uid) {
  if (liveUid === uid && unsubCourses) return;
  try { if (unsubCourses) unsubCourses(); } catch {}
  unsubCourses = null;
  liveUid = uid;
  const q1 = query(collection(db, "courses"), where("trainerIds", "array-contains", uid));
  unsubCourses = onSnapshot(q1, (snap) => {
    const courses = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    applyLiveCourses(uid, courses);
    if (!cache?.extrasReady) loadExtras(uid, token).catch(() => {});
  }, () => {
    const q2 = query(collection(db, "courses"), where("trainerId", "==", uid));
    try { if (unsubCourses) unsubCourses(); } catch {}
    unsubCourses = onSnapshot(q2, (snap) => {
      const courses = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      applyLiveCourses(uid, courses);
    }, () => {});
  });
}
function empty(uid) {
  return {
    uid, courses: [], enrollments: [], assignments: [], quizzes: [], sessions: [], attendance: [],
    submissions: [], quizAttempts: [], quizQuestions: [], quizKeys: [], announcements: [], announcementReads: [], counts: {}, pendingHw: 0, nextSession: null,
    err: "", extraErr: "", hwErr: "", quizErr: "", sessErr: "", attErr: "", enrErr: "", annErr: "", at: 0, extrasReady: false, annsReady: false, loading: true
  };
}

export async function loadTrainerStore(uid, { force } = {}) {
  if (!uid) return cache;
  if (!cache) {
    const disk = readDisk();
    if (disk && disk.uid === uid && Array.isArray(disk.courses)) {
      cache = { ...empty(uid), courses: disk.courses, at: disk.at || Date.now() };
      emit();
    }
  }
  if (cache && cache.uid === uid && !force) {
    refreshTrainerStore(uid);
    return cache;
  }
  if (inflight && !force) return inflight;
  const my = ++token;
  inflight = (async () => {
    const base = cache && cache.uid === uid ? cache : empty(uid);
    if (!cache) { cache = { ...base, at: Date.now() }; emit(); }
    try {
      bootPending("courses query");
      const cs = await withTimeout(getDocs(query(collection(db, "courses"), where("trainerIds", "array-contains", uid))), 8000, "Courses");
      let courses = cs.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (!courses.length) {
        try {
          const cs2 = await withTimeout(getDocs(query(collection(db, "courses"), where("trainerId", "==", uid))), 5000, "Courses");
          courses = cs2.docs.map((d) => ({ id: d.id, ...d.data() }));
        } catch (e2) { bootFail("courses query trainerId", e2); }
      }
      bootOk("courses query", "count " + courses.length);
      cache = { ...base, courses, err: "", at: Date.now(), extrasReady: false, annsReady: false, loading: false };
      writeDisk(cache);
      if (my === token) emit();
      startLiveCourses(uid);
      bootOk("store ready", String(courses.length) + " courses");
      loadExtras(uid, my).catch((e) => {
        bootFail("optional loads", e);
        cache = { ...(cache || base), extraErr: msg(e), extrasReady: true, at: Date.now() };
        if (my === token) emit();
      });
    } catch (e) {
      bootFail("courses query", e);
      cache = { ...base, err: msg(e) || "Taking longer than expected", at: Date.now(), extrasReady: true, loading: false };
      if (my === token) emit();
    }
    inflight = null;
    return cache;
  })();
  return inflight;
}

export function refreshTrainerStore(uid) {
  loadTrainerStore(uid, { force: true });
}

async function byCourse(col, ids) {
  const out = [];
  const errs = [];
  await Promise.all(ids.map(async (id) => {
    try {
      const snap = await getDocs(query(collection(db, col), where("courseId", "==", id)));
      snap.docs.forEach((d) => out.push({ id: d.id, ...d.data() }));
    } catch (e) {
      errs.push(col + ": " + msg(e));
    }
  }));
  return { out, err: errs.join(" · ") };
}

async function loadAnnouncements(uid, ids) {
  const jobs = [
    getDocs(query(collection(db, "announcements"), where("courseId", "==", "all"))),
    ...ids.map((id) => getDocs(query(collection(db, "announcements"), where("courseId", "==", id)))),
    getDocs(query(collection(db, "announcementReads"), where("uid", "==", uid)))
  ];
  const settled = await Promise.allSettled(jobs);
  const announcements = [];
  const seen = new Set();
  const errs = [];
  settled.slice(0, -1).forEach((r) => {
    if (r.status === "fulfilled") {
      r.value.docs.forEach((d) => {
        if (seen.has(d.id)) return;
        seen.add(d.id);
        announcements.push({ id: d.id, ...d.data() });
      });
    } else errs.push("announcements: " + msg(r.reason));
  });
  announcements.sort((a, b) => {
    const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
    const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
    return tb - ta;
  });
  let announcementReads = [];
  const last = settled[settled.length - 1];
  if (last.status === "fulfilled") announcementReads = last.value.docs.map((d) => ({ id: d.id, ...d.data() }));
  else errs.push("announcementReads: " + msg(last.reason));
  return { announcements, announcementReads, annErr: errs.join(" · ") };
}

async function loadExtras(uid, my) {
  if (!cache || cache.uid !== uid) return;
  const ids = (cache.courses || []).map((c) => c.id);
  bootPending("optional loads");
  const [enr, asg, quiz, sess, sub, att, qq, atd] = await Promise.allSettled([
    byCourse("enrollments", ids),
    byCourse("assignments", ids),
    byCourse("quizzes", ids),
    byCourse("sessions", ids),
    byCourse("submissions", ids),
    byCourse("quizAttempts", ids),
    byCourse("quizQuestions", ids),
    byCourse("attendance", ids)
  ]).then((rows) => rows.map((r) => r.status === "fulfilled" ? r.value : { out: [], err: msg(r.reason) }));
  const counts = {};
  ids.forEach((id) => { counts[id] = enr.out.filter((x) => x.courseId === id && String(x.status || "").toLowerCase() !== "cancelled").length; });
  const pendingHw = sub.out.filter((s) => s.status === "submitted").length;
  const now = Date.now();
  const upcoming = sess.out.map((s) => {
    const d = s.date ? new Date(String(s.date) + "T" + (s.startTime || "00:00")) : null;
    return { ...s, t: d && !isNaN(d) ? d.getTime() : 0 };
  }).filter((s) => s.t >= now - 3600000).sort((a, b) => a.t - b.t);
  if (my !== token) return;
  cache = {
    ...cache,
    enrollments: enr.out, assignments: asg.out, quizzes: quiz.out, sessions: sess.out, submissions: sub.out,
    quizAttempts: att.out, quizQuestions: qq.out, quizKeys: [], attendance: atd.out,
    counts, pendingHw, nextSession: upcoming[0] || null,
    enrErr: enr.err, hwErr: [asg.err, sub.err].filter(Boolean).join(" · "), quizErr: [quiz.err, att.err, qq.err].filter(Boolean).join(" · "), sessErr: sess.err, attErr: atd.err,
    extraErr: "", extrasReady: true, at: Date.now()
  };
  bootOk("optional loads", [enr.err, asg.err, quiz.err, sess.err, atd.err].filter(Boolean).join(" · ") || "ok");
  emit();
  const an = await loadAnnouncements(uid, ids);
  if (my !== token) return;
  cache = { ...cache, announcements: an.announcements, announcementReads: an.announcementReads, annErr: an.annErr, annsReady: true, at: Date.now() };
  emit();
  if ((enr.err || sess.err) && !autoTried) {
    autoTried = true;
    setTimeout(() => refreshTrainerStore(uid), 2000);
  }
}

const COURSE_KEYS = {
  attendance: "ghz-trainer-att-course",
  homework: "ghz-trainer-hw-course",
  quizzes: "ghz-trainer-qz-course",
  grades: "ghz-trainer-gr-course"
};
export function getTrainerCourseId(kind) {
  try { return sessionStorage.getItem(COURSE_KEYS[kind] || kind) || ""; } catch { return ""; }
}
export function setTrainerCourseId(kind, id) {
  try { sessionStorage.setItem(COURSE_KEYS[kind] || kind, id || ""); } catch {}
}
export function resolveTrainerCourseId(kind, { hashId, courses, sessionCourseId } = {}) {
  const list = courses || [];
  const open = list.find((c) => c.status === "Open" || c.status === "Closed");
  const ok = (id) => id && list.some((c) => c.id === id);
  if (ok(hashId)) { setTrainerCourseId(kind, hashId); return hashId; }
  if (ok(sessionCourseId)) { setTrainerCourseId(kind, sessionCourseId); return sessionCourseId; }
  const stored = getTrainerCourseId(kind);
  if (ok(stored)) return stored;
  const id = open?.id || list[0]?.id || "";
  if (id) setTrainerCourseId(kind, id);
  return id;
}
export function navToken() { return ++token; }
export function currentNavToken() { return token; }
