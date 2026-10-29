import { db } from "./firebase-config.js?v=auth8";
import {
  collection, query, where, getDocs, doc, setDoc, writeBatch, serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

const mem = new Map();
const listeners = new Set();
const inflight = new Map();
const failed = new Set();

function keyOf(uid, announcementId) {
  return String(uid) + "_" + String(announcementId);
}

function emit(uid) {
  const set = mem.get(uid) || new Set();
  listeners.forEach((fn) => {
    try { fn(uid, set); } catch (_) {}
  });
  try {
    window.dispatchEvent(new CustomEvent("ghz-ann-reads", { detail: { uid, ids: [...set] } }));
  } catch (_) {}
  paintBadges(uid, set);
}

export function onAnnouncementReads(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getReadSet(uid) {
  return mem.get(uid) || new Set();
}

export function isRead(uid, announcementId) {
  return getReadSet(uid).has(String(announcementId));
}

export function visibleAnnouncements(uid, items, courseIds) {
  const ids = new Set((courseIds || []).map(String));
  ids.add("all");
  return (items || []).filter((a) => {
    if (!a || !a.id) return false;
    const cid = String(a.courseId || "all");
    return cid === "all" || ids.has(cid);
  });
}
export function unreadCount(uid, items, courseIds) {
  const vis = courseIds ? visibleAnnouncements(uid, items, courseIds) : (items || []);
  const set = getReadSet(uid);
  return vis.filter((a) => a && a.id && !set.has(String(a.id))).length;
}
export function annTimeAgo(ms) {
  if (!ms) return "";
  const s = Math.max(0, Date.now() - ms);
  const m = Math.round(s / 60000);
  if (m < 1) return "just now";
  if (m < 60) return m + " minute" + (m === 1 ? "" : "s") + " ago";
  const h = Math.round(s / 3600000);
  if (h < 24) return h + " hour" + (h === 1 ? "" : "s") + " ago";
  const d = Math.round(s / 86400000);
  if (d <= 30) return d + " day" + (d === 1 ? "" : "s") + " ago";
  try {
    return new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  } catch { return ""; }
}

export async function loadAnnouncementReads(uid) {
  if (!uid) return new Set();
  if (mem.has(uid)) return mem.get(uid);
  if (inflight.has(uid)) return inflight.get(uid);
  const run = (async () => {
    try {
      const snap = await getDocs(query(collection(db, "announcementReads"), where("uid", "==", uid)));
      const set = new Set();
      (snap.docs || []).forEach((d) => {
        const id = d.data()?.announcementId || String(d.id || "").slice(uid.length + 1);
        if (id) set.add(String(id));
      });
      failed.delete(uid);
      mem.set(uid, set);
      emit(uid);
      return set;
    } catch (e) {
      console.error("announcementReads", e?.code || e?.message || e, "query announcementReads where uid==" + uid);
      failed.add(uid);
      const empty = new Set();
      mem.set(uid, empty);
      emit(uid);
      return empty;
    } finally {
      inflight.delete(uid);
    }
  })();
  inflight.set(uid, run);
  return run;
}

export function markReadLocal(uid, announcementId) {
  if (!uid || !announcementId) return false;
  const set = mem.get(uid) || new Set();
  if (set.has(String(announcementId))) return false;
  set.add(String(announcementId));
  mem.set(uid, set);
  emit(uid);
  return true;
}

export async function markAnnouncementRead(uid, announcementId) {
  if (!uid || !announcementId) return;
  if (isRead(uid, announcementId)) return;
  markReadLocal(uid, announcementId);
  try {
    await setDoc(doc(db, "announcementReads", keyOf(uid, announcementId)), {
      uid,
      announcementId: String(announcementId),
      readAt: serverTimestamp()
    });
    try { window.__ghzPingActivity?.(); } catch (_) {}
  } catch (e) {
    console.error("announcementReads setDoc", e?.code || e?.message || e);
  }
}

export async function markAllAnnouncementsRead(uid, items) {
  if (!uid) return;
  const shown = (items || []).filter((a) => a && a.id && !isRead(uid, a.id));
  shown.forEach((a) => markReadLocal(uid, a.id));
  for (let i = 0; i < shown.length; i += 400) {
    const chunk = shown.slice(i, i + 400);
    const batch = writeBatch(db);
    chunk.forEach((a) => {
      batch.set(doc(db, "announcementReads", keyOf(uid, a.id)), {
        uid,
        announcementId: String(a.id),
        readAt: serverTimestamp()
      });
    });
    try {
      await batch.commit();
    } catch (e) {
      console.error("announcementReads batch", e?.code || e?.message || e);
    }
  }
}

function badgeLabel(n) {
  if (!n || n < 1) return "";
  return n > 99 ? "99+" : String(n);
}
function fillBadge(el, n) {
  if (!el) return;
  el.className = "ann-side-badge";
  if (!n || n < 1) {
    el.textContent = "";
    el.setAttribute("hidden", "");
    el.style.display = "none";
    return;
  }
  el.textContent = badgeLabel(n);
  el.removeAttribute("hidden");
  el.style.display = "inline-flex";
  el.style.color = "#FFFFFF";
}
function paintBadges(uid, set) {
  if (failed.has(uid)) {
    fillBadge(document.getElementById("annBadge"), 0);
    document.querySelectorAll("[data-ann-unread]").forEach((node) => fillBadge(node, 0));
    return;
  }
  let anns = [];
  let courseIds = [];
  try {
    anns = window.__ghzDash?.announcements || window.__ghzTrainerAnns || [];
    courseIds = window.__ghzDash?.courseIds || Object.keys(window.__ghzDash?.courses || {});
  } catch (_) { anns = []; }
  const n = unreadCount(uid, anns, window.__ghzTrainerAnns ? null : courseIds);
  fillBadge(document.getElementById("annBadge"), n);
  document.querySelectorAll("[data-ann-unread]").forEach((node) => fillBadge(node, n));
}
