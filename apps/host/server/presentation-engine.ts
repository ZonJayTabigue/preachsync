import type { Presentation, PresentationState } from "@preachsync/shared";

export class PresentationEngine {
  private currentSlideIndex = 0;

  constructor(private presentation: Presentation) {
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

  /**
   * Replace the active presentation and reset to slide zero.
   * Broadcasts should be triggered by the caller after this call.
   */
  loadPresentation(presentation: Presentation): void {
    if (presentation.slides.length === 0) {
      throw new Error("A presentation must contain at least one slide.");
    }
    this.presentation = presentation;
    this.currentSlideIndex = 0;
  }

  getState(): PresentationState {
    return {
      presentationId: this.presentation.id,
      presentationTitle: this.presentation.title,
      currentSlideIndex: this.currentSlideIndex,
      totalSlides: this.presentation.slides.length,
      currentSlide: this.presentation.slides[this.currentSlideIndex],
    };
  }
}
