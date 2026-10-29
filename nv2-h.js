export function h(type, props, ...kids) {
  return { type, props: props || {}, kids: kids.flat().filter((k) => k != null && k !== false) };
}

const SVG = "http://www.w3.org/2000/svg";
const SVG_TAGS = { svg: 1, path: 1, circle: 1, g: 1, line: 1, rect: 1, polyline: 1, polygon: 1 };

function setProp(el, k, v) {
  if (k === "className") el.setAttribute("class", v || "");
  else if (k === "dangerouslySetInnerHTML") el.innerHTML = v.__html || "";
  else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
  else if (k === "style" && v && typeof v === "object") Object.assign(el.style, v);
  else if (v === true) el.setAttribute(k, "");
  else if (v === false || v == null) {}
  else {
    const attr = k === "viewBox" ? "viewBox" : k.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
    el.setAttribute(attr, String(v));
  }
}

export function create(node) {
  if (node == null || node === false) return document.createTextNode("");
  if (typeof node === "string" || typeof node === "number") return document.createTextNode(String(node));
  if (typeof node.type === "function") return create(node.type(node.props));
  const tag = node.type;
  const el = SVG_TAGS[tag] ? document.createElementNS(SVG, tag) : document.createElement(tag);
  Object.keys(node.props).forEach((k) => setProp(el, k, node.props[k]));
  node.kids.forEach((c) => el.appendChild(create(c)));
  return el;
}
