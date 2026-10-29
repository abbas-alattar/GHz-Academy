import { auth, db } from "./firebase-config.js?v=auth8";
import { collection, query, where, getDocs, getDoc, doc, limit } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { studentCacheClear, studentCacheGet, studentCacheSet, logFail } from "./student-fetch.js";

const listeners = new Set();
let cache = null;
let lastAt = 0;
let loading = false;
let lastUid = "";
let loadCount = 0;
const DISK = "ghz-student-store-v1";
function readDisk() {
  try {
    const raw = sessionStorage.getItem(DISK);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (!o || !o.data) return null;
    return o;
  } catch { return null; }
}
function writeDisk(data) {
  try {
    const slim = {
      user: data.user, name: data.name, studentId: data.studentId,
      enrollments: data.enrollments, courseIds: data.courseIds,
      courses: data.courses, registrations: data.registrations,
      certificates: data.certificates, status: data.status, loadedAt: data.loadedAt
    };
    sessionStorage.setItem(DISK, JSON.stringify({ uid: lastUid, at: Date.now(), data: slim }));
  } catch (_) {}
}
try {
  const disk = readDisk();
  if (disk?.data) { cache = { ...disk.data, status: disk.data.status || "ready", toMs }; lastAt = disk.at || 0; lastUid = disk.uid || ""; }
} catch (_) {}

export function onDashData(fn) { listeners.add(fn); if (cache) fn(cache); return () => listeners.delete(fn); }
export function lastUpdated() { return lastAt; }

const toMs = (t) => t?.toMillis ? t.toMillis() : t ? new Date(t).getTime() : 0;
const fail = (step, e) => ({ step, code: e?.code || e?.message || String(e) });

const emit = (data) => {
  cache = data;
  lastAt = Date.now();
  listeners.forEach((fn) => { try { fn(cache); } catch (_) {} });
  try {
    window.__ghzDash = cache;
    sessionStorage.setItem("ghz-dash-search-v4", JSON.stringify({
      courses: cache.courses,
      assignments: (cache.assignments || []).map((a) => ({ title: a.title, courseId: a.courseId })),
      quizzes: (cache.quizzes || []).map((a) => ({ title: a.title, courseId: a.courseId })),
      announcements: (cache.announcements || []).map((a) => ({ title: a.title }))
    }));
  } catch (_) {}
};

async function safe(step, fn, errors) {
  try {
    const timed = Promise.race([
      fn(),
      new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error("timeout"), { code: "timeout" })), 10000))
    ]);
    return await timed;
  } catch (e) {
    errors[step] = fail(step, e);
    logFail(step, e);
    return null;
  }
}

function emptyData(user) {
  return {
    user,
    name: user.displayName || "student",
    enrollments: [],
    courseIds: [],
    sessions: [],
    assignments: [],
    quizzes: [],
    announcements: [],
    announcementReadIds: [],
    submissions: [],
    quizAttempts: [],
    attendance: [],
    registrations: [],
    certificates: [],
    gradeSchemes: {},
    gradeScores: {},
    courses: {},
    errors: {},
    status: "loading",
    loadedAt: Date.now(),
    toMs
  };
}

