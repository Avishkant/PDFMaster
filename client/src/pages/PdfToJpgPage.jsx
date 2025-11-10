import React, { useState } from "react";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf";
import JSZip from "jszip";

// ensure worker is wired (Vite friendly)
GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/legacy/build/pdf.worker.min.js",
  import.meta.url
).href;

export default function PdfToJpgPage() {
  const [pdfFile, setPdfFile] = useState(null);
  const [images, setImages] = useState([]); // {name, blob, url}
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);

  async function pdfToJpg() {
    setError(null);
    if (!pdfFile) return setError("Pick a PDF first");
    setProcessing(true);
    try {
      const data = await pdfFile.arrayBuffer();
      const loadingTask = getDocument({ data });
      const pdf = await loadingTask.promise;
      const n = pdf.numPages || pdf._pdfInfo.numPages || 0;
      const created = [];
      for (let i = 1; i <= n; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        const ctx = canvas.getContext("2d");
        const renderTask = page.render({ canvasContext: ctx, viewport });
        await renderTask.promise;
        const blob = await new Promise((res) =>
          canvas.toBlob(res, "image/jpeg", 0.9)
        );
        const url = URL.createObjectURL(blob);
        created.push({
          name: `${pdfFile.name.replace(/\.pdf$/i, "")}-page-${i}.jpg`,
          blob,
          url,
        });
      }
      setImages(created);
    } catch (err) {
      console.error(err);
      setError("PDF->JPG failed: " + (err.message || err));
    } finally {
      setProcessing(false);
    }
  }

  async function downloadAllImagesAsZip() {
    if (!images.length) return;
    setProcessing(true);
    setError(null);
    try {
      const zip = new JSZip();
      for (const it of images) {
        zip.file(it.name, it.blob);
      }
      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const a = document.createElement("a");
      a.href = url;
      a.download = pdfFile.name.replace(/\.pdf$/i, "") + "-images.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      setError("Zip failed: " + (err.message || err));
    } finally {
      setProcessing(false);
    }
  }

  return (
    <section>
      <h2>PDF → JPG</h2>
      <div>
        <input
          type="file"
          accept="application/pdf"
          onChange={(e) => setPdfFile(e.target.files && e.target.files[0])}
        />
        <div style={{ marginTop: 8 }}>
          <button
            className="btn primary"
            onClick={pdfToJpg}
            disabled={processing || !pdfFile}
          >
            {processing ? "Working..." : "Convert PDF to JPGs"}
          </button>
          {images.length > 0 && (
            <button
              className="btn"
              style={{ marginLeft: 8 }}
              onClick={downloadAllImagesAsZip}
            >
              Download all as ZIP
            </button>
          )}
        </div>
        {error && <div className="error">{error}</div>}

        <div style={{ marginTop: 12 }}>
          {images.map((it, idx) => (
            <div
              key={idx}
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                marginBottom: 8,
              }}
            >
              <div
                style={{
                  width: 120,
                  height: 140,
                  overflow: "hidden",
                  border: "1px solid #ddd",
                }}
              >
                <img
                  src={it.url}
                  alt="thumb"
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              </div>
              <div>
                <div>{it.name}</div>
                <a
                  className="btn"
                  href={it.url}
                  download={it.name}
                  style={{ marginTop: 6, display: "inline-block" }}
                >
                  Download
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
