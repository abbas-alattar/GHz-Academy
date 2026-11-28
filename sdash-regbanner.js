import { bound } from "./student-dash-data.js?v=stu11-r2";

export function mountRegBanner(el) {
  bound(el, (root, data) => {
    const r = data.registrations.find((x) => x.status === "pending_payment");
    if (!r) { root.innerHTML = ""; return; }
    const label = "Payment pending";
    root.innerHTML = `<div class="sdash-banner"><span>${label}</span><a href="#regs" data-view="regs">View</a></div>`;
    root.querySelector("a").onclick = (e) => { e.preventDefault(); document.querySelector('.side a[data-view="regs"]')?.click(); };
  });
}
