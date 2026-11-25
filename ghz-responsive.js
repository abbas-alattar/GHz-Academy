(function () {
  function ensure() {
    if (document.querySelector(".ghz-navbtn")) return;
    if (!document.querySelector(".portal") && !document.querySelector(".top")) return;
    const top = document.querySelector(".top");
    if (!top) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ghz-navbtn phone-only";
    btn.setAttribute("aria-label", "Open menu");
    btn.innerHTML = "<span></span>";
    btn.addEventListener("click", () => document.body.classList.toggle("ghz-nav-open"));
    top.insertBefore(btn, top.firstChild);
    const scrim = document.createElement("div");
    scrim.className = "ghz-scrim";
    const close = () => document.body.classList.remove("ghz-nav-open", "stu-drawer");
    scrim.addEventListener("click", close);
    document.body.appendChild(scrim);
    document.querySelector(".portal > .side")?.addEventListener("click", (ev) => {
      if (ev.target.closest("nav a, a.brand")) close();
    });
    window.addEventListener("popstate", close);
    window.addEventListener("hashchange", close);
    window.addEventListener("keydown", (e) => { if (e.key === "Escape" || e.key === "Backspace" && !e.target.closest("input,textarea")) close(); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ensure);
  else ensure();
})();
