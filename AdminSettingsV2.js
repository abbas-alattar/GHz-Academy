import { createElement as e, useEffect, useState, Component } from "https://esm.sh/react@18.3.1";
import { createRoot } from "https://esm.sh/react-dom@18.3.1/client";
import { auth, db } from "./firebase-config.js?v=auth8";
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { COUNTRIES } from "./phoneCountries.js";

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
  componentDidCatch(err) { console.error("AdminSettingsV2", err); }
  render() {
    if (this.state.err) {
      return e("div", { className: "asv2" },
        e("p", { className: "asv2-err" }, String(this.state.err?.code || this.state.err?.message || this.state.err)),
        e("button", { type: "button", className: "asv2-save", onClick: () => this.setState({ err: null }) }, "Try again"),);
    }
    return this.props.children;
  }
}

function fbErr(err) { return err?.code || err?.message || String(err || "unknown"); }
function withTimeout(p, ms) {
  return Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error("deadline-exceeded"), { code: "deadline-exceeded" })), ms))
  ]);
}
async function loadDoc(id) {
  const snap = await withTimeout(getDoc(doc(db, "settings", id)), 10000);
  return snap.exists() ? (snap.data() || {}) : {};
}
function Toggle({ on, label, set }) {
  return e("div", { className: "asv2-toggle" },
    e("span", null, label),
    e("button", { type: "button", className: "asv2-sw" + (on ? " on" : ""), "aria-pressed": on, onClick: () => set(!on) }, e("i", null))
  );
}
function Field({ label, children }) {
  return e("div", { className: "asv2-field" }, e("label", null, label), children);
}
function SaveBar({ saving, saved, err, onSave }) {
  return e("div", { className: "asv2-actions" },
    e("button", { type: "button", className: "asv2-save", disabled: saving, onClick: onSave }, saving ? "Saving…" : "Save"),
    saved ? e("span", { className: "asv2-ok" }, "Saved") : null,
    err ? e("span", { className: "asv2-err" }, err) : null
  );
}

const SECTIONS = [
  { id: "academy", label: "Academy" },
  { id: "payment", label: "Payment" },
  { id: "registration", label: "Registration" },
  { id: "certificates", label: "Certificates" },
  { id: "notifications", label: "Notifications" },
  { id: "account", label: "Account" }
];

