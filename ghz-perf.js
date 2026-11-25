const logs = [];

function kbOf(val) {
  try {
    const s = typeof val === "string" ? val : JSON.stringify(val);
    return Math.round((s.length * 2) / 1024);
  } catch {
    return 0;
  }
}

export function ghzPerf(name, extra) {
  const row = { name, t: Date.now(), ...extra };
  logs.push(row);
  try {
    const bits = ["[ghz-perf]", name];
    if (extra?.ms != null) bits.push(extra.ms + "ms");
    if (extra?.count != null) bits.push("n=" + extra.count);
    if (extra?.kb != null) bits.push(extra.kb + "KB");
    console.log(bits.join(" "));
  } catch (_) {}
  return row;
}

export async function timedQuery(name, fn) {
  const t0 = performance.now();
  try {
    const snap = await fn();
    const end = performance.now();
    const ms = Math.round(end - t0);
    let count = 0;
    let kb = 0;
    let biggest = 0;
    const fromCache = !!(snap && snap.metadata && snap.metadata.fromCache);
    if (snap && typeof snap.exists === "function") {
      count = snap.exists() ? 1 : 0;
      kb = snap.exists() ? Math.round(JSON.stringify(snap.data() || {}).length / 1024) : 0;
      biggest = kb;
    } else if (snap && snap.docs) {
      count = snap.docs.length;
      kb = Math.round(JSON.stringify(snap.docs.map((d) => d.data())).length / 1024);
      snap.docs.forEach((d) => {
        const k = Math.round(JSON.stringify(d.data() || {}).length / 1024);
        if (k > biggest) biggest = k;
      });
    }
    const src = fromCache ? "cache" : "server";
    ghzPerf(name, { ms, count, kb, ok: true, start: Math.round(t0), end: Math.round(end), src, biggest });
    try { window.__ghzPerfReads?.push({ name, count, kb, start: Math.round(t0), end: Math.round(end), ms, src, biggest }); } catch (_) {}
    return snap;
  } catch (e) {
    ghzPerf(name, { ms: Math.round(performance.now() - t0), ok: false, err: e?.code || e?.message });
    throw e;
  }
}

export function ghzPerfSlowest(n) {
  return logs.filter((x) => x.ms != null).slice().sort((a, b) => (b.ms || 0) - (a.ms || 0)).slice(0, n || 10);
}

if (typeof window !== "undefined") {
  window.__ghzPerfLogs = logs;
  window.__ghzLogResources = function () {
    try {
      const nav = performance.getEntriesByType("navigation")[0];
      if (nav) console.log("[ghz-perf] ttfb", Math.round(nav.responseStart), "ms html", Math.round((nav.transferSize || 0) / 1024), "KB");
      const res = performance.getEntriesByType("resource") || [];
      const js = res.filter((r) => /script|css|stylesheet/i.test(r.initiatorType) || /\.(js|css)(\?|$)/i.test(r.name));
      js.sort((a, b) => (b.duration || 0) - (a.duration || 0)).slice(0, 10).forEach((r) => {
        console.log("[ghz-perf] js", r.name.split("/").pop(), Math.round(r.duration) + "ms", Math.round((r.transferSize || r.encodedBodySize || 0) / 1024) + "KB");
      });
      const media = res.filter((r) => /img|image|font|css/i.test(r.initiatorType) || /\.(woff2?|png|jpe?g|svg|webp)(\?|$)/i.test(r.name));
      media.sort((a, b) => (b.encodedBodySize || b.transferSize || 0) - (a.encodedBodySize || a.transferSize || 0)).slice(0, 10).forEach((r) => {
        console.log("[ghz-perf] asset", r.name.split("/").pop(), Math.round((r.encodedBodySize || r.transferSize || 0) / 1024) + "KB");
      });
    } catch (_) {}
  };
  window.addEventListener("load", () => setTimeout(() => window.__ghzLogResources?.(), 400));
  window.__ghzPageMark = function (page) {
    const t0 = performance.now();
    const rec = { page, t0, skeleton: null, firstCard: null, all: null };
    const log = (kind, extra) => {
      const ms = Math.round(performance.now() - t0);
      rec[kind] = ms;
      console.log("[ghz-perf] page", page, kind, ms + "ms", extra || "");
    };
    return {
      rec,
      skeleton(extra) { if (rec.skeleton == null) log("skeleton", extra); },
      firstCard(extra) { if (rec.firstCard == null) log("first-card", extra); },
      all(extra) { if (rec.all == null) log("all-cards", extra); }
    };
  };
}

