import React, { useState, useRef } from "react";
import { PDFDocument } from "pdf-lib";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf";
// We can't import the worker as a default ESM export in all bundlers.
// Use a URL reference which works with Vite/ESM.
import "./upload-area.css";

const MAX_FILE_BYTES = 150 * 1024 * 1024; // 150 MB per file

function formatSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

// wire pdfjs worker via URL so Vite can resolve it correctly
GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/legacy/build/pdf.worker.min.js",
  import.meta.url
).href;

export default function UploadArea() {
  const [files, setFiles] = useState([]); // { file, id, thumbnail }
  const [useServer, setUseServer] = useState(false);
  const [error, setError] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [progressText, setProgressText] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState(null);

  // inputRef not required currently
  // drag refs for handle-only HTML5 drag
  const dragIndexRef = useRef(null);
  const allowDragRef = useRef(null);

  function onHandleMouseDown(id) {
    allowDragRef.current = id;
  }

  function onDragStart(e, idx, id) {
    if (allowDragRef.current !== id) {
      // prevent drag unless started on handle
      e.preventDefault();
      return;
    }
    dragIndexRef.current = idx;
    e.dataTransfer.effectAllowed = "move";
    try {
      e.dataTransfer.setData("text/plain", id);
    } catch {
      // ignore
    }
  }

  function onDragEnter(e, idx) {
    e.preventDefault();
    const from = dragIndexRef.current;
    const to = idx;
    if (from === null || from === to) return;
    setFiles((s) => {
      const copy = [...s];
      const [moved] = copy.splice(from, 1);
      copy.splice(to, 0, moved);
      dragIndexRef.current = to;
      return copy;
    });
  }

  function onDragEnd() {
    dragIndexRef.current = null;
    allowDragRef.current = null;
  }

  async function makeThumbnail(file) {
    try {
      const array = await file.arrayBuffer();
      const loadingTask = getDocument({ data: array });
      const pdf = await loadingTask.promise;
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 1 });
      const targetWidth = 140; // px
      const scale = targetWidth / viewport.width;
      const scaled = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(scaled.width);
      canvas.height = Math.round(scaled.height);
      const ctx = canvas.getContext("2d");
      const renderTask = page.render({ canvasContext: ctx, viewport: scaled });
      await renderTask.promise;
      const dataUrl = canvas.toDataURL("image/png");
      return dataUrl;
    } catch (err) {
      console.warn("thumbnail generation failed", err);
      return null;
    }
  }

  function cryptoRandomId() {
    try {
      return crypto.getRandomValues(new Uint32Array(4)).join("-");
    } catch {
      return Math.random().toString(36).slice(2);
    }
  }

  function buildServerUrl(path) {
    const base = window.SERVER_BASE || "http://localhost:4000";
    return base.replace(/\/$/, "") + path;
  }

  async function generateThumbnails(items) {
    for (const it of items) {
      makeThumbnail(it.file).then((thumb) => {
        setFiles((prev) =>
          prev.map((p) => (p.id === it.id ? { ...p, thumbnail: thumb } : p))
        );
      });
    }
  }

  function onFilesSelected(selectedFiles) {
    setError(null);
    const arr = Array.from(selectedFiles || []);
    const validated = [];
    for (const f of arr) {
      if (f.type !== "application/pdf") {
        setError(
          "Only PDF files are supported for client-side operations in this demo."
        );
        continue;
      }
      if (f.size > MAX_FILE_BYTES) {
        setError(
          `File ${f.name} exceeds max size of ${formatSize(MAX_FILE_BYTES)}.`
        );
        continue;
      }
      validated.push({ file: f, id: cryptoRandomId(), thumbnail: null });
    }
    if (validated.length) {
      setFiles((s) => {
        const next = [...s, ...validated];
        generateThumbnails(validated);
        return next;
      });
    }
  }

  function onInputChange(e) {
    onFilesSelected(e.target.files);
    e.target.value = null;
  }

  function onDrop(e) {
    e.preventDefault();
    const dt = e.dataTransfer;
    if (dt && dt.files) onFilesSelected(dt.files);
  }

  function onDragOver(e) {
    e.preventDefault();
  }

  function removeAt(i) {
    setFiles((s) => s.filter((_, idx) => idx !== i));
  }

  async function mergeFiles() {
    setError(null);
    if (files.length < 1) {
      setError("Add at least one PDF to merge.");
      return;
    }
    if (useServer) {
      await uploadAndCreateServerJob();
      return;
    }

    setProcessing(true);
    setProgressText("Preparing merge...");
    try {
      const mergedPdf = await PDFDocument.create();
      let idx = 0;
      for (const entry of files) {
        idx++;
        setProgressText(`Loading ${idx}/${files.length}: ${entry.file.name}`);
        const arrayBuffer = await entry.file.arrayBuffer();
        const donorPdf = await PDFDocument.load(arrayBuffer);
        const copiedPages = await mergedPdf.copyPages(
          donorPdf,
          donorPdf.getPageIndices()
        );
        copiedPages.forEach((p) => mergedPdf.addPage(p));
      }
      setProgressText("Saving merged PDF...");
      const mergedBytes = await mergedPdf.save();
      const blob = new Blob([mergedBytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "merged.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setProgressText("Done");
    } catch (err) {
      console.error(err);
      setError("Merge failed: " + (err.message || err));
    } finally {
      setProcessing(false);
      setTimeout(() => setProgressText(""), 1200);
    }
  }

  async function uploadAndCreateServerJob() {
    setProcessing(true);
    setProgressText("Uploading files...");
    setUploadProgress(0);
    setDownloadUrl(null);
    try {
      const form = new FormData();
      for (const f of files) form.append("files", f.file, f.file.name);

      const uploadUrl = buildServerUrl("/api/upload");
      const uploadResp = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", uploadUrl);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 100);
            setUploadProgress(pct);
            setProgressText(`Uploading ${pct}%`);
          }
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(JSON.parse(xhr.responseText));
          } else {
            reject(new Error("Upload failed: " + xhr.statusText));
          }
        };
        xhr.onerror = () => reject(new Error("Upload network error"));
        xhr.send(form);
      });

      const uploaded = uploadResp.files || [];
      if (uploaded.length === 0) throw new Error("No files uploaded");
      setProgressText("Creating job...");
      const jobResp = await fetch(buildServerUrl("/api/jobs"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "merge",
          inputFiles: uploaded.map((f) => f.id),
        }),
      }).then((r) => r.json());

      const jobId = jobResp.jobId || jobResp.job || null;
      if (!jobId && jobResp.status === "done" && jobResp.downloadUrl) {
        const link = buildServerUrl(jobResp.downloadUrl);
        setDownloadUrl(link);
        setProgressText("Done");
        return;
      }
      if (!jobId) throw new Error("Job creation failed");
      setProgressText("Processing job...");

      const poll = async () => {
        const j = await fetch(buildServerUrl(`/api/jobs/${jobId}`)).then((r) =>
          r.json()
        );
        if (!j) throw new Error("Job status error");
        if (j.status === "done" && j.outputFileId) {
          const link = buildServerUrl(`/files/${j.outputFileId}`);
          setDownloadUrl(link);
          setProgressText("Done");
          return;
        }
        if (j.status === "failed") {
          throw new Error(j.error || "Job failed");
        }
        setTimeout(poll, 1200);
      };
      await poll();
    } catch (err) {
      console.error(err);
      setError("Server merge failed: " + (err.message || err));
    } finally {
      setProcessing(false);
      setUploadProgress(0);
    }
  }

  return (
    <div className="upload-root">
      <div className="upload-area" onDrop={onDrop} onDragOver={onDragOver}>
        <input
          id="file-input"
          type="file"
          accept="application/pdf"
          multiple
          onChange={onInputChange}
        />
        <label htmlFor="file-input" className="upload-label">
          Drag & drop PDFs here, or click to pick files
        </label>
      </div>

      <div className="file-list">
        {files.length === 0 && <p className="muted">No files added</p>}

        <div>
          {files.map((f, idx) => (
            <div
              key={f.id}
              className="file-item"
              draggable
              onDragStart={(e) => onDragStart(e, idx, f.id)}
              onDragEnter={(e) => onDragEnter(e, idx)}
              onDragOver={(e) => e.preventDefault()}
              onDragEnd={onDragEnd}
            >
              <div style={{ display: "flex", alignItems: "center" }}>
                <span
                  className="handle"
                  title="drag"
                  onMouseDown={() => onHandleMouseDown(f.id)}
                  onTouchStart={() => onHandleMouseDown(f.id)}
                />
                <div className="thumb">
                  {f.thumbnail ? (
                    <img src={f.thumbnail} alt="thumb" />
                  ) : (
                    <div
                      style={{
                        width: "100%",
                        height: "100%",
                        background: "#fafafa",
                      }}
                    />
                  )}
                </div>
                <div className="file-meta">
                  <strong>{f.file.name}</strong>
                  <span className="size">{formatSize(f.file.size)}</span>
                </div>
              </div>
              <div className="file-actions">
                <button onClick={() => removeAt(idx)} className="btn small">
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="controls">
        <label
          style={{
            display: "inline-flex",
            gap: 8,
            alignItems: "center",
            marginRight: 12,
          }}
        >
          <input
            type="checkbox"
            checked={useServer}
            onChange={(e) => setUseServer(e.target.checked)}
          />
          <span style={{ fontSize: 12 }}>Use server processing</span>
        </label>

        <button
          className="btn primary"
          onClick={mergeFiles}
          disabled={processing || files.length === 0}
        >
          {processing
            ? "Processing..."
            : useServer
            ? "Upload & Merge (server)"
            : "Merge PDFs (client)"}
        </button>
        {downloadUrl && (
          <a className="btn" href={downloadUrl} style={{ marginLeft: 8 }}>
            Download result
          </a>
        )}
        {processing && <div className="progress">{progressText}</div>}
        {uploadProgress > 0 && (
          <div style={{ marginTop: 8 }}>
            <progress value={uploadProgress} max={100} style={{ width: 220 }} />
            <div className="progress">Upload: {uploadProgress}%</div>
          </div>
        )}
        {error && <div className="error">{error}</div>}
      </div>
    </div>
  );
}
