import { friendlyError } from "./friendlyError.js";
import { auth, db } from "./firebase-config.js?v=auth10";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { collection, query, where, getDocs, getDoc, doc, limit, onSnapshot } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { studentCacheClear, studentCacheGet, studentCacheSet, logFail } from "./student-fetch.js";
import { ghzPerf, timedQuery } from "./ghz-perf.js";
import { stripCoverFields, slimListCourse } from "./coverFor.js?v=stu11";
import { getDisplayName } from "./displayName.js";

const listeners = new Set();
const inflight = {};
const loaded = {};
function markLoaded(key) { loaded[key] = true; }
function isLoaded(key) { return !!loaded[key]; }
let cache = null;
let lastAt = 0;
let loading = false;
let lastUid = "";
let loadCount = 0;
const toMs = (t) => t?.toMillis ? t.toMillis() : t ? new Date(t).getTime() : 0;
const DISK = "ghz-cache-v6";
const DATASET_KEYS = ["enrollments","registrations","catalog","sessions","assignments","quizzes","attendance","submissions","quizAttempts","certificates","announcements","grades"];
function emptyMeta() {
  const m = {};
  DATASET_KEYS.forEach((k) => { m[k] = "idle"; });
  return m;
}
let meta = emptyMeta();
function setMeta(key, st) {
  meta = { ...meta, [key]: st };
}
export function datasetStatus(key) { return meta[key] || (isLoaded(key) ? "ready" : "idle"); }
export function datasetsReady(keys) { return (keys || []).every((k) => datasetStatus(k) === "ready"); }
const STALE_MS = 60000;
const CATALOG_MAX_MS = 10 * 60 * 1000;
const LIST_KEYS = ["enrollments","courseIds","sessions","assignments","quizzes","announcements","announcementReadIds","submissions","quizAttempts","attendance","registrations","certificates","catalog"];
const OBJ_KEYS = ["courses","gradeSchemes","gradeScores","gradeScoreExists","errors","trainers"];
export function asArray(x) { return Array.isArray(x) ? x : []; }
let resolveAuth;
export const authReady = new Promise((res) => { resolveAuth = res; });
onAuthStateChanged(auth, (u) => {
  try { window.__ghzMarkAuth?.(performance.now() - (window.__ghzT0 || 0)); } catch (_) {}
  resolveAuth(u || null);
  resolveAuth = (x) => x;
});
const dsTiming = {};
function dsMark(key, field, extra) {
  const now = Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - (window.__ghzT0 || 0));
  const row = dsTiming[key] || (dsTiming[key] = { key, started: null, finished: null, waited: "none" });
  if (field === "start" && row.started == null) row.started = now;
  if (field === "end") row.finished = now;
  if (extra && extra.waited) row.waited = extra.waited;
  try { window.__ghzDsTiming = dsTiming; } catch (_) {}
}
export function enrollmentsReady() { return datasetStatus("enrollments") === "ready" || datasetStatus("registrations") === "ready"; }
function closedCourseIds(st) {
  const closed = new Set();
  asArray(st?.registrations).forEach((r) => {
    const stt = String(r.status || "").toLowerCase();
    if (stt === "cancelled" || stt === "rejected") closed.add(String(r.courseId || ""));
  });
  return closed;
}
function enrollmentRowsFromStore(st) {
  const s = st || cache || {};
  const closed = closedCourseIds(s);
  const okReg = (stt) => {
    const t = String(stt || "").toLowerCase();
    return t === "enrolled" || t === "confirmed" || t === "active";
  };
  const fromEn = asArray(s.enrollments).filter((en) => en?.courseId && !closed.has(String(en.courseId)));
  const fromReg = asArray(s.registrations).filter((r) => r.courseId && okReg(r.status) && !closed.has(String(r.courseId)));
  const seen = new Set();
  const rows = [];
  [...fromEn, ...fromReg].forEach((row) => {
    const id = String(row.courseId || "");
    if (!id || seen.has(id)) return;
    seen.add(id);
    rows.push(row);
  });
  return rows;
}
export function getEnrolledCourses(st) {
  const s = st || cache || {};
  const cat = asArray(s.catalog);
  const byId = {};
  cat.forEach((c) => { if (c?.id) byId[c.id] = c; });
  Object.keys(s.courses || {}).forEach((id) => { byId[id] = { id, ...(s.courses[id] || {}) }; });
  return enrollmentRowsFromStore(s).map((row) => {
    const id = String(row.courseId);
    const c = byId[id] || {};
    const courseStatus = c.status || row.courseStatus || "Open";
    return {
      enrollmentId: row.id || row.enrollmentId || ("reg-" + id),
      enrollmentStatus: row.status || (row.fromReg ? "enrolled" : "enrolled"),
      fromReg: !!row.fromReg || String(row.id || "").indexOf("reg-") === 0,
      id,
      courseId: id,
      title: c.title || row.courseTitle || id,
      status: courseStatus,
      ...c,
      id,
      courseId: id,
      status: courseStatus
    };
  });
}
export function getActiveEnrollments(st) { return getEnrolledCourses(st); }
export function enrolledCoursesFromStore(st) { return getEnrolledCourses(st); }
export function getActiveCourses(st) {
  return getEnrolledCourses(st).filter((c) => String(c.status || "") !== "Completed");
}
export function getCompletedCourses(st) {
  return getEnrolledCourses(st).filter((c) => String(c.status || "") === "Completed");
}
export function asObject(x) { return x && typeof x === "object" && !Array.isArray(x) ? x : {}; }
function normalizeStore(data) {
  const d = data && typeof data === "object" ? { ...data } : {};
  LIST_KEYS.forEach((k) => { d[k] = asArray(d[k]); });
  OBJ_KEYS.forEach((k) => { d[k] = asObject(d[k]); });
  d.status = d.status || "ready";
  d.toMs = d.toMs || toMs;
  return d;
}
function cacheSane(data) {
  if (!data || typeof data !== "object") return false;
  return LIST_KEYS.every((k) => data[k] == null || Array.isArray(data[k]));
}
function clearOldCaches() {
  try {
    ["ghz-student-store-v1","ghz-student-store-v2","ghz-cache-v2","ghz-cache-v3","ghz-cache-v4","ghz-cache-v5"].forEach((k) => {
      localStorage.removeItem(k); sessionStorage.removeItem(k);
    });
  } catch (_) {}
}
clearOldCaches();
function slimCourse(c) {
  return slimListCourse(c);
}
function readDisk(uid) {
  try {
    const raw = localStorage.getItem(DISK);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (!o || o.ver !== 6 || !o.data) { clearOldCaches(); try { localStorage.removeItem(DISK); } catch (_) {} return null; }
    if (uid && o.uid && o.uid !== uid) return null;
    if (!cacheSane(o.data)) { try { localStorage.removeItem(DISK); } catch (_) {} return null; }
    o.data = normalizeStore(o.data);
    return o;
  } catch { try { localStorage.removeItem(DISK); } catch (_) {} return null; }
}
function writeDisk(data) {
  try {
    const courses = {};
    Object.keys(data.courses || {}).forEach((id) => { courses[id] = slimCourse(data.courses[id]); });
    const slim = {
      user: data.user, name: data.name, studentId: data.studentId,
      enrollments: data.enrollments, courseIds: data.courseIds,
      courses, registrations: data.registrations,
      certificates: data.certificates,
      catalog: (Array.isArray(data.catalog) && data.catalog.length) || data.catalogConfirmed ? data.catalog : undefined,
      catalogAt: data.catalogAt || null,
      catalogConfirmed: !!data.catalogConfirmed,
      trainers: data.trainers || {},
      sessions: data.sessions, assignments: data.assignments, quizzes: data.quizzes,
      announcements: data.announcements, submissions: data.submissions,
      quizAttempts: data.quizAttempts, attendance: data.attendance,
      gradeSchemes: data.gradeSchemes, gradeScores: data.gradeScores,
      status: data.status, loadedAt: data.loadedAt
    };
    localStorage.setItem(DISK, JSON.stringify({ ver: 6, uid: lastUid, at: Date.now(), data: slim }));
  } catch (_) {
    try {
      sessionStorage.setItem(DISK, JSON.stringify({ uid: lastUid, at: Date.now(), data: { name: data.name, enrollments: data.enrollments, courseIds: data.courseIds, courses: data.courses, status: data.status } }));
    } catch (e) {}
  }
}
try {
  const disk = readDisk();
  if (disk?.data) {
    cache = normalizeStore(disk.data);
    lastAt = disk.at || 0;
    lastUid = disk.uid || "";
    DATASET_KEYS.forEach((k) => {
      const has = k === "grades" ? (cache.gradeSchemes && Object.keys(cache.gradeSchemes).length) : asArray(cache[k]).length || (k === "catalog" && cache.catalogConfirmed);
      if (has) { setMeta(k, "stale"); }
    });
    cache._meta = { ...meta };
    cache.status = "stale";
  }
} catch (_) { cache = null; }

