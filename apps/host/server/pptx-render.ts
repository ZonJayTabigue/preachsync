import { renderSlidesWithLibreOffice } from "./pptx-libreoffice";
import { renderSlidesWithPowerPoint } from "./pptx-powerpoint";

/**
 * Render designed slides as PNG buffers.
 * Windows: PowerPoint. Linux/Render: LibreOffice + pdftoppm.
 */
export async function renderPptxSlides(
  pptxBuffer: Buffer,
): Promise<Buffer[] | null> {
  const fromPowerPoint = await renderSlidesWithPowerPoint(pptxBuffer);
  if (fromPowerPoint && fromPowerPoint.length > 0) {
    return fromPowerPoint;
  }

  const fromLibreOffice = await renderSlidesWithLibreOffice(pptxBuffer);
  if (fromLibreOffice && fromLibreOffice.length > 0) {
    return fromLibreOffice;
  }

  return null;
}
