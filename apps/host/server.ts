/**
 * PreachSync unified custom server.
 *
 * Starts Next.js and Socket.IO on the same HTTP server so that everything is
 * available from a single port.
 *
 *   http://localhost:PORT/                        → Host presentation
 *   http://localhost:PORT/controller              → Controller
 *   http://localhost:PORT/api/presentation/upload → PPTX upload (POST, host only)
 *   ws://localhost:PORT                           → Socket.IO
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { parse } from "node:url";
import next from "next";
import busboy from "busboy";
import {
  attachSocketServer,
  type SocketServerControls,
} from "./server/preachsync-server";
import { importPptx } from "./server/pptx-parser";
import { getSlideImage, preparePresentationForBroadcast } from "./server/slide-media";

// ─── PPTX upload handler ──────────────────────────────────────────────────────

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024; // 100 MB

function handlePptxUpload(
  req: IncomingMessage,
  res: ServerResponse,
  controls: SocketServerControls,
): void {
  const providedToken = req.headers["x-preachsync-host-token"];
  if (providedToken !== controls.hostUploadToken) {
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: "Only the presentation host can upload a PowerPoint file.",
      }),
    );
    return;
  }

  const contentType = req.headers["content-type"] ?? "";

  if (!contentType.includes("multipart/form-data")) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Expected multipart/form-data." }));
    return;
  }

  const bb = busboy({
    headers: req.headers,
    limits: { files: 1, fileSize: MAX_UPLOAD_BYTES },
  });

  const chunks: Buffer[] = [];
  let originalFilename = "Uploaded Presentation";
  let fileSizeLimitHit = false;
  let rejectedFileType = false;

  bb.on("file", (_field, fileStream, info) => {
    originalFilename = info.filename || originalFilename;

    if (!originalFilename.toLowerCase().endsWith(".pptx")) {
      rejectedFileType = true;
      fileStream.resume();
      return;
    }

    fileStream.on("data", (chunk: Buffer) => chunks.push(chunk));

    fileStream.on("limit", () => {
      fileSizeLimitHit = true;
      fileStream.resume(); // drain so busboy can emit 'close'
    });
  });

  bb.on("close", async () => {
    if (rejectedFileType) {
      res.writeHead(422, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error:
            "Only .pptx files are supported. Save the deck as PowerPoint (.pptx) and try again.",
        }),
      );
      return;
    }

    if (fileSizeLimitHit) {
      res.writeHead(413, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "File exceeds the 100 MB limit." }));
      return;
    }

    if (chunks.length === 0) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "No file received." }));
      return;
    }

    try {
      const buffer = Buffer.concat(chunks);
      const slides = await importPptx(buffer);

      if (slides.length === 0) {
        res.writeHead(422, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error:
              "No slides found in this file. Make sure it is a valid .pptx file.",
          }),
        );
        return;
      }

      controls.loadPresentation(
        preparePresentationForBroadcast({
          id: `upload-${Date.now()}`,
          title: originalFilename.replace(/\.pptx$/i, ""),
          slides,
        }),
      );

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, slideCount: slides.length }));
    } catch (err) {
      console.error("[PreachSync] PPTX parse error:", err);
      res.writeHead(422, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "Could not parse the file. Make sure it is a valid .pptx file.",
        }),
      );
    }
  });

  bb.on("error", (err: unknown) => {
    console.error("[PreachSync] Upload error:", err);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Upload failed." }));
    }
  });

  req.pipe(bb);
}

// ─── Main server ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const dev = process.env.NODE_ENV !== "production";
  const port = Number(process.env.PORT ?? 4000);
  const hostname = process.env.HOST ?? "0.0.0.0";

  const app = next({ dev, hostname: "localhost", port });
  const handle = app.getRequestHandler();

  await app.prepare();

  const socketControls: { current: SocketServerControls | undefined } = {
    current: undefined,
  };

  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url ?? "/", true);

    // Intercept the upload endpoint before Next.js handles it.
    if (
      req.method === "GET" &&
      parsedUrl.pathname?.startsWith("/api/presentation/slides/")
    ) {
      const slideId = decodeURIComponent(
        parsedUrl.pathname.slice("/api/presentation/slides/".length),
      );
      const image = getSlideImage(slideId);
      if (!image) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Slide image not found." }));
        return;
      }

      res.writeHead(200, {
        "Content-Type": image.mimeType,
        "Cache-Control": "no-store",
      });
      res.end(image.bytes);
      return;
    }

    if (
      req.method === "POST" &&
      parsedUrl.pathname === "/api/presentation/upload"
    ) {
      if (!socketControls.current) {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Server not ready." }));
        return;
      }

      handlePptxUpload(req, res, socketControls.current);
      return;
    }

    void handle(req, res, parsedUrl);
  });

  socketControls.current = attachSocketServer(httpServer);

  httpServer.listen(port, hostname, () => {
    const localUrl = `http://localhost:${port}`;
    console.log("");
    console.log("  PreachSync is running!");
    console.log(`  Host presentation: ${localUrl}/`);
    console.log(`  Controller:        ${localUrl}/controller`);
    console.log("");
    if (hostname === "0.0.0.0") {
      console.log(
        "  LAN: find your Wi-Fi IPv4 address with ipconfig, then open",
      );
      console.log(
        `       http://<YOUR-LAN-IP>:${port}/controller on any phone`,
      );
      console.log("");
    }
  });

  function shutDown(): void {
    console.log("\nShutting down PreachSync…");
    httpServer.close(() => process.exit(0));
  }

  process.on("SIGINT", shutDown);
  process.on("SIGTERM", shutDown);
}

main().catch((error: unknown) => {
  console.error("Failed to start PreachSync server.", error);
  process.exit(1);
});
