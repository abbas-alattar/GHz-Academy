/** Shared 16:9 academy covers. Generated SVG first; optional photo from courseCovers. */

const mem = new Map();
const legacyMem = new Map();
const LS = "ghz-covers-v3";

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (ch) => {
    if (ch === "&") return "\u0026amp;";
    if (ch === "<") return "\u0026lt;";
    if (ch === ">") return "\u0026gt;";
    if (ch === '"') return "\u0026quot;";
    return "\u0026#39;";
  });
}

export function coverCategory(course) {
  const t = (String(course?.title || "") + " " + String(course?.category || "")).toLowerCase();
  if (/\b(5g|nr|core)\b/.test(t)) return "5g";
  if (/antenna/.test(t)) return "antenna";
  if (/\b(rf|spectrum)\b/.test(t)) return "rf";
  if (/microwave|\bdish\b|\blink\b/.test(t)) return "microwave";
  if (/fiber|fibre|optical/.test(t)) return "fiber";
  if (/wireless|wifi|wi-fi|lte|4g|6g/.test(t)) return "wireless";
  return "default";
}

const PALETTE = {
  "5g": { a: "#0B1B33", b: "#2563EB" },
  antenna: { a: "#0B1B33", b: "#0D9488" },
  rf: { a: "#0B1B33", b: "#7C3AED" },
  microwave: { a: "#0B1B33", b: "#06B6D4" },
  fiber: { a: "#0B1B33", b: "#16A34A" },
  wireless: { a: "#0B1B33", b: "#4F46E5" },
  default: { a: "#0B1B33", b: "#1E3A8A" }
};

function iconPath(cat) {
  const s = `fill="none" stroke="#22D3EE" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"`;
  if (cat === "antenna") {
    return `<g ${s} transform="translate(430,40)">
      <path d="M90 280 V120"/><path d="M50 120 h80"/><path d="M90 120 L20 40"/><path d="M90 120 L160 40"/>
      <path d="M10 70 Q90 0 170 70"/>
    </g>`;
  }
  if (cat === "rf") {
    return `<g ${s} transform="translate(400,50)">
      <path d="M20 160 C60 80 100 240 140 160 S220 80 260 160 S340 240 380 160"/>
    </g>`;
  }
  if (cat === "microwave") {
    return `<g ${s} transform="translate(420,50)">
      <ellipse cx="110" cy="150" rx="70" ry="88" transform="rotate(-12 110 150)"/>
      <path d="M110 238 V290"/><path d="M180 150 h70"/>
    </g>`;
  }
  if (cat === "fiber") {
    return `<g ${s} transform="translate(410,40)">
      <path d="M40 260 C80 80, 160 80, 200 260"/>
      <path d="M90 260 C130 100, 200 100, 250 260"/>
      <path d="M30 270 h240"/>
    </g>`;
  }
  if (cat === "wireless") {
    return `<g ${s} transform="translate(460,70)">
      <rect x="40" y="180" width="22" height="70" rx="4"/>
      <rect x="78" y="140" width="22" height="110" rx="4"/>
      <rect x="116" y="100" width="22" height="150" rx="4"/>
      <rect x="154" y="60" width="22" height="190" rx="4"/>
    </g>`;
  }
  return `<g ${s} transform="translate(430,30)">
    <path d="M110 300 V90"/><path d="M78 90 h64"/><circle cx="110" cy="62" r="22"/>
    <path d="M78 140 h64"/><path d="M90 180 h40"/>
  </g>`;
}

