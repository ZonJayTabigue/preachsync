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

function getSocketUrl(): string {
  if (process.env.NEXT_PUBLIC_PREACHSYNC_HOST) {
    return process.env.NEXT_PUBLIC_PREACHSYNC_HOST;
  }

  return `http://${window.location.hostname}:4000`;
}

export function PresentationController() {
  const socketRef = useRef<PreachSyncSocket | null>(null);
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("connecting");
  const [presentationState, setPresentationState] =
    useState<PresentationState | null>(null);

  useEffect(() => {
    const socket: PreachSyncSocket = io(getSocketUrl(), {
      auth: { role: "controller" },
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
    socket.on(socketEvents.error, ({ message }) => console.error(message));

    return () => {
      socketRef.current = null;
      socket.disconnect();
    };
  }, []);

  const isConnected = connectionState === "connected";
  const isAtFirstSlide = presentationState?.currentSlideIndex === 0;
  const isAtLastSlide = presentationState
    ? presentationState.currentSlideIndex === presentationState.totalSlides - 1
    : true;

  function sendCommand(
    event: typeof socketEvents.next | typeof socketEvents.previous,
  ): void {
    if (isConnected) {
      socketRef.current?.emit(event);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-5 py-6 sm:px-8">
      <ControllerHeader connectionState={connectionState} />

      <section className="flex flex-1 flex-col justify-center py-8">
        {presentationState ? (
          <CurrentSlideCard presentationState={presentationState} />
        ) : (
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-center">
            <p className="text-lg font-semibold">
              {connectionState === "connecting"
                ? "Connecting to host…"
                : "Host unavailable"}
            </p>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              Keep this page open. PreachSync will reconnect automatically when
              the presentation host is available.
            </p>
          </div>
        )}
      </section>

      <PresentationControls
        previousDisabled={!isConnected || !presentationState || isAtFirstSlide}
        nextDisabled={!isConnected || isAtLastSlide}
        onPrevious={() => sendCommand(socketEvents.previous)}
        onNext={() => sendCommand(socketEvents.next)}
      />
    </main>
  );
}

function ControllerHeader({
  connectionState,
}: {
  connectionState: ConnectionState;
}) {
  const labels: Record<ConnectionState, string> = {
    connecting: "Connecting",
    connected: "Connected",
    disconnected: "Disconnected",
  };

  return (
    <header className="flex items-center justify-between">
      <div>
        <p className="text-xs font-bold tracking-[0.22em] text-amber-400 uppercase">
          PreachSync
        </p>
        <h1 className="mt-1 text-xl font-semibold">Remote controller</h1>
      </div>
      <span className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-medium text-zinc-300">
        <span
          className={`size-2 rounded-full ${
            connectionState === "connected"
              ? "bg-emerald-400"
              : connectionState === "connecting"
                ? "bg-amber-400"
                : "bg-red-400"
          }`}
          aria-hidden="true"
        />
        {labels[connectionState]}
      </span>
    </header>
  );
}

function CurrentSlideCard({
  presentationState,
}: {
  presentationState: PresentationState;
}) {
  return (
    <article
      className="rounded-3xl border border-white/10 bg-white/[0.04] p-7 shadow-2xl shadow-black/30"
      aria-live="polite"
    >
      <p className="text-sm font-bold tracking-[0.18em] text-amber-400 uppercase">
        Slide {presentationState.currentSlideIndex + 1} of{" "}
        {presentationState.totalSlides}
      </p>
      <h2 className="mt-5 text-4xl leading-tight font-bold tracking-tight">
        {presentationState.currentSlide.title}
      </h2>
      <p className="mt-5 line-clamp-5 text-lg leading-8 text-zinc-300">
        {presentationState.currentSlide.body}
      </p>
    </article>
  );
}

function PresentationControls({
  previousDisabled,
  nextDisabled,
  onPrevious,
  onNext,
}: {
  previousDisabled: boolean;
  nextDisabled: boolean;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <section className="grid grid-cols-[0.8fr_1.2fr] gap-3 pb-[max(0px,env(safe-area-inset-bottom))]">
      <button
        type="button"
        className="min-h-24 touch-manipulation rounded-2xl border border-white/15 bg-white/[0.06] px-4 text-lg font-bold text-white transition-colors hover:bg-white/10 active:bg-white/15 disabled:cursor-not-allowed disabled:opacity-35"
        onClick={onPrevious}
        disabled={previousDisabled}
        aria-label="Previous slide"
      >
        <span aria-hidden="true">←</span> Previous
      </button>
      <button
        type="button"
        className="min-h-24 touch-manipulation rounded-2xl bg-amber-400 px-4 text-xl font-black text-zinc-950 shadow-lg shadow-amber-400/10 transition-colors hover:bg-amber-300 active:bg-amber-500 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400 disabled:shadow-none"
        onClick={onNext}
        disabled={nextDisabled}
        aria-label="Next slide"
      >
        Next <span aria-hidden="true">→</span>
      </button>
    </section>
  );
}
