import { bootStudentNav } from "./student-nav.js";
import { protect } from "./auth-guard.js?v=auth8";
import { db } from "./firebase-config.js?v=auth8";
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { renderAnnouncementsV2 } from "./AnnouncementsV2.js";
import { renderAnnouncementsV3 } from "./AnnouncementsV3.js";
import { loadAnnouncementReads, unreadCount } from "./announcementReads.js";

bootStudentNav("announcements");
import("./StudentTheme.js").then((m) => { try { m.bootStudentTheme(); } catch (_) {} }).catch(() => {});
const root = document.getElementById("annRoot");
const LS = "ghz_ann_seen_at";
const fail = (step, e) => {
  console.error(step, e);
  if (root) root.innerHTML = `<p class="banner">This page could not load<br>${step}: ${(e && (e.code || e.message)) || e}</p>`;
};

try {
  const { user } = await protect("student");
  const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  const millis = (t) => (t && t.toMillis ? t.toMillis() : t ? new Date(t).getTime() : 0);
  const when = (t) => {
    try {
      const d = t && t.toDate ? t.toDate() : t ? new Date(t) : null;
      return d ? d.toLocaleString() : "—";
    } catch { return "—"; }
  };

  let enrolls = [];
  try {
    const es = await getDocs(query(collection(db, "enrollments"), where("uid", "==", user.uid)));
    enrolls = es.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    fail("enrollments", e);
    throw e;
  }

  const courses = {};
  enrolls.forEach((en) => { courses[en.courseId] = en.courseTitle || en.courseId; });

  const seen = Number(localStorage.getItem(LS) || 0);
  let rows = [];
  try {
    const all = await getDocs(query(collection(db, "announcements"), where("courseId", "==", "all")));
    rows = all.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    fail("announcementsAll", e);
    rows = [];
  }
  const ids = [...new Set(enrolls.map((e) => e.courseId).filter(Boolean))];
  const parts = await Promise.allSettled(ids.map((cid) => getDocs(query(collection(db, "announcements"), where("courseId", "==", cid)))));
  parts.forEach((p, i) => {
    if (p.status === "fulfilled") p.value.docs.forEach((d) => rows.push({ id: d.id, ...d.data() }));
    else console.error("announcements", ids[i], p.reason?.code || p.reason);
  });
  const uniq = [];
  const seenIds = new Set();
  for (const r of rows) {
    if (seenIds.has(r.id)) continue;
    seenIds.add(r.id);
    uniq.push(r);
  }
  uniq.sort((a, b) => {
    const pa = a.pinned ? 1 : 0, pb = b.pinned ? 1 : 0;
    if (pb !== pa) return pb - pa;
    return millis(b.createdAt) - millis(a.createdAt);
  });
  await loadAnnouncementReads(user.uid);
  const nNew = unreadCount(user.uid, uniq);
  const badge = document.getElementById("annBadge");
  if (badge) {
    if (nNew) { badge.textContent = String(nNew); badge.hidden = false; }
    else { badge.textContent = ""; badge.hidden = true; }
  }

  root.innerHTML = uniq.length ? uniq.map((a) => `
    <article class="kpi" style="margin-top:12px">
      ${a.pinned ? "📌 " : ""}<strong>${esc(a.title)}</strong>
      ${millis(a.createdAt) > seen ? `<span class="badge" style="background:#16a34a;color:#fff">New</span>` : ""}
      <span class="badge badge-open">${a.courseId === "all" ? "Everyone" : esc(courses[a.courseId] || a.courseId)}</span>
      <p style="white-space:pre-wrap">${esc(a.body)}</p>
      <p style="color:var(--muted)">${esc(a.authorName || "")} · ${esc(a.authorRole || "")} · ${when(a.createdAt)}</p>
    </article>`).join("") : "<p>No announcements yet.</p>";

  const v2 = document.getElementById("annV2Root");
  const showClassic = () => {
    if (v2) v2.classList.add("hidden");
    if (root) root.classList.remove("hidden");
  };
  try {
    renderAnnouncementsV3({
      host: v2,
      items: uniq,
      courses,
      uid: user.uid,
      onClassic: showClassic,
      onReady: () => { if (root) root.classList.add("hidden"); if (v2) v2.classList.remove("hidden"); }
    });
  } catch (e) {
    showClassic();
    if (v2) v2.innerHTML = `<p class="banner">announcements: ${e.code||e.message}</p><button class="btn btn-sm" type="button" id="annClassicBtn">Use classic view</button>`;
    document.getElementById("annClassicBtn")?.addEventListener("click", showClassic);
  }

  localStorage.setItem(LS, String(newest));
} catch (e) {
  fail("boot", e);
}
