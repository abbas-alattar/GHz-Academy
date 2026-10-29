import { db } from "./firebase-config.js?v=auth8";
import { doc, getDoc, updateDoc, serverTimestamp, deleteField } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

function cacheKey(uid) { return "ghz-seenBoxes-" + uid; }
function readCache(uid) {
  try {
    const raw = localStorage.getItem(cacheKey(uid));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function writeCache(uid, map) {
  try { localStorage.setItem(cacheKey(uid), JSON.stringify(map || {})); } catch (_) {}
}

let inflight = {};
const mem = {};

export function assignedBoxKey(courseId) { return "assigned_" + courseId; }
export function completedBoxKey(courseId) { return "completed_" + courseId; }
export function resultBoxKey(courseId) { return "result_" + courseId; }
export function reopenedBoxKey(courseId) { return "reopened_" + courseId; }

export async function loadSeenBoxes(uid) {
  if (!uid) return { ok: false, map: null };
  if (mem[uid]?.ok && !mem[uid].first) return mem[uid];
  if (inflight[uid]) return inflight[uid];
  inflight[uid] = (async () => {
    try {
      const snap = await getDoc(doc(db, "users", uid));
      if (!snap.exists()) {
        const out = { ok: false, map: null };
        mem[uid] = out;
        return out;
      }
      const data = snap.data() || {};
      const has = Object.prototype.hasOwnProperty.call(data, "seenBoxes");
      const map = has && data.seenBoxes && typeof data.seenBoxes === "object" ? { ...data.seenBoxes } : null;
      const out = { ok: true, map, first: !has };
      mem[uid] = out;
      if (map) writeCache(uid, map);
      return out;
    } catch (_) {
      const cached = readCache(uid);
      const out = { ok: false, map: cached };
      mem[uid] = out;
      return out;
    } finally {
      delete inflight[uid];
    }
  })();
  return inflight[uid];
}

export function peekSeenBoxes(uid) {
  return mem[uid] || { ok: false, map: readCache(uid) };
}

export async function patchSeenBoxes(uid, patch) {
  if (!uid || !patch || !Object.keys(patch).length) return false;
  const payload = {};
  Object.keys(patch).forEach((k) => { payload["seenBoxes." + k] = patch[k]; });
  try {
    await updateDoc(doc(db, "users", uid), payload);
    const cur = mem[uid]?.map ? { ...mem[uid].map } : (readCache(uid) || {});
    Object.keys(patch).forEach((k) => {
      if (patch[k] && typeof patch[k] === "object" && patch[k]._methodName === "deleteField") delete cur[k];
      else if (patch[k] === undefined) delete cur[k];
      else cur[k] = patch[k];
    });
    mem[uid] = { ok: true, map: cur, first: false };
    writeCache(uid, cur);
    return true;
  } catch (_) {
    return false;
  }
}

export async function markAssignedSeen(uid, courseId) {
  const k = assignedBoxKey(courseId);
  const cur = mem[uid]?.map || readCache(uid) || {};
  if (cur[k]) return true;
  const ok = await patchSeenBoxes(uid, { [k]: serverTimestamp() });
  if (ok) {
    const m = mem[uid]?.map || {};
    m[k] = Date.now();
    mem[uid] = { ok: true, map: m, first: false };
    writeCache(uid, m);
  }
  return ok;
}

export async function markReopenedSeen(uid, courseId, atMs) {
  const k = reopenedBoxKey(courseId);
  const v = Number(atMs) || 0;
  const cur = mem[uid]?.map || readCache(uid) || {};
  if (String(cur[k]) === String(v)) return true;
  return patchSeenBoxes(uid, { [k]: v });
}

export async function markCompletedSeen(uid, courseId, atMs) {
  const k = completedBoxKey(courseId);
  const v = Number(atMs) || 0;
  const cur = mem[uid]?.map || readCache(uid) || {};
  if (String(cur[k]) === String(v)) return true;
  const ok = await patchSeenBoxes(uid, { [k]: v });
  return ok;
}

export async function markResultSeen(uid, courseId, atMs) {
  const k = resultBoxKey(courseId);
  const v = Number(atMs) || 0;
  const cur = mem[uid]?.map || readCache(uid) || {};
  if (String(cur[k]) === String(v)) return true;
  return patchSeenBoxes(uid, { [k]: v });
}

export async function dropAssignedSeen(uid, courseId) {
  const k = assignedBoxKey(courseId);
  const cur = mem[uid]?.map || readCache(uid) || {};
  if (!Object.prototype.hasOwnProperty.call(cur, k)) return true;
  try {
    await updateDoc(doc(db, "users", uid), { ["seenBoxes." + k]: deleteField() });
    const m = { ...(mem[uid]?.map || cur) };
    delete m[k];
    mem[uid] = { ok: true, map: m, first: false };
    writeCache(uid, m);
    return true;
  } catch (_) { return false; }
}

function tsMs(t) {
  if (!t) return 0;
  try {
    if (typeof t.toMillis === "function") return t.toMillis();
    if (t.seconds) return t.seconds * 1000;
    const n = Number(t);
    if (Number.isFinite(n) && n > 1e11) return n;
    const d = new Date(t).getTime();
    return Number.isFinite(d) ? d : 0;
  } catch { return 0; }
}
export function reopenEventId(c) {
  return tsMs(c?.reopenedAt) || tsMs(c?.completedAt) || 0;
}
const WEEK = 7 * 24 * 3600 * 1000;
export async function baselineTrainerSeen(uid, courses) {
  const now = Date.now();
  const patch = {};
  (courses || []).forEach((c) => {
    if (!c?.id) return;
    const assignedAt = tsMs(c.trainerAssigned?.[uid] || c.trainerAssigned?.[String(uid)]);
    if (assignedAt && assignedAt < now - WEEK) patch[assignedBoxKey(c.id)] = assignedAt;
    if (String(c.status) === "Completed") {
      const ms = tsMs(c.completedAt);
      if (ms && ms < now - WEEK) patch[completedBoxKey(c.id)] = ms;
    }
    const rid = reopenEventId(c);
    if (rid && rid < now - WEEK && String(c.status) !== "Completed") patch[reopenedBoxKey(c.id)] = rid;
  });
  if (!Object.keys(patch).length) {
    try {
      await updateDoc(doc(db, "users", uid), { seenBoxes: {} });
      mem[uid] = { ok: true, map: {}, first: false };
      writeCache(uid, {});
      return true;
    } catch { return false; }
  }
  return patchSeenBoxes(uid, patch);
}

export async function baselineStudentSeen(uid, coursesById) {
  const patch = {};
  Object.keys(coursesById || {}).forEach((id) => {
    const c = coursesById[id];
    if (String(c?.status || "").toLowerCase() !== "completed") return;
    const t = c.completedAt;
    let ms = 0;
    try {
      if (t?.toMillis) ms = t.toMillis();
      else if (t?.seconds) ms = t.seconds * 1000;
      else ms = Number(new Date(t).getTime()) || 0;
    } catch { ms = 0; }
    patch[resultBoxKey(id)] = ms;
  });
  if (!Object.keys(patch).length) {
    try {
      await updateDoc(doc(db, "users", uid), { seenBoxes: {} });
      mem[uid] = { ok: true, map: {}, first: false };
      writeCache(uid, {});
      return true;
    } catch { return false; }
  }
  return patchSeenBoxes(uid, patch);
}

export function seenReopened(map, courseId, atMs) {
  if (!map) return false;
  return String(map[reopenedBoxKey(courseId)] ?? "") === String(Number(atMs) || 0);
}
export function seenAssigned(map, courseId) {
  return !!(map && map[assignedBoxKey(courseId)]);
}
export function seenCompleted(map, courseId, atMs) {
  if (!map) return false;
  return String(map[completedBoxKey(courseId)] ?? "") === String(Number(atMs) || 0);
}
export function seenResult(map, courseId, atMs) {
  if (!map) return false;
  return String(map[resultBoxKey(courseId)] ?? "") === String(Number(atMs) || 0);
}
