import { protect } from "./auth-guard.js?v=auth8";
import { bootAdminSide } from "./admin-side.js";

bootAdminSide("grades");
protect("admin").catch((e) => console.error("protect", e));

const v2 = document.getElementById("adminGradesV2Root");
const root = document.getElementById("root");
const classicWanted = new URLSearchParams(location.search).has("classic");

if (classicWanted) {
  if (v2) v2.hidden = true;
  if (root) root.classList.remove("hidden");
  import("./admin-grades.js").catch((e) => {
    console.error("classic grades", e);
    if (root) root.innerHTML = `<p class="banner">Classic view could not load<br>${e && (e.message || e)}</p>`;
  });
} else {
  const onClassic = () => { location.href = "./admin-grades.html?classic=1"; };
  (async () => {
    try {
      const mod = await import("./AdminGradesV2.js");
      mod.renderAdminGradesV2(v2, { onRetry: () => location.reload() });
    } catch (e) {
      console.error("AdminGradesV2.js", e);
      const p = document.createElement("p");
      p.className = "agv2-err";
      p.textContent = (e && (e.message || e.code)) || String(e);
      const b = document.createElement("button");
      b.type = "button";
      b.className = "agv2-csv";
      b.textContent = "Try again";
      b.onclick = () => location.reload();
      if (v2) { v2.appendChild(p); v2.appendChild(b); }
    }
  })();
}
