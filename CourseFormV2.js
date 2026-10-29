import { createElement as e, useEffect, useMemo, useState, Component } from "https://esm.sh/react@18.3.1";
import { createRoot } from "https://esm.sh/react-dom@18.3.1/client";
import { db } from "./firebase-config.js?v=auth8";
import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

class Boundary extends Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err) { console.error("CourseFormV2", err); }
  render() {
    if (this.state.err) {
      return e("div", { className: "cfv2-dim" },
        e("div", { className: "cfv2", style: { padding: 24 } },
          e("p", null, "Form could not load"),)
      );
    }
    return this.props.children;
  }
}

function compressCover(file) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\/(jpeg|jpg|png|webp)$/i.test(file.type) && !/\.(jpe?g|png|webp)$/i.test(file.name || "")) {
      reject(new Error("not-image"));
      return;
    }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, 800 / img.width);
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      let q = 0.82;
      let data = canvas.toDataURL("image/jpeg", q);
      const tooBig = () => {
        const b64 = data.split(",")[1] || "";
        try { return atob(b64).length > 200 * 1024; } catch { return data.length > 270000; }
      };
      while (tooBig() && q > 0.35) {
        q -= 0.08;
        data = canvas.toDataURL("image/jpeg", q);
      }
      URL.revokeObjectURL(url);
      if (tooBig()) reject(new Error("too large"));
      else resolve(data);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("not-image")); };
    img.src = url;
  });
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const LEVELS = ["Foundation", "Intermediate", "Advanced"];
const STATUSES = ["Draft", "Open", "Coming soon", "Closed", "Completed", "Archived"];
const ZONES = [
  { id: "Asia/Beirut", label: "Beirut time" },
  { id: "UTC", label: "UTC" },
  { id: "Europe/London", label: "London" },
  { id: "America/New_York", label: "New York" }
];

function parseTime(raw) {
  const s = String(raw || "");
  const m = s.match(/(\d{1,2}:\d{2}\s*(?:AM|PM)?)\s*[-–]\s*(\d{1,2}:\d{2}\s*(?:AM|PM)?)/i);
  if (m) return { from: to24(m[1]), to: to24(m[2]), zone: /beirut/i.test(s) ? "Asia/Beirut" : "Asia/Beirut" };
  return { from: "18:00", to: "20:00", zone: "Asia/Beirut" };
}
function to24(t) {
  const x = String(t).trim();
  const am = /am/i.test(x), pm = /pm/i.test(x);
  const [h0, m0] = x.replace(/[^\d:]/g, "").split(":");
  let h = Number(h0) || 0;
  const mm = String(m0 || "00").padStart(2, "0");
  if (pm && h < 12) h += 12;
  if (am && h === 12) h = 0;
  return String(h).padStart(2, "0") + ":" + mm;
}
function pretty(hhmm) {
  const [h, m] = String(hhmm || "00:00").split(":").map(Number);
  const ap = h >= 12 ? "PM" : "AM";
  const hr = ((h + 11) % 12) + 1;
  return hr + ":" + String(m || 0).padStart(2, "0") + " " + ap;
}

function Field({ label, children, help, err, htmlFor }) {
  return e("label", { htmlFor }, label, children, err ? e("span", { className: "cfv2-err" }, err) : help ? e("span", { className: "cfv2-help" }, help) : null);
}

