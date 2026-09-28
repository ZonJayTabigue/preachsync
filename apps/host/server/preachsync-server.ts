import { randomBytes } from "node:crypto";
import { createServer, type Server as HttpServer } from "node:http";
import {
  demoPresentation,
  normalizeRoomId,
  socketEvents,
  type ClientRole,
  type ClientToServerEvents,
  type Presentation,
  type ServerToClientEvents,
} from "@preachsync/shared";
import { Server } from "socket.io";
import { PresentationEngine } from "./presentation-engine";

interface SocketData {
  role: ClientRole;
  roomId: string;
}

interface RoomSession {
  engine: PresentationEngine;
  hostUploadToken: string;
}

type PreachSyncIo = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

export interface SocketServerControls {
  io: PreachSyncIo;
  /** Replace one room's presentation and broadcast slide 1 to that room. */
  loadPresentation: (roomId: string, presentation: Presentation) => void;
  /** Patch one slide in a room without resetting the current index, then broadcast. */
  updateSlide: (
    roomId: string,
    index: number,
    patch: Partial<Pick<Presentation["slides"][number], "title" | "body" | "imageUrl">>,
  ) => void;
  /** Secret required by POST /api/presentation/upload for this room. */
  getHostUploadToken: (roomId: string) => string | undefined;
}

/**
 * Attach Socket.IO and the presentation engine to an existing HTTP server.
 *
 * Used by the custom server (server.ts) so that Socket.IO shares the same port
 * as the Next.js application.
 */
export function attachSocketServer(
  httpServer: HttpServer,
): SocketServerControls {
  const rooms = new Map<string, RoomSession>();

  const io: PreachSyncIo = new Server(httpServer, {
    path: "/socket.io",
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
    transports: ["websocket", "polling"],
    pingInterval: 25_000,
    pingTimeout: 60_000,
  });

  function getOrCreateRoom(roomId: string): RoomSession {
    const existing = rooms.get(roomId);
    if (existing) {
      return existing;
    }

    const room: RoomSession = {
      engine: new PresentationEngine(demoPresentation),
      hostUploadToken: randomBytes(32).toString("hex"),
    };
    rooms.set(roomId, room);
    return room;
  }

  function getControllerCount(roomId: string): number {
    const members = io.sockets.adapter.rooms.get(roomId);
    if (!members) {
      return 0;
    }

    let count = 0;
    for (const socketId of members) {
      const member = io.sockets.sockets.get(socketId);
      if (member?.data.role === "controller") {
        count += 1;
      }
    }
    return count;
  }

  function broadcastControllerCount(roomId: string): void {
    io.to(roomId).emit(
      socketEvents.controllerCount,
      getControllerCount(roomId),
    );
  }

  function broadcastState(roomId: string): void {
    const room = rooms.get(roomId);
    if (!room) {
      return;
    }

    io.to(roomId).emit(socketEvents.state, room.engine.getState());
  }

  io.use((socket, next) => {
    const roomId = normalizeRoomId(String(socket.handshake.auth.roomId ?? ""));
    if (!roomId) {
      next(new Error("A valid room code is required."));
      return;
    }

    socket.data.roomId = roomId;
    socket.data.role =
      socket.handshake.auth.role === "controller" ? "controller" : "host";
    next();
  });

  io.on("connection", (socket) => {
    const { roomId } = socket.data;
    const room = getOrCreateRoom(roomId);
    socket.join(roomId);

    socket.emit(socketEvents.connected, { clientId: socket.id });
    socket.emit(socketEvents.state, room.engine.getState());

    if (socket.data.role === "host") {
      socket.emit(socketEvents.hostToken, { token: room.hostUploadToken });
    }

    broadcastControllerCount(roomId);

    socket.on(socketEvents.requestState, () => {
      const current = rooms.get(roomId);
      if (current) {
        socket.emit(socketEvents.state, current.engine.getState());
      }
    });

    socket.on(socketEvents.next, () => {
      const current = rooms.get(roomId);
      if (current?.engine.next()) {
        broadcastState(roomId);
      }
    });

    socket.on(socketEvents.previous, () => {
      const current = rooms.get(roomId);
      if (current?.engine.previous()) {
        broadcastState(roomId);
      }
    });

    socket.on(socketEvents.goTo, (index) => {
      if (!Number.isInteger(index)) {
        socket.emit(socketEvents.error, {
          message: "The requested slide index is invalid.",
        });
        return;
      }

      const current = rooms.get(roomId);
      if (current?.engine.goTo(index)) {
        broadcastState(roomId);
      }
    });

    socket.on("disconnect", () => {
      broadcastControllerCount(roomId);
    });
  });

  function loadPresentation(roomId: string, presentation: Presentation): void {
    const normalized = normalizeRoomId(roomId);
    if (!normalized) {
      return;
    }

    getOrCreateRoom(normalized).engine.loadPresentation(presentation);
    broadcastState(normalized);
  }

  function updateSlide(
    roomId: string,
    index: number,
    patch: Partial<
      Pick<Presentation["slides"][number], "title" | "body" | "imageUrl">
    >,
  ): void {
    const normalized = normalizeRoomId(roomId);
    if (!normalized) {
      return;
    }

    if (getOrCreateRoom(normalized).engine.updateSlide(index, patch)) {
      broadcastState(normalized);
    }
  }

  function getHostUploadToken(roomId: string): string | undefined {
    const normalized = normalizeRoomId(roomId);
    if (!normalized) {
      return undefined;
    }

    return rooms.get(normalized)?.hostUploadToken;
  }

  return { io, loadPresentation, updateSlide, getHostUploadToken };
}

// ─── Test helpers ─────────────────────────────────────────────────────────────

export interface PreachSyncServer extends SocketServerControls {
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
  const { io, loadPresentation, updateSlide, getHostUploadToken } =
    attachSocketServer(httpServer);

  return {
    io,
    loadPresentation,
    updateSlide,
    getHostUploadToken,
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
