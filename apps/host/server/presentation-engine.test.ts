import { demoPresentation } from "@preachsync/shared";
import { describe, expect, it } from "vitest";
import { PresentationEngine } from "./presentation-engine";

describe("PresentationEngine", () => {
  it("starts at slide zero", () => {
    const engine = new PresentationEngine(demoPresentation);

    expect(engine.getState().currentSlideIndex).toBe(0);
  });

  it("moves to the next and previous slides", () => {
    const engine = new PresentationEngine(demoPresentation);

    expect(engine.next()).toBe(true);
    expect(engine.getState().currentSlideIndex).toBe(1);
    expect(engine.previous()).toBe(true);
    expect(engine.getState().currentSlideIndex).toBe(0);
  });

  it("stays within the first and final slide boundaries", () => {
    const engine = new PresentationEngine(demoPresentation);

    expect(engine.previous()).toBe(false);
    expect(engine.getState().currentSlideIndex).toBe(0);

    engine.goTo(demoPresentation.slides.length - 1);
    expect(engine.next()).toBe(false);
    expect(engine.getState().currentSlideIndex).toBe(
      demoPresentation.slides.length - 1,
    );
  });

  it("accepts valid goTo indexes", () => {
    const engine = new PresentationEngine(demoPresentation);

    expect(engine.goTo(3)).toBe(true);
    expect(engine.getState().currentSlideIndex).toBe(3);
  });

  it.each([-1, 5, 1.5, Number.NaN])(
    "rejects invalid goTo index %s",
    (index) => {
      const engine = new PresentationEngine(demoPresentation);

      expect(engine.goTo(index)).toBe(false);
      expect(engine.getState().currentSlideIndex).toBe(0);
    },
  );
});
