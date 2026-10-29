import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { db } from "./firebase-config.js?v=auth8";

const HEART = 5 * 60 * 1000;
const PING = 60 * 1000;

export async function markLoginActivity(uid) {
  if (!uid) return;
  try {
    await setDoc(doc(db, "users", uid), {
      lastLoginAt: serverTimestamp(),
      lastActiveAt: serverTimestamp()
    }, { merge: true });
  } catch (err) {
    console.error("lastLoginAt", err?.code || err?.message || err);
  }
}

export async function pingActivity(uid, force) {
  if (!uid) return;
  const key = "ghz-last-active-" + uid;
  const last = Number(sessionStorage.getItem(key) || 0);
  if (!force && Date.now() - last < PING) return;
  sessionStorage.setItem(key, String(Date.now()));
  try {
    await setDoc(doc(db, "users", uid), { lastActiveAt: serverTimestamp() }, { merge: true });
  } catch (err) {
    sessionStorage.removeItem(key);
    console.error("lastActiveAt", err?.code || err?.message || err);
  }
}

export function bumpLastActive(uid) {
  return pingActivity(uid, false);
}
export function startLastActiveHeartbeat(uid) {
  if (!uid) return;
  pingActivity(uid, true);
  const id = setInterval(() => pingActivity(uid), HEART);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) pingActivity(uid); });
  window.__ghzPingActivity = () => pingActivity(uid, true);
  window.__ghzBumpActive = () => pingActivity(uid, false);
  return () => clearInterval(id);
}
