import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { doc, getDoc, setDoc, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { getDisplayName, getFirstName, getInitials, writeNameCache, readNameCache, profileFromAuth } from "./displayName.js";
import { auth, db, roleHome } from "./firebase-config.js?v=auth10";
import { setAuthReady } from "./RouteLoader.js";
import { healStudentIdIfMissing } from "./studentId.js";
import { ensureLocalPersistence, leaveToLogin, bindLogoutButton, watchCrossTab, broadcastLogin, performLogout } from "./auth-sync.js?v=auth9";
import { bootPending, bootOk, bootFail } from "./bootTrace.js";
import { ghzPerf, timedQuery } from "./ghz-perf.js";

let authReady = false;
let resolvedOnce = false;

function paintWhoChip({ name, role, studentId }) {
  const who = document.querySelector(".who");
  if (!who) return;
  const nameEl = document.getElementById("userName");
  const roleEl = document.getElementById("userRole");
  let av = who.querySelector(".who-av");
  if (!av) {
    av = document.createElement("div");
    av.className = "who-av";
    av.setAttribute("aria-hidden", "true");
    who.prepend(av);
  }
  av.textContent = getInitials({ name, fullName: name, displayName: name });
  let wrap = who.querySelector(".who-txt");
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.className = "who-txt";
    who.appendChild(wrap);
  }
  if (nameEl && nameEl.parentElement !== wrap) wrap.appendChild(nameEl);
  let sub = who.querySelector(".who-sub");
  if (!sub) {
    sub = document.createElement("div");
    sub.className = "who-sub";
    wrap.appendChild(sub);
  }
  const roleLabel = role === "trainer" ? "Trainer" : role === "admin" ? "Admin" : "Student";
  if (roleEl) {
    roleEl.textContent = roleLabel;
    if (roleEl.parentElement !== sub) sub.prepend(roleEl);
  }
  let sid = who.querySelector(".who-sid");
  let copy = who.querySelector(".who-copy");
  let dot = who.querySelector(".who-dot");
  if (role === "student" && studentId) {
    if (!dot) {
      dot = document.createElement("span");
      dot.className = "who-dot";
      dot.textContent = "·";
      sub.appendChild(dot);
    }
    if (!sid) {
      sid = document.createElement("span");
      sid.className = "who-sid";
      sub.appendChild(sid);
    }
    sid.textContent = "ID " + studentId;
    if (!copy) {
      copy = document.createElement("button");
      copy.type = "button";
      copy.className = "who-copy";
      copy.setAttribute("aria-label", "Copy student ID");
      copy.textContent = "⧉";
      copy.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const id = copy.dataset.id || "";
        if (!id) return;
        navigator.clipboard.writeText(id).then(() => {
          copy.textContent = "Copied";
          setTimeout(() => { copy.textContent = "⧉"; }, 1500);
        }).catch(() => {});
      });
      sub.appendChild(copy);
    }
    copy.dataset.id = studentId;
    copy.hidden = false;
    if (dot) dot.hidden = false;
    sid.hidden = false;
  } else {
    if (sid) sid.hidden = true;
    if (copy) copy.hidden = true;
    if (dot) dot.hidden = true;
  }
  who.classList.toggle("role-student", role === "student");
  who.classList.toggle("role-trainer", role === "trainer");
  who.classList.toggle("role-admin", role === "admin");
  who.setAttribute("role", "link");
  who.tabIndex = 0;
  if (!who.dataset.chipBound) {
    who.dataset.chipBound = "1";
    const go = () => {
      const r = who.classList.contains("role-admin") ? "./admin.html" : who.classList.contains("role-trainer") ? "./trainer.html" : "./student.html";
      const hash = who.classList.contains("role-student") ? "#profilev2" : "#profile";
      location.href = r + hash;
    };
    who.addEventListener("click", go);
    who.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); go(); } });
  }
}

export function applyDisplayName(shown, extra) {
  const profile = typeof shown === "object" && shown ? shown : { name: shown, ...(extra || {}) };
  const name = getDisplayName(profile);
  const first = getFirstName(profile);
  const nameEl = document.getElementById("userName");
  const greet = document.getElementById("welcomeName");
  if (nameEl) nameEl.textContent = name || "Account";
  if (greet) greet.textContent = first;
  writeNameCache({ ...readNameCache(), ...profile, name });
  const cached = readNameCache();
  paintWhoChip({ name: name || "Account", role: profile.role || cached.role || "student", studentId: profile.studentId || cached.studentId || "" });
  document.querySelectorAll(".pv2-name, .stu-who-name, [data-shell-name]").forEach((el) => {
    if (el.id === "userRole") return;
    if (el.classList.contains("pv2-name") || el.hasAttribute("data-shell-name") || el.classList.contains("stu-who-name")) {
      el.textContent = name;
    }
  });
  try { window.dispatchEvent(new CustomEvent("ghz-profile", { detail: profile })); } catch (_) {}
}

