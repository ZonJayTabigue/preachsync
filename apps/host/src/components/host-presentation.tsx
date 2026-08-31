"use client";

import {
  socketEvents,
  type ClientToServerEvents,
  type PresentationState,
  type ServerToClientEvents,
} from "@preachsync/shared";
import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

type ConnectionState = "connecting" | "connected" | "disconnected";
type PreachSyncSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export function HostPresentation() {
  const socketRef = useRef<PreachSyncSocket | null>(null);
  const [presentationState, setPresentationState] =
    useState<PresentationState | null>(null);
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("connecting");
  const [controllerCount, setControllerCount] = useState(0);

  useEffect(() => {
    // Connect to the current browser origin — no hardcoded host or port.
    const socket: PreachSyncSocket = io({
      auth: { role: "host" },
      reconnection: true,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnectionState("connected");
      socket.emit(socketEvents.requestState);
    });
    socket.on("disconnect", () => setConnectionState("disconnected"));
    socket.on("connect_error", () => setConnectionState("disconnected"));
    socket.on(socketEvents.state, setPresentationState);
    socket.on(socketEvents.controllerCount, setControllerCount);
    socket.on(socketEvents.error, ({ message }) => console.error(message));

    return () => {
      socketRef.current = null;
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      const nextKeys = ["ArrowRight", "PageDown", " "];
      const previousKeys = ["ArrowLeft", "PageUp"];

      if (nextKeys.includes(event.key)) {
        event.preventDefault();
        socketRef.current?.emit(socketEvents.next);
      } else if (previousKeys.includes(event.key)) {
        event.preventDefault();
        socketRef.current?.emit(socketEvents.previous);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const isConnected = connectionState === "connected";

  const serverStatusLabel =
    connectionState === "connected"
      ? "Online"
      : connectionState === "connecting"
        ? "Connecting…"
        : "Offline";

  return (
    <main className="flex min-h-screen flex-col bg-[#07090d] text-white">
      <header className="flex items-center justify-between border-b border-white/10 px-5 py-4 sm:px-8">
        <div>
          <p className="text-xs font-bold tracking-[0.24em] text-amber-400 uppercase">
            PreachSync
          </p>
          <p className="mt-1 text-sm text-zinc-400">Presentation host</p>
        </div>
        <div className="flex items-center gap-5 text-sm text-zinc-300">
          <StatusIndicator active={isConnected} label={serverStatusLabel} />
          <span>
            {controllerCount}{" "}
            {controllerCount === 1 ? "controller" : "controllers"}
          </span>
        </div>
      </header>

      <section
        className="flex flex-1 items-center justify-center px-6 py-12 sm:px-12"
        aria-live="polite"
      >
        {presentationState ? (
          <div className="mx-auto w-full max-w-6xl text-center">
            <p className="mb-8 text-sm font-semibold tracking-[0.2em] text-zinc-500 uppercase">
              {presentationState.currentSlideIndex + 1} /{" "}
              {presentationState.totalSlides}
            </p>
            <h1 className="text-5xl leading-tight font-bold tracking-tight text-balance sm:text-7xl lg:text-8xl">
              {presentationState.currentSlide.title}
            </h1>
            <p className="mx-auto mt-10 max-w-5xl text-2xl leading-relaxed text-zinc-300 text-balance sm:text-4xl lg:text-5xl">
              {presentationState.currentSlide.body}
            </p>
          </div>
        ) : (
          <p className="text-xl text-zinc-400">
            {connectionState === "connecting"
              ? "Connecting to server…"
              : "Unable to connect to the presentation server."}
          </p>
        )}
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-5 py-4 text-xs text-zinc-500 sm:px-8">
        <span>Arrow keys · Page Up / Down · Space</span>
        <span>The host is the source of truth</span>
      </footer>
    </main>
  );
}

function StatusIndicator({
  active,
  label,
}: {
  active: boolean;
  label: string;
}) {
  return (
    <span className="flex items-center gap-2">
      <span
        className={`size-2.5 rounded-full ${
          active ? "bg-emerald-400" : "bg-red-400"
        }`}
        aria-hidden="true"
      />
      <span>Server: {label}</span>
    </span>
  );
}
