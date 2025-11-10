import React, { useState, useRef } from "react";
import { PDFDocument } from "pdf-lib";

function parseRanges(input) {
  // e.g. "1-3,5,7" -> [0,1,2,4,6]
  const parts = input
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const out = new Set();
  for (const p of parts) {
    if (p.includes("-")) {
      const [a, b] = p.split("-").map((n) => parseInt(n, 10));
      if (!isNaN(a) && !isNaN(b)) {
        for (let i = a; i <= b; i++) out.add(i - 1);
      }
    } else {
      const v = parseInt(p, 10);
      if (!isNaN(v)) out.add(v - 1);
    }
  }
  return Array.from(out).filter((i) => i >= 0);
}

export default function ExtractPage() {
  const [file, setFile] = useState(null);
  const [ranges, setRanges] = useState("");
  const [error, setError] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [pageCount, setPageCount] = useState(null);
  const inputRef = useRef(null);

  function onChange(e) {
    const f = e.target.files && e.target.files[0];
    if (f) {
      setFile(f);
      setError(null);
      setPageCount(null);
      // load PDF to get page count and focus ranges input
      (async () => {
        try {
          const arr = await f.arrayBuffer();
          const src = await PDFDocument.load(arr);
          const count = src.getPageCount();
          setPageCount(count);
          // focus the ranges input for quick typing
          setTimeout(() => {
            if (inputRef.current) inputRef.current.focus();
          }, 50);
        } catch (err) {
          console.error(err);
          setError("Failed to read PDF: " + (err.message || err));
        }
      })();
    }
  }

  async function extract() {
    setError(null);
    if (!file) return setError("Pick a PDF");
    const indices = parseRanges(ranges);
    if (indices.length === 0)
      return setError("Provide page numbers or ranges, e.g. 1-3,5");
    setProcessing(true);
    try {
      const arr = await file.arrayBuffer();
      const src = await PDFDocument.load(arr);
      const out = await PDFDocument.create();
      const available = src.getPageCount();
      const valid = indices.filter((i) => i >= 0 && i < available);
      if (valid.length === 0) throw new Error("No valid page indices");
      const copied = await out.copyPages(src, valid);
      copied.forEach((p) => out.addPage(p));
      const bytes = await out.save();
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name.replace(/\.pdf$/i, "") + `-extract.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      setError("Extract failed: " + (err.message || err));
    } finally {
      setProcessing(false);
    }
  }

  return (
    <section>
      <h2>Extract Pages</h2>
      <p style={{ color: "#666" }}>
        Provide page numbers or ranges (e.g. 1-3,5) to extract.
      </p>
      <div style={{ marginTop: 12 }}>
        <input type="file" accept="application/pdf" onChange={onChange} />
        <div style={{ marginTop: 8 }}>
          <input
            ref={inputRef}
            placeholder="1-3,5"
            value={ranges}
            onChange={(e) => setRanges(e.target.value)}
            onKeyDown={(e) => {
              // allow Enter to trigger extraction
              if (e.key === "Enter") {
                e.preventDefault();
                extract();
              }
            }}
          />
          <div style={{ marginTop: 6, color: "#666", fontSize: 13 }}>
            {pageCount !== null && <span>PDF pages: {pageCount}.</span>}
            {ranges &&
              (() => {
                const parsed = parseRanges(ranges);
                const valid = pageCount
                  ? parsed.filter((i) => i >= 0 && i < pageCount)
                  : [];
                const invalid = pageCount
                  ? parsed.filter((i) => i >= pageCount)
                  : [];
                return (
                  <span style={{ marginLeft: 8 }}>
                    Selected: {valid.length} pages
                    {valid.length > 0
                      ? ` — ${valid
                          .slice(0, 12)
                          .map((i) => i + 1)
                          .join(", ")}${valid.length > 12 ? ", ..." : ""}`
                      : ""}
                    {invalid.length > 0 ? `; ${invalid.length} invalid` : ""}
                  </span>
                );
              })()}
          </div>
        </div>
        <div style={{ marginTop: 8 }}>
          <button
            className="btn primary"
            onClick={extract}
            disabled={processing || !file}
          >
            {processing ? "Processing..." : "Extract pages"}
          </button>
        </div>
        {error && <div className="error">{error}</div>}
      </div>
    </section>
  );
}
