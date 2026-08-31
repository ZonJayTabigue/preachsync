import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { importPdf } from "./pdf-parser";

async function makePdf(pages: string[]): Promise<Buffer> {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);

  for (const pageTitle of pages) {
    const page = document.addPage([640, 360]);
    page.drawText(pageTitle, { x: 48, y: 280, size: 28, font });
  }

  return Buffer.from(await document.save());
}

describe("importPdf", () => {
  it("renders each page as a slide image", async () => {
    const buffer = await makePdf(["Welcome", "John 3:16"]);
    const slides = await importPdf(buffer);

    expect(slides).toHaveLength(2);
    expect(slides[0].id).toBe("slide-1");
    expect(slides[0].title).toMatch(/Welcome/i);
    expect(slides[0].imageDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(slides[1].title).toMatch(/John 3:16/i);
    expect(slides[1].imageDataUrl).toMatch(/^data:image\/png;base64,/);
  });
});
