import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { auth, roleHome } from "./firebase-config.js?v=auth8";

const CH = "ghz-auth";
const LS = "ghz-logout";
const LS_IN = "ghz-login";
const TAB = "ghz-auth-tab";
let tabId = "";
try {
  tabId = sessionStorage.getItem(TAB) || ("t" + Math.random().toString(36).slice(2) + Date.now().toString(36));
  sessionStorage.setItem(TAB, tabId);
} catch (_) { tabId = "t" + String(Date.now()); }
const bootAt = Date.now();
function ownTab(id) { return id && id === tabId; }

let persistReady = true;
export function ensureLocalPersistence() {
  try { return Promise.resolve(); } catch (_) { return Promise.resolve(); }
}

function channel() {
  try { return new BroadcastChannel(CH); } catch { return null; }
}

const bc = channel();
const unsubs = new Set();
export function registerAuthUnsub(fn) {
  if (typeof fn === "function") unsubs.add(fn);
  return () => unsubs.delete(fn);
}

function keepResultKeys(uid) {
  const keep = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.indexOf("ghz-course-result-seen-") === 0) keep.push(k);
    }
  } catch (_) {}
  return keep;
}

export function clearPortalCaches(uid) {
  unsubs.forEach((fn) => { try { fn(); } catch (_) {} });
  unsubs.clear();
  try { window.dispatchEvent(new Event("ghz-logout")); } catch (_) {}
  try { window.__ghzDash = null; } catch (_) {}
  const keep = keepResultKeys(uid);
  const keepVals = {};
  keep.forEach((k) => { try { keepVals[k] = localStorage.getItem(k); } catch (_) {} });
  try { sessionStorage.clear(); } catch (_) {}
  try {
    const drop = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (k === LS || k === LS_IN) continue;
      if (k.indexOf("ghz-course-result-seen-") === 0) continue;
      if (k.indexOf("ghz-") === 0 || k === "ghz-shell") drop.push(k);
    }
    drop.forEach((k) => localStorage.removeItem(k));
    Object.keys(keepVals).forEach((k) => localStorage.setItem(k, keepVals[k]));
  } catch (_) {}
}

let leaving = false;
export function leaveToLogin() {
  if (leaving) return;
  leaving = true;
  clearPortalCaches();
  location.replace("./login.html");
}

export function broadcastLogout() {
  const ts = String(Date.now());
  try { localStorage.setItem(LS, ts); } catch (_) {}
  try { bc?.postMessage({ type: "logout", t: ts }); } catch (_) {}
}

export function broadcastLogin(uid) {
  const ts = String(Date.now());
  try { localStorage.setItem(LS_IN, JSON.stringify({ uid, t: ts, tab: tabId })); } catch (_) {}
  try { bc?.postMessage({ type: "login", uid, t: ts, tab: tabId }); } catch (_) {}
}

export async function performLogout() {
  broadcastLogout();
  clearPortalCaches();
  try { await signOut(auth); } catch (_) {}
  location.replace("./login.html");
}

export function bindLogoutButton(btn, { confirm } = {}) {
  if (!btn || btn.dataset.ghzOut) return;
  btn.dataset.ghzOut = "1";
  btn.addEventListener("click", async (ev) => {
    ev.preventDefault();
    if (confirm) {
      const ok = await confirm();
      if (!ok) return;
    }
    btn.disabled = true;
    await performLogout();
  });
}

let crossTabBound = false;
export function watchCrossTab({ onLogout, onLogin } = {}) {
  if (crossTabBound) return;
  crossTabBound = true;
  const runOut = (src) => { try { onLogout?.({ src }); } catch (_) {} };
  const runIn = (uid, tab, src) => {
    if (ownTab(tab)) return;
    if (Date.now() - bootAt < 2500) return;
    try { onLogin?.(uid, { src, tab }); } catch (_) {}
  };
  try {
    window.addEventListener("storage", (ev) => {
      if (!ev) return;
      if (ev.key === LS && ev.newValue) runOut("storage-logout");
      if (ev.key === LS_IN && ev.newValue) {
        try {
          const d = JSON.parse(ev.newValue) || {};
          runIn(d.uid, d.tab, "storage-login");
        } catch (_) {}
      }
    });
  } catch (_) {}
  try {
    if (bc) {
      bc.onmessage = (ev) => {
        try {
          const d = ev.data || {};
          if (d.type === "logout") {
            if (ownTab(d.tab)) return;
            runOut("bc-logout");
          }
          if (d.type === "login") runIn(d.uid, d.tab, "bc-login");
        } catch (_) {}
      };
    }
  } catch (_) {}
}

export function portalHome(role) {
  return roleHome[role] || "./student.html";
}

