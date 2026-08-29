import assert from "node:assert/strict";
import test from "node:test";

import { extractPdfText, PdfTextExtractionError } from "./extract-pdf";

function pdfWithText(text: string): Uint8Array {
  const escaped = text.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
  const stream = `BT /F1 12 Tf 40 740 Td (${escaped}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let source = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(source));
    source += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(source);
  source += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  source += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  source += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Uint8Array(Buffer.from(source));
}

test("extracts selectable text from a valid PDF", async () => {
  const expected = "Experienced software engineer building reliable TypeScript and React applications for customers.";
  assert.match(await extractPdfText(pdfWithText(expected)), /Experienced software engineer/);
});

test("surfaces a useful error for an invalid PDF", async () => {
  await assert.rejects(
    extractPdfText(new Uint8Array(Buffer.from("not a pdf"))),
    (error: unknown) => error instanceof PdfTextExtractionError && /valid, unencrypted PDF/.test(error.message),
  );
});

test("gracefully rejects a PDF with no meaningful selectable text", async () => {
  await assert.rejects(
    extractPdfText(pdfWithText("")),
    (error: unknown) => error instanceof PdfTextExtractionError && /little or no selectable text/.test(error.message),
  );
});
