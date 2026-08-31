import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { parsePptx } from "./pptx-parser";

function slideXml(title: string, body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:sp>
        <p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>
        <p:txBody>
          <a:p><a:r><a:t>${title}</a:t></a:r></a:p>
        </p:txBody>
      </p:sp>
      <p:sp>
        <p:nvSpPr><p:nvPr><p:ph type="body"/></p:nvPr></p:nvSpPr>
        <p:txBody>
          <a:p><a:r><a:t>${body}</a:t></a:r></a:p>
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>`;
}

describe("parsePptx", () => {
  it("extracts title and body text in slide order", async () => {
    const zip = new JSZip();
    zip.file("ppt/slides/slide1.xml", slideXml("Welcome", "First body"));
    zip.file("ppt/slides/slide2.xml", slideXml("John 3:16", "For God so loved"));
    const buffer = await zip.generateAsync({ type: "nodebuffer" });

    const slides = await parsePptx(buffer);

    expect(slides).toHaveLength(2);
    expect(slides[0]).toMatchObject({
      title: "Welcome",
      body: "First body",
    });
    expect(slides[1]).toMatchObject({
      title: "John 3:16",
      body: "For God so loved",
    });
  });

  it("uses leftover text boxes when placeholders are missing", async () => {
    const zip = new JSZip();
    zip.file(
      "ppt/slides/slide1.xml",
      `<?xml version="1.0" encoding="UTF-8"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:sp>
        <p:txBody><a:p><a:r><a:t>Faith</a:t></a:r></a:p></p:txBody>
      </p:sp>
      <p:sp>
        <p:txBody><a:p><a:r><a:t>Walk by faith</a:t></a:r></a:p></p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>`,
    );
    const buffer = await zip.generateAsync({ type: "nodebuffer" });

    const slides = await parsePptx(buffer);
    expect(slides[0].title).toBe("Faith");
    expect(slides[0].body).toBe("Walk by faith");
  });

  it("uses the largest embedded slide image", async () => {
    const zip = new JSZip();
    zip.file("ppt/slides/slide1.xml", slideXml("Welcome", "Body"));
    zip.file(
      "ppt/slides/_rels/slide1.xml.rels",
      `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image"
    Target="../media/image1.png"/>
</Relationships>`,
    );
    zip.file(
      "ppt/media/image1.png",
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        "base64",
      ),
    );
    const buffer = await zip.generateAsync({ type: "nodebuffer" });

    const slides = await parsePptx(buffer);
    expect(slides[0].imageDataUrl).toMatch(/^data:image\/png;base64,/);
  });
});
