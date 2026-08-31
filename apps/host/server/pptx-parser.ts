/**
 * PPTX importer.
 *
 * Prefers a true slide render from PowerPoint when it is installed. Otherwise
 * it extracts the largest raster image from the slide, layout, or master.
 * Macros, OLE objects, and scripts are never executed.
 */

import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import type { Slide } from "@preachsync/shared";
import { renderSlidesWithPowerPoint } from "./pptx-powerpoint";

interface TextRun {
  "a:t"?: string | number;
}

interface Paragraph {
  "a:r"?: TextRun | TextRun[];
}

interface TextBody {
  "a:p"?: Paragraph | Paragraph[];
}

interface Placeholder {
  "@_type"?: string;
}

interface Shape {
  "p:nvSpPr"?: {
    "p:nvPr"?: {
      "p:ph"?: Placeholder;
    };
  };
  "p:txBody"?: TextBody;
}

interface SlideSpTree {
  "p:sp"?: Shape | Shape[];
}

interface ParsedSlide {
  "p:sld"?: {
    "p:cSld"?: {
      "p:spTree"?: SlideSpTree;
    };
  };
}

interface Relationship {
  "@_Id"?: string;
  "@_Type"?: string;
  "@_Target"?: string;
}

interface ParsedRels {
  Relationships?: {
    Relationship?: Relationship | Relationship[];
  };
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  isArray: (tagName) => ["p:sp", "a:p", "a:r", "Relationship"].includes(tagName),
});

const DISPLAYABLE_IMAGE_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

function extractTextFromBody(txBody: TextBody | undefined): string {
  if (!txBody) {
    return "";
  }

  const paragraphs = txBody["a:p"];
  if (!paragraphs) {
    return "";
  }

  const paragraphList = Array.isArray(paragraphs) ? paragraphs : [paragraphs];

  return paragraphList
    .map((para) => {
      const runs = para["a:r"];
      if (!runs) {
        return "";
      }
      const runList = Array.isArray(runs) ? runs : [runs];
      return runList.map((run) => String(run["a:t"] ?? "")).join("");
    })
    .filter(Boolean)
    .join("\n");
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function resolveZipPath(fromFile: string, target: string): string {
  if (target.startsWith("/")) {
    return target.replace(/^\/+/, "");
  }

  const baseParts = fromFile.split("/").slice(0, -1);
  for (const part of target.split("/")) {
    if (part === "..") {
      baseParts.pop();
    } else if (part !== ".") {
      baseParts.push(part);
    }
  }
  return baseParts.join("/");
}

function mimeTypeForMedia(path: string): string | undefined {
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  return DISPLAYABLE_IMAGE_TYPES[extension];
}

function zipFile(zip: JSZip, path: string) {
  const normalized = path.replace(/\\/g, "/");
  return (
    zip.files[normalized] ??
    zip.file(normalized) ??
    Object.values(zip.files).find(
      (file) => !file.dir && file.name.replace(/\\/g, "/") === normalized,
    )
  );
}

function relsPathFor(xmlPath: string): string {
  const parts = xmlPath.split("/");
  const fileName = parts.pop();
  return `${parts.join("/")}/_rels/${fileName}.rels`;
}

function relationshipsFromXml(xml: string): Relationship[] {
  const parsed = parser.parse(xml) as ParsedRels;
  const fromParser = asArray(parsed.Relationships?.Relationship).filter(
    (rel) => rel["@_Target"] && rel["@_Type"],
  );
  if (fromParser.length > 0) {
    return fromParser;
  }

  const fromMarkup: Relationship[] = [];
  for (const match of xml.matchAll(/<Relationship\b([^/>]+)/g)) {
    const attributes = match[1];
    const id = attributes.match(/\bId="([^"]+)"/)?.[1];
    const type = attributes.match(/\bType="([^"]+)"/)?.[1];
    const target = attributes.match(/\bTarget="([^"]+)"/)?.[1];
    if (id && type && target) {
      fromMarkup.push({
        "@_Id": id,
        "@_Type": type,
        "@_Target": target,
      });
    }
  }
  return fromMarkup;
}

async function readRelationships(
  zip: JSZip,
  xmlPath: string,
): Promise<Relationship[]> {
  const relsFile = zipFile(zip, relsPathFor(xmlPath));
  if (!relsFile || relsFile.dir) {
    return [];
  }

  return relationshipsFromXml(await relsFile.async("text"));
}

function relatedXmlPath(
  fromXmlPath: string,
  relationships: Relationship[],
  typeFragment: string,
): string | undefined {
  const match = relationships.find((rel) =>
    (rel["@_Type"] ?? "").includes(typeFragment),
  );
  const target = match?.["@_Target"];
  return target ? resolveZipPath(fromXmlPath, target) : undefined;
}

