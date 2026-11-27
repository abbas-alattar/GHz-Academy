/** Turns Firebase / network errors into short messages students and trainers can act on.
 *  The original error is still logged to the browser console for debugging. */
const MESSAGES = {
  "permission-denied": "You don't have access to this right now. Try logging out and back in. If it keeps happening, contact the academy.",
  "unauthenticated": "Your session has ended. Please log in again.",
  "unavailable": "We can't reach the server. Check your internet connection and try again.",
  "deadline-exceeded": "This is taking too long. Check your internet connection and try again.",
  "not-found": "We couldn't find this item. It may have been removed.",
  "resource-exhausted": "Too many requests right now. Please wait a minute and try again.",
  "failed-precondition": "This section isn't ready yet. Please refresh the page in a moment.",
  "cancelled": "The request was cancelled. Please try again.",
  "already-exists": "This already exists.",
  "invalid-argument": "Some information looks invalid. Please check it and try again."
};
const GENERIC = "Something went wrong. Please refresh the page and try again.";

export function friendlyError(err) {
  try { if (err) console.warn("[ghz]", err?.code || "", err?.message || err); } catch (_) {}
  let code = String(err?.code || "").replace(/^firestore\//, "");
  const msg = String(err?.message || (typeof err === "string" ? err : "") || "");
  if (!code) {
    if (/insufficient permissions|permission/i.test(msg)) code = "permission-denied";
    else if (/offline|network|failed to fetch|unavailable/i.test(msg)) code = "unavailable";
    else if (/not signed in|unauthenticated/i.test(msg)) code = "unauthenticated";
  }
  return MESSAGES[code] || GENERIC;
}

try { window.ghzFriendlyError = friendlyError; } catch (_) {}