function Form({ course, trainers: trainersProp, onClose, onSave }) {
  const c = course || {};
  const [trainers, setTrainers] = useState(Array.isArray(trainersProp) ? trainersProp : []);
  const [trLoad, setTrLoad] = useState(!Array.isArray(trainersProp));
  const [trErr, setTrErr] = useState("");
  const loadTrainers = async () => {
    setTrLoad(true); setTrErr("");
    try {
      const snap = await getDocs(query(collection(db, "users"), where("role", "==", "trainer")));
      const list = snap.docs.map((d) => {
        const x = d.data() || {};
        return { id: d.id, uid: x.uid || d.id, name: x.name || x.displayName || "Trainer", email: x.email || "" };
      });
      setTrainers(list);
    } catch (er) {
      setTrErr(String(er?.message || er || "error"));
      setTrainers([]);
    } finally { setTrLoad(false); }
  };
  useEffect(() => {
    if (Array.isArray(trainersProp) && trainersProp.length) { setTrainers(trainersProp); setTrLoad(false); return; }
    loadTrainers();
  }, []);
  const parsed = parseTime(c.sessionTime);
  const [title, setTitle] = useState(c.title || "");
  const [short, setShort] = useState(c.short || "");
  const [full, setFull] = useState(c.full || "");
  const [outline, setOutline] = useState(Array.isArray(c.outline) ? c.outline.map((m) => ({ title: m.title || "", description: m.description || "" })) : []);
  const [duration, setDuration] = useState(c.duration || "");
  const [days, setDays] = useState(Array.isArray(c.days) ? [...c.days] : []);
  const [from, setFrom] = useState(parsed.from);
  const [to, setTo] = useState(parsed.to);
  const [zone, setZone] = useState(parsed.zone);
  const [prerequisites, setPrerequisites] = useState(c.prerequisites || "");
  const [level, setLevel] = useState(c.level || "Intermediate");
  const [price, setPrice] = useState(c.price || 0);
  const [currency, setCurrency] = useState(c.currency || "USD");
  const [startDate, setStartDate] = useState(c.startDate || "");
  const [endDate, setEndDate] = useState(c.endDate || "");
  const [status, setStatus] = useState(c.status || "Draft");
  const [trainerIds, setTrainerIds] = useState(Array.isArray(c.trainerIds) ? c.trainerIds : []);
  const [coverImage, setCoverImage] = useState(c.coverImage || "");
  const [coverErr, setCoverErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [errs, setErrs] = useState({});
  const [drag, setDrag] = useState(null);

  useEffect(() => {
    const onKey = (ev) => { if (ev.key === "Escape" && !saving) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [saving, onClose]);

  const sessionTime = useMemo(() => {
    const z = (ZONES.find((z) => z.id === zone) || ZONES[0]).label;
    return pretty(from) + " – " + pretty(to) + ", " + z;
  }, [from, to, zone]);

  const toggleDay = (d) => setDays((cur) => cur.includes(d) ? cur.filter((x) => x !== d) : DAYS.filter((x) => cur.includes(x) || x === d));
  const toggleTr = (id) => setTrainerIds((cur) => cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
  const move = (i, j) => setOutline((list) => {
    const n = [...list];
    if (j < 0 || j >= n.length) return n;
    const [it] = n.splice(i, 1);
    n.splice(j, 0, it);
    return n;
  });

  const save = async () => {
    const next = {};
    if (!String(title).trim()) next.title = "Enter a title";
    if (endDate && startDate && endDate < startDate) next.endDate = "End date must be on or after the start date";
    setErrs(next);
    if (Object.keys(next).length) return;
    setSaving(true);
    try {
      await onSave({
        id: c.id,
        title, short, full, outline, duration, days, sessionTime, prerequisites, level,
        price: Number(price || 0), currency, startDate, endDate: String(endDate || "").trim(), status, trainerIds,
        coverImage: coverImage || ""
      });
    } finally { setSaving(false); }
  };

  return e("div", { className: "cfv2-dim", onClick: (ev) => { if (ev.target === ev.currentTarget && !saving) onClose(); } },
    e("div", { className: "cfv2", role: "dialog", "aria-modal": "true" },
      e("div", { className: "cfv2-h" },
        e("div", null, e("h2", null, c.id ? "Edit course" : "Add course"), e("p", null, title || "Untitled course")),
        e("button", { type: "button", className: "cfv2-x", "aria-label": "Close", onClick: onClose }, "×")
      ),
      e("div", { className: "cfv2-b" },
        e("section", { className: "cfv2-sec" },
          e("h3", null, "Basics"),
          e(Field, { label: "Title", err: errs.title }, e("input", { id: "ctitle", value: title, onChange: (ev) => setTitle(ev.target.value) })),
          e(Field, { label: "Short description", help: String(short).length + "/140" }, e("input", { id: "cshort", maxLength: 140, value: short, onChange: (ev) => setShort(ev.target.value.slice(0, 140)) })),
          e("div", null, e("span", { style: { fontSize: 13, fontWeight: 600 } }, "Level"),
            e("div", { className: "cfv2-pills", style: { marginTop: 8 } }, LEVELS.map((lv) => e("button", { type: "button", key: lv, className: "cfv2-pill" + (level === lv ? " on" : ""), onClick: () => setLevel(lv) }, lv))),
            e("input", { id: "clev", type: "hidden", value: level })
          ),
          e(Field, { label: "Duration" }, e("input", { id: "cdur", value: duration, onChange: (ev) => setDuration(ev.target.value) })),
          e("div", null,
            e("span", { style: { fontSize: 13, fontWeight: 600 } }, "Cover image"),
            e("p", { className: "cfv2-help" }, "Optional JPG or PNG. Recommended 16:9."),
            e("input", { id: "ccover", type: "file", accept: "image/jpeg,image/png,.jpg,.jpeg,.png", style: { display: "none" }, onChange: async (ev) => {
              const file = ev.target.files && ev.target.files[0];
              ev.target.value = "";
              if (!file) return;
              setCoverErr("");
              try {
                const data = await compressCover(file);
                setCoverImage(data);
              } catch (er) {
                setCoverErr(er && er.message === "too large" ? "That file is too large. Use a smaller image." : "Please choose a JPG or PNG image.");
              }
            } }),
            coverImage ? e("div", { className: "cfv2-cover" },
              e("img", { src: coverImage, alt: "Cover preview" }),
              e("div", { className: "cfv2-cover-acts" },
                e("button", { type: "button", className: "cfv2-can", onClick: () => document.getElementById("ccover")?.click() }, "Replace"),
                e("button", { type: "button", className: "cfv2-ib red", onClick: () => { setCoverImage(""); setCoverErr(""); } }, "Remove")
              )
            ) : e("button", { type: "button", className: "cfv2-can", onClick: () => document.getElementById("ccover")?.click() }, "Upload cover"),
            coverErr ? e("span", { className: "cfv2-err" }, coverErr) : null
          )
        ),
        e("section", { className: "cfv2-sec" },
          e("h3", null, "Content"),
          e(Field, { label: "Full description" }, e("textarea", { id: "cfull", value: full, onChange: (ev) => setFull(ev.target.value) })),
          e("div", null, e("span", { style: { fontSize: 13, fontWeight: 600 } }, "Outline"),
            outline.map((m, i) => e("div", {
              className: "cfv2-mod", key: i, draggable: true,
              onDragStart: () => setDrag(i),
              onDragOver: (ev) => ev.preventDefault(),
              onDrop: () => { if (drag != null) move(drag, i); setDrag(null); }
            },
              e("span", { "aria-hidden": "true" }, "⋮⋮"),
              e("span", { className: "cfv2-num" }, String(i + 1)),
              e("div", { style: { display: "grid", gap: 6 } },
                e("input", { "data-mt": true, placeholder: "Module title", value: m.title, onChange: (ev) => setOutline((list) => list.map((x, j) => j === i ? { ...x, title: ev.target.value } : x)) }),
                e("input", { "data-md": true, placeholder: "Short description", value: m.description, onChange: (ev) => setOutline((list) => list.map((x, j) => j === i ? { ...x, description: ev.target.value } : x)) })
              ),
              e("div", { style: { display: "flex", gap: 4 } },
                e("button", { type: "button", className: "cfv2-ib", "aria-label": "Move up", onClick: () => move(i, i - 1) }, "↑"),
                e("button", { type: "button", className: "cfv2-ib", "aria-label": "Move down", onClick: () => move(i, i + 1) }, "↓"),
                e("button", { type: "button", className: "cfv2-ib red", "aria-label": "Remove", onClick: () => setOutline((list) => list.filter((_, j) => j !== i)) }, "🗑")
              )
            )),
            e("button", { type: "button", className: "cfv2-addm", id: "addMod", onClick: () => setOutline((list) => [...list, { title: "", description: "" }]) }, "+ Add module")
          )
        ),
        e("section", { className: "cfv2-sec" },
          e("h3", null, "Schedule"),
          e("div", null, e("span", { style: { fontSize: 13, fontWeight: 600 } }, "Delivery days"),
            e("div", { className: "cfv2-days", id: "cdays" }, DAYS.map((d) => e("button", {
              type: "button", key: d, "data-day": d, className: "cfv2-day" + (days.includes(d) ? " on" : ""), onClick: () => toggleDay(d)
            }, days.includes(d) ? "✓ " + d : d))),
            e("p", { className: "cfv2-help" }, days.length ? days.join(" · ") : "No days selected")
          ),
          e("div", { className: "cfv2-row2" },
            e(Field, { label: "From" }, e("input", { type: "time", value: from, onChange: (ev) => setFrom(ev.target.value) })),
            e(Field, { label: "To" }, e("input", { type: "time", value: to, onChange: (ev) => setTo(ev.target.value) }))
          ),
          e(Field, { label: "Timezone" }, e("select", { value: zone, onChange: (ev) => setZone(ev.target.value) }, ZONES.map((z) => e("option", { key: z.id, value: z.id }, z.label)))),
          e("p", { className: "cfv2-help" }, pretty(from) + " – " + pretty(to) + " (" + (ZONES.find((z) => z.id === zone)?.label || "Beirut time") + ")"),
          e("input", { id: "ctime", type: "hidden", value: sessionTime }),
          e("div", { className: "cfv2-row2" },
            e(Field, { label: "Start date" }, e("input", { id: "cstart", type: "date", value: startDate, onChange: (ev) => setStartDate(ev.target.value) })),
            e(Field, { label: "End date", err: errs.endDate }, e("input", { id: "cend", type: "date", value: endDate, min: startDate || undefined, onChange: (ev) => setEndDate(ev.target.value) }))
          ),
          e(Field, { label: "Prerequisites" }, e("input", { id: "cpre", value: prerequisites, onChange: (ev) => setPrerequisites(ev.target.value) }))
        ),
        e("section", { className: "cfv2-sec" },
          e("h3", null, "Trainers & pricing"),
          e("div", null, e("span", { style: { fontSize: 13, fontWeight: 600 } }, "Trainer(s)"),
            trLoad ? e("p", { className: "cfv2-help" }, "Loading trainers…") : null,
            trErr ? e("p", { className: "cfv2-err" }, "Trainers could not load. ", e("button", { type: "button", className: "cfv2-can", onClick: loadTrainers }, "Retry")) : null,
            e("div", { className: "cfv2-train", id: "ctrain" }, (Array.isArray(trainers) ? trainers : []).map((t) => e("button", {
              type: "button", key: t.id, className: "cfv2-pill" + (trainerIds.includes(t.id) ? " on" : ""), onClick: () => toggleTr(t.id)
            }, t.name)))
          ),
          e("div", { className: "cfv2-row2" },
            e(Field, { label: "Price" }, e("input", { id: "cprice", type: "number", value: price, onChange: (ev) => setPrice(ev.target.value) })),
            e(Field, { label: "Currency" }, e("input", { id: "ccur", value: currency, onChange: (ev) => setCurrency(ev.target.value) }))
          ),
          e("div", null, e("span", { style: { fontSize: 13, fontWeight: 600 } }, "Status"),
            e("div", { className: "cfv2-pills", style: { marginTop: 8 } }, STATUSES.map((s) => e("button", { type: "button", key: s, className: "cfv2-pill" + (status === s ? " on" : ""), onClick: () => setStatus(s) }, s === "Coming soon" ? "Scheduled" : s === "Open" ? "On going" : s === "Closed" ? "On going · Registration closed" : s))),
            e("input", { id: "cstat", type: "hidden", value: status })
          ),
          (status === "Open" || status === "Closed" || status === "Coming soon") ? e("div", { className: "cfv2-regsw" },
            e("span", { style: { fontSize: 13, fontWeight: 600 } }, "Registration"),
            status === "Coming soon"
              ? e("p", { className: "cfv2-help" }, "Scheduled courses stay Coming soon. Registration stays open until you change status.")
              : e("div", { className: "cfv2-pills", style: { marginTop: 8 } },
                  e("button", { type: "button", className: "cfv2-pill" + (status === "Open" ? " on" : ""), onClick: () => setStatus("Open") }, "Open"),
                  e("button", { type: "button", className: "cfv2-pill" + (status === "Closed" ? " on" : ""), onClick: () => setStatus("Closed") }, "Closed")
                ),
            e("p", { className: "cfv2-help" }, "Closed stops new registrations. Enrolled students are not affected.")
          ) : null
        ),),
      e("div", { className: "cfv2-f" },
        e("button", { type: "button", className: "cfv2-can", onClick: onClose, disabled: saving }, "Cancel"),
        e("button", { type: "button", className: "cfv2-save", id: "saveCourse", onClick: save, disabled: saving }, saving ? "Saving…" : "Save changes")
      )
    )
  );
}

let root;
export function unmountCourseFormV2() {
  try { if (root) root.unmount(); } catch (_) {}
  root = null;
}
export function bootCourseFormV2(host, opts = {}) {
  if (!host) return false;
  try {
    unmountCourseFormV2();
    host.replaceChildren();
    root = createRoot(host);
    const close = () => { unmountCourseFormV2(); opts?.onClose?.(); };
    root.render(e(Boundary, null, e(Form, { ...(opts || {}), onClose: close })));
    return true;
  } catch (err) {
    console.error("CourseFormV2 boot", err);
    unmountCourseFormV2();
    return false;
  }
}
