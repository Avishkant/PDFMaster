import React from "react";
import UploadArea from "../components/UploadArea";

export default function MergePage() {
  return (
    <section>
      <h2>Merge PDFs</h2>
      <p style={{ color: "#666" }}>
        Drag & drop multiple PDFs, reorder and merge them locally.
      </p>
      <UploadArea />
    </section>
  );
}
