import fs from "fs";
import path from "path";
import { PDFDocument, rgb } from "pdf-lib";

async function makeSample(filePath, text) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([400, 200]);
  const timesRomanFont = await pdf.embedFont("Times-Roman");
  page.drawText(text, {
    x: 50,
    y: 100,
    size: 24,
    font: timesRomanFont,
    color: rgb(0, 0, 0),
  });
  const bytes = await pdf.save();
  fs.writeFileSync(filePath, bytes);
}

async function main() {
  const out = path.join(process.cwd(), "test_files");
  if (!fs.existsSync(out)) fs.mkdirSync(out);
  await makeSample(path.join(out, "sample1.pdf"), "Sample PDF 1");
  await makeSample(path.join(out, "sample2.pdf"), "Sample PDF 2");
  console.log("Wrote sample PDFs to", out);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
