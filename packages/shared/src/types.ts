export interface Slide {
  id: string;
  title: string;
  body: string;
  notes?: string;
  /** Same-origin URL for the rendered slide image, e.g. /api/presentation/slides/slide-1 */
  imageUrl?: string;
  /** Optional inline image used while importing; stripped before broadcast. */
  imageDataUrl?: string;
}

export interface Presentation {
  id: string;
  title: string;
  slides: Slide[];
}

export interface SlideSummary {
  id: string;
  title: string;
  imageUrl?: string;
}

export interface PresentationState {
  presentationId: string;
  presentationTitle: string;
  currentSlideIndex: number;
  totalSlides: number;
  currentSlide: Slide;
  nextSlide: Slide | null;
  slides: SlideSummary[];
}

export type ClientRole = "host" | "controller";
