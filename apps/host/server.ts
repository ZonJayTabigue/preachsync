/**
 * PreachSync unified custom server.
 *
 * Starts Next.js and Socket.IO on the same HTTP server so that everything is
 * available from a single port.
 *
 *   http://localhost:PORT/           → Host presentation
 *   http://localhost:PORT/controller → Controller
 *   ws://localhost:PORT              → Socket.IO
 */

import { createServer } from "node:http";
import { parse } from "node:url";
import next from "next";
import { attachSocketServer } from "./server/preachsync-server";

async function main(): Promise<void> {
  const dev = process.env.NODE_ENV !== "production";
  const port = Number(process.env.PORT ?? 4000);
  const hostname = process.env.HOST ?? "0.0.0.0";

  // Prepare the Next.js application (compiles, sets up HMR in dev, etc.)
  const app = next({ dev, hostname: "localhost", port });
  const handle = app.getRequestHandler();

  await app.prepare();

  // Single HTTP server shared by Next.js and Socket.IO
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url ?? "/", true);
    void handle(req, res, parsedUrl);
  });

  attachSocketServer(httpServer);

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
      console.log(`       http://<YOUR-LAN-IP>:${port}/controller on any phone`);
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
