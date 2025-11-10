import React, { useState, useEffect, useRef } from "react";
import React from "react";
import { Link } from "react-router-dom";

export default function ImagesPage() {
  return (
    <section>
      <h2>Images ↔ PDF</h2>
      <p>Choose a specific tool:</p>
      <div style={{ display: "flex", gap: 12 }}>
        <Link className="btn" to="/images/pdf-to-jpg">
          PDF → JPG
        </Link>
        <Link className="btn" to="/images/jpg-to-pdf">
          Images → PDF
        </Link>
      </div>
      <p style={{ marginTop: 12, color: "#666" }}>
        The old combined Images page was split into two focused dashboards for
        clarity. Use the links above or the top navigation.
      </p>
    </section>
  );
}
                  />
                </div>
                <div>
                  <div>{it.name}</div>
                  <a
                    className="btn"
                    import React from "react";
                    import { Link } from "react-router-dom";

                    export default function ImagesPage() {
                      return (
                        <section>
                          <h2>Images ↔ PDF</h2>
                          <p>Choose a specific tool:</p>
                          <div style={{ display: "flex", gap: 12 }}>
                            <Link className="btn" to="/images/pdf-to-jpg">
                              PDF → JPG
                            </Link>
                            <Link className="btn" to="/images/jpg-to-pdf">
                              Images → PDF
                            </Link>
                          </div>
                          <p style={{ marginTop: 12, color: "#666" }}>
                            The old combined Images page was split into two focused dashboards for
                            clarity. Use the links above or the top navigation.
                          </p>
                        </section>
                      );
                    }
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
        </div>
      </div>
    </section>
  );
}
