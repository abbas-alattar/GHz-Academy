import { createElement as e, useEffect, useMemo, useState, Component, useRef } from "https://esm.sh/react@18.3.1";
import { createRoot } from "https://esm.sh/react-dom@18.3.1/client";
import { sortedCountries, detectCountry, flagUrl, buildPhone } from "./phoneCountries.js";
import { courseStatusLabel, statusChipShort } from "./courseStatusLabel.js";

function showSecErr(host, err, retry) {
  if (!host) return;
  const msg = String((err && (err.message || err.code)) || err || "error");
  host.innerHTML = '<div style="margin:16px;padding:16px;background:#fff;border:1px solid #E5EAF1;border-radius:14px;max-width:480px;font-family:system-ui,sans-serif"><p style="margin:0 0 8px;font-weight:650">This section could not load</p><p style="margin:0 0 12px;color:#64748B;font-size:14px"></p><button type="button" style="height:36px;padding:0 14px;border:0;border-radius:10px;background:#2563EB;color:#fff;font-weight:600;cursor:pointer">Retry</button></div>';
  const p = host.querySelector("p:nth-of-type(2)");
  if (p) p.textContent = msg;
  const b = host.querySelector("button");
  if (b) b.onclick = () => { try { retry(); } catch (e2) { showSecErr(host, e2, retry); } };
}

class Boundary extends Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err) { console.error("TrainerFormV2", err); }
  render() {
    if (this.state.err) {
      return e("div", { className: "tfv2-dim" },
        e("div", { className: "tfv2", style: { padding: 24 } },
          e("p", null, "Form could not load"),)
      );
    }
    return this.props.children;
  }
}

const SPECS = ["Wireless Communications", "RAN Planning", "Core Network", "Antenna Design", "Fiber Optics", "RF Engineering", "5G", "6G"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function ico(d) {
  return e("svg", { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "#94A3B8", strokeWidth: "2" }, e("path", { d }));
}
function stClass(s) {
  if (s === "Open") return "open";
  if (s === "Coming soon") return "soon";
  return "gray";
}
function trainerNote(c, users, selfId) {
  const ids = (c.trainerIds || []).filter((id) => id && id !== selfId);
  if (!ids.length) return "";
  const names = ids.map((id) => (users.find((u) => u.id === id || u.uid === id) || {}).name).filter(Boolean);
  return names.length ? "Trainer: " + names.join(", ") : "";
}

function PhoneField({ iso, local, onIso, onLocal }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const all = sortedCountries();
    const s = q.trim().toLowerCase();
    if (!s) return all;
    return all.filter((c) => c.name.toLowerCase().includes(s) || c.dial.includes(s) || c.iso.toLowerCase().includes(s));
  }, [q]);
  const cur = sortedCountries().find((c) => c.iso === iso) || sortedCountries()[0];
  useEffect(() => {
    if (!open) return;
    const onKey = (ev) => { if (ev.key === "Escape") setOpen(false); };
    const onDoc = (ev) => { if (!ev.target.closest?.(".tfv2-ph")) setOpen(false); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDoc);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("mousedown", onDoc); };
  }, [open]);
  return e("div", { className: "tfv2-ph", style: { position: "relative" } },
    e("label", null, "Phone number",
      e("div", { className: "tfv2-phone" },
        e("button", { type: "button", className: "tfv2-cc", "aria-expanded": open, onClick: () => setOpen((v) => !v) },
          e("img", { src: flagUrl(cur.iso), width: 22, height: 16, alt: cur.name + " flag" }),
          e("span", null, cur.dial)
        ),
        e("input", { value: local, inputMode: "tel", placeholder: "Optional", "aria-label": "Phone number", onChange: (ev) => onLocal(ev.target.value) })
      )
    ),
    open ? e("div", { className: "tfv2-dd", role: "listbox" },
      e("input", { autoFocus: true, placeholder: "Search country or code", value: q, onChange: (ev) => setQ(ev.target.value) }),
      list.map((c) => e("button", { type: "button", key: c.iso, onClick: () => { onIso(c.iso); setOpen(false); } },
        e("img", { src: flagUrl(c.iso), width: 22, height: 16, alt: c.name + " flag" }),
        e("span", { style: { flex: 1 } }, c.name),
        e("span", { style: { color: "#64748B" } }, c.dial)
      ))
    ) : null
  );
}

