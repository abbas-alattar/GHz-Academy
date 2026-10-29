import { auth, db } from "./firebase-config.js?v=auth8";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import {
  collection, query, where, getDocs, getDoc, doc
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

function midFromHash() {
  const h = (location.hash || "").replace(/^#/, "");
  const m = h.match(/^view\/(.+)$/);
  return m ? decodeURIComponent(m[1]) : "";
}

function b64bytes(raw) {
  const s = String(raw || "");
  const comma = s.indexOf(",");
  const b64 = comma >= 0 ? s.slice(comma + 1) : s;
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

function blockKeys(ev) {
  const k = String(ev.key || "").toLowerCase();
  const code = ev.code || "";
  if ((ev.ctrlKey || ev.metaKey) && ["s", "p", "c"].includes(k)) { ev.preventDefault(); ev.stopPropagation(); }
  if (k === "printscreen" || code === "PrintScreen") { ev.preventDefault(); }
}

async function canOpen(user, mat) {
  const courseId = mat.courseId;
  try {
    const us = await getDoc(doc(db, "users", user.uid));
    const role = us.exists() ? String(us.data()?.role || "") : "";
    const name = us.data()?.name || user.displayName || "";
    const studentId = us.data()?.studentId || "";
    if (role === "admin") return { ok: true, role, name, studentId, email: user.email || "" };
    if (role === "trainer") {
      const c = await getDoc(doc(db, "courses", courseId));
      const ids = [].concat(c.exists() ? (c.data()?.trainerIds || c.data()?.trainerId || []) : []).map(String);
      if (ids.includes(user.uid)) return { ok: true, role, name, studentId: "", email: user.email || "" };
    }
    if (role === "student") {
      return { ok: false, pendingStudent: true, name, studentId, email: user.email || "" };
    }
  } catch (_) {}
  try {
    const en = await getDocs(query(collection(db, "enrollments"), where("uid", "==", user.uid), where("courseId", "==", courseId)));
    if (en.docs.length) {
      const row = en.docs[0].data() || {};
      return { ok: true, role: "student", name: row.studentName || user.displayName || "", studentId: row.studentId || "", email: user.email || "" };
    }
  } catch (_) {}
  return { ok: false };
}

function overlayHtml(line) {
  const safe = String(line || "").replace(/</g, "");
  const bits = [];
  for (let i = 0; i < 40; i++) bits.push(`<span>${safe}</span>`);
  return `<div class="mv1-wm" data-mv1-wm="1"><div class="mv1-wm-inner">${bits.join("")}</div></div>`;
}

async function drawPage(host, data) {
  const bytes = b64bytes(data);
  const bmp = await createImageBitmap(new Blob([bytes], { type: "image/jpeg" }));
  const wrap = document.createElement("div");
  wrap.className = "mv1-wrap";
  const c = document.createElement("canvas");
  c.width = bmp.width;
  c.height = bmp.height;
  const ctx = c.getContext("2d");
  ctx.drawImage(bmp, 0, 0);
  bmp.close?.();
  wrap.appendChild(c);
  host.appendChild(wrap);
}

function overlayTampered(el) {
  if (!el || !el.isConnected) return true;
  const st = getComputedStyle(el);
  if (st.display === "none" || st.visibility === "hidden" || st.opacity === "0") return true;
  if (st.position !== "fixed") return true;
  if (st.pointerEvents !== "none") return true;
  if (st.mixBlendMode !== "multiply") return true;
  return false;
}

function lockIfOverlayGone(app) {
  const pages = app.querySelector("#mv1Pages");
  const el = document.querySelector("[data-mv1-wm]");
  if (overlayTampered(el)) {
    if (pages) pages.innerHTML = `<p class="mv1-msg">Reload to continue</p>`;
    return true;
  }
  return false;
}

export function bootMaterialView() {
  const root = document.getElementById("mv1Root") || document.body;
  const id = midFromHash();
  root.innerHTML = `<div class="mv1"><div class="mv1-busy">Opening…</div></div>`;
  onAuthStateChanged(auth, async (user) => {
    if (!user) { root.innerHTML = `<div class="mv1"><p class="mv1-msg">No access</p></div>`; return; }
    if (!id) { root.innerHTML = `<div class="mv1"><p class="mv1-msg">No access</p></div>`; return; }
    try {
      const snap = await getDoc(doc(db, "courseMaterials", id));
      if (!snap.exists()) throw new Error("missing");
      const mat = { id: snap.id, ...snap.data() };
      let acc = await canOpen(user, mat);
      if (!acc.ok && acc.pendingStudent) {
        const en = await getDocs(query(collection(db, "enrollments"), where("uid", "==", user.uid), where("courseId", "==", mat.courseId)));
        if (en.docs.length) {
          const row = en.docs[0].data() || {};
          acc = { ok: true, role: "student", name: row.studentName || acc.name || user.displayName || "", studentId: row.studentId || acc.studentId || "", email: user.email || "" };
        }
      }
      if (!acc.ok) { root.innerHTML = `<div class="mv1"><p class="mv1-msg">No access</p></div>`; return; }
      const n = Number(mat.pageCount || 0);
      const when = new Date().toLocaleString();
      const fullName = acc.name || user.displayName || (acc.role === "student" ? "Student" : acc.role);
      const mark = [fullName, acc.studentId || "", user.email || "", when].filter(Boolean).join(" · ");
      const banner = `Protected content · Viewed by ${fullName}${acc.studentId ? " (ID " + acc.studentId + ")" : (acc.role && acc.role !== "student" ? " (" + acc.role + ")" : "")} · Sharing or capturing is prohibited`;
      root.innerHTML = `<div class="mv1" id="mv1App"><div class="mv1-protect" data-mv1-banner="1"></div><header class="mv1-bar"><h1></h1><span>View only</span></header><div class="mv1-pages" id="mv1Pages"><p class="mv1-busy">Loading pages…</p></div>${overlayHtml(mark)}</div>`;
      const ban = root.querySelector("[data-mv1-banner]");
      if (ban) ban.textContent = banner;
      const titleEl = root.querySelector("h1");
      if (titleEl) titleEl.textContent = mat.title || "Material";
      const pages = root.querySelector("#mv1Pages");
      pages.innerHTML = "";
      if (!n) { pages.innerHTML = `<p class="mv1-msg">No pages</p>`; return; }
      for (let i = 0; i < n; i++) {
        const pg = await getDoc(doc(db, "materialPages", id + "_" + i));
        if (!pg.exists()) continue;
        await drawPage(pages, pg.data()?.data);
      }
      const app = root.querySelector("#mv1App");
      const blur = () => app?.classList.add("mv1-blur");
      const unblur = () => { if (!document.hidden && document.hasFocus()) app?.classList.remove("mv1-blur"); };
      document.addEventListener("visibilitychange", () => { if (document.hidden) blur(); else unblur(); });
      window.addEventListener("blur", blur);
      window.addEventListener("focus", unblur);
      document.addEventListener("contextmenu", (ev) => ev.preventDefault());
      document.addEventListener("dragstart", (ev) => ev.preventDefault());
      document.addEventListener("copy", (ev) => ev.preventDefault());
      document.addEventListener("keydown", blockKeys, true);
      document.addEventListener("keyup", blockKeys, true);
      const obs = new MutationObserver(() => lockIfOverlayGone(app));
      obs.observe(app, { subtree: true, childList: true, attributes: true, attributeFilter: ["style", "class", "hidden"] });
      setInterval(() => lockIfOverlayGone(app), 1200);
    } catch (_) {
      root.innerHTML = `<div class="mv1"><p class="mv1-msg">No access</p></div>`;
    }
  });
}

bootMaterialView();
