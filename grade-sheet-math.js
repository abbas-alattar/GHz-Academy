export const parseScore = (raw) => {
  if (raw === "" || raw == null) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.min(100, Math.max(0, n));
};

export const averageOf = (scores, components) => {
  let sum = 0;
  for (const c of components) {
    const v = parseScore(scores[c.id]);
    sum += ((v == null ? 0 : v) * (Number(c.weight) || 0)) / 100;
  }
  return Math.round(sum * 10) / 10;
};

export const statusOf = (scores, components, passMark, avg) => {
  const blank = components.some((c) => parseScore(scores[c.id]) == null);
  if (blank) return { label: "In progress", color: "#92400e", bg: "#fef3c7" };
  if (avg >= passMark) return { label: "P", color: "#166534", bg: "#dcfce7" };
  return { label: "F", color: "#991b1b", bg: "#fee2e2" };
};
