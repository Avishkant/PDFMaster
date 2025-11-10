import React from "react";
import { Link } from "react-router-dom";
import "./pages.css";

function Card({ to, title, desc }) {
  return (
    <Link to={to} className="svc-card">
      <h3>{title}</h3>
      <p>{desc}</p>
    </Link>
  );
}

export default function Home() {
  return (
    <div className="home-root">
      <div className="cards-grid">
        <Card
          to="/merge"
          title="Merge PDFs"
          desc="Combine multiple PDFs into one file."
        />
        <Card
          to="/split"
          title="Split PDF"
          desc="Extract pages or split a PDF into multiple files."
        />
        <Card
          to="/compress"
          title="Compress PDF"
          desc="Reduce PDF file size for easy sharing."
        />
        <Card
          to="/rotate"
          title="Rotate Pages"
          desc="Rotate pages clockwise or counter-clockwise."
        />
        <Card
          to="/extract"
          title="Extract Pages"
          desc="Select and download specific pages from a PDF."
        />
        <Card
          to="/convert?target=docx"
          title="PDF → Word"
          desc="Convert a PDF document into an editable Word (.docx) file."
        />
        <Card
          to="/convert?target=pptx"
          title="PDF → PowerPoint"
          desc="Convert a PDF into a PowerPoint (.pptx) presentation."
        />
        <Card
          to="/convert?target=xlsx"
          title="PDF → Excel"
          desc="Convert a PDF into an Excel (.xlsx) workbook where possible."
        />
      </div>
    </div>
  );
}
