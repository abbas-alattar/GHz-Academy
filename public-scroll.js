(function () {
  try {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  } catch (_) {}
  function hasExplicitTarget() {
    const hash = String(location.hash || "").replace(/^#/, "");
    const course = new URLSearchParams(location.search).get("course");
    return Boolean(course) || (hash && hash !== "home");
  }
  function pinTop() {
    if (hasExplicitTarget()) return;
    window.scrollTo(0, 0);
  }
  pinTop();
  document.addEventListener("DOMContentLoaded", pinTop);
  window.addEventListener("load", pinTop);
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[href]");
    if (!a || a.target === "_blank") return;
    const href = a.getAttribute("href") || "";
    const url = (() => {
      try { return new URL(href, location.href); } catch { return null; }
    })();
    if (!url || url.origin !== location.origin) return;
    if (url.pathname.replace(/\/$/, "") !== location.pathname.replace(/\/$/, "")) return;
    const id = String(url.hash || "").replace(/^#/, "");
    if (!id) return;
    if (id === "home") {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    const el = document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  });
})();
