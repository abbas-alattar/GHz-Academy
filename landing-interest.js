import { db } from "./firebase-config.js?v=auth10";
import { addDoc, collection, getDocs, query, where, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

const PUBLIC = ["Open", "Coming soon", "Closed"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_FILL_MS = 2000;          // from first touch of the form to submit; bots are faster
const COOLDOWN_MS = 60 * 1000;     // one message per browser per minute
const LAST_KEY = "ghz-interest-last";

try {
  const form = document.getElementById("interestForm");
  const sel = document.getElementById("course");
  const msg = document.getElementById("msg");
  const nameEl = document.getElementById("name");
  const emailEl = document.getElementById("email");
  const err = document.getElementById("err");
  const ok = document.getElementById("ok");
  const btn = form?.querySelector('button[type="submit"]');
  if (!form) throw new Error("form missing");

  const fieldErr = (el) => {
    if (!el) return null;
    let n = el.nextElementSibling;
    if (n && n.classList && n.classList.contains("field-err")) return n;
    n = document.createElement("div");
    n.className = "field-err";
    n.style.cssText = "display:none;margin:4px 0 0;font-size:12px;line-height:1.3;color:#b91c1c;";
    el.insertAdjacentElement("afterend", n);
    return n;
  };
  const nameHint = fieldErr(nameEl);
  const emailHint = fieldErr(emailEl);

  const showField = (hint, text) => {
    if (!hint) return;
    if (text) { hint.style.display = "block"; hint.textContent = text; }
    else { hint.style.display = "none"; hint.textContent = ""; }
  };
  const showErr = (t) => { if (err) { err.style.display = "block"; err.textContent = t; } if (ok) ok.style.display = "none"; };
  const showOk = (t) => { if (ok) { ok.style.display = "block"; ok.textContent = t; } if (err) err.style.display = "none"; };
  const clearBanner = () => { if (ok) ok.style.display = "none"; if (err) err.style.display = "none"; };

  if (sel) {
    sel.innerHTML = `<option value="">Not sure yet</option>`;
    sel.required = false;
    try {
      const snap = await getDocs(query(collection(db, "courses"), where("status", "in", PUBLIC)));
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((c) => PUBLIC.includes(c.status));
      list.sort((a, b) => String(a.title || "").localeCompare(String(b.title || "")));
      sel.innerHTML = `<option value="">Not sure yet</option>` + list.map((c) => `<option value="${String(c.id).replace(/"/g, "")}">${String(c.title || "").replace(/</g, "")}</option>`).join("");
    } catch (e) {
      console.error(e && (e.code || e.message) || e);
    }
  }

  if (msg) msg.maxLength = 2000;
  let firstTouch = 0;
  const touch = () => { if (!firstTouch) firstTouch = Date.now(); };
  form.addEventListener("focusin", touch);
  form.addEventListener("input", touch);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearBanner();
    showField(nameHint, "");
    showField(emailHint, "");
    try {
      const honey = document.getElementById("companyWebsite");
      if (honey && honey.value) {
        form.reset();
        showOk("Thank you, we will contact you soon.");
        return;
      }
      if (!firstTouch || Date.now() - firstTouch < MIN_FILL_MS) {
        touch();
        showErr("Please check your details, then press the button again.");
        return;
      }
      let last = 0;
      try { last = Number(localStorage.getItem(LAST_KEY) || 0); } catch (_) {}
      if (last && Date.now() - last < COOLDOWN_MS) {
        showErr("You just sent a message. Please wait a minute before sending another.");
        return;
      }

      const name = String(nameEl?.value || "").trim();
      const email = String(emailEl?.value || "").trim();
      const message = String(msg?.value || "").trim().slice(0, 2000);
      let invalid = false;
      if (name.length < 2) {
        showField(nameHint, "Full name required (min 2 characters)");
        invalid = true;
      } else if (name.length > 100) {
        showField(nameHint, "Please keep your name under 100 characters");
        invalid = true;
      }
      if (!email) {
        showField(emailHint, "Email required and valid");
        invalid = true;
      } else if (!EMAIL_RE.test(email) || email.length > 200) {
        showField(emailHint, "Email required and valid");
        invalid = true;
      }
      if (invalid) return;

      const rawId = String(sel?.value || "").trim();
      const rawTitle = rawId ? String(sel.options[sel.selectedIndex]?.text || "").trim() : "";
      const unsure = !rawId || /^not sure yet$/i.test(rawTitle);
      const courseId = unsure ? "" : rawId;
      const courseTitle = unsure ? "" : rawTitle;
      const source = "landing";

      if (btn) { btn.disabled = true; btn.textContent = "Sending…"; }
      await addDoc(collection(db, "inquiries"), {
        name,
        email,
        courseId,
        courseTitle,
        message,
        status: "new",
        createdAt: serverTimestamp(),
        source
      });
      try { localStorage.setItem(LAST_KEY, String(Date.now())); } catch (_) {}
      form.reset();
      showField(nameHint, "");
      showField(emailHint, "");
      showOk("Thank you, we will contact you soon.");
    } catch (er) {
      console.error(er && er.code, er && er.message, er);
      showErr("We couldn't send your message. Please try again.");
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = "Register interest"; }
    }
  });
} catch (e) {
  console.error(e && e.code, e && e.message, e);
}
