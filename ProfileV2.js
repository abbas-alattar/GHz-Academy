import { sortedCountries, flagUrl, parsePhone, buildPhone, validLocal, digitsOnly } from "./phoneCountries.js";
import { showNoticeDialog } from "./ConfirmDialog.js";
const esc = (s) => String(s ?? "").replace(/&/g,"&"+"amp;").replace(/</g,"&"+"lt;").replace(/"/g,"&"+"quot;");

const KEYS = ["name","phone","phoneCountry","phoneDial","dateOfBirth","nationality","countryOfResidence","cityOfResidence","gender","address","emergencyContactName","emergencyContactPhone","linkedin","education","jobTitle","company","bio","photoDataUrl"];

const COUNTRIES = ["Afghanistan","Albania","Algeria","Andorra","Angola","Argentina","Armenia","Australia","Austria","Azerbaijan","Bahrain","Bangladesh","Belarus","Belgium","Belize","Benin","Bhutan","Bolivia","Bosnia and Herzegovina","Botswana","Brazil","Brunei","Bulgaria","Burkina Faso","Burundi","Cambodia","Cameroon","Canada","Cape Verde","Central African Republic","Chad","Chile","China","Colombia","Comoros","Congo","Costa Rica","Croatia","Cuba","Cyprus","Czechia","Denmark","Djibouti","Dominica","Dominican Republic","Ecuador","Egypt","El Salvador","Equatorial Guinea","Eritrea","Estonia","Eswatini","Ethiopia","Fiji","Finland","France","Gabon","Gambia","Georgia","Germany","Ghana","Greece","Grenada","Guatemala","Guinea","Guyana","Haiti","Honduras","Hungary","Iceland","India","Indonesia","Iran","Iraq","Ireland","Israel","Italy","Ivory Coast","Jamaica","Japan","Jordan","Kazakhstan","Kenya","Kuwait","Kyrgyzstan","Laos","Latvia","Lebanon","Lesotho","Liberia","Libya","Liechtenstein","Lithuania","Luxembourg","Madagascar","Malawi","Malaysia","Maldives","Mali","Malta","Mauritania","Mauritius","Mexico","Moldova","Monaco","Mongolia","Montenegro","Morocco","Mozambique","Myanmar","Namibia","Nepal","Netherlands","New Zealand","Nicaragua","Niger","Nigeria","North Macedonia","Norway","Oman","Pakistan","Palestine","Panama","Papua New Guinea","Paraguay","Peru","Philippines","Poland","Portugal","Qatar","Romania","Russia","Rwanda","Saudi Arabia","Senegal","Serbia","Singapore","Slovakia","Slovenia","Somalia","South Africa","South Korea","South Sudan","Spain","Sri Lanka","Sudan","Sweden","Switzerland","Syria","Taiwan","Tajikistan","Tanzania","Thailand","Togo","Tunisia","Turkey","Turkmenistan","Uganda","Ukraine","United Arab Emirates","United Kingdom","United States","Uruguay","Uzbekistan","Venezuela","Vietnam","Yemen","Zambia","Zimbabwe"];

const emptyForm = () => ({
  name: "", phone: "", dateOfBirth: "", nationality: "", countryOfResidence: "",
  cityOfResidence: "", gender: "", address: "", emergencyContactName: "",
  emergencyContactPhone: "", linkedin: "", education: "", jobTitle: "",
  company: "", bio: "", photoDataUrl: ""
});

const state = {
  form: emptyForm(),
  snap: emptyForm(),
  email: "",
  cv: null,
  idf: null,
  cvSnap: null,
  idSnap: null,
  errs: {},
  toast: "",
  saving: false,
  dirty: false,
  photoFile: null,
  preview: null
};

function fbErr(e, step) {
  return (e?.code || "error") + " — " + step + (e?.message ? ": " + e.message : "");
}
function initials(name) {
  return String(name || "?").split(/\s+/).slice(0,2).map((p)=>p[0]||"").join("").toUpperCase() || "?";
}
function filledCount(f) {
  const list = KEYS.filter((k) => k !== "photoDataUrl");
  let n = 0;
  for (const k of list) if (String(f[k] || "").trim()) n++;
  if (f.photoDataUrl) n++;
  return { n, t: list.length + 1 };
}
function phoneOk(v) {
  const s = String(v || "").trim();
  if (!s) return true;
  return /^\+[1-9]\d{6,14}$/.test(s.replace(/[\s-]/g, ""));
}
function validate(f) {
  const errs = {};
  if (!String(f.name || "").trim()) errs.name = "Full name is required.";
  if (f.phone && !phoneOk(f.phone)) errs.phone = "Enter 6 to 15 digits with a country code.";
  if (f.dateOfBirth) {
    const d = new Date(f.dateOfBirth + "T12:00:00");
    if (Number.isNaN(d.getTime()) || d > new Date()) errs.dateOfBirth = "Date of birth cannot be in the future.";
  }
  if (f.bio && String(f.bio).length > 300) errs.bio = "Keep your bio under 300 characters.";
  return errs;
}
function phonePickerHtml(f) {
  const parsed = parsePhone(f.phone);
  const iso = f.phoneCountry || parsed.iso;
  const local = digitsOnly(f.phone && f.phone.startsWith("+") ? parsed.local : (f.phone || ""));
  const cur = sortedCountries().find((c) => c.iso === iso) || sortedCountries()[0];
  const opts = sortedCountries().map((c) => `<option value="${esc(c.iso)}"${c.iso===cur.iso?" selected":""}>${esc(c.name)} ${esc(c.dial)}</option>`).join("");
  return `<div class="pv2-phone"><span class="pv2-cc"><img src="${esc(flagUrl(cur.iso))}" width="22" height="16" alt="${esc(cur.name)} flag" /><select data-pv2-phone-iso>${opts}</select></span><input data-pv2-phone-local value="${esc(local)}" inputmode="tel" placeholder="71 123 456" /></div>`;
}
function countryOpts(val) {
  return `<option value="">Select</option>` + COUNTRIES.map((c) => `<option value="${esc(c)}"${c===val?" selected":""}>${esc(c)}</option>`).join("");
}
function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = () => reject(new Error("Could not read file"));
    r.readAsDataURL(file);
  });
}
function loadImg(src) {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error("Could not load image"));
    im.src = src;
  });
}
async function compressSquare(file) {
  const url = await readFileAsDataUrl(file);
  const im = await loadImg(url);
  const c = document.createElement("canvas");
  c.width = 200; c.height = 200;
  const ctx = c.getContext("2d");
  const s = Math.min(im.naturalWidth, im.naturalHeight);
  const x = (im.naturalWidth - s) / 2;
  const y = (im.naturalHeight - s) / 2;
  ctx.drawImage(im, x, y, s, s, 0, 0, 200, 200);
  return c.toDataURL("image/jpeg", 0.85);
}
async function compressWide(file) {
  const url = await readFileAsDataUrl(file);
  const im = await loadImg(url);
  const maxW = 1600;
  let w = im.naturalWidth, h = im.naturalHeight;
  if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  c.getContext("2d").drawImage(im, 0, 0, w, h);
  let q = 0.8, out = c.toDataURL("image/jpeg", q);
  while (out.length > 650 * 1024 * 1.37 && q > 0.4) {
    q -= 0.1;
    out = c.toDataURL("image/jpeg", q);
  }
  return out;
}
function sizeOfData(data) {
  const i = String(data || "").indexOf(",");
  const b64 = i >= 0 ? data.slice(i + 1) : data;
  return Math.round((b64.length * 3) / 4);
}
function fmtSize(n) {
  if (!n) return "0 KB";
  return (n / 1024).toFixed(1) + " KB";
}
function dataToBlob(data, mime) {
  const raw = String(data || "");
  const comma = raw.indexOf(",");
  const header = comma >= 0 ? raw.slice(0, comma) : "";
  const b64 = comma >= 0 ? raw.slice(comma + 1) : raw;
  const m = /data:([^;]+)/.exec(header);
  const type = mime || (m && m[1]) || "application/octet-stream";
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type });
}
function openInNewTab(rec) {
  if (!rec?.data) return false;
  const mime = rec.mimeType || "application/octet-stream";
  const blob = dataToBlob(rec.data, mime);
  const url = URL.createObjectURL(blob);
  const w = window.open(url, "_blank", "noopener,noreferrer");
  if (!w) {
    URL.revokeObjectURL(url);
    return false;
  }
  setTimeout(() => { try { URL.revokeObjectURL(url); } catch (_) {} }, 60000);
  return true;
}
function whenTs(t) {
  try {
    const d = t && t.toDate ? t.toDate() : t ? new Date(t) : null;
    if (!d || Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  } catch { return ""; }
}

function field(name, label, inner, err) {
  return `<div class="pv2-field ${name==="address"||name==="bio"?"span":""}"><label>${esc(label)}</label>${inner}${err?`<span class="pv2-err">${esc(err)}</span>`:""}</div>`;
}

function docBox(kind, rec, label, accept) {
  if (rec && rec.fileName) {
    return `<div class="pv2-drop" data-kind="${esc(kind)}">
      <strong>${esc(label)}</strong>
      <p>${esc(rec.fileName)} · ${fmtSize(rec.size)} · ${esc(whenTs(rec.updatedAt) || "Ready")}</p>
      <div class="pv2-acts">
        <button type="button" class="pv2-ghost" data-pv2-view="${esc(kind)}">View</button>
        <button type="button" class="pv2-ghost" data-pv2-replace="${esc(kind)}">Replace</button>
        <button type="button" class="pv2-ghost" data-pv2-del="${esc(kind)}">Delete</button>
      </div>
      <input type="file" accept="${esc(accept)}" hidden data-pv2-file="${esc(kind)}" />
    </div>`;
  }
  return `<div class="pv2-drop" data-kind="${esc(kind)}" data-pv2-drop="${esc(kind)}">
    <div class="pv2-empty">
      <p><strong>${esc(label)}</strong></p>
      <p>Drag and drop or click to upload</p>
    </div>
    <input type="file" accept="${esc(accept)}" hidden data-pv2-file="${esc(kind)}" />
  </div>`;
}

function paint(host, opts) {
  const f = state.form;
  const { n, t } = filledCount(f);
  const pct = Math.round((n / t) * 100);
  const av = f.photoDataUrl
    ? `<div class="pv2-av"><img alt="Your photo" src="${esc(f.photoDataUrl)}" /></div>`
    : `<div class="pv2-av" aria-hidden="true">${esc(initials(f.name))}</div>`;
  host.innerHTML = `<div class="pv2-wrap">
    <div class="pv2-card pv2-head">
      ${av}
      <div style="flex:1;min-width:0">
        <h2 class="pv2-name">${esc(f.name || "Your name")}</h2>
        <p class="pv2-sid">${state.studentId ? "ID " + esc(state.studentId) : "ID Not assigned yet"}${state.studentId ? ` <button type="button" class="pv2-ghost" data-pv2-copyid>Copy</button>` : ""}</p>
        <p class="pv2-mail">${esc(state.email)} <span class="pv2-ok">Verified</span> <span class="pv2-role">Student</span></p>
        <p class="pv2-hint">Complete your profile to speed up certificates and registration</p>
        <div class="pv2-bar" aria-label="Profile completion ${pct}%"><i style="width:${pct}%"></i></div>
        <div class="pv2-photo"><button type="button" class="pv2-ghost" data-pv2-photo>Upload photo</button>
        <input type="file" accept="image/jpeg,image/png" hidden data-pv2-photo-file /></div>
      </div>
    </div>
    <div class="pv2-card">
      <h3 class="pv2-h">Personal information</h3>
      <div class="pv2-grid">
        ${field("name","Full name",`<input data-pv2-k="name" value="${esc(f.name)}" />`, state.errs.name)}
        ${field("studentId","Student ID",`<div class="pv2-idrow"><input value="${esc(state.studentId || "Not assigned yet")}" readonly />${state.studentId ? `<button type="button" class="pv2-ghost" data-pv2-copyid>Copy</button>` : ""}</div>`)}
        ${field("phone","Mobile number", phonePickerHtml(f), state.errs.phone)}
        ${field("dateOfBirth","Date of birth",`<input type="date" data-pv2-k="dateOfBirth" value="${esc(f.dateOfBirth)}" />`, state.errs.dateOfBirth)}
        ${field("gender","Gender (optional)",`<select data-pv2-k="gender"><option value="">Prefer not to say</option><option${f.gender==="Female"?" selected":""}>Female</option><option${f.gender==="Male"?" selected":""}>Male</option><option${f.gender==="Other"?" selected":""}>Other</option></select>`)}
        ${field("nationality","Nationality",`<select data-pv2-k="nationality">${countryOpts(f.nationality)}</select>`)}
        ${field("countryOfResidence","Country of residence",`<select data-pv2-k="countryOfResidence">${countryOpts(f.countryOfResidence)}</select>`)}
        ${field("cityOfResidence","City of residence",`<input data-pv2-k="cityOfResidence" value="${esc(f.cityOfResidence)}" />`)}
        ${field("address","Address (optional)",`<input data-pv2-k="address" value="${esc(f.address)}" />`)}
      </div>
    </div>
    <div class="pv2-card">
      <h3 class="pv2-h">Professional background</h3>
      <div class="pv2-grid">
        ${field("education","Education level",`<select data-pv2-k="education"><option value="">Select</option>${["High school","Diploma","Bachelor's","Master's","Doctorate","Other"].map((x)=>`<option${f.education===x?" selected":""}>${x}</option>`).join("")}</select>`)}
        ${field("jobTitle","Job title",`<input data-pv2-k="jobTitle" value="${esc(f.jobTitle)}" />`)}
        ${field("company","Company",`<input data-pv2-k="company" value="${esc(f.company)}" />`)}
        ${field("linkedin","LinkedIn URL",`<input data-pv2-k="linkedin" value="${esc(f.linkedin)}" placeholder="https://" />`)}
        ${field("bio","Short bio",`<textarea data-pv2-k="bio" maxlength="300" rows="3">${esc(f.bio)}</textarea><div class="pv2-count">${String(f.bio||"").length}/300</div>`, state.errs.bio)}
      </div>
    </div>
    <div class="pv2-card">
      <h3 class="pv2-h">Emergency contact</h3>
      <div class="pv2-grid">
        ${field("emergencyContactName","Name",`<input data-pv2-k="emergencyContactName" value="${esc(f.emergencyContactName)}" />`)}
        ${field("emergencyContactPhone","Phone",`<input data-pv2-k="emergencyContactPhone" value="${esc(f.emergencyContactPhone)}" placeholder="+971…" />`)}
      </div>
    </div>
    <div class="pv2-card">
      <h3 class="pv2-h">Documents</h3>
      <div class="pv2-docs">
        ${docBox("cv", state.cv, "CV / Resume", "application/pdf")}
        ${docBox("id", state.idf, "ID or Passport", "image/jpeg,image/png,application/pdf")}
      </div>
      <p class="pv2-lock">Only you and the academy admin can see your documents.</p>
    </div>
    <div class="pv2-sticky">
      <button type="button" class="pv2-ghost" data-pv2-discard ${state.dirty?"":"disabled"}>Discard</button>
      <button type="button" class="pv2-pri" data-pv2-save ${state.saving?"disabled":""}>${state.saving?"Saving…":"Save changes"}</button>
    </div>

  </div>`;
}

async function handleFile(kind, file, opts) {
  if (!file) return;
  const max = 650 * 1024;
  if (kind === "cv") {
    if (file.type !== "application/pdf") { alert("CV must be a PDF."); return; }
    if (file.size > max) { alert("That PDF is over 650 KB. Please upload a smaller file."); return; }
    const data = await readFileAsDataUrl(file);
    state.cv = { fileName: file.name, mimeType: file.type, size: file.size, data, updatedAt: new Date() };
  } else {
    if (file.type === "application/pdf") {
      if (file.size > max) { alert("That PDF is over 650 KB. Please upload a smaller file."); return; }
      const data = await readFileAsDataUrl(file);
      state.idf = { fileName: file.name, mimeType: file.type, size: file.size, data, updatedAt: new Date() };
    } else if (file.type === "image/jpeg" || file.type === "image/png") {
      const data = await compressWide(file);
      const size = sizeOfData(data);
      if (size > max) { alert("Could not compress that image under 650 KB. Try a smaller photo."); return; }
      state.idf = { fileName: file.name.replace(/\.\w+$/, ".jpg"), mimeType: "image/jpeg", size, data, updatedAt: new Date() };
    } else {
      alert("ID must be JPG, PNG, or PDF.");
      return;
    }
  }
  state.dirty = true;
  paint(opts.host, opts);
}

export async function renderProfileV2(opts) {
  const host = opts?.host;
  if (!host) return false;
  try {
    const db = opts.db;
    const uid = opts.uid;
    const { getDoc, doc, updateDoc, setDoc, deleteDoc, serverTimestamp } = opts.fs || {};
    if (!db || !uid || !getDoc) throw new Error("Missing profile load helpers");
    host.innerHTML = `<div class="pv2-wrap"><div class="pv2-skel"></div><div class="pv2-skel"></div></div>`;
    let uSnap;
    try { uSnap = await getDoc(doc(db, "users", uid)); }
    catch (e) { throw Object.assign(new Error(fbErr(e, "users getDoc")), { code: e.code }); }
    const u = uSnap.exists() ? (uSnap.data() || {}) : {};
    const form = emptyForm();
    for (const k of KEYS) form[k] = u[k] != null ? String(u[k]) : "";
    state.form = form;
    state.snap = { ...form };
    state.email = String(opts.email || u.email || "");
    state.studentId = String(u.studentId || "");
    const loadFile = async (type) => {
      try {
        const s = await getDoc(doc(db, "profileFiles", uid + "_" + type));
        if (!s.exists()) return null;
        const d = s.data() || {};
        return { fileName: d.fileName || "", mimeType: d.mimeType || "", size: d.size || 0, data: d.data || "", updatedAt: d.updatedAt || null };
      } catch (e) {
        if (e?.code === "not-found" || /not found/i.test(String(e?.message||""))) return null;
        throw Object.assign(new Error(fbErr(e, "profileFiles getDoc " + type)), { code: e.code });
      }
    };
    state.cv = await loadFile("cv");
    state.idf = await loadFile("id");
    state.cvSnap = state.cv ? { ...state.cv } : null;
    state.idSnap = state.idf ? { ...state.idf } : null;
    state.errs = {};
    state.dirty = false;
    state.toast = "";
    paint(host, opts);

    const fileInput = (kind) => {
      const wrap = host;
      const nodes = wrap.getElementsByTagName("input");
      for (const n of nodes) if (n.getAttribute("data-pv2-file") === kind) return n;
      return null;
    };

    host.onclick = async (e) => {
      const t = e.target?.closest?.("[data-pv2-photo],[data-pv2-save],[data-pv2-discard],[data-pv2-view],[data-pv2-replace],[data-pv2-del],[data-pv2-drop],[data-classic],[data-pv2-copyid]");
      if (!t) return;
      if (t.hasAttribute("data-classic")) { opts.onClassic?.(); return; }
      if (t.hasAttribute("data-pv2-copyid") && state.studentId) { try { navigator.clipboard.writeText(state.studentId); } catch (_) {} return; }
      if (t.hasAttribute("data-pv2-photo")) {
        const nodes = host.getElementsByTagName("input");
        for (const n of nodes) if (n.hasAttribute("data-pv2-photo-file")) { n.click(); break; }
        return;
      }
      if (t.hasAttribute("data-pv2-drop")) {
        const k = t.getAttribute("data-pv2-drop");
        fileInput(k)?.click();
        return;
      }
      if (t.hasAttribute("data-pv2-replace")) {
        fileInput(t.getAttribute("data-pv2-replace"))?.click();
        return;
      }
      if (t.hasAttribute("data-pv2-view")) {
        const k = t.getAttribute("data-pv2-view");
        const rec = k === "cv" ? state.cv : state.idf;
        if (!rec?.data) { alert("This file is not available to preview yet. Try Replace, then Save changes."); return; }
        if (!openInNewTab(rec)) alert("Allow popups to view your document in a new tab.");
        return;
      }
      if (t.hasAttribute("data-pv2-del")) {
        const k = t.getAttribute("data-pv2-del");
        if (k === "cv") state.cv = null; else state.idf = null;
        state.dirty = true;
        paint(host, opts);
        return;
      }
      if (t.hasAttribute("data-pv2-discard")) {
        state.form = { ...state.snap };
        state.cv = state.cvSnap ? { ...state.cvSnap } : null;
        state.idf = state.idSnap ? { ...state.idSnap } : null;
        state.dirty = false;
        state.errs = {};
        paint(host, opts);
        return;
      }
      if (t.hasAttribute("data-pv2-save")) {
        if (state.saving) return;
        const errs = validate(state.form);
        state.errs = errs;
        if (Object.keys(errs).length) { paint(host, opts); return; }
        const doSave = async () => {
        state.saving = true;
        paint(host, opts);
        try {
          const payload = {};
          for (const k of KEYS) payload[k] = state.form[k] || "";
          payload.profileUpdatedAt = serverTimestamp();
          await updateDoc(doc(db, "users", uid), payload);
          try { window.__ghzPingActivity?.(); } catch (_) {}
          const shown = String(state.form.name || "").trim();
          let nameNote = "Profile saved";
          if (shown && shown !== String(state.snap.name || "").trim()) {
            try {
              const { syncOwnNameCopies, paintLiveName } = await import("./nameSync.js");
              paintLiveName(shown);
              const res = await syncOwnNameCopies(uid, shown);
              if (res.failed.length) {
                const f = res.failed[0];
                nameNote = (f.code || "error") + " — " + f.collection + "." + f.field + (f.message ? ": " + f.message : "");
              } else {
                nameNote = "Name updated everywhere";
              }
            } catch (ne) {
              nameNote = (ne.code || "error") + " — name sync" + (ne.message ? ": " + ne.message : "");
            }
          } else if (shown) {
            try {
              const { paintLiveName } = await import("./nameSync.js");
              paintLiveName(shown);
            } catch (_) {}
          }
          const writeFile = async (type, rec, snap) => {
            const id = uid + "_" + type;
            if (!rec && snap) { await deleteDoc(doc(db, "profileFiles", id)); return; }
            if (!rec) return;
            if (snap && rec.data === snap.data && rec.fileName === snap.fileName) return;
            await setDoc(doc(db, "profileFiles", id), {
              uid, type, fileName: rec.fileName, mimeType: rec.mimeType, size: rec.size, data: rec.data, updatedAt: serverTimestamp()
            });
          };
          await writeFile("cv", state.cv, state.cvSnap);
          await writeFile("id", state.idf, state.idSnap);
          state.snap = { ...state.form };
          state.cvSnap = state.cv ? { ...state.cv } : null;
          state.idSnap = state.idf ? { ...state.idf } : null;
          state.dirty = false;
          state.saving = false;
          state.toast = "";
          paint(host, opts);
          showNoticeDialog({ tone: "ok", title: "Saved", message: "Your profile has been updated.", autoCloseMs: 1500 });
        } catch (err) {
          state.saving = false;
          paint(host, opts);
          showNoticeDialog({
            tone: "danger",
            title: "Could not save",
            message: fbErr(err, "save profile"),
            retry: true,
            onRetry: () => doSave()
          });
        }
        };
        doSave();
      }
    };
    host.onchange = async (e) => {
      if (e.target?.hasAttribute?.("data-pv2-phone-iso") || e.target?.hasAttribute?.("data-pv2-phone-local")) {
        const iso = host.querySelector("[data-pv2-phone-iso]")?.value || "LB";
        const local = host.querySelector("[data-pv2-phone-local]")?.value || "";
        const pack = buildPhone(iso, local);
        state.form.phone = pack.phone;
        state.form.phoneCountry = pack.phoneCountry;
        state.form.phoneDial = pack.phoneDial;
        state.dirty = true;
        if (e.target.hasAttribute("data-pv2-phone-iso")) paint(host, opts);
        return;
      }
      const k = e.target?.getAttribute?.("data-pv2-k");
      if (k) {
        state.form[k] = e.target.value;
        state.dirty = true;
        if (k === "bio") paint(host, opts);
        return;
      }
      if (e.target?.hasAttribute?.("data-pv2-photo-file")) {
        const file = e.target.files && e.target.files[0];
        if (file) {
          state.form.photoDataUrl = await compressSquare(file);
          state.dirty = true;
          paint(host, opts);
        }
        return;
      }
      const kind = e.target?.getAttribute?.("data-pv2-file");
      if (kind) await handleFile(kind, e.target.files && e.target.files[0], opts);
    };
    host.oninput = (e) => {
      const k = e.target?.getAttribute?.("data-pv2-k");
      if (!k) return;
      state.form[k] = e.target.value;
      state.dirty = true;
    };
    host.ondragover = (e) => { e.preventDefault(); };
    host.ondrop = async (e) => {
      e.preventDefault();
      const box = e.target?.closest?.("[data-kind]");
      const kind = box?.getAttribute?.("data-kind");
      const file = e.dataTransfer?.files?.[0];
      if (kind && file) await handleFile(kind, file, opts);
    };
    opts.onReady?.();
    return true;
  } catch (e) {
    const code = fbErr(e, "load profile");
    host.innerHTML = `<div class="pv2-fail"><p>Could not load profile (${esc(code)})</p><button class="btn btn-sm" type="button" data-classic>Use classic view</button></div>`;
    host.onclick = (ev) => { if (ev.target?.closest?.("[data-classic]")) opts.onClassic?.(); };
    return false;
  }
}
