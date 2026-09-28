/**
 * PreachSync unified custom server.
 *
 * Starts Next.js and Socket.IO on the same HTTP server so that everything is
 * available from a single port.
 *
 *   http://localhost:PORT/                        → Host presentation
 *   http://localhost:PORT/controller              → Controller
 *   http://localhost:PORT/api/presentation/upload → PDF upload (POST, host only)
 *   ws://localhost:PORT                           → Socket.IO
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { parse } from "node:url";
import { normalizeRoomId } from "@preachsync/shared";
import next from "next";
import busboy from "busboy";
import {
  attachSocketServer,
  type SocketServerControls,
} from "./server/preachsync-server";
import {
  openPdfDocument,
  renderPdfPage,
  renderPdfPagesInBackground,
  type RenderedPdfPage,
} from "./server/pdf-parser";
import {
  getSlideImage,
  presentationFromFirstPdfPage,
  slidePatchFromRenderedPage,
} from "./server/slide-media";

// ─── PDF upload handler ───────────────────────────────────────────────────────

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024; // 100 MB
const pdfImportGeneration = new Map<string, number>();

function nextPdfGeneration(roomId: string): number {
  const generation = (pdfImportGeneration.get(roomId) ?? 0) + 1;
  pdfImportGeneration.set(roomId, generation);
  return generation;
}

function headerValue(
  value: string | string[] | undefined,
): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function slideIndexFromPage(page: RenderedPdfPage): number {
  return Number.parseInt(page.id.slice("slide-".length), 10) - 1;
}

function handlePdfUpload(
  req: IncomingMessage,
  res: ServerResponse,
  controls: SocketServerControls,
): void {
  const roomId = normalizeRoomId(
    headerValue(req.headers["x-preachsync-room"]),
  );
  const providedToken = headerValue(req.headers["x-preachsync-host-token"]);
  if (!roomId || providedToken !== controls.getHostUploadToken(roomId)) {
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: "Only the presentation host can upload a PDF.",
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

    if (!originalFilename.toLowerCase().endsWith(".pdf")) {
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
            "Only .pdf files are supported. Export the presentation as a PDF and try again.",
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
      const { pdf, pageCount } = await openPdfDocument(buffer);
      let pdfOwnedByBackground = false;

      try {
        if (pageCount === 0) {
          res.writeHead(422, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              error:
                "No pages found in this file. Make sure it is a valid PDF.",
            }),
          );
          return;
        }

        const firstPage = await renderPdfPage(pdf, 1);
        const presentationId = `upload-${Date.now()}`;
        const generation = nextPdfGeneration(roomId);

        controls.loadPresentation(
          roomId,
          presentationFromFirstPdfPage({
            roomId,
            presentationId,
            title: originalFilename.replace(/\.pdf$/i, ""),
            firstPage,
            totalPages: pageCount,
          }),
        );

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, slideCount: pageCount }));

        if (pageCount === 1) {
          return;
        }

        const remainingPages = Array.from(
          { length: pageCount - 1 },
          (_, index) => index + 2,
        );

        pdfOwnedByBackground = true;
        void renderPdfPagesInBackground(
          pdf,
          remainingPages,
          (page) => {
            if (pdfImportGeneration.get(roomId) !== generation) {
              return;
            }
            controls.updateSlide(
              roomId,
              slideIndexFromPage(page),
              slidePatchFromRenderedPage(roomId, presentationId, page),
            );
          },
          () => pdfImportGeneration.get(roomId) === generation,
        ).catch((err: unknown) => {
          console.error("[PreachSync] Background PDF render error:", err);
        });
      } finally {
        if (!pdfOwnedByBackground) {
          await pdf.destroy();
        }
      }
    } catch (err) {
      console.error("[PreachSync] PDF parse error:", err);
      if (!res.headersSent) {
        res.writeHead(422, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error: "Could not parse the file. Make sure it is a valid PDF.",
          }),
        );
      }
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

    // Socket.IO owns this path. If Next.js also handles it, the handshake
    // hangs forever behind proxies such as Render.
    if (parsedUrl.pathname?.startsWith("/socket.io")) {
      return;
    }

    // Intercept the upload endpoint before Next.js handles it.
    if (
      req.method === "GET" &&
      parsedUrl.pathname?.startsWith("/api/presentation/slides/")
    ) {
      const slidePath = parsedUrl.pathname
        .slice("/api/presentation/slides/".length)
        .split("/");
      if (slidePath.length !== 2) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Slide image not found." }));
        return;
      }

      const image = getSlideImage(
        decodeURIComponent(slidePath[0] ?? ""),
        decodeURIComponent(slidePath[1] ?? ""),
      );
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

      handlePdfUpload(req, res, socketControls.current);
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
