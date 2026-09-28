import {
  type ClientToServerEvents,
  type ClientRole,
  type ServerToClientEvents,
} from "@preachsync/shared";
import { io, type Socket } from "socket.io-client";

export type PreachSyncSocket = Socket<
  ServerToClientEvents,
  ClientToServerEvents
>;

export function connectPreachSyncSocket(
  role: ClientRole,
  roomId: string,
): PreachSyncSocket {
  return io({
    auth: { role, roomId },
    path: "/socket.io",
    // Render's proxy is more reliable when the upgrade happens first.
    transports: ["websocket", "polling"],
    reconnection: true,
    timeout: 20_000,
  });
}
