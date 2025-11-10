# PdfMaster — server (MVP)

This is a minimal Express server for the PdfMaster MVP. It implements basic file upload and synchronous merge processing so you can test the end-to-end flow quickly.

Endpoints:

- POST /api/upload — multipart form upload (field name `files`) returns stored file metadata with `id`.
- POST /api/jobs — JSON body { type: 'merge', inputFiles: [fileId,...] } — performs synchronous merge and returns { jobId, downloadUrl } when done.
- GET /api/jobs/:jobId — get job status and metadata.
- GET /files/:fileId — download the stored file.
- DELETE /files/:fileId — immediate deletion (idempotent).

Storage:

- Files are stored in `server/uploads` with auto-generated ids and a 24-hour expiry.
- Metadata is persisted to JSON files in `server/data`.

Run locally:

```powershell
cd server
npm install
npm run dev
```

Notes:

- This is a development scaffold. For production you should add authentication/rate-limiting, virus scanning (ClamAV), signed URLs for downloads, and move storage to S3 or similar.
