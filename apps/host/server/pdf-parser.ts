/**
 * PDF importer — renders each page to a PNG so the designed slide is shown
 * the same way on Windows and on Linux/Render.
 */

import { createCanvas } from "@napi-rs/canvas";
import type { Slide } from "@preachsync/shared";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const TARGET_PAGE_WIDTH = 1600;
const MAX_PAGES = 150;

interface PdfTextItem {
  str?: string;
}

function titleFromPageText(items: PdfTextItem[], pageNumber: number): string {
  const text = items
    .map((item) => item.str?.trim() ?? "")
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) {
    return `Slide ${pageNumber}`;
  }

  return text.length > 80 ? `${text.slice(0, 77)}…` : text;
}

export async function importPdf(buffer: Buffer): Promise<Slide[]> {
  const loadingTask = getDocument(new Uint8Array(buffer));

  const pdf = await loadingTask.promise;
  const pageCount = Math.min(pdf.numPages, MAX_PAGES);
  const slides: Slide[] = [];

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const unscaled = page.getViewport({ scale: 1 });
    const scale = TARGET_PAGE_WIDTH / unscaled.width;
    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const canvasContext = canvas.getContext("2d");

    await page.render({
      canvas: canvas as unknown as HTMLCanvasElement,
      canvasContext: canvasContext as unknown as CanvasRenderingContext2D,
      viewport,
    }).promise;

    const textContent = await page.getTextContent();
    const title = titleFromPageText(
      textContent.items as PdfTextItem[],
      pageNumber,
    );

    slides.push({
      id: `slide-${pageNumber}`,
      title,
      body: "",
      imageDataUrl: `data:image/png;base64,${canvas.toBuffer("image/png").toString("base64")}`,
    });
  }

  return slides;
}
