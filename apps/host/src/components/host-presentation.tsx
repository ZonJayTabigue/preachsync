"use client";

import {
  socketEvents,
  type ClientToServerEvents,
  type PresentationState,
  type ServerToClientEvents,
} from "@preachsync/shared";
import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { HostUpload } from "@/components/host-upload";
import { slideVisualSrc } from "@/lib/slide-visual";

type ConnectionState = "connecting" | "connected" | "disconnected";
type PreachSyncSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export function HostPresentation() {
  const socketRef = useRef<PreachSyncSocket | null>(null);
  const stageRef = useRef<HTMLElement | null>(null);
  const [presentationState, setPresentationState] =
    useState<PresentationState | null>(null);
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("connecting");
  const [controllerCount, setControllerCount] = useState(0);
  const [hostToken, setHostToken] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const socket: PreachSyncSocket = io({
      auth: { role: "host" },
      reconnection: true,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnectionState("connected");
      socket.emit(socketEvents.requestState);
    });
    socket.on("disconnect", () => {
      setConnectionState("disconnected");
      setHostToken(null);
    });
    socket.on("connect_error", () => setConnectionState("disconnected"));
    socket.on(socketEvents.state, setPresentationState);
    socket.on(socketEvents.controllerCount, setControllerCount);
    socket.on(socketEvents.hostToken, ({ token }) => setHostToken(token));
    socket.on(socketEvents.error, ({ message }) => console.error(message));

    return () => {
      socketRef.current = null;
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    function syncFullscreenState(): void {
      setIsFullscreen(document.fullscreenElement === stageRef.current);
    }

    document.addEventListener("fullscreenchange", syncFullscreenState);
    return () =>
      document.removeEventListener("fullscreenchange", syncFullscreenState);
  }, []);

  async function enterPresentationFullscreen(): Promise<void> {
    const stage = stageRef.current;
    if (!stage || document.fullscreenElement === stage) {
      return;
    }

    try {
      await stage.requestFullscreen();
    } catch (error: unknown) {
      console.error("Unable to enter presentation fullscreen.", error);
    }
  }

  async function exitPresentationFullscreen(): Promise<void> {
    if (!document.fullscreenElement) {
      return;
    }

    try {
      await document.exitFullscreen();
    } catch (error: unknown) {
      console.error("Unable to exit presentation fullscreen.", error);
    }
  }

  async function togglePresentationFullscreen(): Promise<void> {
    if (document.fullscreenElement === stageRef.current) {
      await exitPresentationFullscreen();
      return;
    }

    await enterPresentationFullscreen();
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      const nextKeys = ["ArrowRight", "PageDown", " "];
      const previousKeys = ["ArrowLeft", "PageUp"];

      if (event.key === "f" || event.key === "F" || event.key === "F11") {
        event.preventDefault();
        void togglePresentationFullscreen();
        return;
      }

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
          <p className="mt-1 text-sm text-zinc-400">
            {presentationState?.presentationTitle ?? "Presentation host"}
          </p>
        </div>
        <div className="flex items-center gap-5 text-sm text-zinc-300">
          <StatusIndicator active={isConnected} label={serverStatusLabel} />
          <span>
            {controllerCount}{" "}
            {controllerCount === 1 ? "controller" : "controllers"}
          </span>
          <button
            type="button"
            className="rounded-lg border border-white/15 bg-white/[0.06] px-3 py-2 text-xs font-semibold text-white hover:bg-white/10"
            onClick={() => void enterPresentationFullscreen()}
          >
            Fullscreen
          </button>
        </div>
      </header>

      <section
        ref={stageRef}
        className="presentation-stage relative flex w-full flex-1 items-center justify-center overflow-hidden bg-black"
        aria-live="polite"
      >
        {presentationState ? (
          <CurrentSlide
            presentationState={presentationState}
            isFullscreen={isFullscreen}
          />
        ) : (
          <p className="px-6 text-xl text-zinc-400">
            {connectionState === "connecting"
              ? "Connecting to server…"
              : "Unable to connect to the presentation server."}
          </p>
        )}
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-5 py-4 text-xs text-zinc-500 sm:px-8">
        <HostUpload hostToken={hostToken} />
        <span>Arrow keys · Page Up / Down · Space · F fullscreen</span>
      </footer>
    </main>
  );
}

function CurrentSlide({
  presentationState,
  isFullscreen,
}: {
  presentationState: PresentationState;
  isFullscreen: boolean;
}) {
  const { currentSlide } = presentationState;
  const visualSrc = slideVisualSrc(currentSlide);

  if (visualSrc) {
    return (
      <>
        <SlideImage
          src={visualSrc}
          alt={currentSlide.title}
          className="absolute inset-0 h-full w-full object-contain"
        />
        {isFullscreen ? null : (
          <p className="absolute right-5 bottom-4 rounded bg-black/50 px-2 py-1 text-xs font-semibold tracking-[0.16em] text-zinc-200 uppercase">
            {presentationState.currentSlideIndex + 1} /{" "}
            {presentationState.totalSlides}
          </p>
        )}
      </>
    );
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-6xl flex-col items-center justify-center px-6 py-12 text-center">
      {isFullscreen ? null : (
        <p className="mb-8 text-sm font-semibold tracking-[0.2em] text-zinc-500 uppercase">
          {presentationState.currentSlideIndex + 1} /{" "}
          {presentationState.totalSlides}
        </p>
      )}
      <h1 className="text-5xl leading-tight font-bold tracking-tight text-balance sm:text-7xl lg:text-8xl">
        {currentSlide.title}
      </h1>
      {currentSlide.body ? (
        <p className="mx-auto mt-10 max-w-5xl whitespace-pre-line text-2xl leading-relaxed text-zinc-300 text-balance sm:text-4xl lg:text-5xl">
          {currentSlide.body}
        </p>
      ) : null}
    </div>
  );
}

function SlideImage({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className: string;
}) {
  return (
    // Data URLs from uploaded PPTX cannot use next/image.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} className={className} />
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