export function coverFor(course) {
  const cat = coverCategory(course);
  const pal = PALETTE[cat] || PALETTE.default;
  const id = "cg" + cat + String(course?.id || "x").replace(/[^a-zA-Z0-9]/g, "").slice(0, 12);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" width="640" height="360" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs>
      <linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${pal.a}"/><stop offset="1" stop-color="${pal.b}"/>
      </linearGradient>
    </defs>
    <rect width="640" height="360" fill="url(#${id})"/>
    <g opacity="0.14" stroke="#22D3EE" stroke-width="1" fill="none">
      <path d="M0 280 C120 220 200 320 320 260 S520 180 640 240"/>
      <path d="M0 220 C140 160 240 280 360 210 S540 140 640 190"/>
      <path d="M80 0 V360 M160 0 V360 M240 0 V360 M320 0 V360 M400 0 V360 M480 0 V360 M560 0 V360" opacity="0.5"/>
    </g>
    ${iconPath(cat)}
  </svg>`;
}

export function coverMarkup(course, extraClass) {
  const id = String(course?.id || "");
  const cls = extraClass ? "ghz-cover " + extraClass : "ghz-cover";
  const legacy = String(course?.coverImage || course?.cover || course?.coverThumb || "").trim();
  const legacyAttr = (legacy.startsWith("data:image") || /^https?:\/\//.test(legacy)) ? ` data-cover-legacy="1"` : "";
  const at = course?.coverUpdatedAt != null ? ` data-cover-at="${esc(course.coverUpdatedAt)}"` : "";
  return `<div class="${cls}" data-cover-id="${esc(id)}" data-cover-cat="${esc(coverCategory(course))}"${legacyAttr}${at}>${coverFor(course)}</div>`;
}

function readLs() {
  try { return JSON.parse(localStorage.getItem(LS) || "{}") || {}; } catch { return {}; }
}
function writeLs(map) {
  try { localStorage.setItem(LS, JSON.stringify(map)); } catch (_) {}
}

export function stripCoverFields(c) {
  if (!c || typeof c !== "object") return c;
  const o = { ...c };
  const leg = String(o.coverImage || o.cover || o.coverThumb || "").trim();
  if (o.id && (leg.startsWith("data:image") || /^https?:\/\//.test(leg))) legacyMem.set(String(o.id), leg);
  delete o.coverImage;
  delete o.cover;
  delete o.coverThumb;
  delete o.image;
  delete o.imageUrl;
  delete o.photo;
  delete o.thumbnail;
  return o;
}
export function slimListCourse(c) {
  const s = stripCoverFields(c) || {};
  const keep = ["id","title","status","level","startDate","endDate","days","sessionTime","sessionDays","price","trainerName","trainerNames","trainers","duration","short","category","coverUpdatedAt","completionRound","completedAt","reopenedAt","completionCount"];
  const o = { id: s.id };
  keep.forEach((k) => { if (s[k] != null && s[k] !== "") o[k] = s[k]; });
  if (s.short) o.short = String(s.short).slice(0, 180);
  delete o.description;
  delete o.outline;
  delete o.modules;
  delete o.syllabus;
  delete o.longDescription;
  delete o.body;
  return o;
}

function recFromData(id, data, mime, updatedAt) {
  const src = String(data || "");
  if (!src) return null;
  const m = mime || "image/jpeg";
  const url = src.startsWith("data:") ? src : ("data:" + m + ";base64," + src);
  return { data: url, mimeType: m, updatedAt: updatedAt || Date.now(), courseId: id };
}
function cacheKey(id, thumb) { return thumb ? String(id) + "__thumb" : String(id); }
function cacheRec(id, rec, thumb) {
  const k = cacheKey(id, thumb);
  mem.set(k, rec);
  if (!rec) return rec;
  const all = readLs();
  all[k] = rec;
  writeLs(all);
  return rec;
}
export function rememberCover(id, rec, thumb) {
  if (id && rec?.data) cacheRec(id, rec, thumb);
}
export function makeJpegThumb(src, w, h, q0, maxBytes) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const cnv = document.createElement("canvas");
      const tw = w || 480;
      const th = h || Math.round(tw * 9 / 16);
      cnv.width = tw; cnv.height = th;
      cnv.getContext("2d").drawImage(img, 0, 0, tw, th);
      let q = q0 == null ? 0.6 : q0;
      let td = cnv.toDataURL("image/jpeg", q);
      const bytes = () => { try { return atob((td.split(",")[1] || "")).length; } catch { return 0; } };
      while (bytes() > (maxBytes || 40 * 1024) && q > 0.35) {
        q -= 0.06;
        td = cnv.toDataURL("image/jpeg", q);
      }
      resolve({ dataUrl: td, b64: td.split(",")[1] || "", bytes: bytes(), mimeType: "image/jpeg" });
    };
    img.onerror = reject;
    img.src = String(src || "").startsWith("data:") ? src : ("data:image/jpeg;base64," + src);
  });
}
window.__ghzCoverDiag = window.__ghzCoverDiag || {};
export async function loadCourseCover(courseId, course, opts) {
  const id = String(courseId || "");
  const thumb = !!(opts && opts.thumb);
  if (!id) return null;
  const k = cacheKey(id, thumb);
  const wantAt = course?.coverUpdatedAt || course?.updatedAt || "";
  const freshEnough = (rec) => rec?.data && (!wantAt || String(rec.updatedAt) === String(wantAt) || Number(rec.updatedAt) >= Number(wantAt));
  if (mem.has(k) && freshEnough(mem.get(k))) return mem.get(k);
  const cached = readLs()[k];
  if (freshEnough(cached)) {
    mem.set(k, cached);
    return cached;
  }
  const diag = { id, exists: false, permissionDenied: false, source: "none", thumb };
  try {
    const { db } = await import("./firebase-config.js?v=auth10");
    const { doc, getDoc } = await import("https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js");
    let snap = null;
    try {
      if (thumb) {
        try { snap = await getDoc(doc(db, "courseCovers", id + "_thumb")); } catch (e) {
          diag.permissionDenied = String(e?.code || e).indexOf("permission") >= 0;
        }
        if (!snap || !snap.exists()) {
          window.__ghzCoverDiag[id] = diag;
          mem.set(k, null);
          return null;
        }
      } else {
        snap = await getDoc(doc(db, "courseCovers", id));
      }
    } catch (e) {
      diag.permissionDenied = String(e?.code || e).indexOf("permission") >= 0;
      diag.err = e?.code || String(e);
      console.log("[ghz-cover] error", e?.code, e?.message);
    }
    if (snap && snap.exists()) {
      diag.exists = true;
      diag.source = thumb ? "courseCovers_thumb" : "courseCovers";
      const d = snap.data() || {};
      const rec = recFromData(id, d.data, d.mimeType, d.updatedAt);
      window.__ghzCoverDiag[id] = diag;
      if (rec) return cacheRec(id, rec, thumb);
    }
    if (thumb) {
      window.__ghzCoverDiag[id] = diag;
      mem.set(k, null);
      return null;
    }
    const legacy = String(course?.coverImage || course?.cover || course?.coverThumb || legacyMem.get(id) || "").trim();
    if (legacy.startsWith("data:image") || /^https?:\/\//.test(legacy)) {
      diag.source = "legacy-in-memory";
      const rec = recFromData(id, legacy, "image/jpeg", Date.now());
      window.__ghzCoverDiag[id] = diag;
      if (rec) return cacheRec(id, rec, false);
    }
    window.__ghzCoverDiag[id] = diag;
    mem.set(k, null);
    return null;
  } catch (e) {
    diag.err = e?.code || String(e);
    console.log("[ghz-cover] error", e?.code, e?.message);
    window.__ghzCoverDiag[id] = diag;
    mem.set(k, null);
    return null;
  }
}

export function hydrateCovers(root, opts) {
  const host = root && root.querySelectorAll ? root : document;
  const nodes = [...host.querySelectorAll("[data-cover-id]")];
  const useThumb = opts?.thumb !== false;
  const eager = Number(opts?.eager != null ? opts.eager : 3);
  const run = (el, i) => {
    const id = el.getAttribute("data-cover-id");
    if (!id || el.dataset.coverHydrated === "1") return;
    el.dataset.coverHydrated = "1";
    el.classList.add("ghz-cover-ph");
    loadCourseCover(id, { id, coverImage: legacyMem.get(id) || "", coverUpdatedAt: el.getAttribute("data-cover-at") || "" }, { thumb: useThumb }).then((rec) => {
      if (!rec?.data || !el.isConnected) return;
      const img = document.createElement("img");
      img.src = rec.data;
      img.alt = "";
      img.className = "ghz-cover-photo";
      img.loading = i < eager ? "eager" : "lazy";
      img.decoding = "async";
      el.style.position = el.style.position || "relative";
      el.style.aspectRatio = el.style.aspectRatio || "16/9";
      const show = () => {
        img.classList.add("is-on");
        try {
          const cnv = document.createElement("canvas");
          cnv.width = 12; cnv.height = 12;
          const ctx = cnv.getContext("2d");
          ctx.drawImage(img, 0, 0, 12, 12);
          const d = ctx.getImageData(0, 0, 12, 12).data;
          let s = 0, n = 0;
          for (let i = 0; i < d.length; i += 4) { s += (d[i] + d[i + 1] + d[i + 2]) / 3; n++; }
          if (n && s / n > 168) el.classList.add("ghz-cover-light");
        } catch (_) {}
      };
      img.onload = () => {
        show();
        try {
          window.__ghzCoverImgN = (window.__ghzCoverImgN || 0) + 1;
          const n = host.querySelectorAll("[data-cover-id]").length;
          if (window.__ghzCoverImgN >= n) console.log("[ghz-perf] all-images", Math.round(performance.now() - (window.__ghzT0 || 0)) + "ms n=" + n);
        } catch (_) {}
      };
      if (img.complete && img.naturalWidth) show();
      el.appendChild(img);
    }).catch(() => {});
  };
  nodes.slice(0, eager).forEach((el, i) => run(el, i));
  if (typeof IntersectionObserver === "function") {
    const io = new IntersectionObserver((ents) => {
      ents.forEach((en) => { if (en.isIntersecting) { run(en.target, eager); io.unobserve(en.target); } });
    }, { rootMargin: "300px" });
    nodes.slice(eager).forEach((el) => io.observe(el));
  } else {
    nodes.slice(eager).forEach((el, i) => run(el, i + eager));
  }
}

export function cropCoverFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) { reject(new Error("no file")); return; }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const tw = 1400, th = 788;
      const ir = img.width / img.height;
      const tr = tw / th;
      let sw = img.width, sh = img.height, sx = 0, sy = 0;
      if (ir > tr) { sw = img.height * tr; sx = (img.width - sw) / 2; }
      else { sh = img.width / tr; sy = (img.height - sh) / 2; }
      const canvas = document.createElement("canvas");
      canvas.width = tw; canvas.height = th;
      canvas.getContext("2d").drawImage(img, sx, sy, sw, sh, 0, 0, tw, th);
      const encode = (cnv, maxB, startQ) => {
        const tryType = (type) => {
          let q = startQ;
          let data = cnv.toDataURL(type, q);
          if (type === "image/webp" && data.indexOf("image/webp") < 0) return null;
          const bytes = () => {
            const b64 = data.split(",")[1] || "";
            try { return Math.round(atob(b64).length); } catch { return Math.round(data.length * 0.75); }
          };
          while (bytes() > maxB && q > 0.4) {
            q -= 0.08;
            data = cnv.toDataURL(type, q);
          }
          return { data, bytes: bytes(), mimeType: type };
        };
        return tryType("image/webp") || tryType("image/jpeg");
      };
      const full = encode(canvas, 250 * 1024, 0.78);
      const tw2 = 800, th2 = 450;
      const c2 = document.createElement("canvas");
      c2.width = tw2; c2.height = th2;
      c2.getContext("2d").drawImage(canvas, 0, 0, tw2, th2);
      const thumb = encode(c2, 150 * 1024, 0.72);
      URL.revokeObjectURL(url);
      if (!full || full.bytes > 250 * 1024) reject(new Error("too large"));
      else resolve({ dataUrl: full.data, thumbUrl: thumb.data, bytes: full.bytes, thumbBytes: thumb.bytes, mimeType: full.mimeType });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("not-image")); };
    img.src = url;
  });
}
