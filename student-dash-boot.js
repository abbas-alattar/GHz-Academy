import { bootUniDash } from "./student-uni-dash.js";
import { bootDashboardV3 } from "./DashboardV3.js";

export function bootStudentDash() {
  const host = document.getElementById("studentDashRoot");
  if (!host) return;
  const classic = () => {
    try { bootUniDash(); } catch (e) {
      host.innerHTML = `<p class="banner">Dashboard could not load<br>${e?.code || e?.message || e}</p>`;
    }
  };
  try {
    const ok = bootDashboardV3(host, classic);
    if (!ok) classic();
  } catch (_) {
    classic();
  }
}
