import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { auth, db, roleHome } from "./firebase-config.js?v=auth8";
import { ensureLocalPersistence, broadcastLogout, watchCrossTab, performLogout } from "./auth-sync.js?v=auth8";

const PORTALS = {
  student: roleHome.student || "./student.html",
  trainer: roleHome.trainer || "./trainer.html",
  admin: roleHome.admin || "./admin.html"
};

function initials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
}

function roleMeta(role) {
  const r = String(role || "").toLowerCase();
  if (r === "admin") return { key: "admin", label: "Admin", href: PORTALS.admin };
  if (r === "trainer") return { key: "trainer", label: "Trainer", href: PORTALS.trainer };
  return { key: "student", label: "Student", href: PORTALS.student };
}

function esc(s) {
  return String(s || "").replace(/[&<>"']/g, (ch) => {
    if (ch === "&") return "&" + "amp;";
    if (ch === "<") return "&" + "lt;";
    if (ch === ">") return "&" + "gt;";
    if (ch === '"') return "&" + "quot;";
    return "&" + "#39;";
  });
}

function guestHtml() {
  const slot = document.getElementById("landAuthSlot");
  const label = (slot && slot.getAttribute("data-login-label")) || "Login";
  return `<a class="ghost-link land-auth-login" href="./login.html" target="_blank" rel="noopener noreferrer">${esc(label)}</a>
      <a class="btn btn-blue land-auth-reg" href="./login.html?tab=signup" target="_blank" rel="noopener noreferrer">Register</a>`;
}

function chipHtml({ name, role, showPill }) {
  const meta = roleMeta(role);
  const pill = showPill
    ? `<span class="land-chip-pill land-pill-${meta.key}">${meta.label}</span>`
    : "";
  return `<div class="land-user" id="landUser">
    <a class="land-chip" id="landChip" href="${meta.href}" target="_blank" rel="noopener noreferrer" title="Open my portal">
      <span class="land-av" aria-hidden="true">${esc(initials(name))}</span>
      <span class="land-chip-txt">
        <strong class="land-chip-name">${esc(name)}</strong>
        ${pill}
      </span>
    </a>
    <button type="button" class="land-out" id="landSignOut" title="Sign out" aria-label="Sign out">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M10 7V5a2 2 0 0 1 2-2h7v18h-7a2 2 0 0 1-2-2v-2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M4 12h11M12 8l4 4-4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
  </div>`;
}

function paint(slot, html) {
  if (!slot) return;
  slot.innerHTML = html;
}

function setMobileGuest(show) {
  const m = document.querySelector(".land-m-auth");
  if (m) m.hidden = !show;
}

function setFaqRegCta(loggedIn) {
  const cta = document.querySelector(".reg-actions a.reg-cta");
  if (!cta) return;
  if (loggedIn) {
    cta.textContent = "Browse courses";
    cta.setAttribute("href", "./courses.html");
  } else {
    cta.textContent = "Create an account";
    cta.setAttribute("href", "./login.html?tab=signup");
  }
}

function bindOut(slot) {
  const out = slot.querySelector("#landSignOut");
  if (!out) return;
  out.addEventListener("click", async () => {
    out.disabled = true;
    broadcastLogout();
    try { await signOut(auth); } catch { out.disabled = false; }
  });
}

function boot() {
  const slot = document.getElementById("landAuthSlot");
  if (!slot) return;
  ensureLocalPersistence();
  paint(slot, `<div class="land-auth-ph" aria-hidden="true"></div>`);
  const paintGuest = () => { paint(slot, guestHtml()); setMobileGuest(true); };
  watchCrossTab({ onLogout: paintGuest });
  onAuthStateChanged(auth, async (user) => {
    if (!user || !user.emailVerified) {
      paint(slot, guestHtml());
      setMobileGuest(true);
      setFaqRegCta(false);
      return;
    }
    let name = user.email || "Account";
    let role = "";
    let showPill = false;
    try {
      const snap = await getDoc(doc(db, "users", user.uid));
      const d = snap.exists() ? snap.data() : {};
      name = String(d.name || d.fullName || "").trim() || user.email || "Account";
      role = String(d.role || "").toLowerCase();
      showPill = !!role;
    } catch {
      name = user.email || "Account";
      showPill = false;
    }
    paint(slot, chipHtml({ name, role, showPill }));
    setMobileGuest(false);
    setFaqRegCta(true);
    bindOut(slot);
  });
}

boot();