export async function loadStudentDash(force) {
  const user = auth.currentUser;
  if (!user) return;
  if (lastUid && lastUid !== user.uid) {
    cache = null;
    studentCacheClear();
    try { sessionStorage.removeItem(DISK); } catch (_) {}
  }
  lastUid = user.uid;
  if (cache && cache.courses && Object.keys(cache.courses).length && !force) {
    emit(cache);
    if (loading) return cache;
  }
  if (loading) return cache;
  const mem = studentCacheGet("dash") || cache;
  if (!force && mem && Date.now() - lastAt < 20000) {
    cache = mem;
    emit(mem);
    return mem;
  }
  loading = true;
  loadCount += 1;
  try { console.log("[perf] store load start", loadCount); } catch (_) {}
  const t0 = (typeof performance !== "undefined") ? performance.now() : Date.now();
  const data = emptyData(user);
  const prior = cache;

  const [userSnap, enrollments, registrations, certs] = await Promise.all([
    safe("users", () => getDoc(doc(db, "users", user.uid)), data.errors),
    safe("enrollments", () => getDocs(query(collection(db, "enrollments"), where("uid", "==", user.uid))), data.errors),
    safe("registrations", () => getDocs(query(collection(db, "registrations"), where("uid", "==", user.uid))), data.errors),
    safe("certificates", () => getDocs(query(collection(db, "certificates"), where("uid", "==", user.uid))), data.errors)
  ]);
  if (userSnap && userSnap.exists && userSnap.exists()) {
    const u = userSnap.data() || {};
    if (u.name) data.name = u.name;
    data.user = { id: user.uid, ...u };
    data.studentId = u.studentId || "";
  }
  data.registrations = registrations && registrations.docs ? registrations.docs.map((d) => ({ id: d.id, ...d.data() })) : [];
  const closed = new Set();
  data.registrations.forEach((r) => {
    const st = String(r.status || "");
    if (st === "cancelled" || st === "rejected") closed.add(String(r.courseId || ""));
  });
  const rawEns = enrollments && enrollments.docs ? enrollments.docs.map((d) => ({ id: d.id, ...d.data() })) : [];
  data.enrollments = rawEns.filter((en) => !closed.has(String(en.courseId || "")));
  data.certificates = certs && certs.docs ? certs.docs.map((d) => ({ id: d.id, ...d.data() })) : [];
  const ids = [...new Set(data.enrollments.map((e) => e.courseId).filter(Boolean))];
  data.courseIds = ids;
  data.status = "loading";
  if (!prior || prior.status !== "ready") emit({ ...data, status: "loading" });

  const courseSnaps = await Promise.all(ids.map((id) =>
    safe("course:" + id, () => getDoc(doc(db, "courses", id)), data.errors)
  ));
  data.courses = {};
  courseSnaps.forEach((cs, i) => {
    if (cs && cs.exists && cs.exists()) data.courses[ids[i]] = { id: ids[i], ...cs.data() };
  });
  const rows = (snap) => (snap && snap.docs ? snap.docs.map((d) => ({ id: d.id, ...d.data() })) : []);
  const jobs = ids.flatMap((id) => [
    safe("sessions:" + id, () => getDocs(query(collection(db, "sessions"), where("courseId", "==", id))), data.errors)
      .then((snap) => { data.sessions.push(...rows(snap)); }),
    safe("assignments:" + id, () => getDocs(query(collection(db, "assignments"), where("courseId", "==", id), where("status", "==", "Published"))), data.errors)
      .then((snap) => { data.assignments.push(...rows(snap)); }),
    safe("quizzes:" + id, () => getDocs(query(collection(db, "quizzes"), where("courseId", "==", id), where("status", "==", "Published"))), data.errors)
      .then((snap) => { data.quizzes.push(...rows(snap)); }),
    safe("announcements:" + id, () => getDocs(query(collection(db, "announcements"), where("courseId", "==", id))), data.errors)
      .then((snap) => { data.announcements.push(...rows(snap)); }),
    safe("attendance:" + id, () => getDocs(query(collection(db, "attendance"), where("uid", "==", user.uid), where("courseId", "==", id))), data.errors)
      .then((snap) => { data.attendance.push(...rows(snap)); }),
    safe("submissions:" + id, () => getDocs(query(collection(db, "submissions"), where("uid", "==", user.uid), where("courseId", "==", id))), data.errors)
      .then((snap) => { data.submissions.push(...rows(snap)); }),
    safe("quizAttempts:" + id, () => getDocs(query(collection(db, "quizAttempts"), where("uid", "==", user.uid), where("courseId", "==", id))), data.errors)
      .then((snap) => { data.quizAttempts.push(...rows(snap)); })
  ]);
  jobs.push(
    safe("announcementsAll", () => getDocs(query(collection(db, "announcements"), where("courseId", "==", "all"), limit(50))), data.errors)
      .then((snap) => { data.announcements.push(...rows(snap)); })
  );
  ids.forEach((id) => {
    const st = data.courses[id]?.status;
    jobs.push(safe("gradeSchemes:" + id, () => getDoc(doc(db, "gradeSchemes", id)), data.errors).then((snap) => {
      if (snap && snap.exists && snap.exists()) data.gradeSchemes[id] = snap.data();
    }));
    if (st === "Completed") {
      jobs.push(safe("gradeScores:" + id, () => getDoc(doc(db, "gradeScores", user.uid + "_" + id)), data.errors).then((snap) => {
        if (snap && snap.exists && snap.exists()) data.gradeScores[id] = snap.data();
      }));
    }
  });
  await Promise.allSettled(jobs);
  data.loadedAt = Date.now();
  const out = { ...data, sessions: [...data.sessions], assignments: [...data.assignments], quizzes: [...data.quizzes], announcements: [...data.announcements], submissions: [...data.submissions], quizAttempts: [...data.quizAttempts], attendance: [...data.attendance], status: Object.keys(data.errors).length && !data.enrollments.length ? "error" : "ready" };
  const failedHard = Object.keys(data.errors).length && data.errors.enrollments && prior;
  if (failedHard) {
    emit({ ...prior, status: prior.status || "ready" });
    loading = false;
    return prior;
  }
  studentCacheSet("dash-v3", out);
  writeDisk(out);
  emit(out);
  loading = false;
  try { console.log("[perf] store loaded", Math.round(((typeof performance !== "undefined") ? performance.now() : Date.now()) - t0) + "ms", "n=" + loadCount); } catch (_) {}
  return cache;
}