async function largestEmbeddedImage(
  zip: JSZip,
  xmlPaths: string[],
): Promise<string | undefined> {
  let largest: { bytes: Buffer; mimeType: string } | undefined;

  for (const xmlPath of xmlPaths) {
    const relationships = await readRelationships(zip, xmlPath);

    for (const relationship of relationships) {
      const type = relationship["@_Type"] ?? "";
      const target = relationship["@_Target"];
      if (!target) {
        continue;
      }

      const mediaPath = resolveZipPath(xmlPath, target);
      const mimeType = mimeTypeForMedia(mediaPath);
      const isImage = type.includes("/image") || Boolean(mimeType);
      const mediaFile = zipFile(zip, mediaPath);
      if (!isImage || !mediaFile || mediaFile.dir || !mimeType) {
        continue;
      }

      const bytes = await mediaFile.async("nodebuffer");
      if (!largest || bytes.length > largest.bytes.length) {
        largest = { bytes, mimeType };
      }
    }
  }

  if (!largest) {
    return undefined;
  }

  return `data:${largest.mimeType};base64,${largest.bytes.toString("base64")}`;
}

async function extractSlideImage(
  zip: JSZip,
  slidePath: string,
): Promise<string | undefined> {
  const xmlPaths = [slidePath];
  const slideRels = await readRelationships(zip, slidePath);
  const layoutPath = relatedXmlPath(slidePath, slideRels, "slideLayout");

  if (layoutPath) {
    xmlPaths.push(layoutPath);
    const layoutRels = await readRelationships(zip, layoutPath);
    const masterPath = relatedXmlPath(layoutPath, layoutRels, "slideMaster");
    if (masterPath) {
      xmlPaths.push(masterPath);
    }
  }

  return largestEmbeddedImage(zip, xmlPaths);
}

function parseSlideXml(xml: string, slideNumber: number): Omit<Slide, "imageDataUrl"> {
  const parsed = parser.parse(xml) as ParsedSlide;
  const shapes = asArray(parsed?.["p:sld"]?.["p:cSld"]?.["p:spTree"]?.["p:sp"]);

  let title = "";
  const bodyParts: string[] = [];
  const leftoverText: string[] = [];

  for (const shape of shapes) {
    const text = extractTextFromBody(shape?.["p:txBody"]).trim();
    if (!text) {
      continue;
    }

    const placeholderType =
      shape?.["p:nvSpPr"]?.["p:nvPr"]?.["p:ph"]?.["@_type"] ?? "";
    if ((placeholderType === "title" || placeholderType === "ctrTitle") && !title) {
      title = text;
      continue;
    }
    if (placeholderType === "body" || placeholderType === "subTitle") {
      bodyParts.push(text);
      continue;
    }
    leftoverText.push(text);
  }

  if (!title && leftoverText.length > 0) {
    title = leftoverText[0];
    leftoverText.shift();
  }

  return {
    id: `slide-${slideNumber}`,
    title: title || `Slide ${slideNumber}`,
    body: [...bodyParts, ...leftoverText].join("\n\n"),
  };
}

async function parsePptxFromZip(buffer: Buffer): Promise<Slide[]> {
  const zip = await JSZip.loadAsync(buffer);

  const slideFileNames = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const numA = Number(a.match(/(\d+)\.xml$/)?.[1] ?? 0);
      const numB = Number(b.match(/(\d+)\.xml$/)?.[1] ?? 0);
      return numA - numB;
    });

  const slides: Slide[] = [];

  for (let index = 0; index < slideFileNames.length; index += 1) {
    const slidePath = slideFileNames[index];
    const xml = await zip.files[slidePath].async("text");
    const slide = parseSlideXml(xml, index + 1);
    const imageDataUrl = await extractSlideImage(zip, slidePath);
    slides.push(imageDataUrl ? { ...slide, imageDataUrl } : slide);
  }

  return slides;
}

export async function parsePptx(buffer: Buffer): Promise<Slide[]> {
  return parsePptxFromZip(buffer);
}

/**
 * Import a PPTX for display. Uses PowerPoint to render the designed slide
 * when available; otherwise uses the largest embedded image plus text.
 */
export async function importPptx(buffer: Buffer): Promise<Slide[]> {
  const textSlides = await parsePptxFromZip(buffer);
  const rendered = await renderSlidesWithPowerPoint(buffer);

  if (!rendered || rendered.length === 0) {
    return textSlides;
  }

  return rendered.map((bytes, index) => {
    const textSlide = textSlides[index];
    return {
      id: textSlide?.id ?? `slide-${index + 1}`,
      title: textSlide?.title ?? `Slide ${index + 1}`,
      body: textSlide?.body ?? "",
      imageDataUrl: `data:image/png;base64,${bytes.toString("base64")}`,
    };
  });
}
