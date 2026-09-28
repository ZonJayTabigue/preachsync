import type { Presentation, Slide } from "@preachsync/shared";
import type { RenderedPdfPage } from "./pdf-parser";

export interface StoredSlideImage {
  mimeType: string;
  bytes: Buffer;
}

const slideImages = new Map<string, StoredSlideImage>();

function imageKey(roomId: string, slideId: string): string {
  return `${roomId}/${slideId}`;
}

export function clearSlideImages(roomId: string): void {
  const prefix = `${roomId}/`;
  for (const key of slideImages.keys()) {
    if (key.startsWith(prefix)) {
      slideImages.delete(key);
    }
  }
}

export function setSlideImage(
  roomId: string,
  slideId: string,
  image: StoredSlideImage,
): void {
  slideImages.set(imageKey(roomId, slideId), image);
}

export function getSlideImage(
  roomId: string,
  slideId: string,
): StoredSlideImage | undefined {
  return slideImages.get(imageKey(roomId, slideId));
}

export function slideImageUrl(
  roomId: string,
  presentationId: string,
  slideId: string,
): string {
  return `/api/presentation/slides/${encodeURIComponent(roomId)}/${encodeURIComponent(slideId)}?v=${encodeURIComponent(presentationId)}`;
}

function slideFromRenderedPage(
  roomId: string,
  presentationId: string,
  page: RenderedPdfPage,
): Slide {
  setSlideImage(roomId, page.id, {
    mimeType: page.mimeType,
    bytes: page.imageBytes,
  });

  return {
    id: page.id,
    title: page.title,
    body: page.body,
    imageUrl: slideImageUrl(roomId, presentationId, page.id),
  };
}

export function presentationFromFirstPdfPage(options: {
  roomId: string;
  presentationId: string;
  title: string;
  firstPage: RenderedPdfPage;
  totalPages: number;
}): Presentation {
  clearSlideImages(options.roomId);

  const slides: Slide[] = [
    slideFromRenderedPage(options.roomId, options.presentationId, options.firstPage),
  ];

  for (let pageNumber = 2; pageNumber <= options.totalPages; pageNumber += 1) {
    slides.push({
      id: `slide-${pageNumber}`,
      title: `Slide ${pageNumber}`,
      body: "",
    });
  }

  return {
    id: options.presentationId,
    title: options.title,
    slides,
  };
}

export function slidePatchFromRenderedPage(
  roomId: string,
  presentationId: string,
  page: RenderedPdfPage,
): Pick<Slide, "title" | "body" | "imageUrl"> {
  const slide = slideFromRenderedPage(roomId, presentationId, page);
  return {
    title: slide.title,
    body: slide.body,
    imageUrl: slide.imageUrl,
  };
}
