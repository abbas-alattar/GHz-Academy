export const esc = (s) => String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/"/g,"&quot;");
export const pct = (n, d) => {
  const e = Number(n), m = Number(d);
  if (!Number.isFinite(m) || m <= 0 || !Number.isFinite(e)) return null;
  const p = Math.round((e / m) * 100);
  if (p > 100 || p < 0) return null;
  return p;
};
export const score100 = (n, d) => { const p = pct(n, d); return p == null ? "—" : p + "/100"; };
export const attPct = (recs) => {
  const den = recs.filter((r) => r.status && r.status !== "excused").length;
  const good = recs.filter((r) => r.status === "present" || r.status === "late").length;
  return den ? Math.round(good / den * 100) : null;
};
export const ring = (p) => {
  const v = p == null ? 0 : p;
  const c = 2 * Math.PI * 36;
  const off = c - (v / 100) * c;
  const label = p == null ? "—" : v + "%";
  return `<svg width="90" height="90" viewBox="0 0 90 90"><circle cx="45" cy="45" r="36" fill="none" stroke="#e5e7eb" stroke-width="8"/>
    <circle cx="45" cy="45" r="36" fill="none" stroke="#16a34a" stroke-width="8" stroke-dasharray="${c}" stroke-dashoffset="${off}" transform="rotate(-90 45 45)"/>
    <text x="45" y="50" text-anchor="middle" font-size="16" font-weight="700">${label}</text></svg>`;
};
export const cellColor = (kind, p) => {
  if (kind === "partial") return "#7c3aed";
  if (kind === "missing") return "#94a3b8";
  if (p == null) return "#94a3b8";
  if (p >= 80) return "#16a34a";
  if (p >= 50) return "#d97706";
  return "#dc2626";
};
export const csvDown = (name, rows) => {
  const blob = new Blob([rows.map((r) => r.map((c) => `"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n")], { type: "text/csv" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click();
};
