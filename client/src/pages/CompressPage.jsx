import React, { useState } from "react";
import { PDFDocument } from "pdf-lib";

function buildServerUrl(path) {
  const base = window.SERVER_BASE || "http://localhost:4000";
  return base.replace(/\/$/, "") + path;
}

export default function CompressPage() {
  const [file, setFile] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [useServer, setUseServer] = useState(true);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState(null);
  const [error, setError] = useState(null);

  function onChange(e) {
    const f = e.target.files && e.target.files[0];
    if (f) setFile(f);
  }

  async function compress() {
    setError(null);
    if (!file) return setError("Pick a PDF");
    if (useServer) {
      setProcessing(true);
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
            else reject(new Error("upload failed"));
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
            type: "compress",
            inputFiles: [uploaded[0].id],
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
        setError("Compress failed: " + (err.message || err));
      } finally {
        setProcessing(false);
        setUploadProgress(0);
      }
      return;
    }

    // client-side naive re-save
    setProcessing(true);
    try {
      const arr = await file.arrayBuffer();
      const doc = await PDFDocument.load(arr);
      const bytes = await doc.save();
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name.replace(/\.pdf$/i, "") + "-resaved.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      setError("Compress failed: " + (err.message || err));
    } finally {
      setProcessing(false);
    }
  }

  return (
    <section>
      <h2>Compress PDF</h2>
      <p style={{ color: "#666" }}>
        Compress a PDF (server-side recommended for best results).
      </p>
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
          <span style={{ fontSize: 12 }}>Use server compression</span>
        </label>
        <div style={{ marginTop: 8 }}>
          <button
            className="btn primary"
            onClick={compress}
            disabled={processing || !file}
          >
            {processing
              ? "Processing..."
              : useServer
              ? "Upload & Compress (server)"
              : "Compress (client resave)"}
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
