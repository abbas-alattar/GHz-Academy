/** Shared GHz Academy logo: wave + GHz (white) + Academy (cyan), same size. */
export const LOGO_SVG = `<svg viewBox="0 0 40 22" fill="none" aria-hidden="true"><path d="M2 11c3-8 7-8 10 0s7 8 10 0 7-8 10 0 4 6 6 0" stroke="#2EC8FF" stroke-width="2.6" stroke-linecap="round"/></svg>`;
export function ghzLogoHtml(href = "./index.html") {
  return `<a class="brand ghz-logo" href="${href}" aria-label="GHz Academy">${LOGO_SVG}<span class="ghz">GHz</span> <span class="acad">Academy</span></a>`;
}
export function mountGhzLogos() {
  document.querySelectorAll("a.brand").forEach((el) => {
    if (el.querySelector(".ghz") && el.querySelector(".acad") && el.querySelector("svg")) return;
    const href = el.getAttribute("href") || "./index.html";
    el.outerHTML = ghzLogoHtml(href);
  });
}
if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mountGhzLogos);
  else mountGhzLogos();
}
