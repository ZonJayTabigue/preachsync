export interface Slide {
  id: string;
  title: string;
  body: string;
  notes?: string;
}

export interface Presentation {
  id: string;
  title: string;
  slides: Slide[];
}

export interface PresentationState {
  presentationId: string;
  currentSlideIndex: number;
  totalSlides: number;
  currentSlide: Slide;
}

export type ClientRole = "host" | "controller";
