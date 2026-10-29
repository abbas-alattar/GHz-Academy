import { beginLoad, endLoad, bindOverlay, cacheClear, pageReady } from "./RouteLoader.js";
import { swapLoadingText, perf } from "./WaveLoader.js";

const WAVE = '<svg class="ghz-wave" viewBox="0 0 56 24" fill="none" aria-hidden="true"><path class="ghz-wpath" d="M2 12c4-9 8-9 12 0s8 9 12 0 8-9 12 0 8 9 12 0" stroke="#2EC8FF" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function overlayHtml() {
  return `<div class="ghz-load" hidden><div class="ghz-mark">${WAVE}</div><p class="ghz-loadcap">Loading…</p></div>`;
}

function highlight(nav, a) {
  if (!nav || !a) return;
  const links = nav.getElementsByTagName("a");
  for (let i = 0; i < links.length; i++) links[i].classList.toggle("on", links[i] === a);
}

function wrapContent(content) {
  if (!content || content.dataset.ghzWrap === "1") return content;
  const shell = document.createElement("div");
  shell.className = "ghz-content-shell";
  const page = document.createElement("div");
  page.className = "ghz-page ghz-page-in on";
  const parent = content.parentNode;
  parent.insertBefore(shell, content);
  page.appendChild(content);
  shell.insertAdjacentHTML("beforeend", overlayHtml());
  shell.appendChild(page);
  content.dataset.ghzWrap = "1";
  bindOverlay(shell.firstElementChild);
  return content;
}

function playIn(page) {
  page.classList.remove("ghz-page-out");
  page.classList.add("ghz-page-in");
  requestAnimationFrame(() => page.classList.add("on"));
}

export function bootPageMotion(root) {
  try {
    if (!root) return;
    const side = root.getElementsByClassName("side")[0];
    const content = root.getElementsByClassName("content")[0];
    const nav = side && side.getElementsByTagName("nav")[0];
    if (!content || !nav) return;
    wrapContent(content);
    const page = content.parentNode;
    beginLoad();
    const t0 = performance.now();
    const prefetch = (href) => {
      if (!href) return;
      try {
        const u = new URL(href, location.href);
        if (u.pathname.replace(/\/+$/, "") === location.pathname.replace(/\/+$/, "")) return;
        const l = document.createElement("link");
        l.rel = "prefetch";
        l.href = href;
        document.head.appendChild(l);
      } catch (_) {}
    };
    nav.addEventListener("pointerenter", (e) => {
      const a = e.target && e.target.closest ? e.target.closest("a") : null;
      if (a) prefetch(a.getAttribute("href"));
    }, true);
    nav.addEventListener("click", (e) => {
      const a = e.target && e.target.closest ? e.target.closest("a") : null;
      if (!a || a.getAttribute("target") === "_blank") return;
      highlight(nav, a);
      beginLoad();
      page.classList.add("ghz-page-out");
      setTimeout(() => {
        page.classList.remove("ghz-page-out");
        playIn(page);
      }, 120);
    });
    window.addEventListener("hashchange", () => {
      beginLoad();
      playIn(page);
      setTimeout(() => pageReady(), 600);
    });
    window.addEventListener("pageshow", () => endLoad(true));
    window.addEventListener("popstate", () => {
      beginLoad();
      setTimeout(() => pageReady(), 600);
    });
    root.addEventListener("submit", () => cacheClear(), true);
    const out = root.getElementsByClassName("out")[0];
    if (out) out.addEventListener("click", () => cacheClear());
    setTimeout(() => { pageReady(); perf(location.pathname.split("/").pop() || "page", t0); }, 600);
  } catch (_) {}
}

export { pageReady, usePageReady } from "./RouteLoader.js";
