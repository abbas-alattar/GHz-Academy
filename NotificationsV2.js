import { loadNotifications, saveSeen, clearNotifCache } from "./useNotifications.js";
import { NotificationBell } from "./NotificationBell.js";
import { NotificationPanel } from "./NotificationPanel.js";
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
  return items.filter((n) => !read.has(n.id) && n.time > (seenAt || 0) && !hid.has(n.id) && !mut.has(n.category)).length;
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

  const persist = async (extra) => {
    if (!uid) return;
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
    if (state.open) ph.replaceChildren(create(h(NotificationPanel, props)));
    else ph.replaceChildren();
    const pageHost = document.getElementById("nt2PageRoot");
    if (pageHost) {
      if (state.page) pageHost.replaceChildren(create(h(NotificationPanel, { ...props, open: false, page: true })));
      else pageHost.replaceChildren();
    }
  };

  const apply = (data, fromRefresh) => {
    const prevIds = known;
    state.items = data.items || [];
    state.seenAt = data.seenAt;
    state.readIds = data.readIds || [];
    state.hidden = data.hiddenIds || [];
    state.muted = data.muted || [];
    state.loading = false;
    state.badge = visibleBadge(state.items, state.seenAt, state.hidden, state.muted, state.readIds);
    known = new Set(state.items.map((n) => n.id));
    if (fromRefresh && prevIds.size) {
      const fresh = state.items.find((n) => !prevIds.has(n.id) && !state.muted.includes(n.category) && !state.hidden.includes(n.id) && !(state.readIds || []).includes(n.id) && !toastShown(n.id));
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
    state.readIds = state.items.map((n) => n.id);
    state.seenAt = Date.now();
    state.badge = 0;
    paint();
    await persist();
  };

  const markOne = async (n) => {
    if (!state.readIds.includes(n.id)) state.readIds = [...state.readIds, n.id].slice(-300);
    state.badge = visibleBadge(state.items, state.seenAt, state.hidden, state.muted);
    paint();
    await persist();
  };

  const hideOne = async (n) => {
    if (!state.hidden.includes(n.id)) state.hidden = [...state.hidden, n.id].slice(-300);
    state.badge = visibleBadge(state.items, state.seenAt, state.hidden, state.muted);
    paint();
    await persist({ hiddenIds: state.hidden, muted: state.muted });
  };

  const muteCat = async (c) => {
    state.muted = state.muted.includes(c) ? state.muted.filter((x) => x !== c) : [...state.muted, c];
    state.badge = visibleBadge(state.items, state.seenAt, state.hidden, state.muted);
    paint();
    await persist({ hiddenIds: state.hidden, muted: state.muted });
  };

  const openItem = (n) => {
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
  document.addEventListener("click", (e) => {
    if (!state.open && !state.settings) return;
    const t = e.target;
    if (host.contains(t) || (t && t.closest && t.closest(".nv2-slot, .nv2-root, .nv2-bell, .nv2-panel, .nv2-page, .nt2-panel, .nt2-page, #nt2-portal"))) return;
    state.open = false; state.settings = false; paint();
  }, true);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { state.open = false; state.page = false; state.settings = false; paint(); }
  });
  window.addEventListener("ghz-logout", () => { clearNotifCache(); clearInterval(timer); });
  if (/#notifications/.test(location.hash)) state.page = true;
  window.addEventListener("hashchange", () => {
    const on = /#notifications/.test(location.hash);
    if (state.page !== on) { state.page = on; if (on) state.open = false; paint(); }
  });
  timer = setInterval(() => { if (document.visibilityState === "visible") refresh(false); }, 90000);
  paint();
  refresh(true);
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
