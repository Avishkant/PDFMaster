import React, { useState } from "react";
import { PDFDocument, degrees } from "pdf-lib";

function buildServerUrl(path) {
  const base = window.SERVER_BASE || "http://localhost:4000";
  return base.replace(/\/$/, "") + path;
}

export default function RotatePage() {
  const [file, setFile] = useState(null);
  const [angle, setAngle] = useState(90);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [useServer, setUseServer] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState(null);

  function onChange(e) {
    const f = e.target.files && e.target.files[0];
    if (f) setFile(f);
  }

  async function rotateAll() {
    setError(null);
    if (!file) return setError("Pick a PDF");

    if (useServer) {
      setProcessing(true);
      setUploadProgress(0);
      try {
        const form = new FormData();
        form.append("files", file, file.name);
        const uploadResp = await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("POST", buildServerUrl("/api/upload"));
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable)
              setUploadProgress(Math.round((e.loaded / e.total) * 100));
          };
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300)
              resolve(JSON.parse(xhr.responseText));
            else reject(new Error("upload"));
          };
          xhr.onerror = () => reject(new Error("network"));
          xhr.send(form);
        });
        const uploaded = uploadResp.files || [];
        if (!uploaded.length) throw new Error("upload failed");
        const jobResp = await fetch(buildServerUrl("/api/jobs"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "rotate",
            inputFiles: [uploaded[0].id],
            params: { angle },
          }),
        }).then((r) => r.json());
        if (jobResp.status === "done" && jobResp.downloadUrl) {
          setDownloadUrl(buildServerUrl(jobResp.downloadUrl));
          setProcessing(false);
          return;
        }
        const jobId = jobResp.jobId;
        if (!jobId) throw new Error("job create failed");
        const poll = async () => {
          const j = await fetch(buildServerUrl(`/api/jobs/${jobId}`)).then(
            (r) => r.json()
          );
          if (j.status === "done" && j.outputFileId) {
            setDownloadUrl(buildServerUrl(`/files/${j.outputFileId}`));
            setProcessing(false);
            return;
          }
          if (j.status === "failed") throw new Error(j.error || "job failed");
          setTimeout(poll, 1200);
        };
        await poll();
      } catch (err) {
        console.error(err);
        setError("Server rotate failed: " + (err.message || err));
      } finally {
        setProcessing(false);
        setUploadProgress(0);
      }
      return;
    }

    setProcessing(true);
    try {
      const arr = await file.arrayBuffer();
      const doc = await PDFDocument.load(arr);
      const pageCount = doc.getPageCount();
      for (let i = 0; i < pageCount; i++) {
        const p = doc.getPage(i);
        p.setRotation(degrees(angle));
      }
      const bytes = await doc.save();
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name.replace(/\.pdf$/i, "") + `-rotated-${angle}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      setError("Rotate failed: " + (err.message || err));
    } finally {
      setProcessing(false);
    }
  }

  return (
    <section>
      <h2>Rotate Pages</h2>
      <p style={{ color: "#666" }}>Rotate all pages by a fixed angle.</p>
      <div style={{ marginTop: 12 }}>
        <input type="file" accept="application/pdf" onChange={onChange} />
        <label
          style={{
            display: "inline-flex",
            gap: 8,
            alignItems: "center",
            marginLeft: 12,
          }}
        >
          <input
            type="checkbox"
            checked={useServer}
            onChange={(e) => setUseServer(e.target.checked)}
          />
          <span style={{ fontSize: 12 }}>Use server processing</span>
        </label>
        <div style={{ marginTop: 8 }}>
          <label style={{ marginRight: 8 }}>Angle:</label>
          <select
            value={angle}
            onChange={(e) => setAngle(parseInt(e.target.value, 10))}
          >
            <option value={90}>90°</option>
            <option value={180}>180°</option>
            <option value={270}>270°</option>
          </select>
        </div>
        <div style={{ marginTop: 8 }}>
          <button
            className="btn primary"
            onClick={rotateAll}
            disabled={processing || !file}
          >
            {processing
              ? "Processing..."
              : useServer
              ? "Upload & Rotate (server)"
              : "Rotate PDF"}
          </button>
          {downloadUrl && (
            <a className="btn" href={downloadUrl} style={{ marginLeft: 8 }}>
              Download result
            </a>
          )}
        </div>
        {uploadProgress > 0 && (
          <div>
            <progress value={uploadProgress} max={100}></progress>
            <div className="progress">Upload: {uploadProgress}%</div>
          </div>
        )}
        {error && <div className="error">{error}</div>}
      </div>
    </section>
  );
}
