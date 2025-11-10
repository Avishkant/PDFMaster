import express from "express";
import cors from "cors";
import helmet from "helmet";
import multer from "multer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from "uuid";
import { PDFDocument } from "pdf-lib";
import mime from "mime-types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(helmet());
app.use(express.json());

const DATA_DIR = path.join(__dirname, "data");
const UPLOADS_DIR = path.join(__dirname, "uploads");
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const FILES_DB = path.join(DATA_DIR, "files.json");
const JOBS_DB = path.join(DATA_DIR, "jobs.json");

function readJson(file, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, obj) {
  fs.writeFileSync(file, JSON.stringify(obj, null, 2));
}

let files = readJson(FILES_DB, {});
import archiver from "archiver";
import { execFileSync } from "child_process";
let jobs = readJson(JOBS_DB, {});

function persist() {
  writeJson(FILES_DB, files);
  writeJson(JOBS_DB, jobs);
}

const upload = multer({
  dest: UPLOADS_DIR,
  limits: { fileSize: 200 * 1024 * 1024 }, // 200 MB per file
});

// POST /api/upload -> accept multipart/form-data 'files' (array)
app.post("/api/upload", upload.array("files", 10), (req, res) => {
  if (!req.files || req.files.length === 0)
    return res.status(400).json({ error: "No files" });
  const created = [];
  for (const f of req.files) {
    const id = uuidv4();
    const expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
    const storageName = path.basename(f.path);
    files[id] = {
      id,
      name: f.originalname,
      size: f.size,
      mime:
        f.mimetype || mime.lookup(f.originalname) || "application/octet-stream",
      storagePath: storageName,
      uploadedAt: Date.now(),
      expiresAt,
      status: "available",
    };
    created.push(files[id]);
  }
  persist();
  res.json({ files: created });
});

// POST /api/convert -> accept multipart/form-data 'file' and field 'target' (e.g. docx, pptx, xlsx, pdf)
app.post("/api/convert", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  const target = (req.body && req.body.target) || req.query.target;
  if (!target) return res.status(400).json({ error: "Missing target format" });
  const allowed = ["pdf", "docx", "pptx", "xlsx"];
  if (!allowed.includes(target))
    return res.status(400).json({ error: "Unsupported target format" });

  const origName = req.file.originalname;
  const srcTempPath = path.join(UPLOADS_DIR, req.file.filename);
  // create a copy with the original basename so soffice will emit the same base name with new ext
  const base = path.parse(origName).name;
  const tempInputName = `${base}${path.extname(origName) || ".tmp"}`;
  const tempInputPath = path.join(UPLOADS_DIR, tempInputName);
  try {
    fs.copyFileSync(srcTempPath, tempInputPath);
  } catch (e) {
    console.error("failed to copy temp input", e);
    return res.status(500).json({ error: "Failed to prepare file for conversion" });
  }

  // try soffice candidates
  const sofficeCandidates = ["soffice", "soffice.bin", "soffice.exe"];
  let sofficeUsed = null;
  let convertedPath = null;
  try {
    for (const cmd of sofficeCandidates) {
      try {
        execFileSync(cmd, [
          "--headless",
          "--convert-to",
          target,
          "--outdir",
          UPLOADS_DIR,
          tempInputPath,
        ], { stdio: "ignore" });
        sofficeUsed = cmd;
        break;
      } catch (e) {
        // try next
      }
    }

    if (!sofficeUsed) {
      // Not available — return a clear error explaining requirement
      return res.status(501).json({
        error:
          "Server-side conversion requires LibreOffice (soffice) installed and available on PATH",
        available: false,
      });
    }

    // LibreOffice writes output with base name + new extension
    const outName = `${base}.${target}`;
    const outPath = path.join(UPLOADS_DIR, outName);
    if (!fs.existsSync(outPath)) {
      // conversion failed unexpectedly
      return res.status(500).json({ error: "Conversion attempted but output not found" });
    }

    // register converted file
    const bytes = fs.readFileSync(outPath);
    const id = uuidv4();
    const storageName = path.basename(outPath);
    const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
    files[id] = {
      id,
      name: outName,
      size: bytes.length,
      mime: mime.lookup(outName) || "application/octet-stream",
      storagePath: storageName,
      uploadedAt: Date.now(),
      expiresAt,
      status: "available",
    };
    persist();

    // cleanup temp input (keep original uploaded file entry around)
    try {
      fs.unlinkSync(tempInputPath);
    } catch (e) {}

    return res.json({
      converted: true,
      downloadUrl: `/files/${id}`,
      soffice: sofficeUsed,
    });
  } catch (err) {
    console.error("conversion error", err);
    // cleanup temp
    try {
      if (fs.existsSync(tempInputPath)) fs.unlinkSync(tempInputPath);
    } catch (e) {}
    return res.status(500).json({ error: String(err.message || err) });
  }
});

