import { imageToDataUrl } from "@/lib/image";
import { SCAN_MAX_DATA_URL, SCAN_MAX_TEXT } from "@shared/types";

/** Below this many characters a PDF is treated as a scan (photo inside a PDF), not text. */
const MIN_TEXT = 200;

export type PdfScanInput = { text: string; pages: number } | { image: string; pages: number };

/**
 * Prepares a PDF for AI reading, in the browser. A PDF with real text (most lab reports from a lab's
 * system) sends that text: every page, more accurate than a photo, and fewer AI units. A scanned PDF
 * sends page 1 as an image, like a photo. pdf.js is loaded only when a PDF is read.
 */
export async function pdfForScan(file: File): Promise<PdfScanInput> {
  const [pdfjs, { default: workerUrl }] = await Promise.all([import("pdfjs-dist/legacy/build/pdf.mjs"), import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url")]);
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const doc = await task.promise;
  try {
    let text = "";
    for (let n = 1; n <= doc.numPages && text.length < SCAN_MAX_TEXT; n++) {
      const content = await (await doc.getPage(n)).getTextContent();
      for (const item of content.items) if ("str" in item) text += item.str + (item.hasEOL ? "\n" : " ");
      text += "\n";
    }
    text = text.replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
    if (text.length >= MIN_TEXT) return { text: text.slice(0, SCAN_MAX_TEXT), pages: doc.numPages };

    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: 1600 / Math.max(base.width, base.height) });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob) throw new Error("Could not read this PDF");
    return { image: await imageToDataUrl(new File([blob], "page.jpg", { type: "image/jpeg" }), SCAN_MAX_DATA_URL), pages: doc.numPages };
  } finally {
    await task.destroy();
  }
}
