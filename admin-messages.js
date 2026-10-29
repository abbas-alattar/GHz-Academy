import { protect } from "./auth-guard.js?v=auth8";
import { db } from "./firebase-config.js?v=auth8";
import { collection, query, orderBy, limit, startAfter, getDocs, updateDoc, deleteDoc, doc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { mountPdfButton, fmtPdfDate } from "./AdminPdfExport.js";

const root = document.getElementById("msgRoot");
const fail = (step, e) => {
  console.error(step, e);
  if (root) root.innerHTML = `<p class="banner">${step}: ${(e && (e.code || e.message)) || e}</p>`;
};

try {
  const { user } = await protect("admin");
  const n1 = document.getElementById("userName");
  if (n1) n1.textContent = user.displayName || (user.email || "").split("@")[0] || "admin";

  const PAGE = 200;
  let rows = [];
  let lastDoc = null;
  let more = false;
  let filter = "all";
  let courseF = "";
  let qtext = "";
  let openId = "";

  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (ch) => {
    if (ch === "&") return "\u0026amp;";
    if (ch === "<") return "\u0026lt;";
    if (ch === ">") return "\u0026gt;";
    return "\u0026quot;";
  });
  const fmt = (v) => {
    try {
      const d = v && v.toDate ? v.toDate() : v ? new Date(v) : null;
      return d && !isNaN(d) ? d.toLocaleString() : "—";
    } catch { return "—"; }
  };
  const badge = (s) => {
    const map = { new: "badge-soon", read: "badge-draft", replied: "badge-open", archived: "badge-arch" };
    const label = { new: "New", read: "Read", replied: "Replied", archived: "Archived" }[s] || s;
    return `<span class="badge ${map[s] || "badge-draft"}">${label}</span>`;
  };

  const loadPage = async (reset) => {
    try {
      const parts = [collection(db, "inquiries"), orderBy("createdAt", "desc"), limit(PAGE)];
      let qy = query(...parts);
      if (!reset && lastDoc) qy = query(collection(db, "inquiries"), orderBy("createdAt", "desc"), startAfter(lastDoc), limit(PAGE));
      const snap = await getDocs(qy);
      const chunk = snap.docs.map((d) => ({ id: d.id, ...d.data(), _snap: d }));
      if (reset) rows = chunk; else rows = rows.concat(chunk);
      lastDoc = snap.docs[snap.docs.length - 1] || lastDoc;
      more = snap.docs.length === PAGE;
    } catch (e) {
      fail("inquiries", e);
      throw e;
    }
  };

  const patch = async (id, extra) => {
    await updateDoc(doc(db, "inquiries", id), {
      ...extra,
      handledBy: user.uid,
      handledAt: serverTimestamp()
    });
    const r = rows.find((x) => x.id === id);
    if (r) Object.assign(r, extra);
  };

  const filtered = () => {
    return rows.filter((r) => {
      if (filter !== "all" && r.status !== filter) return false;
      if (courseF && r.courseId !== courseF && r.courseTitle !== courseF) return false;
      if (qtext) {
        const t = qtext.toLowerCase();
        const blob = `${r.name || ""} ${r.email || ""} ${r.message || ""}`.toLowerCase();
        if (!blob.includes(t)) return false;
      }
      return true;
    });
  };

  const courses = () => {
    const m = new Map();
    rows.forEach((r) => { if (r.courseTitle) m.set(r.courseId || r.courseTitle, r.courseTitle); });
    return [...m.entries()];
  };

  const exportCsv = () => {
    const list = filtered();
    const lines = ["Date,Name,Email,Course,Status,Message"].concat(list.map((r) => {
      const msg = String(r.message || "").replace(/"/g, '""');
      return `"${fmt(r.createdAt)}","${(r.name || "").replace(/"/g, '""')}","${r.email || ""}","${(r.courseTitle || "").replace(/"/g, '""')}",${r.status || ""},"${msg}"`;
    }));
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "messages.csv"; a.click(); URL.revokeObjectURL(url);
  };

  const paint = () => {
    const list = filtered();
    const open = rows.find((x) => x.id === openId);
    root.innerHTML = `
      <div class="toolbar">
        <button type="button" class="${filter === "all" ? "btn btn-sm" : "btn btn-sm btn-ghost"}" data-st="all">All</button>
        <button type="button" class="${filter === "new" ? "btn btn-sm" : "btn btn-sm btn-ghost"}" data-st="new">New</button>
        <button type="button" class="${filter === "read" ? "btn btn-sm" : "btn btn-sm btn-ghost"}" data-st="read">Read</button>
        <button type="button" class="${filter === "replied" ? "btn btn-sm" : "btn btn-sm btn-ghost"}" data-st="replied">Replied</button>
        <button type="button" class="${filter === "archived" ? "btn btn-sm" : "btn btn-sm btn-ghost"}" data-st="archived">Archived</button>
        <select id="msgCourse"><option value="">All courses</option>${courses().map(([id, t]) => `<option value="${esc(id)}" ${courseF === id ? "selected" : ""}>${esc(t)}</option>`).join("")}</select>
        <input id="msgSearch" placeholder="Search name, email, text" value="${esc(qtext)}" />
        <button class="btn btn-sm btn-ghost" type="button" id="exportMsg">Export CSV</button>
        <span id="msgPdf"></span>
      </div>
      <div class="table-wrap"><table class="data"><thead><tr><th>Date</th><th>Name</th><th>Email</th><th>Course</th><th>Message</th><th>Status</th></tr></thead><tbody>
        ${list.length ? list.map((r) => `<tr data-id="${r.id}"><td>${fmt(r.createdAt)}</td><td>${esc(r.name)}</td><td>${esc(r.email)}</td><td>${esc(r.courseTitle)}</td><td>${esc((r.message || "").slice(0, 80))}${(r.message || "").length > 80 ? "…" : ""}</td><td>${badge(r.status)}</td></tr>`).join("") : `<tr><td colspan="6">No messages.</td></tr>`}
      </tbody></table></div>
      ${more ? `<p><button class="btn btn-sm" type="button" id="loadMore">Load more</button></p>` : ""}
      <div id="msgPanel">${open ? panelHtml(open) : ""}</div>`;
    root.querySelectorAll("[data-st]").forEach((b) => b.onclick = () => { filter = b.dataset.st; paint(); });
    const cs = document.getElementById("msgCourse"); if (cs) cs.onchange = () => { courseF = cs.value; paint(); };
    const se = document.getElementById("msgSearch"); if (se) se.oninput = () => { qtext = se.value; paint(); };
    const ex = document.getElementById("exportMsg"); if (ex) ex.onclick = exportCsv;
    const lm = document.getElementById("loadMore"); if (lm) lm.onclick = async () => { try { await loadPage(false); paint(); } catch (e) { fail("inquiries", e); } };
    root.querySelectorAll("[data-id]").forEach((tr) => tr.onclick = async () => {
      openId = tr.dataset.id;
      const r = rows.find((x) => x.id === openId);
      try {
        if (r && r.status === "new") {
          await patch(openId, { status: "read" });
          r.status = "read";
        }
      } catch (e) { fail("mark-read", e); return; }
      paint();
    });
    bindPanel();
    mountPdfButton(document.getElementById("msgPdf"), () => {
      const list = filtered();
      return {
        page: "Messages",
        filters: "Status: " + filter + (qtext ? " · Search: " + qtext : ""),
        columns: [{ key: "name", label: "Name" }, { key: "email", label: "Email" }, { key: "subject", label: "Subject" }, { key: "date", label: "Date" }, { key: "status", label: "Status" }],
        rows: list.map((r) => ({ name: r.name || "—", email: r.email || "—", subject: r.courseTitle || "Interest", date: fmtPdfDate(r.createdAt), status: r.status || "—" }))
      };
    }, "Messages");
  };

  const panelHtml = (r) => `
    <article class="kpi" style="margin-top:16px">
      <h3>${esc(r.name)}</h3>
      <p>${esc(r.email)} · ${esc(r.courseTitle)} · ${fmt(r.createdAt)}</p>
      <p>${esc(r.message)}</p>
      <p>
        <a class="btn btn-sm" href="mailto:${encodeURIComponent(r.email)}?subject=${encodeURIComponent("Re: your interest in " + (r.courseTitle || "GHz Academy"))}&body=${encodeURIComponent("Hello " + (r.name || "") + ",\\n\\nThank you for your interest in " + (r.courseTitle || "GHz Academy") + ".\\n\\n")}">Reply by email</a>
        <button class="btn btn-sm btn-ghost" type="button" id="copyEm">Copy email</button>
        <button class="btn btn-sm" type="button" id="togRead">${r.status === "read" || r.status === "replied" ? "Mark as unread" : "Mark as read"}</button>
        <button class="btn btn-sm" type="button" id="markRep">Mark as replied</button>
        <button class="btn btn-sm btn-warn" type="button" id="archMsg">Archive</button>
        <button class="btn btn-sm btn-ghost" type="button" id="delMsg">Delete</button>
      </p>
      <label>Internal note</label>
      <textarea id="adminNote" style="width:100%;min-height:70px;padding:12px;border:1px solid var(--line);border-radius:10px;font:inherit">${esc(r.adminNote || "")}</textarea>
      <p><button class="btn btn-sm" type="button" id="saveNote">Save note</button></p>
      <p id="msgErr" class="banner" hidden></p>
    </article>`;

  const bindPanel = () => {
    const r = rows.find((x) => x.id === openId);
    if (!r) return;
    const err = (step, e) => {
      const el = document.getElementById("msgErr");
      if (el) { el.hidden = false; el.textContent = step + ": " + (e.code || e.message || e); }
    };
    const copy = document.getElementById("copyEm");
    if (copy) copy.onclick = () => navigator.clipboard.writeText(r.email || "").then(() => {}).catch(() => {});
    const tog = document.getElementById("togRead");
    if (tog) tog.onclick = async () => {
      try { await patch(r.id, { status: r.status === "new" ? "read" : "new" }); paint(); } catch (e) { err("status", e); }
    };
    const mr = document.getElementById("markRep");
    if (mr) mr.onclick = async () => { try { await patch(r.id, { status: "replied" }); paint(); } catch (e) { err("status", e); } };
    const ar = document.getElementById("archMsg");
    if (ar) ar.onclick = async () => { try { await patch(r.id, { status: "archived" }); paint(); } catch (e) { err("status", e); } };
    const sn = document.getElementById("saveNote");
    if (sn) sn.onclick = async () => {
      try {
        const note = document.getElementById("adminNote").value;
        await patch(r.id, { adminNote: note, status: r.status || "read" });
        r.adminNote = note;
      } catch (e) { err("adminNote", e); }
    };
    const del = document.getElementById("delMsg");
    if (del) del.onclick = async () => {
      if (!confirm("Delete this message?")) return;
      try { await deleteDoc(doc(db, "inquiries", r.id)); rows = rows.filter((x) => x.id !== r.id); openId = ""; paint(); }
      catch (e) { err("delete", e); }
    };
  };

  await loadPage(true);
  paint();
} catch (e) {
  fail("boot", e);
}
