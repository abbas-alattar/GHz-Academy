import { protect } from "./auth-guard.js?v=auth8";
import { bootAdminSide } from "./admin-side.js";

bootAdminSide("certificates");
protect("admin").catch((e) => console.error("protect", e));

const v2 = document.getElementById("adminCertificatesV2Root");
const root = document.getElementById("root");
const classicWanted = new URLSearchParams(location.search).has("classic");

if (classicWanted) {
  if (v2) v2.hidden = true;
  if (root) root.classList.remove("hidden");
  import("./admin-certificates-grades.js").catch((e) => {
    console.error("classic certificates", e);
    if (root) root.innerHTML = `<p class="banner">Classic view could not load<br>${e && (e.message || e)}</p>`;
  });
} else {
  if (root) root.classList.add("hidden");
  const onClassic = () => { location.href = "./admin-certificates.html?classic=1"; };
  (async () => {
    try {
      const mod = await import("./AdminCertificatesV2.js");
      mod.renderAdminCertificatesV2(v2, { onClassic });
    } catch (e) {
      console.error("AdminCertificatesV2.js", e);
      const p = document.createElement("p");
      p.className = "acv2-err";
      p.textContent = (e && (e.message || e.code)) || String(e);
      const b = document.createElement("button");
      b.type = "button";
      b.className = "acv2-pri";
      b.textContent = "Try again";
      b.onclick = () => location.reload();
      if (v2) v2.replaceChildren(p, b);
    }
  })();
}
