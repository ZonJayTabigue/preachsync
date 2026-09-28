import { describe, expect, it } from "vitest";
import {
  getSlideImage,
  presentationFromFirstPdfPage,
  slidePatchFromRenderedPage,
} from "./slide-media";

const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);

describe("presentationFromFirstPdfPage", () => {
  it("stores the first page JPEG and placeholders for remaining pages", () => {
    const presentation = presentationFromFirstPdfPage({
      roomId: "north",
      presentationId: "uploaded",
      title: "Sunday",
      firstPage: {
        id: "slide-1",
        title: "Welcome",
        body: "",
        imageBytes: jpegBytes,
        mimeType: "image/jpeg",
      },
      totalPages: 3,
    });

    expect(presentation.slides).toHaveLength(3);
    expect(presentation.slides[0].imageUrl).toBe(
      "/api/presentation/slides/north/slide-1?v=uploaded",
    );
    expect(presentation.slides[1].id).toBe("slide-2");
    expect(presentation.slides[1].imageUrl).toBeUndefined();
    expect(getSlideImage("north", "slide-1")?.mimeType).toBe("image/jpeg");
    expect(getSlideImage("north", "slide-1")?.bytes.equals(jpegBytes)).toBe(true);
    expect(getSlideImage("north", "slide-2")).toBeUndefined();
  });

  it("clears images for one room without deleting another room", () => {
    presentationFromFirstPdfPage({
      roomId: "north",
      presentationId: "north-deck",
      title: "North",
      firstPage: {
        id: "slide-1",
        title: "North welcome",
        body: "",
        imageBytes: jpegBytes,
        mimeType: "image/jpeg",
      },
      totalPages: 1,
    });

    const southBytes = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0xd9]);
    presentationFromFirstPdfPage({
      roomId: "south",
      presentationId: "south-deck",
      title: "South",
      firstPage: {
        id: "slide-1",
        title: "South welcome",
        body: "",
        imageBytes: southBytes,
        mimeType: "image/jpeg",
      },
      totalPages: 1,
    });

    expect(getSlideImage("north", "slide-1")?.bytes.equals(jpegBytes)).toBe(true);
    expect(getSlideImage("south", "slide-1")?.bytes.equals(southBytes)).toBe(true);
  });
});

describe("slidePatchFromRenderedPage", () => {
  it("stores JPEG bytes and returns an image URL without a data URL", () => {
    const patch = slidePatchFromRenderedPage("north", "uploaded", {
      id: "slide-2",
      title: "John 3:16",
      body: "",
      imageBytes: jpegBytes,
      mimeType: "image/jpeg",
    });

    expect(patch.title).toBe("John 3:16");
    expect(patch.imageUrl).toBe(
      "/api/presentation/slides/north/slide-2?v=uploaded",
    );
    expect(getSlideImage("north", "slide-2")?.mimeType).toBe("image/jpeg");
  });
});
