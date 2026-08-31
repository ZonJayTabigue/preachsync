import { describe, expect, it } from "vitest";
import { getSlideImage, preparePresentationForBroadcast } from "./slide-media";

describe("preparePresentationForBroadcast", () => {
  it("stores slide images and replaces data URLs with same-origin URLs", () => {
    const presentation = preparePresentationForBroadcast({
      id: "uploaded",
      title: "Sunday",
      slides: [
        {
          id: "slide-1",
          title: "Welcome",
          body: "",
          imageDataUrl:
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        },
      ],
    });

    expect(presentation.slides[0].imageDataUrl).toBeUndefined();
    expect(presentation.slides[0].imageUrl).toBe(
      "/api/presentation/slides/slide-1",
    );
    expect(getSlideImage("slide-1")?.mimeType).toBe("image/png");
    expect(getSlideImage("slide-1")?.bytes.length).toBeGreaterThan(0);
  });
});
