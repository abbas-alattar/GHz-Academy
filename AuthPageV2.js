import { createElement as e, useEffect, useMemo, useState, Component } from "https://esm.sh/react@18.3.1";
import { createRoot } from "https://esm.sh/react-dom@18.3.1/client";
import { sortedCountries, detectCountry, flagUrl, digitsOnly, buildPhone, validLocal } from "./phoneCountries.js";
import { db } from "./firebase-config.js?v=auth8";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { courseStatusLabel } from "./courseStatusLabel.js";

class Boundary extends Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err) { console.error("AuthPageV2", err); }
  render() {
    if (this.state.err) {
      return e("div", { className: "ap2-formcol" },
        e("p", null, "Could not load the new login page."),);
    }
    return this.props.children;
  }
}

const ico = (d) => e("svg", { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "#94A3B8", strokeWidth: 2 }, e("path", { d }));

function PhoneField({ iso, local, onIso, onLocal, err }) {
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
    const onDoc = (ev) => { if (!ev.target.closest?.(".ap2-phonewrap")) setOpen(false); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDoc);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("mousedown", onDoc); };
  }, [open]);
  return e("div", { className: "ap2-field ap2-phonewrap", style: { position: "relative" } },
    e("label", null, "Mobile number"),
    e("div", { className: "ap2-phone" },
      e("button", { type: "button", className: "ap2-cc", "aria-expanded": open, onClick: () => setOpen((v) => !v) },
        e("img", { src: flagUrl(cur.iso), width: 22, height: 16, alt: cur.name + " flag" }),
        e("span", null, cur.dial),
        e("span", null, "▾")
      ),
      e("input", { value: local, inputMode: "tel", autoComplete: "tel-national", placeholder: "71 123 456", onChange: (ev) => onLocal(ev.target.value) })
    ),
    open ? e("div", { className: "ap2-dd", role: "listbox" },
      e("input", { autoFocus: true, placeholder: "Search country or code", value: q, onChange: (ev) => setQ(ev.target.value) }),
      list.map((c) => e("button", { type: "button", key: c.iso, className: c.iso === iso ? "on" : "", onClick: () => { onIso(c.iso); setOpen(false); } },
        e("img", { src: flagUrl(c.iso), width: 22, height: 16, alt: c.name + " flag" }),
        e("span", { style: { flex: 1 } }, c.name),
        e("span", { style: { color: "#64748B" } }, c.dial)
      ))
    ) : null,
    err ? e("div", { className: "ap2-err" }, err) : null
  );
}

function strength(pw) {
  let n = 0;
  if (pw.length >= 8) n++;
  if (/\d/.test(pw)) n++;
  if (/[A-Za-z]/.test(pw)) n++;
  if (pw.length >= 12 || /[^A-Za-z0-9]/.test(pw)) n++;
  return n;
}

function Field({ label, type, value, onChange, icon, auto, extra }) {
  return e("div", { className: "ap2-field" },
    e("label", null, label),
    e("div", { className: "ap2-in" },
      icon,
      e("input", { type, value, autoComplete: auto, onChange: (ev) => onChange(ev.target.value) }),
      extra
    )
  );
}

