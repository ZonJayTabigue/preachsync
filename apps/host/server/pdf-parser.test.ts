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

function isJpeg(bytes: Buffer): boolean {
  return bytes.length > 2 && bytes[0] === 0xff && bytes[1] === 0xd8;
}

describe("importPdf", () => {
  it("renders each page as a JPEG buffer", async () => {
    const buffer = await makePdf(["Welcome", "John 3:16"]);
    const slides = await importPdf(buffer);

    expect(slides).toHaveLength(2);
    expect(slides[0].id).toBe("slide-1");
    expect(slides[0].title).toMatch(/Welcome/i);
    expect(slides[0].mimeType).toBe("image/jpeg");
    expect(isJpeg(slides[0].imageBytes)).toBe(true);
    expect(slides[1].title).toMatch(/John 3:16/i);
    expect(slides[1].mimeType).toBe("image/jpeg");
    expect(isJpeg(slides[1].imageBytes)).toBe(true);
  }, 30_000);
});
