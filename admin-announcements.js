import { protect } from "./auth-guard.js?v=auth8";
import { db } from "./firebase-config.js?v=auth8";
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { mountPdfButton, fmtPdfDate } from "./AdminPdfExport.js";

const root = document.getElementById("annRoot");
const fail = (step, e) => {
  console.error(step, e);
  if (root) root.innerHTML = `<p class="banner">This page could not load<br>${step}: ${(e && (e.code || e.message)) || e}</p>`;
};

try {
  const { user, profile } = await protect("admin");
  const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  const when = (t) => {
    try {
      const d = t && t.toDate ? t.toDate() : t ? new Date(t) : null;
      return d ? d.toLocaleString() : "—";
    } catch { return "—"; }
  };
  const authorName = (profile && profile.name) || user.displayName || (user.email || "").split("@")[0] || "Admin";

  let courses = [];
  try {
    const cs = await getDocs(collection(db, "courses"));
    courses = cs.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    fail("courses", e);
    throw e;
  }
  const titleOf = (id) => id === "all" ? "Everyone" : (courses.find((c) => c.id === id)?.title || id);

  root.innerHTML = `
    <div class="toolbar">
      <select id="annFilter">
        <option value="">All targets</option>
        <option value="all">Everyone</option>
        ${courses.map((c) => `<option value="${c.id}">${esc(c.title)}</option>`).join("")}
      </select>
      <button class="btn btn-sm" type="button" id="newAnn">New announcement</button>
      <span id="annPdf"></span>
    </div>
    <p id="annToast" class="toast" hidden></p>
    <div id="annForm" class="hidden kpi" style="margin-top:12px"></div>
    <div id="annList"></div>`;

  const toast = (m) => {
    const t = document.getElementById("annToast");
    t.hidden = false; t.textContent = m;
  };

  const showForm = (row) => {
    const box = document.getElementById("annForm");
    box.classList.remove("hidden");
    const tgt = row ? row.courseId : "all";
    box.innerHTML = `
      <h3>${row ? "Edit announcement" : "New announcement"}</h3>
      <label>Target
        <select id="fTarget" ${row ? "disabled" : ""}>
          <option value="all">Everyone</option>
          ${courses.map((c) => `<option value="${c.id}" ${tgt===c.id?"selected":""}>${esc(c.title)}</option>`).join("")}
        </select>
      </label>
      <label>Title <input id="fTitle" maxlength="120" value="${esc(row ? row.title : "")}" /></label>
      <label>Message <textarea id="fBody" maxlength="3000" rows="6">${esc(row ? row.body : "")}</textarea></label>
      <p id="fCount">0 / 3000</p>
      <button class="btn" type="button" id="saveAnn">Save</button>
      <button class="btn btn-ghost" type="button" id="cancelAnn">Cancel</button>`;
    if (!row) document.getElementById("fTarget").value = "all";
    const bodyEl = document.getElementById("fBody");
    const count = () => { document.getElementById("fCount").textContent = `${bodyEl.value.length} / 3000`; };
    bodyEl.oninput = count; count();
    document.getElementById("cancelAnn").onclick = () => box.classList.add("hidden");
    document.getElementById("saveAnn").onclick = async () => {
      const courseId = row ? row.courseId : document.getElementById("fTarget").value;
      const ttl = document.getElementById("fTitle").value.trim().slice(0, 120);
      const msg = bodyEl.value.trim().slice(0, 3000);
      if (!ttl || !msg) { toast("Title and message are required."); return; }
      try {
        if (row) {
          await updateDoc(doc(db, "announcements", row.id), { title: ttl, body: msg });
        } else {
          await addDoc(collection(db, "announcements"), {
            courseId,
            title: ttl,
            body: msg,
            authorId: user.uid,
            authorName,
            authorRole: "admin",
            pinned: false,
            createdAt: serverTimestamp()
          });
        }
        box.classList.add("hidden");
        toast("Saved.");
        await loadList();
      } catch (e) {
        document.getElementById("annList").innerHTML = `<p class="banner">saveAnnouncement: ${e.code || e.message}</p>`;
      }
    };
  };

  const loadList = async () => {
    const box = document.getElementById("annList");
    box.textContent = "Loading…";
    let rows = [];
    try {
      const snap = await getDocs(collection(db, "announcements"));
      rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (e) {
      box.innerHTML = `<p class="banner">announcements: ${e.code || e.message}</p>`;
      return;
    }
    const filter = document.getElementById("annFilter").value;
    if (filter) rows = rows.filter((r) => r.courseId === filter);
    rows.sort((a, b) => {
      const pa = a.pinned ? 1 : 0, pb = b.pinned ? 1 : 0;
      if (pb !== pa) return pb - pa;
      const ta = a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0;
      const tb = b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0;
      return tb - ta;
    });
    box.innerHTML = rows.length ? rows.map((a) => `
      <article class="kpi" style="margin-top:12px">
        ${a.pinned ? "📌 " : ""}<strong>${esc(a.title)}</strong>
        <span class="badge badge-open">${esc(titleOf(a.courseId))}</span>
        <p style="white-space:pre-wrap">${esc(a.body)}</p>
        <p style="color:var(--muted)">${esc(a.authorName || "")} · ${esc(a.authorRole || "")} · ${when(a.createdAt)}</p>
        <button class="btn btn-sm" type="button" data-edit="${a.id}">Edit</button>
        <button class="btn btn-sm btn-ghost" type="button" data-pin="${a.id}">${a.pinned ? "Unpin" : "Pin"}</button>
        <button class="btn btn-sm btn-warn" type="button" data-del="${a.id}">Delete</button>
      </article>`).join("") : "<p>No announcements yet.</p>";

    mountPdfButton(document.getElementById("annPdf"), () => ({
      page: "Announcements",
      filters: document.getElementById("annFilter")?.selectedOptions?.[0]?.text || "All",
      columns: [{ key: "title", label: "Title" }, { key: "author", label: "Author" }, { key: "aud", label: "Audience" }, { key: "date", label: "Date" }],
      rows: rows.map((a) => ({ title: a.title || "—", author: a.authorName || "—", aud: titleOf(a.courseId), date: fmtPdfDate(a.createdAt) }))
    }), "Announcements");
    box.querySelectorAll("[data-edit]").forEach((b) => {
      b.onclick = () => showForm(rows.find((x) => x.id === b.dataset.edit));
    });
    box.querySelectorAll("[data-pin]").forEach((b) => {
      b.onclick = async () => {
        const row = rows.find((x) => x.id === b.dataset.pin);
        try {
          await updateDoc(doc(db, "announcements", row.id), { pinned: !row.pinned });
          await loadList();
        } catch (e) {
          box.innerHTML = `<p class="banner">pinAnnouncement: ${e.code || e.message}</p>`;
        }
      };
    });
    box.querySelectorAll("[data-del]").forEach((b) => {
      b.onclick = async () => {
        if (!confirm("Delete this announcement?")) return;
        try {
          await deleteDoc(doc(db, "announcements", b.dataset.del));
          await loadList();
        } catch (e) {
          box.innerHTML = `<p class="banner">deleteAnnouncement: ${e.code || e.message}</p>`;
        }
      };
    });
  };

  document.getElementById("annFilter").onchange = loadList;
  document.getElementById("newAnn").onclick = () => showForm(null);
  await loadList();
} catch (e) {
  fail("boot", e);
}