export function onDashData(fn) { listeners.add(fn); if (cache) fn(cache); return () => listeners.delete(fn); }
export function lastUpdated() { return lastAt; }

const fail = (step, e) => ({ step, code: e?.code || e?.message || String(e) });

const emit = (data) => {
  const next = normalizeStore(data);
  next._meta = { ...(next._meta || {}), ...meta };
  cache = next;
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
    name: getDisplayName({ displayName: user.displayName, email: user.email }) || "",
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
    catalog: [],
    catalogAt: 0,
    catalogConfirmed: false,
    gradeSchemes: {},
    gradeScores: {},
    gradeScoreExists: {},
    courses: {},
    trainers: {},
    errors: {},
    status: "loading",
    loadedAt: Date.now(),
    toMs
  };
}

export async function loadStudentDash(force) {
  const user = auth.currentUser || await authReady;
  if (!user) return cache;
  if (lastUid && lastUid !== user.uid) {
    cache = null;
    meta = emptyMeta();
    Object.keys(loaded).forEach((k) => { delete loaded[k]; });
    studentCacheClear();
    try { localStorage.removeItem(DISK); sessionStorage.removeItem(DISK); } catch (_) {}
  }
  lastUid = user.uid;
  if (!cache) {
    const disk = readDisk(user.uid);
    if (disk?.data) {
      mergePatch({ ...normalizeStore(disk.data), status: "stale" }, { skipDisk: true, fromDisk: true });
      lastAt = disk.at || 0;
    }
  }
  if (!force && cache && Date.now() - lastAt < STALE_MS && datasetStatus("enrollments") === "ready") return cache;
  await prefetchStudentCore();
  startDashRefresh();
  return cache;
}

