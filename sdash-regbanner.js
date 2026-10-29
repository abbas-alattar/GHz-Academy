import { bound } from "./student-dash-data.js?v=stu7";

export function mountRegBanner(el) {
  bound(el, (root, data) => {
    const r = data.registrations.find((x) => x.status === "pending_payment" || x.status === "payment_submitted");
    if (!r) { root.innerHTML = ""; return; }
    const label = r.status === "pending_payment" ? "Payment pending" : "Payment submitted";
    root.innerHTML = `<div class="sdash-banner"><span>${label}</span><a href="#regs" data-view="regs">View</a></div>`;
    root.querySelector("a").onclick = (e) => { e.preventDefault(); document.querySelector('.side a[data-view="regs"]')?.click(); };
  });
}
