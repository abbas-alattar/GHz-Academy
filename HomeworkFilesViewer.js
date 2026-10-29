import { createElement as e, useEffect, useState } from "https://esm.sh/react@18.3.1";
import { db } from "./firebase-config.js?v=auth8";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { typeOf, tileColor } from "./FileDropzone.js";

function blobFrom(data) {
  const s = String(data || "");
  const i = s.indexOf(",");
  const b64 = i >= 0 ? s.slice(i + 1) : s;
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let n = 0; n < bin.length; n++) arr[n] = bin.charCodeAt(n);
  const mime = (s.match(/^data:([^;]+)/) || [])[1] || "application/octet-stream";
  return new Blob([arr], { type: mime });
}

export function HomeworkFilesViewer({ assignmentId, uid, files, readonly }) {
  const [rows, setRows] = useState((files || []).map((f) => ({ ...f, loading: true, data: null, err: null })));
  useEffect(() => {
    let live = true;
    (async () => {
      const next = [];
      for (const f of files || []) {
        const id = assignmentId + "_" + uid + "_" + f.index;
        try {
          const snap = await getDoc(doc(db, "submissionFiles", id));
          if (!live) return;
          next.push({ ...f, loading: false, data: snap.exists() ? snap.data().data : null, err: snap.exists() ? null : "missing" });
        } catch (err) {
          next.push({ ...f, loading: false, data: null, err: err.code || String(err) });
        }
        if (live) setRows([...next, ...(files || []).slice(next.length).map((x) => ({ ...x, loading: true }))]);
      }
      if (live) setRows(next);
    })();
    return () => { live = false; };
  }, [assignmentId, uid, JSON.stringify(files || [])]);

  const open = (row, download) => {
    if (!row.data) return;
    const blob = blobFrom(row.data);
    const url = URL.createObjectURL(blob);
    if (download) {
      const a = document.createElement("a");
      a.href = url; a.download = row.fileName || "file"; a.click();
    } else window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  if (!(files || []).length) return e("p", { className: "hs2-hint" }, "No files.");
  return e("div", { className: "hs2-files" },
    e("h3", null, "Student files"),
    rows.map((r) => {
      const t = typeOf(r.fileName, r.mimeType);
      return e("div", { className: "hs2-row", key: r.index },
        e("b", { className: "hs2-tile", style: { background: tileColor(t) } }, t),
        e("div", null, e("strong", null, r.fileName), e("span", null, Math.round((r.size || 0) / 1024) + " KB")),
        r.loading ? e("span", { className: "hs2-wave", "aria-label": "Loading" }) : null,
        r.err ? e("span", { className: "hs2-err" }, r.err) : null,
        !r.loading && r.data ? e("button", { type: "button", className: "hs2-mini", onClick: () => open(r, true) }, "Download") : null,
        !r.loading && r.data && /pdf|png|jpe?g/i.test(t) ? e("button", { type: "button", className: "hs2-mini", onClick: () => open(r, false) }, "Preview") : null
      );
    }),
    readonly ? null : null
  );
}