function Form(props) {
  const { trainer = {}, courses = [], users = [], onClose, onSave, welcome } = props;
  const edit = Boolean(trainer.id);
  const first = useRef(null);
  const [name, setName] = useState(trainer.name || "");
  const [email, setEmail] = useState(trainer.email || "");
  const [specialty, setSpecialty] = useState(trainer.specialty || "");
  const [iso, setIso] = useState(trainer.phoneCountry || detectCountry().iso);
  const [local, setLocal] = useState(trainer.phone ? String(trainer.phone).replace(/^\+\d+/, "") : "");
  const [bio, setBio] = useState(trainer.bio || "");
  const [assigned, setAssigned] = useState(() => courses.filter((c) => (c.trainerIds || []).includes(trainer.id)).map((c) => c.id));
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(false);
  const [errs, setErrs] = useState({});
  const [fail, setFail] = useState("");
  const [ok, setOk] = useState(null);

  useEffect(() => {
    const onKey = (ev) => { if (ev.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    first.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const emailTaken = useMemo(() => {
    const em = email.trim().toLowerCase();
    if (!em || edit) return false;
    return users.some((u) => String(u.email || "").toLowerCase() === em);
  }, [email, users, edit]);

  const validName = name.trim().length >= 2;
  const validEmail = EMAIL_RE.test(email.trim());
  const canSave = validName && validEmail && !emailTaken && !saving;

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return courses.filter((c) => !s || String(c.title || "").toLowerCase().includes(s));
  }, [courses, q]);

  const toggle = (id) => setAssigned((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const submit = async () => {
    const nextErr = {};
    if (!validName) nextErr.name = "Enter at least 2 characters";
    if (!validEmail) nextErr.email = "Enter a valid email";
    if (emailTaken) nextErr.email = "This email is already registered";
    setErrs(nextErr);
    if (Object.keys(nextErr).length) return;
    setSaving(true);
    setFail("");
    const phone = buildPhone(iso, local);
    const res = await onSave({
      trainer,
      name: name.trim(),
      email: email.trim(),
      specialty: specialty.trim(),
      bio: bio.trim().slice(0, 300),
      assigned,
      phone: phone.phone || "",
      phoneCountry: phone.phoneCountry || iso,
      phoneDial: phone.phoneDial || ""
    });
    setSaving(false);
    if (res?.ok === false) {
      if (res.duplicate) setErrs({ email: "This email is already registered" });
      setFail(res.error || "");
      return;
    }
    if (!edit && res?.welcome) setOk(res);
    else onClose();
  };

  if (ok) {
    return e("div", { className: "tfv2-dim", onClick: onClose },
      e("div", { className: "tfv2", onClick: (ev) => ev.stopPropagation() },
        e("div", { className: "tfv2-h" },
          e("div", null, e("h2", null, "Trainer created"), e("p", null, ok.name)),
          e("button", { type: "button", className: "tfv2-x", "aria-label": "Close", onClick: onClose }, "×")
        ),
        e("div", { className: "tfv2-b" },
          e("div", { className: "tfv2-ok" },
            e("div", { className: "tfv2-ok-ic", "aria-hidden": "true" }, "✓"),
            e("strong", null, ok.name),
            e("span", null, ok.email),
            e("pre", null, ok.welcome),
            e("button", { type: "button", className: "tfv2-save", onClick: async () => { try { await navigator.clipboard.writeText(ok.welcome); } catch (_) {} } }, "Copy welcome message"),
            e("button", { type: "button", className: "tfv2-can", onClick: onClose }, "Done")
          )
        )
      )
    );
  }

  return e("div", { className: "tfv2-dim" },
    e("div", { className: "tfv2", role: "dialog", "aria-labelledby": "tfv2t", onClick: (ev) => ev.stopPropagation() },
      e("div", { className: "tfv2-h" },
        e("div", null,
          e("h2", { id: "tfv2t" }, edit ? "Edit trainer" : "Add trainer"),
          e("p", null, edit ? "Update this trainer’s profile and courses" : "They will receive an email to set their password")
        ),
        e("button", { type: "button", className: "tfv2-x", "aria-label": "Close", onClick: onClose }, "×")
      ),
      e("div", { className: "tfv2-b" },
        e("section", { className: "tfv2-sec" },
          e("h3", null, "👤 Personal info"),
          e("label", null, "Full name",
            e("div", { className: "tfv2-in" },
              ico("M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8"),
              e("input", { ref: first, className: "tfv2-pad", value: name, onChange: (ev) => setName(ev.target.value) })
            ),
            errs.name ? e("span", { className: "tfv2-err" }, errs.name) : null
          ),
          e("label", null, "Email",
            e("div", { className: "tfv2-in" },
              ico(edit ? "M12 15v2M7 11V8a5 5 0 0110 0v3M6 11h12v10H6z" : "M4 6h16v12H4zM4 6l8 7 8-7"),
              e("input", { className: "tfv2-pad", type: "email", value: email, disabled: edit, readOnly: edit, onChange: (ev) => setEmail(ev.target.value) })
            ),
            errs.email ? e("span", { className: "tfv2-err" }, errs.email) : null
          ),
          e("label", null, "Specialty",
            e("input", { value: specialty, list: "tfv2spec", onChange: (ev) => setSpecialty(ev.target.value) }),
            e("datalist", { id: "tfv2spec" }, SPECS.map((s) => e("option", { key: s, value: s })))
          ),
          e(PhoneField, { iso, local, onIso: setIso, onLocal: setLocal })
        ),
        e("section", { className: "tfv2-sec" },
          e("h3", null, "📚 Teaching"),
          e("label", null, "Short bio",
            e("textarea", { value: bio, maxLength: 300, onChange: (ev) => setBio(ev.target.value.slice(0, 300)) }),
            e("span", { className: "tfv2-help" }, bio.length + "/300")
          ),
          e("div", { className: "tfv2-pick" + (filtered.length > 8 ? " nest" : "") },
            e("div", { className: "tfv2-pick-h" },
              e("span", { className: "tfv2-pick-lab" }, "Courses to assign"),
              e("div", { className: "tfv2-links" },
                e("button", { type: "button", onClick: () => setAssigned(courses.map((c) => c.id)) }, "Select all"),
                e("button", { type: "button", onClick: () => setAssigned([]) }, "Clear")
              ),
              e("span", { className: "tfv2-help" }, assigned.length + " selected")
            ),
            e("div", { className: "tfv2-search" },
              ico("M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3"),
              e("input", { placeholder: "Search courses", "aria-label": "Search courses", value: q, onChange: (ev) => setQ(ev.target.value) })
            ),
            e("div", { className: "tfv2-clist", onWheel: filtered.length > 8 ? (ev) => ev.stopPropagation() : undefined },
              (() => {
                const sel = filtered.filter((c) => assigned.includes(c.id));
                const rest = filtered.filter((c) => !assigned.includes(c.id));
                const card = (c) => {
                  const on = assigned.includes(c.id);
                  const note = trainerNote(c, users, trainer.id);
                  return e("button", { type: "button", key: c.id, className: "tfv2-ccard" + (on ? " on" : ""), onClick: () => toggle(c.id) },
                    e("span", { className: "tfv2-ck", "aria-hidden": "true" }, on ? e("svg", { width: 12, height: 12, viewBox: "0 0 24 24", fill: "none", stroke: "#FFFFFF", strokeWidth: "3" }, e("path", { d: "M5 12l5 5L20 7", strokeLinecap: "round", strokeLinejoin: "round" })) : null),
                    e("span", { className: "tfv2-cmain" },
                      e("strong", { className: "tfv2-ctitle" }, c.title || c.id),
                      e("span", { className: "tfv2-cmeta" }, (c.level || "Level") + " · " + courseStatusLabel(c),
                        note ? e("span", { className: "tfv2-amber" }, " · " + note) : null)
                    ),
                    e("span", { className: "tfv2-st " + stClass(c.status), title: courseStatusLabel(c) }, statusChipShort(c))
                  );
                };
                return [
                  sel.length ? e("div", { className: "tfv2-g", key: "a" }, "Assigned (" + sel.length + ")") : null,
                  ...sel.map(card),
                  rest.length ? e("div", { className: "tfv2-g", key: "b" }, "Available (" + rest.length + ")") : null,
                  ...rest.map(card)
                ];
              })()
            )
          )
        ),
        fail ? e("p", { className: "tfv2-err" }, fail) : null
      ),
      e("div", { className: "tfv2-f" },
        e("div", { className: "tfv2-f-r" },
          e("button", { type: "button", className: "tfv2-can", onClick: onClose }, "Cancel"),
          e("button", { type: "button", className: "tfv2-save", disabled: !canSave, onClick: submit },
            saving ? e("span", null, e("span", { className: "tfv2-spin" }), edit ? "Saving…" : "Creating…") : (edit ? "Save changes" : "Create trainer")
          )
        )
      )
    )
  );
}

let root;
export function unmountTrainerFormV2() {
  try { if (root) root.unmount(); } catch (_) {}
  root = null;
}
export function bootTrainerFormV2(host, opts = {}) {
  if (!host) return false;
  try {
    unmountTrainerFormV2();
    host.replaceChildren();
    root = createRoot(host);
    const close = () => { unmountTrainerFormV2(); opts?.onClose?.(); };
    root.render(e(Boundary, null, e(Form, { ...(opts || {}), onClose: close })));
    return true;
  } catch (err) {
    console.error("TrainerFormV2 boot", err);
    unmountTrainerFormV2();
    return false;
  }
}
