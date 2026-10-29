import { createElement as e, useRef, useState } from "https://esm.sh/react@18.3.1";

const ALLOW = {
  "application/pdf": "PDF",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
  "application/msword": "DOC",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "XLS",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "PPT",
  "text/plain": "TXT",
  "application/zip": "ZIP",
  "application/x-zip-compressed": "ZIP",
  "image/png": "PNG",
  "image/jpeg": "JPG"
};
const EXT = { pdf:"PDF", docx:"DOCX", doc:"DOC", xlsx:"XLS", pptx:"PPT", txt:"TXT", zip:"ZIP", png:"PNG", jpg:"JPG", jpeg:"JPG" };

export function typeOf(name, mime) {
  const ext = String(name || "").split(".").pop().toLowerCase();
  return EXT[ext] || ALLOW[mime] || "FILE";
}
export function tileColor(t) {
  if (t === "PDF") return "#DC2626";
  if (t === "DOCX" || t === "DOC") return "#2563EB";
  if (t === "XLS") return "#16A34A";
  if (t === "PPT") return "#EA580C";
  if (t === "ZIP") return "#64748B";
  return "#2563EB";
}

export function FileDropzone({ disabled, onFiles, error }) {
  const [over, setOver] = useState(false);
  const ref = useRef(null);
  const pick = (list) => {
    const arr = Array.from(list || []);
    if (arr.length) onFiles(arr);
  };
  return e("div", {
    className: "hs2-drop" + (over ? " on" : ""),
    onDragOver: (ev) => { ev.preventDefault(); if (!disabled) setOver(true); },
    onDragLeave: () => setOver(false),
    onDrop: (ev) => { ev.preventDefault(); setOver(false); if (!disabled) pick(ev.dataTransfer.files); }
  },
    e("div", { className: "hs2-upico", "aria-hidden": "true" }, "↑"),
    e("p", null, "Drag and drop your files here"),
    e("button", { type: "button", className: "hs2-browse", disabled, onClick: () => ref.current && ref.current.click() }, "Browse files"),
    e("input", { ref, type: "file", multiple: true, hidden: true, onChange: (ev) => pick(ev.target.files) }),
    e("div", { className: "hs2-types" },
      ["PDF","DOCX","XLSX","PPTX","TXT","ZIP","PNG","JPG"].map((t) => e("span", { key: t }, t))
    ),
    e("p", { className: "hs2-hint" }, "Up to 3 files, 650 KB each"),
    error ? e("p", { className: "hs2-err" }, error) : null
  );
}
