/** Manual transfer adapter. Card/gateway plugs in later. */

const PHONE = "+961 76 908 224";
const NAME = "Abbas Adnan Al Attar";
const NAME_SHORT = "Abbas Al Attar";
const EMAIL = "abbas.alattar@hotmail.com";

function seedFor(id) {
  if (id === "whish") return {
    showReference: false,
    refLabel: "",
    askConf: { mtcn: false, paymentId: false, senderName: true },
    steps: [
      "Open the Whish Money app and send exactly {amount} to the mobile number below.",
      "Enter your name below and press I have paid."
    ],
    details: [{ label: "Mobile number", value: PHONE, copy: true, mono: true }]
  };
  if (id === "omt") return {
    showReference: false,
    refLabel: "",
    askConf: { mtcn: false, paymentId: false, senderName: true },
    steps: [
      "Send exactly {amount} through OMT to the receiver below.",
      "Enter your name below and press I have paid."
    ],
    details: [
      { label: "Mobile number", value: PHONE, copy: true, mono: true },
      { label: "Receiver's full name", value: NAME, copy: true, mono: false }
    ]
  };
  if (id === "wu") return {
    showReference: false,
    refLabel: "MTCN",
    askConf: { mtcn: true, paymentId: false, senderName: true },
    steps: [
      "Send exactly {amount} in USD to the receiver below.",
      "Enter the MTCN and your name below and press I have paid."
    ],
    details: [
      { label: "Mobile number", value: PHONE, copy: true, mono: true },
      { label: "Country", value: "Lebanon", copy: false, mono: false },
      { label: "Currency", value: "USD", copy: false, mono: true },
      { label: "Receiver's full name", value: NAME, copy: true, mono: false }
    ]
  };
  if (id === "payoneer") return {
    showReference: false,
    refLabel: "",
    askConf: { mtcn: false, paymentId: false, senderName: true },
    steps: [
      "Send exactly {amount} to the receiver below.",
      "Enter your name below and press I have paid."
    ],
    details: [
      { label: "Mobile number", value: PHONE, copy: true, mono: true },
      { label: "Country", value: "Lebanon", copy: false, mono: false },
      { label: "Receiver's name", value: NAME_SHORT, copy: true, mono: false },
      { label: "Receiver's email", value: EMAIL, copy: true, mono: true }
    ]
  };
  return { showReference: false, refLabel: "", askConf: { mtcn: false, paymentId: false, senderName: true }, steps: [], details: [] };
}

export const DEFAULT_METHODS = [
  { id: "wu", label: "Western Union", type: "manual", enabled: true, comingSoon: false, order: 1, instructions: "", accountNumber: "", icon: "wu", ...seedFor("wu") },
  { id: "whish", label: "Whish Money", type: "manual", enabled: true, comingSoon: false, order: 2, instructions: "", accountNumber: "", icon: "whish", ...seedFor("whish") },
  { id: "omt", label: "OMT", type: "manual", enabled: true, comingSoon: false, order: 3, instructions: "", accountNumber: "", icon: "omt", ...seedFor("omt") },
  { id: "payoneer", label: "Payoneer", type: "manual", enabled: true, comingSoon: false, order: 4, instructions: "", accountNumber: "", icon: "payoneer", ...seedFor("payoneer") },
  { id: "card", label: "Card", type: "gateway", enabled: true, comingSoon: true, order: 5, instructions: "", accountNumber: "", icon: "card", ...seedFor("card") }
];

function normDetails(list, seed) {
  const src = Array.isArray(list) && list.length ? list : seed;
  return src.map((r) => ({
    label: String(r.label || ""),
    value: String(r.value || ""),
    copy: r.copy !== false,
    mono: r.mono !== false
  }));
}
function normSteps(list, seed) {
  if (Array.isArray(list) && list.length) return list.map((s) => String(s || ""));
  if (typeof list === "string" && list.trim()) return list.split("\n").map((s) => s.trim()).filter(Boolean);
  return seed.slice();
}
export function normalizeMethods(list) {
  const src = Array.isArray(list) && list.length ? list : DEFAULT_METHODS;
  return [...src].map((m, i) => {
    const seed = seedFor(m.id);
    return {
      id: String(m.id || "m" + i),
      label: String(m.label || "Method"),
      type: m.type === "gateway" ? "gateway" : "manual",
      enabled: m.enabled !== false,
      comingSoon: !!m.comingSoon,
      order: Number(m.order) || i + 1,
      instructions: String(m.instructions || ""),
      accountNumber: String(m.accountNumber || ""),
      icon: String(m.icon || m.id || ""),
      refLabel: String((m.askConf ? m.refLabel : seed.refLabel) || ""),
      showReference: false,
      askConf: {
        mtcn: !!(m.askConf && m.askConf.mtcn != null ? m.askConf.mtcn : seed.askConf?.mtcn),
        paymentId: m.id === "payoneer" ? false : !!(m.askConf && m.askConf.paymentId != null ? m.askConf.paymentId : seed.askConf?.paymentId),
        senderName: (m.askConf && m.askConf.senderName != null) ? !!m.askConf.senderName : (seed.askConf?.senderName !== false)
      },
      steps: m.askConf ? normSteps(m.steps, seed.steps) : seed.steps.slice(),
      details: m.askConf ? normDetails(m.details, seed.details) : seed.details.map((x) => ({ ...x }))
    };
  }).sort((a, b) => a.order - b.order);
}

export function courseCode(course) {
  const raw = String(course?.code || course?.shortCode || course?.title || "CRS").replace(/[^A-Za-z0-9]/g, "").slice(0, 8).toUpperCase();
  return raw || "CRS";
}

export function makeTransferRef(course) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let tail = "";
  for (let i = 0; i < 5; i++) tail += alphabet[Math.floor(Math.random() * alphabet.length)];
  return "GHZ-" + courseCode(course) + "-" + tail;
}

export async function createPayment(registration) {
  const method = registration?.method || {};
  return {
    adapter: method.type === "gateway" ? "gateway" : "manual",
    status: "awaiting_transfer",
    transferRef: registration?.transferRef || makeTransferRef(registration?.course),
    amount: Number(registration?.amount) || 0,
    currency: registration?.currency || "USD"
  };
}

export async function getStatus(registration) {
  const st = String(registration?.status || "");
  if (st === "enrolled" || st === "confirmed" || st === "paid") return "paid";
  if (st === "payment_submitted") return "submitted";
  if (st === "rejected") return "rejected";
  if (st === "refunded") return "refunded";
  if (st === "expired") return "expired";
  return "awaiting";
}

export function methodInstructions(m) {
  const t = String(m?.instructions || "").trim();
  if (t) return t;
  if (m?.id === "wu" || m?.id === "payoneer") return "Instructions will be added soon";
  return "";
}

export function isFreeCourse(course) {
  const n = Number(course?.price ?? course?.amount);
  return !Number.isFinite(n) || n <= 0;
}

export const STATUS = {
  awaiting: "pending_payment",
  submitted: "payment_submitted",
  paid: "paid",
  confirmed: "enrolled",
  rejected: "rejected",
  expired: "expired",
  refunded: "refunded"
};
