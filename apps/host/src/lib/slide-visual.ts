export function slideVisualSrc(slide: {
  imageUrl?: string;
  imageDataUrl?: string;
}): string | undefined {
  return slide.imageUrl ?? slide.imageDataUrl;
}
