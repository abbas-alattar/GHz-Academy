const WAVE = '<svg class="wl-wave" viewBox="0 0 56 24" fill="none" aria-hidden="true"><path class="wl-path" d="M2 12c4-9 8-9 12 0s8 9 12 0 8-9 12 0 8 9 12 0" stroke="#2EC8FF" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

export function waveLoader(size = "page") {
  const cap = size === "page" ? `<p class="wl-cap">Loading…</p>` : "";
  return `<div class="wl wl-${size}" role="status" aria-label="Loading">${WAVE}${cap}</div>`;
}

export function perf(name, started) {
  const ms = Math.round(performance.now() - started);
  console.log("[perf] " + name + " " + ms + "ms");
  return ms;
}

export function swapLoadingText(root) {
  if (root && root.closest && root.closest(".ghz-content-shell")) return;
  const html = waveLoader("page");
  const walk = (el) => {
    if (!el || el.nodeType !== 1) return;
    if (el.classList && (el.classList.contains("wl") || el.classList.contains("ghz-load"))) return;
    const t = (el.textContent || "").trim();
    const kids = el.childNodes.length === 1 && el.childNodes[0].nodeType === 3;
    if (kids && /^(Loading|Loading…|Loading\.\.\.|Please wait|Saving\.\.\.|Submitting\.\.\.)$/i.test(t)) {
      el.innerHTML = html;
      return;
    }
    for (let i = 0; i < el.children.length; i++) walk(el.children[i]);
  };
  walk(root || document.body);
}

if (typeof window !== "undefined") {
  window.waveLoader = waveLoader;
  window.ghzPerf = perf;
  window.addEventListener("DOMContentLoaded", () => {
    if (!document.querySelector(".ghz-content-shell")) swapLoadingText(document.body);
  });
}
