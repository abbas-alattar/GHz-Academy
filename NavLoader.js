const WAVE = `<svg class="ghz-wsvg" viewBox="0 0 40 22" fill="none" aria-hidden="true"><defs><linearGradient id="ghzWaveGrad" x1="0" y1="0" x2="40" y2="0"><stop stop-color="#2563EB"/><stop offset="1" stop-color="#06B6D4"/></linearGradient></defs><path d="M2 11c3-8 7-8 10 0s7 8 10 0 7-8 10 0 4 6 6 0"/></svg>`;

let bar, overlay, shownAt = 0, wait200, wait600;

function ensure() {
  const content = document.querySelector(".content");
  if (!content) return null;
  const shell = content.closest(".ghz-content-shell") || content.parentElement;
  if (!shell) return null;
  if (getComputedStyle(shell).position === "static") shell.style.position = "relative";
  if (!bar) {
    bar = document.createElement("div");
    bar.className = "ghz-navbar";
    shell.prepend(bar);
  }
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.className = "ghz-wave-load";
    overlay.innerHTML = `<div class="ghz-wglow"><span class="ghz-ring"></span><span class="ghz-ring r2"></span>${WAVE}</div>`;
    shell.appendChild(overlay);
  }
  return shell;
}

export function beginNav() {
  try {
    ensure();
    clearTimeout(wait200); clearTimeout(wait600);
    wait200 = setTimeout(() => { if (bar) bar.classList.add("on"); }, 200);
    wait600 = setTimeout(() => {
      /* in-app hash nav: never show the white glow overlay */
    }, 600);
  } catch (_) {}
}

export function endNav() {
  try {
    clearTimeout(wait200); clearTimeout(wait600);
    const hide = () => {
      if (bar) bar.classList.remove("on");
      if (overlay) overlay.classList.remove("on");
    };
    const left = overlay && overlay.classList.contains("on") ? Math.max(0, 300 - (Date.now() - shownAt)) : 0;
    setTimeout(hide, left);
  } catch (_) {}
}

export function swapLoadingText() {
  document.querySelectorAll(".content").forEach((el) => {
    if (/^Loading/.test((el.textContent || "").trim()) && el.children.length < 4) {
      el.querySelectorAll("p,div").forEach((n) => {
        if (/Loading/.test(n.textContent || "") && n.children.length === 0) n.textContent = "";
      });
    }
  });
}