export async function loadListPage(kind) {
  const page = String(kind || "browse");
  if (page === "browse") await ensureCatalog();
  else if (page === "regs") await Promise.all([ensureCatalog(), ensureRegistrations()]);
  else await Promise.all([ensureCatalog(), ensureEnrollments(), ensureRegistrations()]);
  return cache;
}

function mergePatch(patch, opts) {
  const fromDisk = !!(opts && opts.fromDisk);
  const base = cache ? { ...cache } : emptyData(auth.currentUser || {});
  const p = patch && typeof patch === "object" ? { ...patch } : {};
  if (fromDisk) {
    DATASET_KEYS.forEach((k) => {
      if (datasetStatus(k) === "ready") {
        delete p[k];
        if (k === "grades") { delete p.gradeSchemes; delete p.gradeScores; delete p.gradeScoreExists; }
        if (k === "catalog") { delete p.courses; delete p.catalogAt; delete p.catalogConfirmed; }
        if (k === "enrollments") delete p.courseIds;
      }
    });
  }
  const next = normalizeStore({ ...base, ...p, _meta: { ...meta } });
  if (!fromDisk) next.status = p.status || "ready";
  else next.status = cache?.status === "ready" ? "ready" : "stale";
  next._meta = { ...meta };
  emit(next);
  if (!(opts && opts.skipDisk)) writeDisk(next);
  return next;
}
function courseIdsOf() {
  const fromLive = getEnrolledCourses(cache).map((c) => c.id).filter(Boolean);
  if (fromLive.length) return [...new Set(fromLive)];
  return [...new Set((cache?.courseIds || []).filter(Boolean))];
}
async function chunkIn(col, field, ids, extraWheres) {
  const list = (ids || []).filter(Boolean);
  const parts = [];
  for (let i = 0; i < list.length; i += 10) parts.push(list.slice(i, i + 10));
  if (!parts.length) return [];
  const rows = (snap) => (snap && snap.docs ? snap.docs.map((d) => ({ id: d.id, ...d.data() })) : []);
  const snaps = await Promise.all(parts.map((chunk, i) => {
    const cons = [where(field, "in", chunk)].concat((extraWheres || []).map((w) => where(w[0], w[1], w[2])));
    const qy = query(collection(db, col), ...cons);
    return timedQuery(col + " in" + i, () => getDocs(qy));
  }));
  return snaps.flatMap(rows);
}
async function once(key, fn) {
  if (isLoaded(key) && cache && datasetStatus(key) === "ready") return cache;
  if (inflight[key]) return inflight[key];
  inflight[key] = (async () => {
    dsMark(key, "start");
    try {
      const user = await authReady;
      if (!user) {
        setMeta(key, "idle");
        dsMark(key, "end", { waited: "auth" });
        emit({ ...(cache || emptyData({})), _meta: { ...meta }, status: cache?.status || "idle" });
        return cache;
      }
      setMeta(key, datasetStatus(key) === "stale" ? "stale" : "loading");
      emit({ ...(cache || emptyData(user)), _meta: { ...meta }, status: cache?.status === "stale" ? "stale" : "loading" });
      const ran = await fn(user);
      if (ran === false) {
        setMeta(key, "idle");
        dsMark(key, "end", { waited: "auth" });
        return cache;
      }
      markLoaded(key);
      setMeta(key, "ready");
      dsMark(key, "end");
      emit({ ...(cache || emptyData(user)), _meta: { ...meta }, status: "ready" });
      return cache;
    } catch (e) {
      setMeta(key, "error");
      dsMark(key, "end");
      emit({ ...(cache || emptyData(auth.currentUser || {})), _meta: { ...meta }, status: cache?.status || "error" });
      throw e;
    } finally {
      delete inflight[key];
    }
  })();
  return inflight[key];
}
function idsKey(ids) { return [...new Set(ids || [])].sort().join(","); }
async function loadByCourseIds(col, extra) {
  const ids = courseIdsOf();
  dsMark(col, "start", { waited: ids.length ? "disk-ids" : "none" });
  const list = ids.length ? await chunkIn(col, "courseId", ids, extra) : [];
  return { ids, list };
}
export async function ensureCatalog() {
  return once("catalog", async () => {
    const snap = await timedQuery("catalog courses", () => getDocs(query(collection(db, "courses"), where("status", "in", ["Open", "Coming soon", "Closed", "Completed"]))));
    const catalog = snap && snap.docs ? snap.docs.map((d) => slimCourse({ id: d.id, ...d.data() })) : [];
    const courses = { ...(cache?.courses || {}) };
    const enrolled = getEnrolledCourses({ ...(cache || {}), catalog });
    const ids = new Set(courseIdsOf().concat(enrolled.map((c) => c.id)));
    catalog.forEach((c) => { if (ids.has(c.id) || !ids.size) courses[c.id] = c; });
    enrolled.forEach((c) => { if (c.id && !courses[c.id]) courses[c.id] = c; });
    mergePatch({ catalog, courses, catalogConfirmed: true, catalogAt: Date.now() });
    refreshEnrolledCourseMeta(ids).catch(() => {});
    watchEnrolledCourses(ids);
  });
}
function courseMetaFrom(d) {
  const data = d.data ? d.data() : d;
  const id = d.id || data.id;
  return slimCourse({
    id,
    ...data,
    status: data.status,
    completionRound: Number(data.completionRound || 0),
    completedAt: data.completedAt || null,
    reopenedAt: data.reopenedAt || null,
    completionCount: data.completionCount != null ? data.completionCount : null
  });
}
async function refreshEnrolledCourseMeta(ids) {
  const list = [...(ids || [])].filter(Boolean);
  if (!list.length) return;
  const next = { ...(cache?.courses || {}) };
  await Promise.all(list.map(async (id) => {
    try {
      const snap = await getDoc(doc(db, "courses", id));
      if (snap.exists()) next[id] = { ...(next[id] || {}), ...courseMetaFrom(snap) };
    } catch (_) {}
  }));
  mergePatch({ courses: next });
}
let courseWatchOff = [];
function watchEnrolledCourses(ids) {
  courseWatchOff.forEach((fn) => { try { fn(); } catch (_) {} });
  courseWatchOff = [];
  [...new Set(ids || [])].filter(Boolean).forEach((id) => {
    try {
      const off = onSnapshot(doc(db, "courses", id), (snap) => {
        if (!snap.exists()) return;
        const row = courseMetaFrom(snap);
        const prev = cache?.courses?.[id] || {};
        mergePatch({ courses: { ...(cache?.courses || {}), [id]: { ...prev, ...row } } });
        try { window.dispatchEvent(new CustomEvent("ghz-course-meta", { detail: row })); } catch (_) {}
      });
      courseWatchOff.push(off);
    } catch (_) {}
  });
}
export async function ensureEnrollments() {
  return once("enrollments", async (user) => {
    ensureRegistrations().catch(() => {});
    const snap = await timedQuery("enrollments", () => getDocs(query(collection(db, "enrollments"), where("uid", "==", user.uid))));
    const closed = closedCourseIds(cache);
    const raw = snap && snap.docs ? snap.docs.map((d) => ({ id: d.id, ...d.data() })) : [];
    const fromEn = raw.filter((en) => en.courseId && !closed.has(String(en.courseId || "")));
    const fromReg = asArray(cache?.registrations).filter((r) => {
      const stt = String(r.status || "").toLowerCase();
      return (stt === "enrolled" || stt === "confirmed" || stt === "active") && r.courseId && !closed.has(String(r.courseId));
    }).map((r) => ({ id: "reg-" + r.id, courseId: r.courseId, courseTitle: r.courseTitle, uid: user.uid, status: r.status, fromReg: true }));
    const seen = new Set();
    const enrollments = [];
    [...fromEn, ...fromReg].forEach((row) => {
      const id = String(row.courseId || "");
      if (!id || seen.has(id)) return;
      seen.add(id);
      enrollments.push(row);
    });
    const ids = [...new Set(enrollments.map((e) => e.courseId).filter(Boolean))];
    mergePatch({ enrollments, courseIds: ids });
  });
}
export async function ensureRegistrations() {
  return once("registrations", async (user) => {
    const snap = await timedQuery("registrations", () => getDocs(query(collection(db, "registrations"), where("uid", "==", user.uid))));
    const registrations = snap && snap.docs ? snap.docs.map((d) => ({ id: d.id, ...d.data() })) : [];
    mergePatch({ registrations });
  });
}
export async function ensureSessions() {
  return once("sessions", async () => {
    const first = await loadByCourseIds("sessions");
    mergePatch({ sessions: first.list });
    ensureEnrollments().then(() => {
      const next = idsKey(courseIdsOf());
      if (next && next !== idsKey(first.ids)) {
        loaded.sessions = false;
        setMeta("sessions", "stale");
        chunkIn("sessions", "courseId", courseIdsOf()).then((list) => {
          mergePatch({ sessions: list });
          markLoaded("sessions"); setMeta("sessions", "ready");
        }).catch(() => {});
      }
    }).catch(() => {});
  });
}
export async function ensureAssignments() {
  return once("assignments", async () => {
    const extra = [["status", "==", "Published"]];
    const first = await loadByCourseIds("assignments", extra);
    mergePatch({ assignments: first.list });
    ensureEnrollments().then(() => {
      const next = idsKey(courseIdsOf());
      if (next && next !== idsKey(first.ids)) {
        loaded.assignments = false;
        setMeta("assignments", "stale");
        chunkIn("assignments", "courseId", courseIdsOf(), extra).then((list) => {
          mergePatch({ assignments: list });
          markLoaded("assignments"); setMeta("assignments", "ready");
        }).catch(() => {});
      }
    }).catch(() => {});
  });
}
export async function ensureQuizzes() {
  return once("quizzes", async () => {
    const extra = [["status", "==", "Published"]];
    const first = await loadByCourseIds("quizzes", extra);
    mergePatch({ quizzes: first.list });
    ensureEnrollments().then(() => {
      const next = idsKey(courseIdsOf());
      if (next && next !== idsKey(first.ids)) {
        loaded.quizzes = false;
        setMeta("quizzes", "stale");
        chunkIn("quizzes", "courseId", courseIdsOf(), extra).then((list) => {
          mergePatch({ quizzes: list });
          markLoaded("quizzes"); setMeta("quizzes", "ready");
        }).catch(() => {});
      }
    }).catch(() => {});
  });
}
export async function ensureAttendance() {
  return once("attendance", async (user) => {
    const snap = await timedQuery("attendance uid", () => getDocs(query(collection(db, "attendance"), where("uid", "==", user.uid), limit(80))));
    const attendance = snap && snap.docs ? snap.docs.map((d) => ({ id: d.id, ...d.data() })) : [];
    mergePatch({ attendance });
  });
}
export async function ensureSubmissions() {
  return once("submissions", async (user) => {
    const snap = await timedQuery("submissions uid", () => getDocs(query(collection(db, "submissions"), where("uid", "==", user.uid), limit(80))));
    const submissions = snap && snap.docs ? snap.docs.map((d) => ({ id: d.id, ...d.data() })) : [];
    mergePatch({ submissions });
  });
}
export async function ensureQuizAttempts() {
  return once("quizAttempts", async (user) => {
    const snap = await timedQuery("quizAttempts uid", () => getDocs(query(collection(db, "quizAttempts"), where("uid", "==", user.uid), limit(80))));
    const quizAttempts = snap && snap.docs ? snap.docs.map((d) => ({ id: d.id, ...d.data() })) : [];
    mergePatch({ quizAttempts });
  });
}
export async function ensureCertificates() {
  return once("certificates", async (user) => {
    const snap = await timedQuery("certificates", () => getDocs(query(collection(db, "certificates"), where("uid", "==", user.uid))));
    const certificates = snap && snap.docs ? snap.docs.map((d) => ({ id: d.id, ...d.data() })) : [];
    mergePatch({ certificates });
  });
}
export async function ensureAnnouncements() {
  return once("announcements", async () => {
    const first = await loadByCourseIds("announcements");
    mergePatch({ announcements: first.list });
    ensureEnrollments().then(() => {
      const next = idsKey(courseIdsOf());
      if (next && next !== idsKey(first.ids)) {
        chunkIn("announcements", "courseId", courseIdsOf()).then((list) => mergePatch({ announcements: list })).catch(() => {});
      }
    }).catch(() => {});
  });
}
export async function ensureGrades() {
  return once("grades", async (user) => {
    try { await ensureEnrollments(); } catch (_) {}
    const ids = courseIdsOf();
    dsMark("grades", "start", { waited: ids.length ? "disk-ids" : "none" });
    const schemes = { ...(cache?.gradeSchemes || {}) };
    const scores = { ...(cache?.gradeScores || {}) };
    const exists = { ...(cache?.gradeScoreExists || {}) };
    await Promise.all(ids.map(async (id) => {
      await Promise.all([
        (async () => {
          try {
            const s = await timedQuery("gradeSchemes/" + id, () => getDoc(doc(db, "gradeSchemes", id)));
            if (s && s.exists && s.exists()) schemes[id] = { id, ...s.data() };
          } catch (_) {}
        })(),
        (async () => {
          try {
            const g = await timedQuery("gradeScores/" + user.uid + "_" + id, () => getDoc(doc(db, "gradeScores", user.uid + "_" + id)));
            if (g && g.exists && g.exists()) {
              scores[id] = { id, ...g.data() };
              exists[id] = true;
            } else exists[id] = false;
          } catch (_) { exists[id] = false; }
        })()
      ]);
    }));
    mergePatch({ gradeSchemes: schemes, gradeScores: scores, gradeScoreExists: exists });
  });
}
export async function getCourseResult(courseId) {
  const id = String(courseId || "");
  if (!id) return { status: "loading" };
  try { await ensureEnrollments(); } catch (_) {}
  try { await ensureCatalog(); } catch (_) {}
  try { await ensureGrades(); } catch (_) {}
  const st = cache || {};
  const course = st.courses?.[id] || (st.catalog || []).find((c) => c.id === id) || null;
  const scheme = st.gradeSchemes?.[id];
  const gradesReady = datasetStatus("grades") === "ready";
  if (!gradesReady || !scheme) return { status: "loading", course, title: course?.title || "this course" };
  const passN = Number(scheme.passMark);
  const pass = Number.isFinite(passN) ? passN : 60;
  const existsMap = st.gradeScoreExists || {};
  const raw = st.gradeScores?.[id];
  const unpublished = existsMap[id] === false || !raw;
  if (unpublished) {
    return { status: "unpublished", course, title: course?.title || "this course", pass, unpublished: true, avg: null, passed: null };
  }
  const { resultFromStored, formatGrade } = await import("./gradeCalc.js");
  const res = resultFromStored(scheme, raw, course?.status);
  if (res.unpublished || res.missing) {
    return { status: "unpublished", course, title: course?.title || "this course", pass, unpublished: true, avg: null, passed: null };
  }
  const avg = Number(res.avg);
  if (!Number.isFinite(avg)) return { status: "loading", course, title: course?.title || "this course", pass };
  const passed = res.passed === true;
  const failed = res.passed === false;
  return {
    status: failed ? "failed" : (passed ? "passed" : "unpublished"),
    course, title: course?.title || "this course",
    avg, pass, passed, unpublished: false,
    display: formatGrade(avg)
  };
}
export function prefetchStudentCore() {
  return Promise.all([
    ensureRegistrations(), ensureEnrollments(), ensureCatalog(),
    ensureSubmissions(), ensureQuizAttempts(), ensureAttendance()
  ]);
}
export async function ensureSectionData(keys) {
  const map = {
    catalog: ensureCatalog, enrollments: ensureEnrollments, registrations: ensureRegistrations,
    sessions: ensureSessions, assignments: ensureAssignments, quizzes: ensureQuizzes,
    attendance: ensureAttendance, submissions: ensureSubmissions, quizAttempts: ensureQuizAttempts,
    certificates: ensureCertificates, announcements: ensureAnnouncements, grades: ensureGrades
  };
  await Promise.all((keys || []).map((k) => (map[k] ? map[k]() : Promise.resolve())));
  return cache;
}
export function getStudentStore() {
  if (!cache) return cache;
  cache._meta = { ...meta };
  return cache;
}
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
        el.innerHTML = `<p class="sdash-fail">This section could not load<br>${friendlyError(e)}</p><button class="btn btn-sm" type="button" data-retry>Retry</button>`;
        el.querySelector("[data-retry]")?.addEventListener("click", () => loadStudentDash(true));
      }
    });
  } catch (e) {
    el.innerHTML = `<p class="sdash-fail">This section could not load<br>${friendlyError(e)}</p>`;
  }
}

export function applyLiveProfile(profile) {
  if (!cache) return;
  const name = getDisplayName({ ...cache.user, ...profile });
  emit({ ...cache, user: { ...cache.user, ...profile }, name, studentId: profile.studentId || cache.studentId || "" });
}

window.addEventListener("ghz-logout", () => { cache = null; lastUid = ""; studentCacheClear(); });
