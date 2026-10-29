export const PRIORITY = ["LB", "SA", "AE", "JO", "EG", "IQ", "KW", "QA", "SY", "US"];

export const COUNTRIES = [
  { iso: "LB", name: "Lebanon", dial: "+961" },
  { iso: "SA", name: "Saudi Arabia", dial: "+966" },
  { iso: "AE", name: "United Arab Emirates", dial: "+971" },
  { iso: "JO", name: "Jordan", dial: "+962" },
  { iso: "EG", name: "Egypt", dial: "+20" },
  { iso: "IQ", name: "Iraq", dial: "+964" },
  { iso: "KW", name: "Kuwait", dial: "+965" },
  { iso: "QA", name: "Qatar", dial: "+974" },
  { iso: "SY", name: "Syria", dial: "+963" },
  { iso: "US", name: "United States", dial: "+1" },
  { iso: "GB", name: "United Kingdom", dial: "+44" },
  { iso: "FR", name: "France", dial: "+33" },
  { iso: "DE", name: "Germany", dial: "+49" },
  { iso: "TR", name: "Turkey", dial: "+90" },
  { iso: "IR", name: "Iran", dial: "+98" },
  { iso: "IN", name: "India", dial: "+91" },
  { iso: "PK", name: "Pakistan", dial: "+92" },
  { iso: "BD", name: "Bangladesh", dial: "+880" },
  { iso: "CN", name: "China", dial: "+86" },
  { iso: "JP", name: "Japan", dial: "+81" },
  { iso: "KR", name: "South Korea", dial: "+82" },
  { iso: "AU", name: "Australia", dial: "+61" },
  { iso: "CA", name: "Canada", dial: "+1" },
  { iso: "BR", name: "Brazil", dial: "+55" },
  { iso: "MX", name: "Mexico", dial: "+52" },
  { iso: "IT", name: "Italy", dial: "+39" },
  { iso: "ES", name: "Spain", dial: "+34" },
  { iso: "NL", name: "Netherlands", dial: "+31" },
  { iso: "SE", name: "Sweden", dial: "+46" },
  { iso: "NO", name: "Norway", dial: "+47" },
  { iso: "DK", name: "Denmark", dial: "+45" },
  { iso: "FI", name: "Finland", dial: "+358" },
  { iso: "PL", name: "Poland", dial: "+48" },
  { iso: "RU", name: "Russia", dial: "+7" },
  { iso: "UA", name: "Ukraine", dial: "+380" },
  { iso: "GR", name: "Greece", dial: "+30" },
  { iso: "CY", name: "Cyprus", dial: "+357" },
  { iso: "MA", name: "Morocco", dial: "+212" },
  { iso: "TN", name: "Tunisia", dial: "+216" },
  { iso: "DZ", name: "Algeria", dial: "+213" },
  { iso: "LY", name: "Libya", dial: "+218" },
  { iso: "SD", name: "Sudan", dial: "+249" },
  { iso: "YE", name: "Yemen", dial: "+967" },
  { iso: "OM", name: "Oman", dial: "+968" },
  { iso: "BH", name: "Bahrain", dial: "+973" },
  { iso: "PS", name: "Palestine", dial: "+970" },
  { iso: "IL", name: "Israel", dial: "+972" },
  { iso: "NG", name: "Nigeria", dial: "+234" },
  { iso: "ZA", name: "South Africa", dial: "+27" },
  { iso: "KE", name: "Kenya", dial: "+254" },
  { iso: "GH", name: "Ghana", dial: "+233" },
  { iso: "PH", name: "Philippines", dial: "+63" },
  { iso: "ID", name: "Indonesia", dial: "+62" },
  { iso: "MY", name: "Malaysia", dial: "+60" },
  { iso: "SG", name: "Singapore", dial: "+65" },
  { iso: "TH", name: "Thailand", dial: "+66" },
  { iso: "VN", name: "Vietnam", dial: "+84" },
  { iso: "NZ", name: "New Zealand", dial: "+64" },
  { iso: "IE", name: "Ireland", dial: "+353" },
  { iso: "CH", name: "Switzerland", dial: "+41" },
  { iso: "AT", name: "Austria", dial: "+43" },
  { iso: "BE", name: "Belgium", dial: "+32" },
  { iso: "PT", name: "Portugal", dial: "+351" },
  { iso: "CZ", name: "Czechia", dial: "+420" },
  { iso: "RO", name: "Romania", dial: "+40" },
  { iso: "HU", name: "Hungary", dial: "+36" },
  { iso: "AR", name: "Argentina", dial: "+54" },
  { iso: "CL", name: "Chile", dial: "+56" },
  { iso: "CO", name: "Colombia", dial: "+57" }
];

export function flagUrl(iso) {
  return "https://flagcdn.com/w40/" + String(iso || "").toLowerCase() + ".png";
}

export function sortedCountries() {
  const map = new Map(COUNTRIES.map((c) => [c.iso, c]));
  const top = PRIORITY.map((iso) => map.get(iso)).filter(Boolean);
  const rest = COUNTRIES.filter((c) => !PRIORITY.includes(c.iso)).sort((a, b) => a.name.localeCompare(b.name));
  return [...top, ...rest];
}

export function detectCountry() {
  try {
    const loc = (navigator.language || "en-LB").split("-")[1];
    const iso = loc ? loc.toUpperCase() : "LB";
    return COUNTRIES.find((c) => c.iso === iso) || COUNTRIES[0];
  } catch {
    return COUNTRIES[0];
  }
}

export function digitsOnly(s) {
  return String(s || "").replace(/\D/g, "");
}

export function parsePhone(raw) {
  const s = String(raw || "").trim();
  if (!s) return { iso: "LB", local: "" };
  const list = sortedCountries().slice().sort((a, b) => b.dial.length - a.dial.length);
  for (const c of list) {
    if (s.startsWith(c.dial)) return { iso: c.iso, local: s.slice(c.dial.length) };
  }
  if (s.startsWith("+")) return { iso: "LB", local: digitsOnly(s) };
  return { iso: "LB", local: digitsOnly(s) };
}

export function buildPhone(iso, local) {
  const c = COUNTRIES.find((x) => x.iso === iso) || COUNTRIES[0];
  const d = digitsOnly(local);
  return { phone: c.dial + d, phoneCountry: c.iso, phoneDial: c.dial };
}

export function validLocal(local) {
  const d = digitsOnly(local);
  return d.length >= 6 && d.length <= 15;
}
