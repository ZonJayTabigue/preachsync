import type { Slide } from "@preachsync/shared";

export function slideVisualSrc(slide: Slide): string | undefined {
  return slide.imageUrl ?? slide.imageDataUrl;
}