function bootPerfPanel() {
  try {
    if (typeof window === "undefined") return;
    if (window.innerWidth >= 768) return;
    if (!/[?&]perf=1(?:&|$)/.test(location.search)) return;
    if (document.getElementById("ghz-perf-panel")) return;
    window.__ghzPerfReads = window.__ghzPerfReads || [];
    window.__ghzPerfVisits = window.__ghzPerfVisits || [];
    const tPage = window.__ghzT0 || performance.now();
    const panel = document.createElement("div");
    panel.id = "ghz-perf-panel";
    panel.setAttribute("data-phone-only", "1");
    panel.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:9999;max-height:40vh;overflow:auto;background:rgba(15,23,42,.88);color:#fff;font:11px/1.35 ui-monospace,Menlo,monospace;padding:8px 8px 10px;box-sizing:border-box";
    const bar = document.createElement("div");
    bar.style.cssText = "display:flex;gap:8px;justify-content:flex-end;position:sticky;top:0";
    const copy = document.createElement("button");
    copy.textContent = "Copy";
    copy.type = "button";
    copy.style.cssText = "font:11px monospace;background:#334155;color:#fff;border:0;border-radius:4px;padding:2px 8px";
    const close = document.createElement("button");
    close.textContent = "X";
    close.type = "button";
    close.style.cssText = copy.style.cssText;
    close.onclick = () => panel.remove();
    const pre = document.createElement("pre");
    pre.style.cssText = "margin:6px 0 0;white-space:pre-wrap;word-break:break-word";
    bar.appendChild(copy);
    bar.appendChild(close);
    panel.appendChild(bar);
    panel.appendChild(pre);
    const mount = () => {
      if (!document.body) return;
      if (!panel.isConnected) document.body.appendChild(panel);
    };
    if (document.body) mount();
    else document.addEventListener("DOMContentLoaded", mount);
    function route() {
      return ((location.hash || "").replace("#", "").split("/")[0] || "dash").replace(/v2$/, "") || "dash";
    }
    function kbRes(r) {
      return Math.round((r.transferSize || r.encodedBodySize || 0) / 1024);
    }
    function collect(label) {
      const nav = (performance.getEntriesByType("navigation")[0]) || {};
      const res = performance.getEntriesByType("resource") || [];
      const scripts = res.filter((r) => /script|css|stylesheet/i.test(r.initiatorType) || /\.(js|css)(\?|$)/i.test(r.name));
      const totalKb = scripts.reduce((a, r) => a + kbRes(r), 0);
      const slow5 = scripts.slice().sort((a, b) => (b.duration || 0) - (a.duration || 0)).slice(0, 5);
      const imgs = res.filter((r) => /img|image/i.test(r.initiatorType) || /\.(png|jpe?g|webp|svg|gif)(\?|$)/i.test(r.name));
      const big5 = imgs.slice().sort((a, b) => kbRes(b) - kbRes(a)).slice(0, 5);
      const reads = window.__ghzPerfReads || [];
      const conn = navigator.connection || {};
      const skel = document.querySelector(".sdash-skel, .th2-skline, .v2-card, .mc2-card, .reg-card, .uni-card");
      const cards = document.querySelectorAll(".v2-card, .mc2-card, article.v2-card, .reg-row, .uni-card");
      const images = document.querySelectorAll(".ghz-cover img, .v2-coverwrap img");
      const now = Math.round(performance.now() - tPage);
      const lines = [];
      lines.push("route " + (label || route()));
      lines.push("html ttfb " + Math.round(nav.responseStart || 0) + "ms  page load " + Math.round(nav.loadEventEnd || now) + "ms");
      lines.push("scripts+css total " + totalKb + "KB");
      slow5.forEach((r) => lines.push("slow " + (r.name.split("/").pop() || r.name) + " " + kbRes(r) + "KB " + Math.round(r.duration) + "ms"));
      const authMs = window.__ghzAuthMs;
      lines.push("auth ready " + (authMs == null ? "pending" : authMs + "ms"));
      reads.forEach((r) => lines.push("read " + r.name + " n=" + r.count + " " + r.kb + "KB start " + r.start + " end " + r.end + " " + r.ms + "ms " + r.src));
      const ds = window.__ghzDsTiming || {};
      Object.keys(ds).sort().forEach((k) => {
        const d = ds[k] || {};
        lines.push("ds " + k + " start " + (d.started == null ? "—" : d.started) + " end " + (d.finished == null ? "—" : d.finished) + " waited " + (d.waited || "none"));
      });
      const courseReads = reads.filter((r) => /catalog|course/i.test(r.name));
      const regReads = reads.filter((r) => /registration/i.test(r.name));
      lines.push("biggest course doc " + (courseReads.reduce((m, r) => Math.max(m, r.biggest || 0), 0) || "—") + "KB");
      lines.push("biggest registration doc " + (regReads.reduce((m, r) => Math.max(m, r.biggest || 0), 0) || "—") + "KB");
      lines.push("first skeleton " + (skel ? now : "—") + "ms");
      lines.push("first-card " + (cards[0] ? now : "—") + "ms");
      lines.push("all-cards " + (cards.length ? now + " n=" + cards.length : "—") + "ms");
      lines.push("all-images " + (images.length ? now + " n=" + images.length : "—") + "ms");
      big5.forEach((r) => lines.push("img " + (r.name.split("/").pop() || r.name) + " " + kbRes(r) + "KB " + Math.round(r.duration) + "ms"));
      lines.push("connection " + (conn.effectiveType || "n/a") + " downlink " + (conn.downlink != null ? conn.downlink : "n/a"));
      try {
        const st = window.__ghzDash || {};
        const n = (k) => Array.isArray(st[k]) ? st[k].length : 0;
        lines.push("store enrollments=" + n("enrollments") + " assignments=" + n("assignments") + " quizzes=" + n("quizzes") + " submissions=" + n("submissions") + " attendance=" + n("attendance") + " sessions=" + n("sessions"));
      } catch (_) {}
      return lines;
    }
    function paint() {
      const cur = collect();
      cur.forEach((ln) => { try { console.log("[ghz-perf]", ln); } catch (_) {} });
      const hist = window.__ghzPerfVisits || [];
      const blocks = hist.map((h) => h.join("\n")).concat([cur.join("\n")]);
      pre.textContent = blocks.join("\n---\n");
    }
    copy.onclick = () => {
      try { navigator.clipboard.writeText(pre.textContent || ""); } catch (_) {}
    };
    let lastRoute = route();
    function snapshotRoute() {
      const lines = collect();
      window.__ghzPerfVisits.push(lines);
      if (window.__ghzPerfVisits.length > 8) window.__ghzPerfVisits.shift();
    }
    window.addEventListener("hashchange", () => {
      snapshotRoute();
      lastRoute = route();
      paint();
    });
    const mo = new MutationObserver(() => paint());
    mo.observe(document.documentElement, { childList: true, subtree: true });
    setInterval(paint, 800);
    paint();
    window.__ghzPerfPaint = paint;
    window.__ghzMarkAuth = function (ms) {
      window.__ghzAuthMs = Math.round(ms);
      paint();
    };
  } catch (_) {}
}
if (typeof window !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootPerfPanel);
  else bootPerfPanel();
}
