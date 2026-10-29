import { db } from "./firebase-config.js?v=auth8";
import {
  collection, query, where, getDocs, writeBatch
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { applyDisplayName } from "./auth-guard.js?v=auth8";

const NAME_COLS = [
  ["registrations", "studentName"],
  ["enrollments", "studentName"],
  ["submissions", "studentName"],
  ["quizAttempts", "studentName"],
  ["attendance", "studentName"]
];

export function liveStudentName(profile, user) {
  const n = String(profile?.name || "").trim();
  if (n) return n;
  return String(user?.displayName || "").trim() || (user?.email || "").split("@")[0] || "Student";
}

function fail(collection, field, e) {
  return { collection, field, code: e?.code || "error", message: e?.message || "" };
}

export async function syncOwnNameCopies(uid, name, extra) {
  const next = String(name || "").trim();
  const failed = [];
  const updated = [];
  if (!uid || !next) return { updated, failed };
  const studentId = extra && extra.studentId ? String(extra.studentId).trim() : "";

  for (const [col, field] of NAME_COLS) {
    let docs = [];
    try {
      const snap = await getDocs(query(collection(db, col), where("uid", "==", uid)));
      docs = snap.docs || [];
    } catch (e) {
      failed.push(fail(col, field, e));
      continue;
    }
    const batch = writeBatch(db);
    let n = 0;
    for (const d of docs) {
      const data = d.data() || {};
      const patch = {};
      if (String(data[field] || "") !== next) patch[field] = next;
      if (col === "enrollments" && studentId && String(data.studentId || "") !== studentId) patch.studentId = studentId;
      if (!Object.keys(patch).length) continue;
      batch.update(d.ref, patch);
      n++;
      if (n >= 400) break;
    }
    if (!n) continue;
    try {
      await batch.commit();
      updated.push(col + "." + field);
    } catch (e) {
      failed.push(fail(col, field, e));
    }
  }
  return { updated, failed };
}

export async function healOwnNameOnce(uid, name) {
  const key = "ghz-name-heal-v2-" + uid;
  try { if (sessionStorage.getItem(key)) return { skipped: true, updated: [], failed: [] }; } catch (_) {}
  const res = await syncOwnNameCopies(uid, name);
  try { sessionStorage.setItem(key, "1"); } catch (_) {}
  return res;
}

export function paintLiveName(name) {
  applyDisplayName(name);
}