function App({ user }) {
  const [sec, setSec] = useState("academy");
  const [dirty, setDirty] = useState({});
  const [academy, setAcademy] = useState({ name: "", supportEmail: "", phone: "", phoneDial: "+961", website: "", address: "", linkedin: "", facebook: "", instagram: "", youtube: "", certificate: { signerName: "", signerTitle: "", lineUnderTitle: "" } });
  const [payment, setPayment] = useState({ text: "" });
  const [policies, setPolicies] = useState({ allowRegistrations: true, requirePaymentConfirm: true, currency: "USD", closedMessage: "" });
  const [notes, setNotes] = useState({ newRegistration: true, newMessage: true, paymentConfirmed: true });
  const [load, setLoad] = useState({ academy: true, payment: true, policies: true, notifications: true });
  const [lerr, setLerr] = useState({});
  const [saving, setSaving] = useState({});
  const [saved, setSaved] = useState({});
  const [serr, setSerr] = useState({});
  const [resetMsg, setResetMsg] = useState("");
  const [resetErr, setResetErr] = useState("");
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");
  const [syncErr, setSyncErr] = useState("");

  const mark = (k) => setDirty((d) => ({ ...d, [k]: true }));

  const fetchOne = async (id, apply) => {
    setLoad((s) => ({ ...s, [id]: true }));
    setLerr((s) => ({ ...s, [id]: null }));
    try {
      const data = await loadDoc(id);
      apply(data);
      setLoad((s) => ({ ...s, [id]: false }));
    } catch (err) {
      apply({});
      setLerr((s) => ({ ...s, [id]: fbErr(err) }));
      setLoad((s) => ({ ...s, [id]: false }));
    }
  };

  useEffect(() => {
    fetchOne("academy", (d) => setAcademy((a) => ({
      ...a,
      name: d.name || "",
      supportEmail: d.supportEmail || "",
      phone: d.phone || "",
      phoneDial: d.phoneDial || "+961",
      website: d.website || "",
      address: d.address || "",
      linkedin: d.linkedin || "",
      facebook: d.facebook || "",
      instagram: d.instagram || "",
      youtube: d.youtube || "",
      certificate: {
        signerName: d.certificate?.signerName || "",
        signerTitle: d.certificate?.signerTitle || "",
        lineUnderTitle: d.certificate?.lineUnderTitle || ""
      }
    })));
    fetchOne("payment", (d) => setPayment({ text: d.text || "" }));
    fetchOne("policies", (d) => setPolicies({
      allowRegistrations: d.allowRegistrations !== false,
      requirePaymentConfirm: d.requirePaymentConfirm !== false,
      currency: d.currency || "USD",
      closedMessage: d.closedMessage || ""
    }));
    fetchOne("notifications", (d) => setNotes({
      newRegistration: d.newRegistration !== false,
      newMessage: d.newMessage !== false,
      paymentConfirmed: d.paymentConfirmed !== false
    }));
  }, []);

  useEffect(() => {
    const go = (ev) => {
      if (Object.values(dirty).some(Boolean)) {
        ev.preventDefault();
        ev.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", go);
    return () => window.removeEventListener("beforeunload", go);
  }, [dirty]);

  const save = async (key, id, payload) => {
    setSaving((s) => ({ ...s, [key]: true }));
    setSerr((s) => ({ ...s, [key]: null }));
    setSaved((s) => ({ ...s, [key]: false }));
    try {
      await setDoc(doc(db, "settings", id), { ...payload, updatedAt: serverTimestamp() }, { merge: true });
      setSaving((s) => ({ ...s, [key]: false }));
      setSaved((s) => ({ ...s, [key]: true }));
      setDirty((d) => ({ ...d, [key]: false }));
    } catch (err) {
      setSaving((s) => ({ ...s, [key]: false }));
      setSerr((s) => ({ ...s, [key]: fbErr(err) }));
    }
  };

  const leaveSec = (id) => {
    if (dirty[sec] && !window.confirm("You have unsaved changes. Leave this section?")) return;
    setSec(id);
  };

  const sk = e("div", null, e("div", { className: "asv2-sk lg" }), e("div", { className: "asv2-sk" }), e("div", { className: "asv2-sk" }), e("div", { className: "asv2-sk lg" }));
  const loadErr = (id, retry) => e("div", null,
    e("p", { className: "asv2-err" }, lerr[id]),
    e("button", { type: "button", className: "asv2-save", onClick: retry }, "Try again")
  );

  let body = null;
  if (sec === "academy") {
    body = load.academy ? sk : lerr.academy ? loadErr("academy", () => fetchOne("academy", (d) => setAcademy((a) => ({ ...a, ...d, certificate: d.certificate || a.certificate })))) :
      e("div", null,
        e("h3", null, "Academy"),
        e(Field, { label: "Academy name" }, e("input", { value: academy.name, onChange: (ev) => { setAcademy({ ...academy, name: ev.target.value }); mark("academy"); } })),
        e(Field, { label: "Support email" }, e("input", { type: "email", value: academy.supportEmail, onChange: (ev) => { setAcademy({ ...academy, supportEmail: ev.target.value }); mark("academy"); } })),
        e(Field, { label: "Phone / WhatsApp" }, e("div", { className: "asv2-phone" },
          e("select", { value: academy.phoneDial, onChange: (ev) => { setAcademy({ ...academy, phoneDial: ev.target.value }); mark("academy"); } },
            COUNTRIES.map((c) => e("option", { key: c.iso, value: c.dial }, c.iso + " " + c.dial))
          ),
          e("input", { value: academy.phone, onChange: (ev) => { setAcademy({ ...academy, phone: ev.target.value }); mark("academy"); } })
        )),
        e(Field, { label: "Website" }, e("input", { value: academy.website, onChange: (ev) => { setAcademy({ ...academy, website: ev.target.value }); mark("academy"); } })),
        e(Field, { label: "Address" }, e("textarea", { style: { minHeight: 80 }, value: academy.address, onChange: (ev) => { setAcademy({ ...academy, address: ev.target.value }); mark("academy"); } })),
        e("div", { className: "asv2-row2" },
          e(Field, { label: "LinkedIn" }, e("input", { value: academy.linkedin, onChange: (ev) => { setAcademy({ ...academy, linkedin: ev.target.value }); mark("academy"); } })),
          e(Field, { label: "Facebook" }, e("input", { value: academy.facebook, onChange: (ev) => { setAcademy({ ...academy, facebook: ev.target.value }); mark("academy"); } }))
        ),
        e("div", { className: "asv2-row2" },
          e(Field, { label: "Instagram" }, e("input", { value: academy.instagram, onChange: (ev) => { setAcademy({ ...academy, instagram: ev.target.value }); mark("academy"); } })),
          e(Field, { label: "YouTube" }, e("input", { value: academy.youtube, onChange: (ev) => { setAcademy({ ...academy, youtube: ev.target.value }); mark("academy"); } }))
        ),
        e(SaveBar, { saving: saving.academy, saved: saved.academy, err: serr.academy, onSave: () => save("academy", "academy", {
          name: academy.name, supportEmail: academy.supportEmail, phone: academy.phone, phoneDial: academy.phoneDial,
          website: academy.website, address: academy.address, linkedin: academy.linkedin, facebook: academy.facebook,
          instagram: academy.instagram, youtube: academy.youtube, certificate: academy.certificate
        }) }),
        e("h3", { style: { marginTop: 28 } }, "Courses"),
        e("p", { className: "asv2-note" }, "Copy trainer names onto each course so students can see them."),
        e("button", { type: "button", className: "asv2-save", disabled: syncBusy, onClick: async () => {
          setSyncBusy(true); setSyncErr(""); setSyncMsg("");
          try {
            const [us, cs] = await Promise.all([
              withTimeout(getDocs(collection(db, "users")), 15000),
              withTimeout(getDocs(collection(db, "courses")), 15000)
            ]);
            const byId = {};
            us.docs.forEach((d) => { const x = d.data() || {}; byId[d.id] = x.name || x.displayName || ""; });
            let ok = 0, fail = 0;
            for (const d of cs.docs) {
              const c = d.data() || {};
              const ids = [].concat(c.trainerIds || c.trainerId || []).filter(Boolean).map(String);
              const trainerNames = ids.map((id) => String(byId[id] || "").trim());
              try {
                await updateDoc(doc(db, "courses", d.id), { trainerNames, trainerName: trainerNames[0] || "" });
                ok++;
              } catch { fail++; }
            }
            setSyncMsg("Updated " + ok + " course" + (ok === 1 ? "" : "s") + (fail ? ". " + fail + " failed." : "."));
          } catch (err) { setSyncErr(fbErr(err)); }
          setSyncBusy(false);
        } }, syncBusy ? "Syncing…" : "Sync trainer names"),
        syncMsg ? e("p", { className: "asv2-ok" }, syncMsg) : null,
        syncErr ? e("p", { className: "asv2-err" }, syncErr) : null
      );
  } else if (sec === "payment") {
    body = load.payment ? sk : lerr.payment ? loadErr("payment", () => fetchOne("payment", (d) => setPayment({ text: d.text || "" }))) :
      e("div", null,
        e("h3", null, "Payment"),
        e(Field, { label: "Payment instructions" }, e("textarea", { value: payment.text, onChange: (ev) => { setPayment({ text: ev.target.value }); mark("payment"); } })),
        e("div", { className: "asv2-count" }, String(payment.text.length) + " characters"),
        e("p", { className: "asv2-note" }, "Student preview"),
        e("div", { className: "asv2-preview" }, payment.text || "Students will see payment instructions here."),
        e(SaveBar, { saving: saving.payment, saved: saved.payment, err: serr.payment, onSave: () => save("payment", "payment", { text: payment.text }) })
      );
  } else if (sec === "registration") {
    body = load.policies ? sk : lerr.policies ? loadErr("policies", () => fetchOne("policies", (d) => setPolicies({
      allowRegistrations: d.allowRegistrations !== false, requirePaymentConfirm: d.requirePaymentConfirm !== false, currency: d.currency || "USD", closedMessage: d.closedMessage || ""
    }))) :
      e("div", null,
        e("h3", null, "Registration"),
        e(Toggle, { on: policies.allowRegistrations, label: "Allow new registrations", set: (v) => { setPolicies({ ...policies, allowRegistrations: v }); mark("registration"); } }),
        e(Toggle, { on: policies.requirePaymentConfirm, label: "Require admin confirmation of payment", set: (v) => { setPolicies({ ...policies, requirePaymentConfirm: v }); mark("registration"); } }),
        e(Field, { label: "Default currency" }, e("select", { value: policies.currency, onChange: (ev) => { setPolicies({ ...policies, currency: ev.target.value }); mark("registration"); } },
          e("option", { value: "USD" }, "USD")
        )),
        e(Field, { label: "Message when registration is closed" }, e("textarea", { style: { minHeight: 100 }, value: policies.closedMessage, onChange: (ev) => { setPolicies({ ...policies, closedMessage: ev.target.value }); mark("registration"); } })),
        e(SaveBar, { saving: saving.registration, saved: saved.registration, err: serr.registration, onSave: () => save("registration", "policies", policies) })
      );
  } else if (sec === "certificates") {
    const cert = academy.certificate || {};
    body = load.academy ? sk : lerr.academy ? loadErr("academy", () => fetchOne("academy", (d) => setAcademy((a) => ({ ...a, certificate: d.certificate || a.certificate })))) :
      e("div", null,
        e("h3", null, "Certificates"),
        e("p", { className: "asv2-note" }, "These fields are stored for later. The live certificate layout does not use them yet."),
        e(Field, { label: "Signer name" }, e("input", { value: cert.signerName || "", onChange: (ev) => { setAcademy({ ...academy, certificate: { ...cert, signerName: ev.target.value } }); mark("certificates"); mark("academy"); } })),
        e(Field, { label: "Signer title" }, e("input", { value: cert.signerTitle || "", onChange: (ev) => { setAcademy({ ...academy, certificate: { ...cert, signerTitle: ev.target.value } }); mark("certificates"); mark("academy"); } })),
        e(Field, { label: "Line under course title" }, e("input", { value: cert.lineUnderTitle || "", onChange: (ev) => { setAcademy({ ...academy, certificate: { ...cert, lineUnderTitle: ev.target.value } }); mark("certificates"); mark("academy"); } })),
        e("div", { className: "asv2-cert" },
          e("small", null, "GHz Academy"),
          e("b", null, "Course title"),
          e("small", null, cert.lineUnderTitle || "Optional line under the course title"),
          e("p", { style: { margin: "12px 0 0", fontSize: 13 } }, (cert.signerName || "Signer name") + (cert.signerTitle ? " · " + cert.signerTitle : ""))
        ),
        e(SaveBar, { saving: saving.certificates, saved: saved.certificates, err: serr.certificates, onSave: () => save("certificates", "academy", {
          name: academy.name, supportEmail: academy.supportEmail, phone: academy.phone, phoneDial: academy.phoneDial,
          website: academy.website, address: academy.address, linkedin: academy.linkedin, facebook: academy.facebook,
          instagram: academy.instagram, youtube: academy.youtube, certificate: academy.certificate
        }) })
      );
  } else if (sec === "notifications") {
    body = load.notifications ? sk : lerr.notifications ? loadErr("notifications", () => fetchOne("notifications", (d) => setNotes({
      newRegistration: d.newRegistration !== false, newMessage: d.newMessage !== false, paymentConfirmed: d.paymentConfirmed !== false
    }))) :
      e("div", null,
        e("h3", null, "Notifications"),
        e(Toggle, { on: notes.newRegistration, label: "New registration", set: (v) => { setNotes({ ...notes, newRegistration: v }); mark("notifications"); } }),
        e(Toggle, { on: notes.newMessage, label: "New message", set: (v) => { setNotes({ ...notes, newMessage: v }); mark("notifications"); } }),
        e(Toggle, { on: notes.paymentConfirmed, label: "Payment confirmed", set: (v) => { setNotes({ ...notes, paymentConfirmed: v }); mark("notifications"); } }),
        e(SaveBar, { saving: saving.notifications, saved: saved.notifications, err: serr.notifications, onSave: () => save("notifications", "notifications", notes) })
      );
  } else {
    const email = user?.email || auth.currentUser?.email || "";
    const name = user?.displayName || auth.currentUser?.displayName || "Admin";
    body = e("div", null,
      e("h3", null, "Account"),
      e(Field, { label: "Name" }, e("div", { className: "asv2-ro" }, name)),
      e(Field, { label: "Email" }, e("div", { className: "asv2-ro" }, email || "—")),
      e("div", { className: "asv2-actions" },
        e("button", { type: "button", className: "asv2-save", onClick: async () => {
          setResetMsg(""); setResetErr("");
          try {
            if (!email) throw Object.assign(new Error("auth/missing-email"), { code: "auth/missing-email" });
            await sendPasswordResetEmail(auth, email);
            setResetMsg("Password reset email sent");
          } catch (err) { setResetErr(fbErr(err)); }
        } }, "Send password reset email"),
        resetMsg ? e("span", { className: "asv2-ok" }, resetMsg) : null,
        resetErr ? e("span", { className: "asv2-err" }, resetErr) : null
      )
    );
  }

  return e("div", { className: "asv2" },
    e("div", { className: "asv2-head" },
      e("h2", null, "Settings"),
      e("p", null, "Manage academy information and student-facing options")
    ),
    e("div", { className: "asv2-shell" },
      e("nav", { className: "asv2-nav", "aria-label": "Settings sections" },
        SECTIONS.map((s) => e("button", { type: "button", key: s.id, className: sec === s.id ? "on" : "", onClick: () => leaveSec(s.id) }, s.label))
      ),
      e("div", { className: "asv2-card" }, body)
    )
  );
}

const roots = new WeakMap();
export function renderAdminSettingsV2(host, opts = {}) {
  if (!host) return;
  let root = roots.get(host);
  if (root) { try { root.unmount(); } catch (_) {} roots.delete(host); }
  host.replaceChildren();
  root = createRoot(host);
  roots.set(host, root);
  try {
    root.render(e(Boundary, null, e(App, { user: opts?.user })));
  } catch (err) {
    console.error(err);
    showSecErr(host, err, () => renderAdminSettingsV2(host, opts));
  }
}