export function getStudentStore() { return cache; }
export function storeStatus() { return cache?.status || (loading ? "loading" : "idle"); }
export function whenStudentStore() {
  if (cache && (cache.status === "ready" || cache.status === "error")) return Promise.resolve(cache);
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(cache || emptyData(auth.currentUser || {})), 4000);
    const off = onDashData((d) => {
      if (d && (d.status === "ready" || d.status === "error")) { clearTimeout(t); off(); resolve(d); }
    });
  });
}
export function startDashRefresh() {
  if (window.__ghzDashRefreshOn) return;
  window.__ghzDashRefreshOn = true;
  window.addEventListener("focus", () => loadStudentDash(false));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") loadStudentDash(false);
  });
  setInterval(() => loadStudentDash(false), 90000);
}

export function bound(el, render) {
  try {
    const sk = document.createElement("div");
    sk.innerHTML = `<div class="sdash-skel"></div><div class="sdash-skel"></div>`;
    el.replaceChildren(sk);
    const stop = setTimeout(() => {
      if (!el.querySelector(".uni-card, .uni-hero, .banner, .uni-fail")) {
        el.innerHTML = `<p class="sdash-fail">This section could not load<br>timeout</p><button class="btn btn-sm" type="button" data-retry>Retry</button>`;
        el.querySelector("[data-retry]")?.addEventListener("click", () => loadStudentDash(true));
      }
    }, 8000);
    onDashData((d) => {
      clearTimeout(stop);
      try { render(el, d); }
      catch (e) {
        el.innerHTML = `<p class="sdash-fail">This section could not load<br>${e?.code || e?.message || e}</p><button class="btn btn-sm" type="button" data-retry>Retry</button>`;
        el.querySelector("[data-retry]")?.addEventListener("click", () => loadStudentDash(true));
      }
    });
  } catch (e) {
    el.innerHTML = `<p class="sdash-fail">This section could not load<br>${e?.code || e?.message || e}</p>`;
  }
}

window.addEventListener("ghz-logout", () => { cache = null; lastUid = ""; studentCacheClear(); });
