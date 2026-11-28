import { loadNotifications, loadNotifPrefs, saveSeen, clearNotifCache, studentNotifsFromStore, CAT } from "./useNotifications.js?v=r2";
import { db } from "./firebase-config.js?v=auth10";
import { collection, query, orderBy, limit, onSnapshot, doc, updateDoc, writeBatch, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { onDashData, getStudentStore, datasetsReady } from "./student-dash-data.js?v=stu11-r2";
import { NotificationBell } from "./NotificationBell.js";
import { NotificationPanel } from "./NotificationPanel.js?v=r2";
import { NotificationToast, pushNotificationToast } from "./NotificationToast.js";
import { h, create } from "./nv2-h.js";
export { h };

function goHash(hash) {
  let next = String(hash || "dash").replace(/^#/, "");
  if (!next) next = "dash";
  const full = "#" + next;
  if (location.hash === full) {
    try { window.dispatchEvent(new HashChangeEvent("hashchange")); } catch (_) { window.dispatchEvent(new Event("hashchange")); }
  } else {
    location.hash = next;
  }
}
function pickId(n, key) {
  if (n[key]) return n[key];
  const m = String(n.link || "").match(/item=([^&]+)/);
  return m ? decodeURIComponent(m[1]) : "";
}
function routeFor(n, role) {
  const t = String(n.type || "");
  const cid = n.courseId || "";
  const title = String(n.title || "") + " " + String(n.message || "");
  if (t === "ann" || /announcement/i.test(title)) return "#announcements";
  if (t === "regReceived" || t === "payReview" || t === "enrolled" || t === "regRejected" || /registration/i.test(title)) {
    return role === "admin" ? "#registrations" : "#regs";
  }
  if (t === "course_completed" || t === "courseDone") {
    return cid ? "#grades/" + cid : "#grades";
  }
  if (t === "finalGrade" || t === "courseGrade" || t === "coursePass" || t === "courseFail" || t === "gradeDist" || /grade/i.test(title)) {
    return cid ? "#grades?course=" + encodeURIComponent(cid) : "#grades";
  }
  if (t === "certIssued" || t === "certRevoked" || /certificate/i.test(title)) return "#certificates";
  if (t === "hwGraded" || t === "hwPosted" || t === "hwSub") {
    const hid = pickId(n, "assignmentId") || pickId(n, "id");
    if (role === "student" && t === "hwGraded" && hid) return "#homework/" + hid;
    if (role === "student" && t === "hwPosted" && hid) return "#homework/" + hid;
    return "#homework";
  }
  if (t === "quizGraded" || t === "quizPosted" || t === "quizSub") {
    const qid = pickId(n, "quizId");
    if (role === "student" && qid) return "#quiz/" + qid;
    return "#quizzes";
  }
  if (/material/i.test(title) && cid) return "#course/" + cid + "/materials";
  if ((t === "assigned" || t === "course_assigned" || t === "course_reopened") && cid) return "#course/" + cid;
  if (role === "admin" && /message/i.test(title)) return "#messages";
  if (t === "enrolled" && cid) return "#course/" + cid;
  return role === "admin" ? "#dash" : "#dash";
}
function visibleBadge(items, seenAt, hidden, muted, readIds) {
  const hid = new Set(hidden || []);
  const mut = new Set(muted || []);
  const read = new Set(readIds || []);
  return items.filter((n) => !n.read && !read.has(n.id) && n.time > (seenAt || 0) && !hid.has(n.id) && !mut.has(n.category)).length;
}
function toastShown(id) {
  try { return (JSON.parse(sessionStorage.getItem("ghz-toast-shown") || "[]") || []).includes(id); } catch { return false; }
}

export function bootNotificationsV2({ role, uid, host }) {
  if (!host) return false;
  const state = {
    items: [], seenAt: 0, readIds: [], hidden: [], muted: [],
    open: false, page: false, tab: "all", loading: true, badge: 0, shake: false, toast: null,
    expanded: {}, settings: false, query: "", resultBox: null, pageLimit: 30
  };
  let timer = 0;
  let toastTimer = 0;
  let known = new Set();
  // The count is only shown once this person's read history has loaded; before that,
  // every notification would look unread and a large number would flash at login.
  let prefsReady = false;
  // Saved notifications (live) are merged with the computed history; same id = same event.
  let derived = [];
  let saved = [];
  let liveOk = false;
  const relTime = (ms) => { const d = Date.now() - ms; if (d < 60000) return "now"; if (d < 3600000) return Math.floor(d / 60000) + "m"; if (d < 86400000) return Math.floor(d / 3600000) + "h"; return Math.floor(d / 86400000) + "d"; };
  const merged = () => {
    const byId = new Map();
    derived.forEach((n) => byId.set(n.id, n));
    saved.forEach((n) => { const old = byId.get(n.id); byId.set(n.id, old ? { ...old, ...n, link: old.link || n.link } : n); });
    return Array.from(byId.values()).sort((a, b) => b.time - a.time);
  };
  const markSavedRead = (list) => {
    const todo = (list || []).filter((n) => n && n.saved && !n.read && n.docId);
    if (!todo.length || !uid) return;
    todo.forEach((n) => { n.read = true; });
    try {
      const b = writeBatch(db);
      todo.slice(0, 450).forEach((n) => b.update(doc(db, "users", uid, "notifications", n.docId), { read: true, readAt: serverTimestamp() }));
      b.commit().catch(() => {});
    } catch (_) {}
  };
  const badgeNow = () => prefsReady ? visibleBadge(state.items, state.seenAt, state.hidden, state.muted, state.readIds) : 0;
  // Keep read state in step across open tabs of the same account.
  let chan = null;
  try { chan = uid && "BroadcastChannel" in window ? new BroadcastChannel("ghz-notif-" + uid) : null; } catch (_) { chan = null; }
  const broadcast = () => {
    try { chan?.postMessage({ seenAt: state.seenAt, readIds: state.readIds, hidden: state.hidden, muted: state.muted }); } catch (_) {}
  };

  const persist = async (extra) => {
    if (!uid) return;
    broadcast();
    await saveSeen(uid, state.seenAt, state.readIds, extra || { hiddenIds: state.hidden, muted: state.muted });
  };

  const portalHost = () => {
    let el = document.getElementById("nt2-portal");
    if (!el) {
      el = document.createElement("div");
      el.id = "nt2-portal";
      document.body.appendChild(el);
    }
    return el;
  };
  const panelStyleFromBell = () => {
    const bell = host.querySelector(".nv2-bell");
    const r = bell ? bell.getBoundingClientRect() : { right: 24, bottom: 56, left: window.innerWidth - 64 };
    const w = Math.min(400, window.innerWidth - 16);
    let left = Math.min(Math.max(8, r.right - w), window.innerWidth - w - 8);
    const top = Math.round(r.bottom + 8);
    return { position: "fixed", top: top + "px", left: left + "px", right: "auto", width: w + "px", zIndex: "240" };
  };
  const paint = () => {
    const tree = h("div", { className: "nv2-root nt2-root" },
      h(NotificationBell, {
        badge: state.badge,
        open: state.open,
        shake: state.shake,
        onToggle: toggle
      }),
      h(NotificationToast, {
        toast: state.toast,
        onView: (n) => openItem(n),
        onClose: () => { state.toast = null; paint(); }
      }),
      state.resultBox ? h("div", { className: "nv2-box-scrim", onClick: () => { state.resultBox = null; paint(); } },
        h("div", {
          className: "nv2-box" + (state.resultBox.type === "courseFail" ? " nv2-box-fail" : " nv2-box-pass"),
          onClick: (e) => e.stopPropagation(),
          role: "dialog",
          "aria-modal": "true"
        },
          h("strong", null, state.resultBox.type === "courseFail" ? "Course not passed" : "Congratulations"),
          h("p", null, state.resultBox.message),
          h("button", { type: "button", onClick: () => {
            const n = state.resultBox;
            state.resultBox = null;
            paint();
            goHash(routeFor(n, role));
          } }, state.resultBox.type === "courseFail" ? "View grades" : "Continue")
        )
      ) : null
    );
    host.replaceChildren(create(tree));
    const ph = portalHost();
    const props = {
      open: state.open,
      page: false,
      panelStyle: state.open ? panelStyleFromBell() : undefined,
      loading: state.loading && !state.items.length,
      items: state.items,
      seenAt: state.seenAt,
      readIds: state.readIds,
      hidden: state.hidden,
      muted: state.muted,
      tab: state.tab,
      expanded: state.expanded,
      settings: state.settings,
      query: state.query,
      limit: state.pageLimit,
      onTab: (t) => { state.tab = t; paint(); },
      onMarkAll: () => markAll(),
      onOpen: (n) => openItem(n),
      onRead: (n) => markOne(n),
      onHide: (n) => hideOne(n),
      onExp: (id) => { state.expanded[id] = !state.expanded[id]; paint(); },
      onSeeAll: () => { state.open = false; state.page = true; paint(); goHash("#notifications"); },
      onClosePage: () => { state.page = false; paint(); },
      onGear: () => { state.settings = !state.settings; paint(); },
      onMute: (c) => muteCat(c),
      onQuery: (q) => { state.query = q; paint(); },
      onMore: () => { state.pageLimit += 30; paint(); }
    };
    const phoneSheet = window.matchMedia("(max-width: 639px)").matches;
    const closeSheet = () => {
      state.open = false;
      document.body.classList.remove("nt2-noscroll");
      paint();
    };
    if (phoneSheet && state.open) document.body.classList.add("nt2-noscroll");
    else document.body.classList.remove("nt2-noscroll");
    if (state.open) ph.replaceChildren(create(h(NotificationPanel, { ...props, sheet: phoneSheet, role, onClose: closeSheet })));
    else ph.replaceChildren();
    const pageHost = document.getElementById("nt2PageRoot");
    if (pageHost) {
      if (state.page) pageHost.replaceChildren(create(h(NotificationPanel, { ...props, open: false, page: true })));
      else pageHost.replaceChildren();
    }
  };

  const apply = (data, fromRefresh) => {
    const prevIds = known;
    derived = data.items || [];
    state.items = merged();
    state.seenAt = data.seenAt;
    state.readIds = data.readIds || [];
    state.hidden = data.hiddenIds || [];
    state.muted = data.muted || [];
    state.loading = false;
    if (fromRefresh) prefsReady = true;
    state.badge = badgeNow();
    known = new Set(state.items.map((n) => n.id));
    if (fromRefresh && prevIds.size) {
      const fresh = state.items.find((n) => n.type !== "coursePass" && n.type !== "courseFail" && !prevIds.has(n.id) && !state.muted.includes(n.category) && !state.hidden.includes(n.id) && !(state.readIds || []).includes(n.id) && !toastShown(n.id));
      if (fresh) {
        if (fresh.type === "coursePass" || fresh.type === "courseFail") {
          /* student result modal is CourseResultBox */
        }
        pushNotificationToast(fresh, { onView: (n) => openItem(n) });
      }
    }
    if (state.badge && !state.open) {
      state.shake = true;
      setTimeout(() => { state.shake = false; paint(); }, 700);
    }
    paint();
  };

  const refresh = async (force) => {
    const data = await loadNotifications({ role, uid, force });
    apply(data, true);
  };

  const toggle = async (ev) => {
    if (ev) { ev.preventDefault(); ev.stopPropagation(); }
    state.open = !state.open;
    state.settings = false;
    if (state.open) {
      state.seenAt = Date.now();
      state.badge = 0;
      paint();
      await persist();
    } else paint();
  };

  const markAll = async () => {
    markSavedRead(state.items);
    state.readIds = state.items.map((n) => n.id);
    state.seenAt = Date.now();
    state.badge = 0;
    paint();
    await persist();
  };

  const markOne = async (n) => {
    markSavedRead(state.items.filter((x) => x.id === n.id));
    if (!state.readIds.includes(n.id)) state.readIds = [...state.readIds, n.id].slice(-300);
    state.badge = badgeNow();
    paint();
    await persist();
  };

  const hideOne = async (n) => {
    if (!state.hidden.includes(n.id)) state.hidden = [...state.hidden, n.id].slice(-300);
    state.badge = badgeNow();
    paint();
    await persist({ hiddenIds: state.hidden, muted: state.muted });
  };

  const muteCat = async (c) => {
    state.muted = state.muted.includes(c) ? state.muted.filter((x) => x !== c) : [...state.muted, c];
    state.badge = badgeNow();
    paint();
    await persist({ hiddenIds: state.hidden, muted: state.muted });
  };

  const openItem = (n) => {
    markSavedRead(state.items.filter((x) => x.id === n.id));
    if (!state.readIds.includes(n.id)) state.readIds = [...state.readIds, n.id].slice(-300);
    state.open = false;
    state.page = false;
    state.toast = null;
    paint();
    persist();
    if (n.type === "coursePass" || n.type === "courseFail") {
      state.resultBox = n;
      paint();
      return;
    }
    if (n.type === "ann" && n.announcementId && uid) {
      import("./announcementReads.js").then((m) => m.markAnnouncementRead(uid, n.announcementId)).catch(() => {});
    }
    goHash(routeFor(n, role));
  };

  window.addEventListener("ghz-mark-assigned", (ev) => {
    const cid = ev.detail?.courseId;
    if (!cid) return;
    const types = ev.detail?.type ? [ev.detail.type, "assigned", "course_assigned", "course_reopened", "course_completed", "courseDone"] : ["assigned", "course_assigned", "course_reopened", "course_completed", "courseDone"];
    state.items.filter((n) => types.includes(n.type) && n.courseId === cid).forEach((n) => {
      if (!state.readIds.includes(n.id)) state.readIds = [...state.readIds, n.id].slice(-300);
    });
    paint();
    persist();
  });
  window.addEventListener("ghz-trainer-courses", () => { if (role === "trainer") refresh(true); });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") refresh(false); });
  const outsideClose = (e) => {
    if (!state.open && !state.settings) return;
    const t = e.target;
    if (t && t.closest && t.closest(".nv2-bell, .nv2-root")) return;
    if (t && t.closest && t.closest(".nt2-sheet, .nt2-panel, .nt2-page")) return;
    state.open = false; state.settings = false; document.body.classList.remove("nt2-noscroll"); paint();
  };
  document.addEventListener("pointerdown", outsideClose, true);
  document.addEventListener("click", outsideClose, true);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { state.open = false; state.page = false; state.settings = false; document.body.classList.remove("nt2-noscroll"); paint(); }
  });
  window.addEventListener("ghz-logout", () => { clearNotifCache(); clearInterval(timer); });
  if (/#notifications/.test(location.hash)) state.page = true;
  window.addEventListener("hashchange", () => {
    const on = /#notifications/.test(location.hash);
    if (state.page !== on) { state.page = on; if (on) state.open = false; document.body.classList.remove("nt2-noscroll"); paint(); }
    else if (state.open) { state.open = false; document.body.classList.remove("nt2-noscroll"); paint(); }
  });
  timer = setInterval(() => { if (document.visibilityState === "visible" && !liveOk) refresh(false); }, 90000);
  if (chan) chan.onmessage = (ev) => {
    const d = ev && ev.data;
    if (!d) return;
    state.seenAt = Math.max(Number(state.seenAt) || 0, Number(d.seenAt) || 0);
    state.readIds = Array.from(new Set([...(state.readIds || []), ...(d.readIds || [])])).slice(-300);
    state.hidden = Array.from(new Set([...(state.hidden || []), ...(d.hidden || [])])).slice(-300);
    if (Array.isArray(d.muted)) state.muted = d.muted.slice();
    state.badge = badgeNow();
    paint();
  };
  window.addEventListener("ghz-logout", () => { try { chan?.close(); } catch (_) {} });
  let unsubLive = null;
  let firstLive = true;
  try {
    unsubLive = onSnapshot(query(collection(db, "users", uid, "notifications"), orderBy("createdAt", "desc"), limit(60)), (snap) => {
      liveOk = true;
      const fresh = [];
      saved = snap.docs.map((d) => {
        const x = d.data() || {};
        const t = (x.createdAt && typeof x.createdAt.toMillis === "function") ? x.createdAt.toMillis() : Date.now();
        return { id: d.id, docId: d.id, saved: true, read: !!x.read, type: x.type || "", category: CAT[x.type] || "Courses",
          title: x.title || "", message: x.message || "", courseTitle: x.courseTitle || "", courseId: x.courseId || "",
          link: x.link || "", time: t, rel: relTime(t), actorName: x.actorName || "" };
      });
      if (!firstLive) snap.docChanges().forEach((ch) => { if (ch.type === "added") { const n = saved.find((y) => y.id === ch.doc.id); if (n && !n.read) fresh.push(n); } });
      firstLive = false;
      state.items = merged();
      known = new Set(state.items.map((n) => n.id));
      state.badge = badgeNow();
      const pick = fresh.find((n) => !state.muted.includes(n.category) && !state.hidden.includes(n.id) && !(state.readIds || []).includes(n.id) && !toastShown(n.id));
      if (pick && !state.open) {
        pushNotificationToast(pick, { onView: (n) => openItem(n) });
        state.shake = true;
        setTimeout(() => { state.shake = false; paint(); }, 700);
      }
      paint();
    }, () => { liveOk = false; });
  } catch (_) { liveOk = false; }
  window.addEventListener("ghz-logout", () => { try { unsubLive?.(); } catch (_) {} });
  loadNotifPrefs(uid).then((p) => {
    if (!p || prefsReady) return;
    state.seenAt = p.seenAt; state.readIds = p.readIds.slice(); state.hidden = p.hiddenIds.slice(); state.muted = p.muted.slice();
    prefsReady = true;
    state.badge = badgeNow();
    paint();
  }).catch(() => {});
  paint();
  if (role === "student") {
    const fromStore = (st) => {
      const items = studentNotifsFromStore(uid, st || getStudentStore());
      const ready = datasetsReady(["enrollments", "assignments", "quizzes", "submissions", "quizAttempts", "announcements", "certificates", "registrations"]);
      apply({
        items,
        seenAt: state.seenAt,
        readIds: state.readIds,
        hiddenIds: state.hidden,
        muted: state.muted
      }, false);
      state.loading = !ready && !items.length;
      if (!state.loading) paint();
    };
    onDashData((st) => fromStore(st));
    fromStore(getStudentStore());
  }
  refresh(true);
  window.__ghzNv2 = {
    getState: () => state,
    markAll,
    markOne,
    openItem,
    refresh
  };
  return true;
}

export function mountNotificationsV2(opts) {
  try {
    return bootNotificationsV2(opts);
  } catch (e) {
    console.error("NotificationsV2", e);
    return false;
  }
}