export function protect(requiredRole) {
  return new Promise((resolve) => {
    let lastUid = "";
    const tAuth0 = performance.now();
    bootPending("auth restored");
    const showSlow = () => {
      const host = document.getElementById("studentDashRoot") || document.getElementById("tr2CoursesRoot") || document.querySelector(".content") || document.body;
      if (!host || host.querySelector(".ghz-auth-slow")) return;
      const card = document.createElement("div");
      card.className = "ghz-auth-slow banner";
      card.style.cssText = "margin:16px;padding:16px;background:#FFF7ED;color:#9A3412;border-radius:14px;max-width:480px";
      card.innerHTML = "<p><strong>Connection problem</strong></p><p>Sign-in did not finish. Check your connection, then try again.</p><p><button type='button' class='btn' id='ghzAuthRetry'>Retry</button></p>";
      host.prepend(card);
      document.getElementById("ghzAuthRetry")?.addEventListener("click", () => { console.warn("[ghz-reload]", "auth retry click"); location.reload(); });
    };
    const authTimer = setTimeout(() => {
      if (resolvedOnce) return;
      bootFail("auth restored", { code: "timeout", message: "auth not ready in 6s" });
      const n1 = document.getElementById("userName");
      if (n1 && (n1.textContent === "…" || n1.textContent === "...")) n1.textContent = "Account";
      showSlow();
    }, 6000);
    onAuthStateChanged(auth, async (user) => {
      if (!user) {
        bootFail("auth restored", { code: "no-user", message: "signed out" });
        if (resolvedOnce || lastUid) leaveToLogin();
        else location.replace("./login.html");
        return;
      }
      ghzPerf("auth ready", { ms: Math.round(performance.now() - tAuth0) });
      bootOk("auth restored", "uid " + String(user.uid).slice(0, 8));
      if (resolvedOnce) {
        if (lastUid) lastUid = user.uid;
        return;
      }
      lastUid = user.uid;
      const nameEl = document.getElementById("userName");
      const greet = document.getElementById("welcomeName");
      const cachedShell = readNameCache();
      const paintProf = profileFromAuth(user, cachedShell);
      const firstPaint = getDisplayName(paintProf) || "Account";
      if (nameEl) nameEl.textContent = firstPaint;
      if (greet) greet.textContent = getFirstName(paintProf);
      paintWhoChip({ name: firstPaint, role: cachedShell.role || requiredRole, studentId: cachedShell.studentId || "" });
      let profile = {
        ...paintProf,
        name: firstPaint,
        role: cachedShell.role || requiredRole,
        email: user.email,
        active: true,
        studentId: cachedShell.studentId || ""
      };
      authReady = true;
      resolvedOnce = true;
      setAuthReady(true);
      applyDisplayName(profile);
      paintWhoChip({ name: firstPaint, role: profile.role, studentId: profile.studentId || "" });
      clearTimeout(authTimer);
      resolve({ user, profile });
      bootPending("users/uid read");
      const tProf = performance.now();
      (async () => {
      try {
        const snap = await Promise.race([
          timedQuery("users/" + user.uid, () => getDoc(doc(db, "users", user.uid))),
          new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error("Profile timed out"), { code: "timeout" })), 8000))
        ]);
        ghzPerf("user profile load", { ms: Math.round(performance.now() - tProf) });
        if (snap.exists()) {
          profile = snap.data();
          bootOk("users/uid read", "ok");
        } else {
          bootOk("users/uid read", "missing doc");
        }
      } catch (e) {
        bootFail("users/uid read", e);
        console.error("profile", e);
        ghzPerf("user profile load", { ms: Math.round(performance.now() - tProf), ok: false });
        profile = { email: user.email, role: requiredRole, active: true, displayName: user.displayName || "" };
      }
      if (profile.active === false) {
        await signOut(auth);
        location.replace("./login.html?disabled=1");
        return;
      }
      if (profile.role && profile.role !== requiredRole) {
        location.replace(roleHome[profile.role] || "./student.html");
        return;
      }
      const live = { ...profile, uid: user.uid, email: profile.email || user.email, displayName: profile.displayName || user.displayName };
      const shown = getDisplayName(live);
      const role = profile.role || requiredRole;
      writeNameCache({ ...live, role, name: shown });
      applyDisplayName(live);
      paintWhoChip({ name: shown || "Account", role, studentId: profile.studentId || "" });
      try {
        if (window.__ghzUserUnsub) window.__ghzUserUnsub();
        window.__ghzUserUnsub = onSnapshot(doc(db, "users", user.uid), (snap) => {
          if (!snap.exists()) return;
          const next = { uid: user.uid, email: user.email, displayName: user.displayName, ...snap.data() };
          if (next.active === false) return;
          writeNameCache(next);
          applyDisplayName(next);
          try {
            import("./student-dash-data.js?v=stu11").then((m) => m.applyLiveProfile?.(next)).catch(() => {});
          } catch (_) {}
        });
      } catch (_) {}
      const banner = document.getElementById("verifyBanner");
      if (banner && requiredRole === "student" && !user.emailVerified) banner.hidden = false;
      document.querySelectorAll("[data-needs-verified]").forEach((el) => {
        if (!user.emailVerified) {
          el.setAttribute("aria-disabled", "true");
          el.classList.add("disabled");
          el.addEventListener("click", (ev) => ev.preventDefault());
        }
      });
      healStudentIdIfMissing(user.uid, profile).then(() => {}).catch(() => {});
      broadcastLogin(user.uid);
      setDoc(doc(db, "users", user.uid), {
        emailVerified: !!user.emailVerified,
        lastLoginAt: serverTimestamp(),
        lastActiveAt: serverTimestamp()
      }, { merge: true }).catch((err) => console.error("lastLoginAt", err?.code || err?.message || err));
      try {
        const role = profile.role || requiredRole;
        import("./portal-notify.js").then((m) => m.bootNotify({ role, uid: user.uid })).catch(() => {});
      } catch (_) {}
      })();
    });
    try {
      watchCrossTab({
        onLogout: () => leaveToLogin(),
        onLogin: (uid) => {
          if (!uid || !lastUid) return;
          if (uid === lastUid) return;
          console.warn("[ghz-reload]", "cross-tab user changed", lastUid, "->", uid);
          location.reload();
        }
      });
    } catch (_) {}
    try { ensureLocalPersistence(); } catch (_) {}
  });
}

const out = typeof document !== "undefined" ? document.getElementById("logoutBtn") : null;
if (out) bindLogoutButton(out);

export { roleHome };
