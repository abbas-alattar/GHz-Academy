const cache = new Map();
const TTL = 60000;
let overlay = null;
let shownAt = 0;
let delayTimer = 0;
let maxTimer = 0;
let fallbackTimer = 0;
let busy = 0;
let authReady = false;

export function isAuthReady() { return authReady; }
export function setAuthReady(v) { authReady = !!v; }

export function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > TTL) { cache.delete(key); return null; }
  return hit.data;
}
export function cacheSet(key, data) { cache.set(key, { at: Date.now(), data }); }
export function cacheClear(key) { if (key) cache.delete(key); else cache.clear(); }

export function bindOverlay(el) { overlay = el; }

export function beginLoad() {
  busy += 1;
  if (!delayTimer) {
    delayTimer = setTimeout(() => {
      delayTimer = 0;
      if (!busy || !overlay) return;
      overlay.hidden = false;
      shownAt = Date.now();
    }, 150);
  }
  clearTimeout(maxTimer);
  maxTimer = setTimeout(() => endLoad(true), 8000);
  clearTimeout(fallbackTimer);
  fallbackTimer = setTimeout(() => endLoad(), 600);
}

export function endLoad(force) {
  busy = force ? 0 : Math.max(0, busy - 1);
  if (!force && busy > 0) return;
  busy = 0;
  clearTimeout(delayTimer); delayTimer = 0;
  clearTimeout(maxTimer); maxTimer = 0;
  clearTimeout(fallbackTimer); fallbackTimer = 0;
  const wait = overlay && !overlay.hidden ? Math.max(0, 350 - (Date.now() - shownAt)) : 0;
  setTimeout(() => { if (overlay) overlay.hidden = true; }, wait);
}

export function usePageReady() {
  return function pageReady() { endLoad(); };
}

export function pageReady() { endLoad(); }
