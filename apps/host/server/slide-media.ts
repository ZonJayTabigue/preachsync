import type { Presentation, Slide } from "@preachsync/shared";

interface StoredSlideImage {
  mimeType: string;
  bytes: Buffer;
}

const slideImages = new Map<string, StoredSlideImage>();

function parseDataUrl(dataUrl: string): StoredSlideImage | undefined {
  const match = /^data:([^;,]+);base64,(.+)$/.exec(dataUrl);
  if (!match) {
    return undefined;
  }

  return {
    mimeType: match[1],
    bytes: Buffer.from(match[2], "base64"),
  };
}

export function preparePresentationForBroadcast(
  presentation: Presentation,
): Presentation {
  slideImages.clear();

  return {
    ...presentation,
    slides: presentation.slides.map((slide) => {
      if (!slide.imageDataUrl) {
        return slide;
      }

      const stored = parseDataUrl(slide.imageDataUrl);
      if (stored) {
        slideImages.set(slide.id, stored);
      }

      const prepared: Slide = {
        id: slide.id,
        title: slide.title,
        body: slide.body,
        imageUrl: `/api/presentation/slides/${encodeURIComponent(slide.id)}`,
      };
      if (slide.notes) {
        prepared.notes = slide.notes;
      }
      return prepared;
    }),
  };
}

export function getSlideImage(slideId: string): StoredSlideImage | undefined {
  return slideImages.get(slideId);
}
