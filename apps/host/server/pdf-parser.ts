/**
 * PDF importer — renders each page to a JPEG so the designed slide is shown
 * the same way on Windows and on Linux/Render.
 */

import { createCanvas } from "@napi-rs/canvas";
import { getDocument, type PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";

const TARGET_PAGE_WIDTH = 1280;
const MAX_PAGES = 150;
const RENDER_CONCURRENCY = 3;
const JPEG_QUALITY = 82;

interface PdfTextItem {
  str?: string;
}

export interface RenderedPdfPage {
  id: string;
  title: string;
  body: string;
  imageBytes: Buffer;
  mimeType: "image/jpeg";
}

export interface OpenPdfDocument {
  pdf: PDFDocumentProxy;
  pageCount: number;
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

export async function openPdfDocument(buffer: Buffer): Promise<OpenPdfDocument> {
  const loadingTask = getDocument(new Uint8Array(buffer));
  const pdf = await loadingTask.promise;
  const pageCount = Math.min(pdf.numPages, MAX_PAGES);
  return { pdf, pageCount };
}

export async function renderPdfPage(
  pdf: PDFDocumentProxy,
  pageNumber: number,
): Promise<RenderedPdfPage> {
  const page = await pdf.getPage(pageNumber);
  const unscaled = page.getViewport({ scale: 1 });
  const scale = TARGET_PAGE_WIDTH / unscaled.width;
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(
    Math.ceil(viewport.width),
    Math.ceil(viewport.height),
  );
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

  return {
    id: `slide-${pageNumber}`,
    title,
    body: "",
    imageBytes: canvas.toBuffer("image/jpeg", JPEG_QUALITY),
    mimeType: "image/jpeg",
  };
}

async function mapWithConcurrency(
  pageNumbers: number[],
  worker: (pageNumber: number) => Promise<void>,
  shouldContinue?: () => boolean,
): Promise<void> {
  let nextIndex = 0;

  async function runWorker(): Promise<void> {
    while (nextIndex < pageNumbers.length) {
      if (shouldContinue && !shouldContinue()) {
        return;
      }
      const pageNumber = pageNumbers[nextIndex];
      nextIndex += 1;
      if (pageNumber === undefined) {
        return;
      }
      await worker(pageNumber);
    }
  }

  const workerCount = Math.min(RENDER_CONCURRENCY, pageNumbers.length);
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
}

export async function importPdf(buffer: Buffer): Promise<RenderedPdfPage[]> {
  const { pdf, pageCount } = await openPdfDocument(buffer);
  const pages: RenderedPdfPage[] = new Array(pageCount);

  try {
    const pageNumbers = Array.from({ length: pageCount }, (_, index) => index + 1);
    await mapWithConcurrency(pageNumbers, async (pageNumber) => {
      pages[pageNumber - 1] = await renderPdfPage(pdf, pageNumber);
    });
  } finally {
    await pdf.destroy();
  }

  return pages;
}

export async function renderPdfPagesInBackground(
  pdf: PDFDocumentProxy,
  pageNumbers: number[],
  onPage: (page: RenderedPdfPage) => Promise<void> | void,
  shouldContinue?: () => boolean,
): Promise<void> {
  try {
    await mapWithConcurrency(
      pageNumbers,
      async (pageNumber) => {
        if (shouldContinue && !shouldContinue()) {
          return;
        }
        const page = await renderPdfPage(pdf, pageNumber);
        if (shouldContinue && !shouldContinue()) {
          return;
        }
        await onPage(page);
      },
      shouldContinue,
    );
  } finally {
    await pdf.destroy();
  }
}