// POST /api/jobs -> { type: 'merge', inputFiles: [fileId,...] }
app.post("/api/jobs", async (req, res) => {
  const { type, inputFiles, params } = req.body;
  if (!type || !Array.isArray(inputFiles) || inputFiles.length === 0) {
    return res.status(400).json({ error: "Invalid body" });
  }
  const jobId = uuidv4();
  jobs[jobId] = {
    id: jobId,
    type,
    inputFiles,
    params: params || {},
    status: "queued",
    createdAt: Date.now(),
  };
  persist();

  // For MVP: process certain job types synchronously (merge/split/rotate/compress)
  if (["merge", "split", "rotate", "compress"].includes(type)) {
    try {
      jobs[jobId].status = "processing";
      persist();
      const mergedPdf = await PDFDocument.create();
      for (const fid of inputFiles) {
        const fileMeta = files[fid];
        if (!fileMeta) throw new Error("Input file not found: " + fid);
        const filePath = path.join(UPLOADS_DIR, fileMeta.storagePath);
        const data = fs.readFileSync(filePath);
        const donor = await PDFDocument.load(data);
        const copied = await mergedPdf.copyPages(donor, donor.getPageIndices());
        copied.forEach((p) => mergedPdf.addPage(p));
      }

      if (type === "split") {
        // split first input file into pages and create a zip of single-page PDFs
        try {
          const fid = inputFiles[0];
          const fileMeta = files[fid];
          if (!fileMeta) throw new Error("Input file not found: " + fid);
          const srcPath = path.join(UPLOADS_DIR, fileMeta.storagePath);
          const data = fs.readFileSync(srcPath);
          const srcPdf = await PDFDocument.load(data);
          const pageCount = srcPdf.getPageCount();
          const createdFiles = [];
          for (let i = 0; i < pageCount; i++) {
            const outPdf = await PDFDocument.create();
            const [copied] = await outPdf.copyPages(srcPdf, [i]);
            outPdf.addPage(copied);
            const bytes = await outPdf.save();
            const outId = uuidv4();
            const outName = `${fileMeta.name.replace(/\.pdf$/i, "")}-page-${
              i + 1
            }.pdf`;
            const outPath = path.join(UPLOADS_DIR, outId);
            fs.writeFileSync(outPath, Buffer.from(bytes));
            const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
            files[outId] = {
              id: outId,
              name: outName,
              size: bytes.byteLength,
              mime: "application/pdf",
              storagePath: path.basename(outPath),
              uploadedAt: Date.now(),
              expiresAt,
              status: "available",
            };
            createdFiles.push(files[outId]);
          }

          // Create a zip containing all createdFiles
          const zipId = uuidv4();
          const zipName = `${fileMeta.name.replace(/\.pdf$/i, "")}-pages.zip`;
          const zipPath = path.join(UPLOADS_DIR, zipId);
          const output = fs.createWriteStream(zipPath);
          const archive = archiver("zip", { zlib: { level: 9 } });
          archive.pipe(output);
          for (const cf of createdFiles) {
            const fpath = path.join(UPLOADS_DIR, cf.storagePath);
            archive.file(fpath, { name: cf.name });
          }
          await archive.finalize();
          const zstat = fs.statSync(zipPath);
          const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
          files[zipId] = {
            id: zipId,
            name: zipName,
            size: zstat.size,
            mime: "application/zip",
            storagePath: path.basename(zipPath),
            uploadedAt: Date.now(),
            expiresAt,
            status: "available",
          };
          jobs[jobId].status = "done";
          jobs[jobId].outputFileId = zipId;
          jobs[jobId].completedAt = Date.now();
          persist();
          return res.json({
            jobId,
            status: "done",
            downloadUrl: `/files/${zipId}`,
          });
        } catch (err) {
          console.error(err);
          jobs[jobId].status = "failed";
          jobs[jobId].error = String(err.message || err);
          persist();
          return res.status(500).json({
            jobId,
            status: "failed",
            error: err.message || String(err),
          });
        }
      }

      if (type === "rotate") {
        try {
          const angle = (params && params.angle) || 90;
          const mergedPdf = await PDFDocument.create();
          for (const fid of inputFiles) {
            const fileMeta = files[fid];
            if (!fileMeta) throw new Error("Input file not found: " + fid);
            const filePath = path.join(UPLOADS_DIR, fileMeta.storagePath);
            const data = fs.readFileSync(filePath);
            const donor = await PDFDocument.load(data);
            const idxs = donor.getPageIndices();
            const copied = await mergedPdf.copyPages(donor, idxs);
            copied.forEach((p) => {
              mergedPdf.addPage(p);
            });
          }
          // apply rotation to all pages
          const outDoc = mergedPdf;
          const pcount = outDoc.getPageCount();
          for (let i = 0; i < pcount; i++) {
            const p = outDoc.getPage(i);
            p.setRotation({ type: "degrees", angle });
          }
          const bytes = await outDoc.save();
          const outId = uuidv4();
          const outName = `rotated-${Date.now()}.pdf`;
          const outPath = path.join(UPLOADS_DIR, outId);
          fs.writeFileSync(outPath, Buffer.from(bytes));
          const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
          files[outId] = {
            id: outId,
            name: outName,
            size: bytes.byteLength,
            mime: "application/pdf",
            storagePath: path.basename(outPath),
            uploadedAt: Date.now(),
            expiresAt,
            status: "available",
          };
          jobs[jobId].status = "done";
          jobs[jobId].outputFileId = outId;
          jobs[jobId].completedAt = Date.now();
          persist();
          return res.json({
            jobId,
            status: "done",
            downloadUrl: `/files/${outId}`,
          });
        } catch (err) {
          console.error(err);
          jobs[jobId].status = "failed";
          jobs[jobId].error = String(err.message || err);
          persist();
          return res.status(500).json({
            jobId,
            status: "failed",
            error: err.message || String(err),
          });
        }
      }

      if (type === "compress") {
        // Try Ghostscript-based compression first (try common binary names on Windows too),
        // fallback to simple PDF resave if Ghostscript isn't available.
        try {
          const fid = inputFiles[0];
          const fileMeta = files[fid];
          if (!fileMeta) throw new Error("Input file not found: " + fid);
          const srcPath = path.join(UPLOADS_DIR, fileMeta.storagePath);
          const outId = uuidv4();
          const outPath = path.join(UPLOADS_DIR, outId);

          const gsCandidates = ["gs", "gswin64c", "gswin32c"];
          let gsUsed = null;
          for (const gsCmd of gsCandidates) {
            try {
              execFileSync(
                gsCmd,
                [
                  "-sDEVICE=pdfwrite",
                  "-dCompatibilityLevel=1.4",
                  "-dPDFSETTINGS=/ebook",
                  "-dNOPAUSE",
                  "-dBATCH",
                  `-sOutputFile=${outPath}`,
                  srcPath,
                ],
                { stdio: "ignore" }
              );
              gsUsed = gsCmd;
              break;
            } catch (e) {
              // try next candidate
            }
          }

          if (!gsUsed) {
            // Ghostscript not found or failed — fallback: reload and save with pdf-lib
            // Note: this is not true compression but preserves functionality.
            const src = await PDFDocument.load(fs.readFileSync(srcPath));
            const bytes = await src.save();
            fs.writeFileSync(outPath, Buffer.from(bytes));
          }

          const stat = fs.statSync(outPath);
          const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
          files[outId] = {
            id: outId,
            name: `compressed-${fileMeta.name}`,
            size: stat.size,
            mime: "application/pdf",
            storagePath: path.basename(outPath),
            uploadedAt: Date.now(),
            expiresAt,
            status: "available",
          };
          jobs[jobId].status = "done";
          jobs[jobId].outputFileId = outId;
          jobs[jobId].completedAt = Date.now();
          persist();
          return res.json({
            jobId,
            status: "done",
            downloadUrl: `/files/${outId}`,
            gsUsed: gsUsed || null,
          });
        } catch (err) {
          console.error(err);
          jobs[jobId].status = "failed";
          jobs[jobId].error = String(err.message || err);
          persist();
          return res.status(500).json({
            jobId,
            status: "failed",
            error: err.message || String(err),
          });
        }
      }
      const mergedBytes = await mergedPdf.save();
      const outId = uuidv4();
      const outName = `merged-${Date.now()}.pdf`;
      const outPath = path.join(UPLOADS_DIR, outId);
      fs.writeFileSync(outPath, Buffer.from(mergedBytes));
      const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
      files[outId] = {
        id: outId,
        name: outName,
        size: mergedBytes.byteLength,
        mime: "application/pdf",
        storagePath: path.basename(outPath),
        uploadedAt: Date.now(),
        expiresAt,
        status: "available",
      };
      jobs[jobId].status = "done";
      jobs[jobId].outputFileId = outId;
      jobs[jobId].completedAt = Date.now();
      persist();
      return res.json({
        jobId,
        status: "done",
        downloadUrl: `/files/${outId}`,
      });
    } catch (err) {
      console.error(err);
      jobs[jobId].status = "failed";
      jobs[jobId].error = String(err.message || err);
      persist();
      return res
        .status(500)
        .json({ jobId, status: "failed", error: err.message || String(err) });
    }
  }

  // Other job types can be implemented later.
  res.json({ jobId, status: "queued" });
});

