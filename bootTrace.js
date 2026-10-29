const steps = [];
const t0 = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
function nowMs() {
  return Math.round(((typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now()) - t0);
}
function codeOf(e) {
  if (!e) return "";
  return String(e.code || e.message || e);
}
export function bootLog(label, status, detail) {
  const row = { t: nowMs(), label, status: status || "ok", detail: detail || "" };
  const i = steps.findIndex((s) => s.label === label);
  if (i >= 0) steps[i] = row;
  else steps.push(row);
  try {
    console.log("[ghz-boot +" + row.t + "ms]", label, status || "ok", detail || "");
    window.__ghzBoot = steps.slice();
  } catch {}
  try { window.dispatchEvent(new CustomEvent("ghz-boot")); } catch {}
  return row;
}
export function bootPending(label) { return bootLog(label, "pending", ""); }
export function bootOk(label, detail) { return bootLog(label, "ok", detail || ""); }
export function bootFail(label, e) { return bootLog(label, "fail", codeOf(e)); }
export function getBootSteps() { return steps.slice(); }
export function isDebugBoot() {
  try { return /(?:^|[?&])debug=1(?:&|$)/.test(location.search) || location.hash.indexOf("debug=1") >= 0; } catch { return false; }
}
export function paintBootCard(host) {
  if (!host) return;
  const rows = getBootSteps();
  const html = `<div class="tr2-timeout"><h3>Load status</h3><ul class="tr2-boot">${rows.map((s) => {
    const cls = s.status === "fail" ? "fail" : s.status === "pending" ? "pend" : "ok";
    return `<li class="${cls}"><b>${s.label}</b> · ${s.status}${s.detail ? " · " + s.detail : ""} <span>+${s.t}ms</span></li>`;
  }).join("")}</ul><div class="tr2-timeout-acts"><button type="button" class="tr2-btn pri" id="ghzBootRetry">Try again</button><a href="#" id="ghzBootOut">Log out</a></div></div>`;
  host.innerHTML = html;
  host.querySelector("#ghzBootRetry")?.addEventListener("click", () => location.reload());
  host.querySelector("#ghzBootOut")?.addEventListener("click", (ev) => { ev.preventDefault(); document.getElementById("logoutBtn")?.click(); });
}
bootPending("auth restored");
bootLog("script", "ok", "bootTrace loaded");
