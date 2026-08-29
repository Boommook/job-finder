import { PDFParse } from "pdf-parse";

export class PdfTextExtractionError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PdfTextExtractionError";
  }
}

export async function extractPdfText(data: Uint8Array): Promise<string> {
  const parser = new PDFParse({ data });
  try {
    const text = (await parser.getText()).text.trim();
    if (text.length < 80) {
      throw new PdfTextExtractionError(
        "This PDF has little or no selectable text. OCR is not run automatically.",
      );
    }
    return text;
  } catch (error) {
    if (error instanceof PdfTextExtractionError) throw error;
    throw new PdfTextExtractionError(
      "The PDF text could not be extracted. Check that the file is a valid, unencrypted PDF.",
      { cause: error },
    );
  } finally {
    await parser.destroy();
  }
}
