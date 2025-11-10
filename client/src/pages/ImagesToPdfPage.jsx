import React, { useState, useEffect, useRef } from "react";
import { PDFDocument } from "pdf-lib";
import { PAGE_SIZES, mmToPoints } from "./images-utils";

export default function ImagesToPdfPage() {
  const [imgFiles, setImgFiles] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [pageSize, setPageSize] = useState("A4");
  const [scaleMode, setScaleMode] = useState("fit"); // fit, fill, stretch, original
  const [marginMm, setMarginMm] = useState(10);
  const previewRef = useRef(null);

  function onImgFilesSelected(flist) {
    const arr = Array.from(flist || []);
    setImgFiles(arr);
  }

  // Render preview of first image into preview canvas when options or files change
  useEffect(() => {
    const first = imgFiles && imgFiles[0];
    const canvas = previewRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!first) return;
    const url = URL.createObjectURL(first);
    const img = new Image();
    img.onload = () => {
      // determine page size
      let pW, pH;
      if (pageSize === "original") {
        pW = img.width;
        pH = img.height;
      } else {
        const ps = PAGE_SIZES[pageSize] || PAGE_SIZES.A4;
        pW = ps.w;
        pH = ps.h;
      }
      const margin = mmToPoints(marginMm);
      const innerW = Math.max(1, pW - 2 * margin);
      const innerH = Math.max(1, pH - 2 * margin);

      // compute target image size on page (points) using scaleMode
      const imgW = img.width;
      const imgH = img.height;
      let targetW = imgW;
      let targetH = imgH;
      const imgRatio = imgW / imgH;
      const innerRatio = innerW / innerH;
      if (scaleMode === "fit") {
        if (imgRatio > innerRatio) {
          targetW = innerW;
          targetH = innerW / imgRatio;
        } else {
          targetH = innerH;
          targetW = innerH * imgRatio;
        }
      } else if (scaleMode === "fill") {
        if (imgRatio > innerRatio) {
          targetH = innerH;
          targetW = innerH * imgRatio;
        } else {
          targetW = innerW;
          targetH = innerW / imgRatio;
        }
      } else if (scaleMode === "stretch") {
        targetW = innerW;
        targetH = innerH;
      } else {
        // original
        targetW = imgW;
        targetH = imgH;
      }

      // draw preview scaled to canvas size
      const previewScale = Math.min(280 / pW, 200 / pH, 1);
      const canvasW = Math.round(pW * previewScale);
      const canvasH = Math.round(pH * previewScale);
      canvas.width = canvasW;
      canvas.height = canvasH;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvasW, canvasH);
      // draw inner box
      const pxMargin = Math.round(margin * previewScale);
      const drawInnerW = Math.round(innerW * previewScale);
      const drawInnerH = Math.round(innerH * previewScale);
      ctx.fillStyle = "#f6f6f6";
      ctx.fillRect(pxMargin, pxMargin, drawInnerW, drawInnerH);
      // compute image draw size in canvas pixels
      const drawImgW = Math.round(targetW * previewScale);
      const drawImgH = Math.round(targetH * previewScale);
      const dx = Math.round(pxMargin + (drawInnerW - drawImgW) / 2);
      const dy = Math.round(pxMargin + (drawInnerH - drawImgH) / 2);
      ctx.drawImage(img, dx, dy, drawImgW, drawImgH);
      URL.revokeObjectURL(url);
    };
    img.onerror = (e) => {
      console.error("preview image load failed", e);
      URL.revokeObjectURL(url);
    };
    img.src = url;
    // cleanup
    return () => {};
  }, [imgFiles, pageSize, scaleMode, marginMm]);

  async function imagesToPdf() {
    setError(null);
    if (!imgFiles || imgFiles.length === 0)
      return setError("Pick one or more JPG/PNG files");
    setProcessing(true);
    try {
      const doc = await PDFDocument.create();
      for (const f of imgFiles) {
        const buf = await f.arrayBuffer();
        // try jpeg first then png
        let img;
        if (/\.jpe?g$/i.test(f.name)) {
          img = await doc.embedJpg(buf);
        } else {
          img = await doc.embedPng(buf);
        }
        const imgW = img.width;
        const imgH = img.height;

        // determine page size in PDF points
        let pW, pH;
        if (pageSize === "original") {
          pW = imgW;
          pH = imgH;
        } else {
          const ps = PAGE_SIZES[pageSize] || PAGE_SIZES.A4;
          pW = ps.w;
          pH = ps.h;
        }

        const margin = mmToPoints(marginMm);
        const innerW = Math.max(1, pW - 2 * margin);
        const innerH = Math.max(1, pH - 2 * margin);

        // compute target image size on page according to scaleMode
        const imgRatio = imgW / imgH;
        const innerRatio = innerW / innerH;
        let targetW = imgW;
        let targetH = imgH;
        if (scaleMode === "fit") {
          if (imgRatio > innerRatio) {
            targetW = innerW;
            targetH = innerW / imgRatio;
          } else {
            targetH = innerH;
            targetW = innerH * imgRatio;
          }
        } else if (scaleMode === "fill") {
          if (imgRatio > innerRatio) {
            targetH = innerH;
            targetW = innerH * imgRatio;
          } else {
            targetW = innerW;
            targetH = innerW / imgRatio;
          }
        } else if (scaleMode === "stretch") {
          targetW = innerW;
          targetH = innerH;
        } else if (scaleMode === "original") {
          targetW = imgW;
          targetH = imgH;
        }

        const page = doc.addPage([pW, pH]);
        const x = (pW - targetW) / 2;
        const y = (pH - targetH) / 2;
        page.drawImage(img, { x, y, width: targetW, height: targetH });
      }
      const bytes = await doc.save();
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        (imgFiles.length === 1
          ? imgFiles[0].name.replace(/\.(jpe?g|png)$/i, "")
          : "images") + "-combined.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      setError("Images->PDF failed: " + (err.message || err));
    } finally {
      setProcessing(false);
    }
  }

  return (
    <section>
      <h2>JPG/PNG(s) → PDF</h2>
      <input
        type="file"
        accept="image/jpeg,image/png"
        multiple
        onChange={(e) => onImgFilesSelected(e.target.files)}
      />
      <div
        style={{ marginTop: 8, display: "flex", gap: 12, alignItems: "center" }}
      >
        <label>
          Page size:{" "}
          <select
            value={pageSize}
            onChange={(e) => setPageSize(e.target.value)}
          >
            <option value="original">Original</option>
            <option value="A4">A4</option>
            <option value="Letter">Letter</option>
          </select>
        </label>

        <label>
          Scale:{" "}
          <select
            value={scaleMode}
            onChange={(e) => setScaleMode(e.target.value)}
          >
            <option value="fit">Fit</option>
            <option value="fill">Fill (crop)</option>
            <option value="stretch">Stretch</option>
            <option value="original">Original size</option>
          </select>
        </label>

        <label>
          Margin (mm):{" "}
          <input
            type="number"
            value={marginMm}
            min={0}
            onChange={(e) => setMarginMm(Number(e.target.value))}
            style={{ width: 80 }}
          />
        </label>
      </div>

      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>
          Preview (first image)
        </div>
        <canvas
          ref={previewRef}
          style={{ border: "1px solid #ddd", width: 280, height: 200 }}
        />
      </div>

      <div style={{ marginTop: 8 }}>
        <button
          className="btn primary"
          onClick={imagesToPdf}
          disabled={processing || imgFiles.length === 0}
        >
          {processing ? "Working..." : "Create PDF from images"}
        </button>
      </div>

      <div style={{ marginTop: 12 }}>
        {imgFiles.map((f, i) => (
          <div key={i} style={{ marginBottom: 8 }}>
            {f.name} ({Math.round(f.size / 1024)} KB)
          </div>
        ))}
      </div>
      {error && <div className="error">{error}</div>}
    </section>
  );
}