function Page({ api }) {
  const params = new URLSearchParams(location.search);
  const courseId = params.get("course") || "";
  const [courseHint, setCourseHint] = useState(null);
  const [tab, setTab] = useState(params.get("tab") === "signup" ? "signup" : "login");
  useEffect(() => {
    if (!courseId) return;
    try { sessionStorage.setItem("ghz-reg-course", courseId); } catch {}
    getDoc(doc(db, "courses", courseId)).then((snap) => {
      if (snap.exists()) setCourseHint({ id: courseId, title: snap.data().title || "this course", status: snap.data().status || "Open" });
    }).catch(() => setCourseHint({ id: courseId, title: "this course", status: "Open" }));
  }, [courseId]);
  const [lemail, setLemail] = useState("");
  const [lpw, setLpw] = useState("");
  const [showL, setShowL] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [iso, setIso] = useState(detectCountry().iso);
  const [local, setLocal] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [showS, setShowS] = useState(false);
  const [showS2, setShowS2] = useState(false);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [code, setCode] = useState("");
  const [ok, setOk] = useState("");
  const [verify, setVerify] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const [wait, setWait] = useState(0);
  const phoneErr = local && !validLocal(local) ? "Enter 6 to 15 digits." : (!local && tab === "signup" ? "Mobile number is required." : "");
  const st = strength(pw);
  const match = pw2 && pw === pw2;
  const valid = name.trim() && email.includes("@") && validLocal(local) && pw.length >= 8 && /\d/.test(pw) && /[A-Za-z]/.test(pw) && match && agree;
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const phonePack = () => buildPhone(iso, local);

  const onLogin = async (ev) => {
    ev.preventDefault();
    setErr(""); setCode(""); setOk(""); setBusy(true);
    const r = await api.login(lemail.trim(), lpw);
    setBusy(false);
    if (!r.ok) { setErr(r.message); setCode(r.code || ""); }
  };
  const onSignup = async (ev) => {
    ev.preventDefault();
    if (!valid) return;
    setErr(""); setCode(""); setBusy(true);
    const r = await api.signup({ name: name.trim(), email: email.trim(), password: pw, ...phonePack() });
    setBusy(false);
    if (!r.ok) { setErr(r.message); setCode(r.code || ""); return; }
    setVerify(true);
  };
  const emailOk = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || "").trim());
  const resetFriendly = (c) => {
    if (c === "auth/invalid-email") return "Enter a valid email";
    if (c === "auth/too-many-requests") return "Too many attempts, try again in a few minutes";
    if (c === "auth/network-request-failed") return "Check your connection";
    return "Could not send the reset link. Try again.";
  };
  const openReset = (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    setErr(""); setCode(""); setOk("");
    setResetEmail(lemail.trim());
    setResetSent(false);
    setResetOpen(true);
  };
  const sendReset = async () => {
    const em = resetEmail.trim();
    setErr(""); setCode(""); setOk("");
    if (!emailOk(em)) {
      setErr("Enter a valid email");
      setCode("auth/invalid-email");
      return;
    }
    setBusy(true);
    const r = await api.forgot(em);
    setBusy(false);
    const c = r.code || "";
    if (r.ok || c === "auth/user-not-found" || c === "auth/invalid-login-credentials") {
      setResetSent(true);
      setWait(30);
      setOk("If an account exists for this email, we sent a reset link. Check your inbox and spam folder.");
      return;
    }
    setErr(resetFriendly(c));
    setCode(c);
  };

  const art = e("aside", { className: "ap2-art" },
    e("div", { className: "ap2-glow" }),
    e("svg", { className: "ap2-wave", viewBox: "0 0 800 120", preserveAspectRatio: "none" },
      e("path", { d: "M0 60c80-40 160 40 240 0s160-40 240 0 160 40 240 0 80-20 80-20" })
    ),
    e("a", { className: "ap2-logo", href: "./index.html" }, e("img", { src: "./logo.png", alt: "GHz Academy logo" }), "GHz Academy"),
    e("div", { className: "ap2-kicker" }, "Wireless academy"),
    e("h1", { className: "ap2-h" }, "Learn wireless, from ", e("span", null, "LTE to 6G")),
    e("ul", { className: "ap2-ben" },
      ["Expert trainers", "Live sessions and recordings", "Certificates"].map((t) => e("li", { key: t }, e("span", { className: "ap2-ck" }, "✓"), t))
    )
  );

  if (resetOpen) {
    return e("div", { className: "ap2" }, art,
      e("div", { className: "ap2-mobhead" }, e("img", { src: "./logo.png", alt: "GHz Academy logo" }), "GHz Academy"),
      e("div", { className: "ap2-formcol" },
        e("div", { className: "ap2-card", role: "dialog", "aria-labelledby": "ap2-reset-title" },
          e("h2", { id: "ap2-reset-title", className: "ap2-title" }, "Reset your password"),
          e("p", { className: "ap2-sub" }, "We will email a link to choose a new password."),
          e(Field, { label: "Email", type: "email", value: resetEmail, onChange: setResetEmail, auto: "email", icon: ico("M4 6h16v12H4z M4 6l8 7 8-7") }),
          resetSent ? e("p", { className: "ap2-okline", role: "status" }, "If an account exists for this email, we sent a reset link. Check your inbox and spam folder.") : null,
          e("button", {
            type: "button",
            className: "ap2-btn",
            disabled: busy || (resetSent && wait > 0),
            onClick: sendReset
          }, busy ? "Sending…" : (resetSent ? (wait > 0 ? ("Resend (" + wait + "s)") : "Resend") : "Send reset link")),
          err ? e("p", { className: "ap2-err", role: "alert" }, err) : null,
          code ? e("p", { className: "ap2-code" }, code) : null,
          e("button", { type: "button", className: "ap2-classic", onClick: () => { setResetOpen(false); setResetSent(false); setErr(""); setCode(""); setOk(""); setTab("login"); } }, "Back to log in")
        )
      )
    );
  }

  if (verify) {
    return e("div", { className: "ap2" }, art,
      e("div", { className: "ap2-mobhead" }, e("img", { src: "./logo.png", alt: "GHz Academy logo" }), "GHz Academy"),
      e("div", { className: "ap2-formcol" },
        e("div", { className: "ap2-card ap2-ok" },
          e("div", { className: "ap2-check" }, "✓"),
          e("h2", null, "Check your email to verify your account"),
          e("p", null, email || lemail),
          e("button", { type: "button", className: "ap2-btn", disabled: wait > 0, onClick: async () => {
            setWait(30);
            const r = await api.resend();
            if (!r.ok) { setErr(r.message); setCode(r.code || ""); }
          } }, wait > 0 ? ("Resend email (" + wait + "s)") : "Resend email"),
          e("p", null, e("button", { type: "button", className: "ap2-classic", onClick: () => { setVerify(false); setTab("login"); } }, "Back to log in")),
          err ? e("p", { className: "ap2-err" }, err) : null
        )
      )
    );
  }

  return e("div", { className: "ap2" }, art,
    e("div", { className: "ap2-mobhead" }, e("img", { src: "./logo.png", alt: "GHz Academy logo" }), "GHz Academy"),
    e("div", { className: "ap2-formcol" },
      e("div", { className: "ap2-card" },
        params.get("welcome") === "trainer" ? e("p", { className: "ap2-sub" }, "Welcome to GHz Academy! Your password is set. Log in to access your trainer portal.") : null,
        e("div", { className: "ap2-tabs" },
          e("div", { className: "ap2-slide" + (tab === "signup" ? " signup" : "") }),
          e("button", { type: "button", className: tab === "login" ? "on" : "", onClick: () => setTab("login") }, "Log in"),
          e("button", { type: "button", className: tab === "signup" ? "on" : "", onClick: () => setTab("signup") }, "Create account")
        ),
        courseHint ? e("p", { className: "ap2-sub", style: { marginBottom: 10 } }, "Create your account to register for ", e("strong", null, courseHint.title), " ", e("span", { className: "pc1-badge " + (courseHint.status === "Open" ? "open" : courseHint.status === "Coming soon" ? "soon" : "closed"), style: { display: "inline-flex", fontSize: 11, padding: "2px 8px", borderRadius: 999, background: "#dcfce7", color: "#166534" } }, courseStatusLabel(courseHint.status || "Open"))) : null,
        tab === "signup" ? e("div", null, e("h2", { className: "ap2-title" }, "Create your account"), e("p", { className: "ap2-sub" }, "Join GHz Academy in a minute")) : e("h2", { className: "ap2-title" }, "Log in"),
        tab === "login" ? e("form", { onSubmit: onLogin },
          e(Field, { label: "Email", type: "email", value: lemail, onChange: setLemail, auto: "email", icon: ico("M4 6h16v12H4z M4 6l8 7 8-7") }),
          e(Field, { label: "Password", type: showL ? "text" : "password", value: lpw, onChange: setLpw, auto: "current-password", icon: ico("M12 17a2 2 0 100-4 2 2 0 000 4z M6 10V8a6 6 0 1112 0v2"), extra: e("button", { type: "button", className: "ap2-eye", onClick: () => setShowL((v) => !v) }, showL ? "Hide" : "Show") }),
          e("button", { type: "button", className: "ap2-forgot", onClick: openReset }, "Forgot password?"),
          e("button", { className: "ap2-btn", type: "submit", disabled: busy }, busy ? "Logging in…" : "Log in")
        ) : e("form", { onSubmit: onSignup },
          e(Field, { label: "Full name", type: "text", value: name, onChange: setName, auto: "name", icon: ico("M12 12a4 4 0 100-8 4 4 0 000 8z M4 20a8 8 0 0116 0") }),
          e(Field, { label: "Email", type: "email", value: email, onChange: setEmail, auto: "email", icon: ico("M4 6h16v12H4z M4 6l8 7 8-7") }),
          e(PhoneField, { iso, local, onIso: setIso, onLocal: setLocal, err: local || busy ? phoneErr : "" }),
          e("div", { className: "ap2-field" },
            e("label", null, "Password"),
            e("div", { className: "ap2-in" },
              ico("M12 17a2 2 0 100-4 2 2 0 000 4z M6 10V8a6 6 0 1112 0v2"),
              e("input", { type: showS ? "text" : "password", value: pw, autoComplete: "new-password", onChange: (ev) => setPw(ev.target.value) }),
              e("button", { type: "button", className: "ap2-eye", onClick: () => setShowS((v) => !v) }, showS ? "Hide" : "Show")
            ),
            e("div", { className: "ap2-meter" }, [1, 2, 3, 4].map((i) => e("i", { key: i, className: st >= i ? "on" + i : "" }))),
            e("div", { className: "ap2-cklist" },
              e("span", { className: pw.length >= 8 ? "ok" : "" }, "8+ characters"),
              e("span", { className: /\d/.test(pw) ? "ok" : "" }, "a number"),
              e("span", { className: /[A-Za-z]/.test(pw) ? "ok" : "" }, "a letter")
            )
          ),
          e("div", { className: "ap2-field" },
            e("label", null, "Confirm password"),
            e("div", { className: "ap2-in" },
              ico("M12 17a2 2 0 100-4 2 2 0 000 4z M6 10V8a6 6 0 1112 0v2"),
              e("input", { type: showS2 ? "text" : "password", value: pw2, autoComplete: "new-password", onChange: (ev) => setPw2(ev.target.value) }),
              e("button", { type: "button", className: "ap2-eye", onClick: () => setShowS2((v) => !v) }, showS2 ? "Hide" : "Show")
            ),
            pw2 ? e("div", { className: "ap2-match " + (match ? "ok" : "bad") }, match ? "✓ Passwords match" : "Passwords do not match") : null
          ),
          e("label", { className: "ap2-agree" },
            e("input", { type: "checkbox", checked: agree, onChange: (ev) => setAgree(ev.target.checked) }),
            e("span", null, "I agree to the ", e("a", { href: "./terms/", target: "_blank", rel: "noopener noreferrer" }, "Terms & Conditions"), " and ", e("a", { href: "./privacy/", target: "_blank", rel: "noopener noreferrer" }, "Privacy Policy"))
          ),
          e("button", { className: "ap2-btn", type: "submit", disabled: !valid || busy }, busy ? "Creating account…" : "Create student account")
        ),
        err ? e("p", { className: "ap2-err", role: "alert" }, err) : null,
        code ? e("p", { className: "ap2-code" }, "(" + code + ")") : null,
        ok ? e("p", { style: { color: "#16A34A" } }, ok) : null,)
    )
  );
}

let root;
export function renderAuthPageV2(host, api) {
  if (!host) return false;
  try {
    if (!root) root = createRoot(host);
    root.render(e(Boundary, { onClassic: api.onClassic }, e(Page, { api })));
    return true;
  } catch (err) {
    console.error("AuthPageV2", err);
    return false;
  }
}
