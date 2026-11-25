const SHELL = "ghz-shell";
const PROF = "ghz-profile-v1";

function trim(s) {
  return String(s == null ? "" : s).trim();
}

function looksLikeEmail(s) {
  return /@/.test(s);
}

function fromEmail(email) {
  const local = trim(email).split("@")[0];
  if (!local) return "";
  return local.charAt(0).toUpperCase() + local.slice(1);
}

export function getDisplayName(profile) {
  const p = profile && typeof profile === "object" ? profile : {};
  const picks = [p.fullName, p.name, p.displayName];
  for (const x of picks) {
    const n = trim(x);
    if (n && !looksLikeEmail(n)) return n;
  }
  const em = trim(p.email);
  return fromEmail(em) || "";
}

export function getFirstName(profile) {
  const n = getDisplayName(profile);
  if (!n) return "";
  return n.split(/\s+/).filter(Boolean)[0] || "";
}

export function getInitials(profile) {
  const n = getDisplayName(profile);
  const parts = n.split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return ((parts[0][0] || "") + (parts[1] ? parts[1][0] : "")).toUpperCase();
}

export function nameWriteFields(display) {
  const n = trim(display);
  return { name: n, fullName: n, displayName: n, nameUpdatedAt: Date.now() };
}

export function readNameCache() {
  try {
    const s = JSON.parse(localStorage.getItem(SHELL) || "{}") || {};
    const p = JSON.parse(localStorage.getItem(PROF) || "{}") || {};
    return { ...p, ...s };
  } catch {
    return {};
  }
}

export function writeNameCache(profile) {
  const p = profile && typeof profile === "object" ? profile : {};
  const name = getDisplayName(p);
  const studentId = trim(p.studentId);
  const role = trim(p.role) || "student";
  const updatedAt = p.updatedAt || p.nameUpdatedAt || Date.now();
  try {
    const cur = JSON.parse(localStorage.getItem(SHELL) || "{}") || {};
    localStorage.setItem(SHELL, JSON.stringify({
      ...cur,
      name,
      role,
      studentId,
      updatedAt
    }));
  } catch (_) {}
  try {
    localStorage.setItem(PROF, JSON.stringify({
      uid: p.uid || p.id || "",
      fullName: trim(p.fullName),
      name: trim(p.name),
      displayName: trim(p.displayName),
      email: trim(p.email),
      studentId,
      role,
      updatedAt
    }));
  } catch (_) {}
  try { window.__ghzLiveName = name; } catch (_) {}
}

export function clearNameCache() {
  try { localStorage.removeItem(SHELL); } catch (_) {}
  try { localStorage.removeItem(PROF); } catch (_) {}
  try { window.__ghzLiveName = ""; } catch (_) {}
}

export function profileFromAuth(user, extra) {
  const u = user || {};
  return {
    ...(extra || {}),
    uid: u.uid,
    email: extra?.email || u.email || "",
    displayName: extra?.displayName || u.displayName || ""
  };
}
