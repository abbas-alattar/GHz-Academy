import { auth, db } from "./firebase-config.js?v=auth10";
import { collection, getDocs, query, where, doc, getDoc } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { renderBrowseCoursesV2 } from "./BrowseCoursesV2.js?v=r2";
import { stripCoverFields, hydrateCovers } from "./coverFor.js?v=stu11-r2";
import { publicCardActions, moneyLabel } from "./courseCardActions.js?v=r3";

const PUBLIC = ["Open", "Coming soon", "Closed"];

async function loadRegs(uid) {
  if (!uid) return {};
  const map = {};
  try {
    const snap = await getDocs(query(collection(db, "registrations"), where("uid", "==", uid)));
    snap.docs.forEach((d) => {
      const r = { id: d.id, ...d.data() };
      if (r.courseId) map[r.courseId] = r;
    });
  } catch (_) {}
  try {
    const snap = await getDocs(query(collection(db, "enrollments"), where("uid", "==", uid)));
    snap.docs.forEach((d) => {
      const e = d.data() || {};
      const cid = e.courseId;
      if (cid && !map[cid]) map[cid] = { courseId: cid, status: "enrolled" };
    });
  } catch (_) {}
  return map;
}

async function roleOf(user) {
  if (!user) return "guest";
  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    return String(snap.exists() ? (snap.data().role || "student") : "student");
  } catch {
    return "student";
  }
}

function paint(host, list, ctx) {
  if (!host) return;
  renderBrowseCoursesV2({
    host,
    catalog: list,
    bare: true,
    money: moneyLabel,
    cardActions: (c) => publicCardActions(c, ctx)
  });
  hydrateCovers(host);
}

try {
  const grid = document.getElementById("courseGrid");
  const filters = document.getElementById("filters");
  const sub = document.getElementById("coursesSub");
  const openLabel = document.getElementById("openRegLabel");
  if (filters) filters.hidden = true;

  let list = [];
  try {
    const snap = await getDocs(query(collection(db, "courses"), where("status", "in", PUBLIC)));
    list = snap.docs.map((d) => stripCoverFields({ id: d.id, ...d.data() }))
      .filter((c) => PUBLIC.includes(c.status));
    try { console.log("[ghz-courses] loaded", list.length); } catch {}
  } catch (err) {
    try { console.log("[ghz-courses] error", err?.code, err?.message); } catch {}
    if (grid) {
      grid.innerHTML = `<div class="pc1-err"><p>Could not load courses. Retry</p><button type="button" class="pc1-btn pri" id="landRetry">Retry</button></div>`;
      document.getElementById("landRetry")?.addEventListener("click", () => location.reload());
    }
    throw err;
  }

  const openCount = list.filter((c) => c.status === "Open").length;
  if (openLabel) openLabel.hidden = openCount < 1;
  if (sub) {
    if (openCount < 1) sub.textContent = "Build your knowledge from wireless fundamentals to advanced telecom engineering applications.";
    else sub.textContent = openCount === 1
      ? "Build your knowledge from wireless fundamentals to advanced telecom engineering applications. One course is open for registration."
      : `Build your knowledge from wireless fundamentals to advanced telecom engineering applications. ${openCount} courses are open for registration.`;
  }

  const t0 = performance.now();
  const ctx = { role: "guest", user: null, authReady: false, regsReady: false, regsByCourse: {}, checkingTimedOut: false };
  paint(grid, list, ctx);
  try { console.log("[ghz-reg] cards", list.length, Math.round(performance.now() - t0)); } catch {}
  if (!document.getElementById("pc1Modal")) {
    const m = document.createElement("div");
    m.id = "pc1Modal"; m.className = "pc1-modal"; m.hidden = true;
    document.body.appendChild(m);
  }
  grid?.addEventListener("click", async (ev) => {
    const a = ev.target?.closest("[data-view]");
    if (!a) return;
    ev.preventDefault();
    const id = a.getAttribute("data-view");
    if (!id) return;
    location.href = "./course.html?id=" + encodeURIComponent(id);
  });
  const want = new URLSearchParams(location.search).get("course");
  if (want) {
    const { openModal, applyCourseParam } = await import("./PublicCoursesV1.js?v=21-r3");
    const c = list.find((x) => String(x.id) === want || String(x.slug || "").toLowerCase() === want.toLowerCase() || String(x.title || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") === want.toLowerCase());
    if (c) location.replace("./course.html?id=" + encodeURIComponent(c.id));
    else applyCourseParam(false);
  }

  onAuthStateChanged(auth, async (user) => {
    ctx.user = user || null;
    ctx.authReady = true;
    try { console.log("[ghz-reg] auth", user || null, Math.round(performance.now() - t0)); } catch {}
    ctx.role = user ? "student" : "guest";
    ctx.regsByCourse = {};
    ctx.regsReady = !user;
    ctx.checkingTimedOut = false;
    paint(grid, list, ctx);
    try { console.log("[ghz-reg] cards", list.length, Math.round(performance.now() - t0)); } catch {}
    if (!user) return;
    try {
      ctx.role = await roleOf(user);
    } catch { ctx.role = "student"; }
    if (ctx.role !== "student") {
      ctx.regsReady = true;
      paint(grid, list, ctx);
      return;
    }
    const once = loadRegs(user.uid);
    const timed = Promise.race([once, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 4000))]);
    try {
      ctx.regsByCourse = await timed;
      ctx.regsReady = true;
    } catch {
      ctx.checkingTimedOut = true;
      ctx.regsReady = false;
      once.then((m) => { ctx.regsByCourse = m; ctx.regsReady = true; ctx.checkingTimedOut = false; paint(grid, list, ctx); }).catch(() => {});
    }
    paint(grid, list, ctx);
    try { console.log("[ghz-reg] cards", list.length, Math.round(performance.now() - t0)); } catch {}
  });
} catch (err) {
  console.error(err);
  const grid = document.getElementById("courseGrid");
  if (grid) grid.innerHTML = `<p class="empty-courses">Courses are temporarily unavailable</p>`;
}
