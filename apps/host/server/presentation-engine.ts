import type {
  Presentation,
  PresentationState,
} from "@preachsync/shared";

export class PresentationEngine {
  private currentSlideIndex = 0;

  constructor(private readonly presentation: Presentation) {
    if (presentation.slides.length === 0) {
      throw new Error("A presentation must contain at least one slide.");
    }
  }

  next(): boolean {
    return this.goTo(this.currentSlideIndex + 1);
  }

  previous(): boolean {
    return this.goTo(this.currentSlideIndex - 1);
  }

  goTo(index: number): boolean {
    if (
      !Number.isInteger(index) ||
      index < 0 ||
      index >= this.presentation.slides.length ||
      index === this.currentSlideIndex
    ) {
      return false;
    }

    this.currentSlideIndex = index;
    return true;
  }

  getState(): PresentationState {
    return {
      presentationId: this.presentation.id,
      currentSlideIndex: this.currentSlideIndex,
      totalSlides: this.presentation.slides.length,
      currentSlide: this.presentation.slides[this.currentSlideIndex],
    };
  }
}
