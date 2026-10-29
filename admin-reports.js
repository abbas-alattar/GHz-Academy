import { protect } from "./auth-guard.js?v=auth8";
import { bootAdminSide } from "./admin-side.js";

bootAdminSide("reports");
protect("admin").catch((e) => console.error("protect", e));

const v2 = document.getElementById("adminReportsV2Root");
const root = document.getElementById("root");
let classic = false;
const onClassic = () => {
  classic = true;
  if (v2) v2.hidden = true;
  if (root) root.classList.remove("hidden");
  root.innerHTML = `<p class="banner">Use the tables below if the new Reports view cannot load.</p>`;
};

(async () => {
  try {
    const mod = await import("./AdminReportsV2.js");
    if (classic) return;
    const paint = (props) => {
      try { mod.renderAdminReportsV2(v2, props); }
      catch (e) { console.error("AdminReportsV2", e); onClassic(); }
    };
    paint({ courses: [], pack: null, loading: true, error: null, sectionErr: {}, onRetry: () => location.reload() });
    try {
      const data = await mod.loadReportPack();
      if (classic) return;
      paint({
        courses: data.courses, pack: data.pack, loading: false,
        error: data.error || data.courseErr, sectionErr: data.sectionErr || {},
        onRetry: () => location.reload(),
        onOpenStudent: () => { location.href = "./admin.html#students"; }
      });
    } catch (e) {
      console.error("loadReportPack", e);
      paint({ courses: [], pack: null, loading: false, error: e.code || e.message, sectionErr: { summary: e.code || e.message }, onRetry: () => location.reload() });
    }
  } catch (e) {
    console.error("AdminReportsV2.js", e);
    const p = document.createElement("p");
    p.className = "arv2-err";
    p.textContent = (e && (e.message || e.code)) || String(e);
    const b = document.createElement("button");
    b.type = "button";
    b.className = "arv2-view";
    b.textContent = "Try again";
    b.onclick = () => location.reload();
    v2.appendChild(p);
    v2.appendChild(b);
  }
})();