app.get("/api/jobs/:jobId", (req, res) => {
  const job = jobs[req.params.jobId];
  if (!job) return res.status(404).json({ error: "Not found" });
  res.json(job);
});

// Stream file by id
app.get("/files/:fileId", (req, res) => {
  const f = files[req.params.fileId];
  if (!f) return res.status(404).json({ error: "file not found" });
  const fp = path.join(UPLOADS_DIR, f.storagePath);
  if (!fs.existsSync(fp))
    return res.status(404).json({ error: "file missing on disk" });
  res.setHeader("Content-Type", f.mime || "application/octet-stream");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${encodeURIComponent(f.name)}"`
  );
  const stream = fs.createReadStream(fp);
  stream.pipe(res);
});

// DELETE /files/:fileId
app.delete("/files/:fileId", (req, res) => {
  const id = req.params.fileId;
  const f = files[id];
  if (!f) return res.status(204).end();
  const fp = path.join(UPLOADS_DIR, f.storagePath);
  try {
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  } catch (e) {
    console.error("Failed to unlink", e);
  }
  delete files[id];
  // remove references from jobs
  for (const jid of Object.keys(jobs)) {
    const j = jobs[jid];
    if (j.outputFileId === id) j.outputFileId = null;
  }
  persist();
  res.json({ deleted: id });
});

// Simple cleanup job run every hour
setInterval(() => {
  const now = Date.now();
  let changed = false;
  for (const id of Object.keys(files)) {
    const f = files[id];
    if (f.expiresAt && f.expiresAt < now) {
      const fp = path.join(UPLOADS_DIR, f.storagePath);
      try {
        if (fs.existsSync(fp)) fs.unlinkSync(fp);
      } catch (e) {
        console.error("cleanup unlink error", e);
      }
      delete files[id];
      changed = true;
    }
  }
  // prune old jobs (e.g., older than 48h)
  for (const jid of Object.keys(jobs)) {
    const j = jobs[jid];
    if (j.createdAt && j.createdAt + 48 * 60 * 60 * 1000 < now) {
      delete jobs[jid];
      changed = true;
    }
  }
  if (changed) persist();
}, 1000 * 60 * 60);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
