import { createServer, type Server as HttpServer } from "node:http";
import {
  demoPresentation,
  socketEvents,
  type ClientRole,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from "@preachsync/shared";
import { Server } from "socket.io";
import { PresentationEngine } from "./presentation-engine";

interface SocketData {
  role: ClientRole;
}

type PreachSyncIo = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

/**
 * Attach Socket.IO and the presentation engine to an existing HTTP server.
 *
 * This is used by the custom server (server.ts) so that Socket.IO shares the
 * same port as the Next.js application.
 */
export function attachSocketServer(httpServer: HttpServer): PreachSyncIo {
  const presentationEngine = new PresentationEngine(demoPresentation);

  const io: PreachSyncIo = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  function getControllerCount(): number {
    return [...io.sockets.sockets.values()].filter(
      (socket) => socket.data.role === "controller",
    ).length;
  }

  function broadcastControllerCount(): void {
    io.emit(socketEvents.controllerCount, getControllerCount());
  }

  function broadcastState(): void {
    io.emit(socketEvents.state, presentationEngine.getState());
  }

  io.on("connection", (socket) => {
    socket.data.role =
      socket.handshake.auth.role === "controller" ? "controller" : "host";

    socket.emit(socketEvents.connected, { clientId: socket.id });
    socket.emit(socketEvents.state, presentationEngine.getState());
    broadcastControllerCount();

    socket.on(socketEvents.requestState, () => {
      socket.emit(socketEvents.state, presentationEngine.getState());
    });

    socket.on(socketEvents.next, () => {
      if (presentationEngine.next()) {
        broadcastState();
      }
    });

    socket.on(socketEvents.previous, () => {
      if (presentationEngine.previous()) {
        broadcastState();
      }
    });

    socket.on(socketEvents.goTo, (index) => {
      if (!Number.isInteger(index)) {
        socket.emit(socketEvents.error, {
          message: "The requested slide index is invalid.",
        });
        return;
      }

      if (presentationEngine.goTo(index)) {
        broadcastState();
      }
    });

    socket.on("disconnect", () => {
      broadcastControllerCount();
    });
  });

  return io;
}

// ─── Test helpers ────────────────────────────────────────────────────────────
// The types below are only used by preachsync-server.test.ts so that tests can
// spin up an isolated server without interfering with the main application.

export interface PreachSyncServer {
  io: PreachSyncIo;
  httpServer: HttpServer;
  start: (port: number, hostname?: string) => Promise<number>;
  stop: () => Promise<void>;
}

/**
 * Create a self-contained PreachSync server (own HTTP server + Socket.IO).
 * Used by tests only — the application uses `attachSocketServer` instead.
 */
export function createPreachSyncServer(): PreachSyncServer {
  const httpServer = createServer();
  const io = attachSocketServer(httpServer);

  return {
    io,
    httpServer,
    start(port, hostname = "0.0.0.0") {
      return new Promise((resolve, reject) => {
        httpServer.once("error", reject);
        httpServer.listen(port, hostname, () => {
          httpServer.off("error", reject);
          const address = httpServer.address();
          resolve(typeof address === "object" && address ? address.port : port);
        });
      });
    },
    stop() {
      return new Promise((resolve) => {
        io.close(() => resolve());
      });
    },
  };
}
