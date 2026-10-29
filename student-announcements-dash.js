import { auth, db } from "./firebase-config.js?v=auth8";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

(function () {
  const host = document.getElementById("annDashHost");
  if (!host) return;
  const fail = (step, e) => {
    console.error(step, e);
    host.innerHTML = `<p class="banner">Latest announcements<br>${step}: ${(e && (e.code || e.message)) || e}</p>`;
  };
  const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  const millis = (t) => (t && t.toMillis ? t.toMillis() : t ? new Date(t).getTime() : 0);

  onAuthStateChanged(auth, async (user) => {
    if (!user) return;
    try {
      host.innerHTML = `<div class="kpi"><h3 style="font-size:1.05rem;color:var(--navy)">Latest announcements</h3><p>Loading…</p></div>`;
      let enrolls = [];
      try {
        const es = await getDocs(query(collection(db, "enrollments"), where("uid", "==", user.uid)));
        enrolls = es.docs.map((d) => d.data());
      } catch (e) {
        fail("enrollments", e);
        return;
      }
      let rows = [];
      try {
        const all = await getDocs(query(collection(db, "announcements"), where("courseId", "==", "all")));
        rows = all.docs.map((d) => ({ id: d.id, ...d.data() }));
      } catch (e) {
        fail("announcementsAll", e);
        return;
      }
      const ids = [...new Set(enrolls.map((e) => e.courseId).filter(Boolean))];
      for (const cid of ids) {
        try {
          const qs = await getDocs(query(collection(db, "announcements"), where("courseId", "==", cid)));
          qs.docs.forEach((d) => rows.push({ id: d.id, ...d.data() }));
        } catch (e) {
          fail("announcements", e);
          return;
        }
      }
      const uniq = [];
      const seen = new Set();
      for (const r of rows) {
        if (seen.has(r.id)) continue;
        seen.add(r.id);
        uniq.push(r);
      }
      uniq.sort((a, b) => {
        const pa = a.pinned ? 1 : 0, pb = b.pinned ? 1 : 0;
        if (pb !== pa) return pb - pa;
        return millis(b.createdAt) - millis(a.createdAt);
      });
      const top = uniq.slice(0, 3);
      host.innerHTML = `<div class="kpi" style="margin-top:18px">
        <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap">
          <h3 style="font-size:1.05rem;color:var(--navy)">Latest announcements</h3>
          <a href="./student-announcements.html">See all</a>
        </div>
        ${top.length ? top.map((a) => `<p style="margin-top:10px"><strong>${esc(a.title)}</strong><br>${esc(String(a.body||"").slice(0,140))}${String(a.body||"").length>140?"…":""}</p>`).join("") : "<p style=\"margin-top:10px\">No announcements yet.</p>"}
      </div>`;
    } catch (e) {
      fail("dashAnnouncements", e);
    }
  });
})();
