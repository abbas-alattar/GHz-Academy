export function stKey(s) {
  const x = String(s || "").trim().toLowerCase();
  if (x === "open") return "open";
  if (x === "closed") return "closed";
  if (x === "completed") return "completed";
  if (x === "coming soon") return "soon";
  if (x === "draft") return "draft";
  if (x === "archived") return "archived";
  return "draft";
}
export function statusBadgeClass(s) {
  return "ghz-st " + stKey(s);
}
export function statusBadgeHtml(s) {
  const label = s || "—";
  const t = String(label).replace(/&/g,"&").replace(/</g,"<");
  return `<span class="${statusBadgeClass(s)}">${t}</span>`;
}
