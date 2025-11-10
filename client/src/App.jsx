import React from "react";
import "./App.css";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import Home from "./pages/Home";
import MergePage from "./pages/MergePage";
import SplitPage from "./pages/SplitPage";
import CompressPage from "./pages/CompressPage";
import RotatePage from "./pages/RotatePage";
import ExtractPage from "./pages/ExtractPage";
import PdfToJpgPage from "./pages/PdfToJpgPage";
import ImagesToPdfPage from "./pages/ImagesToPdfPage";
import ConvertOfficePage from "./pages/ConvertOfficePage";

function Nav() {
  return (
    <nav
      className="top-nav"
      style={{
        display: "flex",
        gap: "1rem",
        justifyContent: "center",
        marginBottom: "1rem",
      }}
    >
      <Link to="/">Home</Link>
      <Link to="/merge">Merge</Link>
      <Link to="/split">Split</Link>
      <Link to="/compress">Compress</Link>
      <Link to="/images/pdf-to-jpg">PDF → JPG</Link>
      <Link to="/images/jpg-to-pdf">Images → PDF</Link>
      <Link to="/convert">Convert</Link>
      <Link to="/rotate">Rotate</Link>
      <Link to="/extract">Extract</Link>
    </nav>
  );
}

function App() {
  return (
    <BrowserRouter>
      <div id="app-root">
        <header style={{ textAlign: "center", marginBottom: "1rem" }}>
          <h1>PdfMaster — Quick tools</h1>
          <p style={{ color: "#888" }}>
            Accountless, one-off PDF tools. Pick a service to start.
          </p>
        </header>
        <Nav />
        <main>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/merge" element={<MergePage />} />
            <Route path="/split" element={<SplitPage />} />
            <Route path="/compress" element={<CompressPage />} />
            <Route path="/images/pdf-to-jpg" element={<PdfToJpgPage />} />
            <Route path="/images/jpg-to-pdf" element={<ImagesToPdfPage />} />
            <Route path="/convert" element={<ConvertOfficePage />} />
            <Route path="/rotate" element={<RotatePage />} />
            <Route path="/extract" element={<ExtractPage />} />
          </Routes>
        </main>
        <footer
          style={{ textAlign: "center", marginTop: "2rem", color: "#999" }}
        >
          <small>
            Client-side tools & demo — files are not uploaded unless you choose
            the server flow.
          </small>
        </footer>
      </div>
    </BrowserRouter>
  );
}

export default App;
