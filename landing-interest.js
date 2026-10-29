import { db } from "./firebase-config.js?v=auth8";
import { addDoc, collection, getDocs, query, where, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

const COOL_KEY = "ghz-inquiry-cool";
const PUBLIC = ["Open", "Coming soon", "Closed"];

try {
  const form = document.getElementById("interestForm");
  const sel = document.getElementById("course");
  const msg = document.getElementById("msg");
  const err = document.getElementById("err");
  const ok = document.getElementById("ok");
  const btn = form?.querySelector('button[type="submit"]');
  if (!form) throw new Error("form missing");

  const showErr = (t) => { if (err) { err.style.display = "block"; err.textContent = t; } if (ok) ok.style.display = "none"; };
  const showOk = (t) => { if (ok) { ok.style.display = "block"; ok.textContent = t; } if (err) err.style.display = "none"; };

  if (sel) {
    sel.innerHTML = `<option value="">Not sure yet</option>`;
    sel.required = false;
    try {
      const snap = await getDocs(query(collection(db, "courses"), where("status", "in", PUBLIC)));
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((c) => PUBLIC.includes(c.status));
      list.sort((a, b) => String(a.title || "").localeCompare(String(b.title || "")));
      sel.innerHTML = `<option value="">Not sure yet</option>` + list.map((c) => `<option value="${c.id}">${c.title}</option>`).join("");
    } catch (e) {
      console.error(e);
    }
  }

  if (msg) msg.maxLength = 2000;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (ok) ok.style.display = "none";
    if (err) err.style.display = "none";
    try {
      const honey = document.getElementById("companyWebsite");
      if (honey && honey.value) {
        showOk("Thank you! We received your message and will contact you soon.");
        form.reset();
        paintCount();
        return;
      }
      const now = Date.now();
      try {
        const last = Number(localStorage.getItem(COOL_KEY) || 0);
        if (last && now - last < 30000) {
          showErr("Please wait a moment before sending another message.");
          return;
        }
      } catch (_) {}

      const name = (document.getElementById("name")?.value || "").trim();
      const email = (document.getElementById("email")?.value || "").trim();
      const message = (msg?.value || "").trim();
      if (name.length < 2 || name.length > 100) { showErr("Please enter a name between 2 and 100 characters."); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showErr("Please enter a valid email."); return; }
      if (message.length > 2000) { showErr("Message must be 2000 characters or fewer."); return; }

      const courseId = sel?.value || "";
      const courseTitle = courseId ? (sel.options[sel.selectedIndex]?.text || "") : "Not sure yet";

      if (btn) { btn.disabled = true; btn.textContent = "Sending…"; }
      await addDoc(collection(db, "inquiries"), {
        name, email, courseId, courseTitle, message, status: "new", createdAt: serverTimestamp(), source: "landing"
      });
      try { localStorage.setItem(COOL_KEY, String(Date.now())); } catch (_) {}
      form.reset();
      paintCount();
      showOk("Thank you! We received your message and will contact you soon.");
    } catch (er) {
      console.error(er && (er.code || er.message) || er);
      showErr("We couldn't send your message. Please try again.");
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = "Register interest"; }
    }
  });
} catch (e) {
  console.error(e);
}
