import { db } from "./firebase-config.js?v=auth8";
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query, where, getDocs,
  runTransaction, serverTimestamp, Timestamp
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

export function yymmUtc(date) {
  const d = date instanceof Date ? date : new Date(date || Date.now());
  const yy = String(d.getUTCFullYear() - 2000).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return yy + mm;
}

export function yymmFromTs(v) {
  try {
    if (!v) return yymmUtc(new Date());
    if (v.toDate) return yymmUtc(v.toDate());
    if (v.toMillis) return yymmUtc(new Date(v.toMillis()));
    if (typeof v.seconds === "number") return yymmUtc(new Date(v.seconds * 1000));
    return yymmUtc(new Date(v));
  } catch {
    return yymmUtc(new Date());
  }
}

export function formatStudentId(n, prefix) {
  return String(prefix) + String(n).padStart(3, "0");
}

function fb(e) {
  return e?.code || e?.message || String(e || "error");
}

export async function assignStudentIdTx(uid, { source = "signup", assignedBy } = {}) {
  const prefix = yymmUtc(new Date());
  const counterRef = doc(db, "counters", "studentId_" + prefix);
  const userRef = doc(db, "users", uid);
  let lastErr = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const id = await runTransaction(db, async (tx) => {
        const userSnap = await tx.get(userRef);
        const existing = userSnap.exists() ? userSnap.data().studentId : "";
        if (existing) return existing;
        const cSnap = await tx.get(counterRef);
        let next = 1;
        if (cSnap.exists()) next = Number(cSnap.data().n || 0) + 1;
        if (next > 999) throw Object.assign(new Error("This month’s student ID sequence is full (999)."), { code: "resource-exhausted" });
        const newId = formatStudentId(next, prefix);
        const idRef = doc(db, "studentIds", newId);
        const taken = await tx.get(idRef);
        if (taken.exists()) throw Object.assign(new Error("already-exists"), { code: "already-exists" });
        if (cSnap.exists()) tx.update(counterRef, { n: next, updatedAt: serverTimestamp() });
        else tx.set(counterRef, { n: next, updatedAt: serverTimestamp() });
        tx.set(idRef, { uid, assignedAt: serverTimestamp(), assignedBy: assignedBy || uid, source: source || "signup" });
        tx.update(userRef, { studentId: newId });
        return newId;
      });
      return { ok: true, id };
    } catch (e) {
      lastErr = e;
      if (e?.code === "already-exists" || /already-exists/i.test(String(e?.message))) continue;
      return { ok: false, error: fb(e) };
    }
  }
  return { ok: false, error: fb(lastErr) };
}

export async function healStudentIdIfMissing(uid, profile) {
  if (!uid || (profile && profile.role && profile.role !== "student")) return;
  if (profile?.studentId) return;
  try { await assignStudentIdTx(uid, { source: "signup", assignedBy: uid }); } catch (_) {}
}

export async function backfillMissingIds(students, { onProgress } = {}) {
  const missing = (students || [])
    .filter((s) => s.role === "student" && !String(s.studentId || "").trim())
    .sort((a, b) => {
      const am = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt?.seconds || 0) * 1000;
      const bm = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt?.seconds || 0) * 1000;
      return am - bm;
    });
  const groups = {};
  missing.forEach((s) => {
    const p = yymmFromTs(s.createdAt);
    (groups[p] = groups[p] || []).push(s);
  });
  let assigned = 0;
  const errors = [];
  const prefixes = Object.keys(groups).sort();
  for (const prefix of prefixes) {
    const list = groups[prefix];
    const counterRef = doc(db, "counters", "studentId_" + prefix);
    let n = 0;
    try {
      const cs = await getDoc(counterRef);
      if (cs.exists()) n = Number(cs.data().n || 0);
    } catch (e) { errors.push(fb(e)); continue; }
    for (const s of list) {
      n += 1;
      if (n > 999) { errors.push("Sequence full for " + prefix); break; }
      const id = formatStudentId(n, prefix);
      const uid = s.id || s.uid;
      onProgress?.(assigned, missing.length, id);
      try {
        const taken = await getDoc(doc(db, "studentIds", id));
        if (taken.exists()) { errors.push(id + " already taken"); continue; }
        await setDoc(doc(db, "studentIds", id), {
          uid, assignedAt: serverTimestamp(), assignedBy: "admin", source: "backfill"
        });
        await setDoc(counterRef, { n, updatedAt: serverTimestamp() }, { merge: true });
        await updateDoc(doc(db, "users", uid), { studentId: id });
        assigned += 1;
      } catch (e) {
        errors.push((s.name || uid) + ": " + fb(e));
      }
    }
  }
  return { assigned, total: missing.length, errors };
}

export async function adminChangeStudentId({ uid, oldId, newId, adminUid }) {
  const val = String(newId || "").replace(/\D/g, "");
  if (!/^\d{7}$/.test(val)) return { ok: false, error: "Enter exactly 7 digits." };
  if (oldId && val === String(oldId)) return { ok: true, id: val };
  try {
    const dupUsers = await getDocs(query(collection(db, "users"), where("studentId", "==", val)));
    const clash = dupUsers.docs.find((d) => d.id !== uid);
    if (clash) return { ok: false, error: "This ID is already assigned to another student" };
  } catch (e) {
    return { ok: false, error: fb(e) };
  }
  try {
    await runTransaction(db, async (tx) => {
      const idRef = doc(db, "studentIds", val);
      const taken = await tx.get(idRef);
      if (taken.exists() && taken.data().uid !== uid) {
        throw Object.assign(new Error("This ID is already assigned to another student"), { code: "already-exists" });
      }
      tx.set(idRef, { uid, assignedAt: serverTimestamp(), assignedBy: adminUid || "admin", source: "admin" });
      if (oldId && oldId !== val) tx.delete(doc(db, "studentIds", String(oldId)));
      tx.set(doc(db, "users", uid), { studentId: val }, { merge: true });
    });
    return { ok: true, id: val };
  } catch (e) {
    if (e?.code === "already-exists" || /already assigned/i.test(String(e?.message))) {
      return { ok: false, error: "This ID is already assigned to another student" };
    }
    return { ok: false, error: fb(e) };
  }
}

export { Timestamp };
