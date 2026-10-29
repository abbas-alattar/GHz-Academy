import { createElement as e, useEffect, useState } from "https://esm.sh/react@18.3.1";
import { createRoot } from "https://esm.sh/react-dom@18.3.1/client";

function readName() {
  const el = document.getElementById("userName");
  const live = String(el?.textContent || "").replace(/\u2026/g, "").replace(/\.\.\./g, "").trim();
  if (live && live !== "…" && live !== "—" && live.toLowerCase() !== "student") return live;
  try {
    const shell = JSON.parse(localStorage.getItem("ghz-shell") || "{}") || {};
    const n = String(shell.name || "").trim();
    if (n) return n;
  } catch {}
  return "";
}

function CollapseDock() {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem("ghz-stu-side") === "1"; } catch { return false; }
  });
  const [name, setName] = useState(readName);
  useEffect(() => {
    const tick = () => {
      const n = readName();
      if (n) setName(n);
    };
    tick();
    const t = setInterval(tick, 400);
    const stop = setTimeout(() => clearInterval(t), 20000);
    const el = document.getElementById("userName");
    let mo;
    if (el && typeof MutationObserver !== "undefined") {
      mo = new MutationObserver(tick);
      mo.observe(el, { childList: true, characterData: true, subtree: true });
    }
    return () => { clearInterval(t); clearTimeout(stop); if (mo) mo.disconnect(); };
  }, []);
  const shown = name || "Student";
  const initials = shown.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase() || "S";
  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem("ghz-stu-side", next ? "1" : "0"); } catch {}
    document.body.classList.toggle("stu-collapsed", next);
  };
  if (collapsed && !document.body.classList.contains("stu-collapsed")) document.body.classList.add("stu-collapsed");
  return e("div", { className: "stu-dock" },
    e("button", { type: "button", className: "stu-collapse", onClick: toggle, "aria-label": "Collapse menu" }, collapsed ? "›" : "‹"),
    e("div", { className: "stu-usercard" },
      e("i", null, initials),
      e("div", null, e("strong", null, shown), e("span", null, "Student"))
    )
  );
}

export function bootStudentTheme() {
  try {
    document.body.classList.add("stu-v3");
    try { if (localStorage.getItem("ghz-stu-side") === "1") document.body.classList.add("stu-collapsed"); } catch {}
    const portal = document.body.children[0];
    const aside = portal && portal.children[0];
    if (aside && !aside.querySelector(".stu-theme-root")) {
      const host = document.createElement("div");
      host.className = "stu-theme-root";
      aside.appendChild(host);
      createRoot(host).render(e(CollapseDock));
    }
  } catch (err) {
    document.body.classList.remove("stu-v3", "stu-collapsed");
    console.error("StudentTheme", err);
  }
}
