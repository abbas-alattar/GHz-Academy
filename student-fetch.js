import { auth, db } from "./firebase-config.js?v=auth8";
import { collection, query, where, getDocs, getDoc, doc } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

const mem = new Map();
let lastUid = "";

function uidOf() {
  return auth.currentUser?.uid || "";
}

function keyOf(uid, name) {
  return uid + "::" + name;
}

export function studentCacheClear() {
  mem.clear();
  lastUid = "";
}

export function studentCacheGet(name) {
  const uid = uidOf();
  if (!uid) return null;
  if (lastUid && lastUid !== uid) mem.clear();
  lastUid = uid;
  const hit = mem.get(keyOf(uid, name === "dash" ? "dash-v3" : name));
  return hit ? hit.data : null;
}

export function studentCacheSet(name, data) {
  const uid = uidOf();
  if (!uid || data == null) return;
  lastUid = uid;
  mem.set(keyOf(uid, name), { at: Date.now(), data });
}

export function logFail(step, e) {
  const code = e?.code || e?.message || String(e);
  console.error(step, code, e);
  return { step, code };
}

export async function settled(step, fn) {
  try {
    return { ok: true, value: await fn(), step };
  } catch (e) {
    logFail(step, e);
    return { ok: false, value: null, step, error: e };
  }
}

export async function loadEnrollments() {
  const uid = uidOf();
  if (!uid) return [];
  const snap = await getDocs(query(collection(db, "enrollments"), where("uid", "==", uid)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function loadCoursesByIds(ids) {
  const list = [...new Set((ids || []).filter(Boolean))];
  const rows = await Promise.all(list.map((id) => getDoc(doc(db, "courses", id)).then((snap) => {
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() };
  }).catch((e) => {
    logFail("courses/" + id, e);
    return { __fail: true, id, error: e };
  })));
  return rows.filter(Boolean);
}

export function qPublished(col, courseId) {
  return getDocs(query(collection(db, col), where("courseId", "==", courseId), where("status", "==", "Published")));
}

export function qCourse(col, courseId) {
  return getDocs(query(collection(db, col), where("courseId", "==", courseId)));
}

export function qMineCourse(col, uid, courseId) {
  return getDocs(query(collection(db, col), where("uid", "==", uid), where("courseId", "==", courseId)));
}

if (typeof window !== "undefined") {
  window.addEventListener("ghz-logout", () => studentCacheClear());
}
