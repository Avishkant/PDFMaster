import React, { useState } from "react";
import { PDFDocument } from "pdf-lib";

function buildServerUrl(path) {
  const base = window.SERVER_BASE || "http://localhost:4000";
  return base.replace(/\/$/, "") + path;
}

export default function SplitPage() {
  const [file, setFile] = useState(null);
  const [error, setError] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [progressText, setProgressText] = useState("");
  const [useServer, setUseServer] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState(null);

  function onChange(e) {
    setError(null);
    const f = e.target.files && e.target.files[0];
    if (f) setFile(f);
  }

  async function splitIntoPages() {
    setError(null);
    if (!file) return setError("Pick a PDF file");
    if (useServer) {
      // upload and create split job
      setProcessing(true);
      setUploadProgress(0);
      setProgressText("Uploading...");
      try {
        const form = new FormData();
        form.append("files", file, file.name);
        const uploadResp = await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("POST", buildServerUrl("/api/upload"));
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              const pct = Math.round((e.loaded / e.total) * 100);
              setUploadProgress(pct);
              setProgressText(`Uploading ${pct}%`);
            }
          };
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300)
              resolve(JSON.parse(xhr.responseText));
            else reject(new Error("Upload failed"));
          };
          xhr.onerror = () => reject(new Error("Network"));
          xhr.send(form);
        });
        const uploaded = uploadResp.files || [];
        if (!uploaded.length) throw new Error("Upload failed");
        setProgressText("Creating job...");
        const jobResp = await fetch(buildServerUrl("/api/jobs"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "split", inputFiles: [uploaded[0].id] }),
        }).then((r) => r.json());
        if (jobResp.status === "done" && jobResp.downloadUrl) {
          setDownloadUrl(buildServerUrl(jobResp.downloadUrl));
          setProgressText("Done");
          return;
        }
        const jobId = jobResp.jobId;
        if (!jobId) throw new Error("Job create failed");
        // poll
        const poll = async () => {
          const j = await fetch(buildServerUrl(`/api/jobs/${jobId}`)).then(
            (r) => r.json()
          );
          if (j.status === "done" && j.outputFileId) {
            setDownloadUrl(buildServerUrl(`/files/${j.outputFileId}`));
            setProgressText("Done");
            return;
          }
          if (j.status === "failed") throw new Error(j.error || "Job failed");
          setTimeout(poll, 1200);
        };
        await poll();
      } catch (err) {
        console.error(err);
        setError("Server split failed: " + (err.message || err));
      } finally {
        setProcessing(false);
        setUploadProgress(0);
      }
      return;
    }

    // client-side split
    setProcessing(true);
    try {
      const arr = await file.arrayBuffer();
      const doc = await PDFDocument.load(arr);
      const total = doc.getPageCount();
      for (let i = 0; i < total; i++) {
        setProgressText(`Creating page ${i + 1}/${total}`);
        const out = await PDFDocument.create();
        const [copied] = await out.copyPages(doc, [i]);
        out.addPage(copied);
        const bytes = await out.save();
        const blob = new Blob([bytes], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${file.name.replace(/\.pdf$/i, "")}-page-${i + 1}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }
      setProgressText("Done");
    } catch (err) {
      console.error(err);
      setError("Split failed: " + (err.message || err));
    } finally {
      setProcessing(false);
      setTimeout(() => setProgressText(""), 1500);
    }
  }

  return (
    <section>
      <h2>Split PDF</h2>
      <p style={{ color: "#666" }}>Split a PDF into single-page files.</p>
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
        {file && (
          <div style={{ marginTop: 8 }}>
            <strong>{file.name}</strong>
          </div>
        )}
        <div style={{ marginTop: 8 }}>
          <button
            className="btn primary"
            onClick={splitIntoPages}
            disabled={processing || !file}
          >
            {processing
              ? "Processing..."
              : useServer
              ? "Upload & Split (server)"
              : "Split into pages"}
          </button>
          {downloadUrl && (
            <a className="btn" href={downloadUrl} style={{ marginLeft: 8 }}>
              Download result
            </a>
          )}
        </div>
        {progressText && <div className="progress">{progressText}</div>}
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
