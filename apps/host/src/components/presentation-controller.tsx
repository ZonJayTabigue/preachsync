"use client";

import {
  socketEvents,
  type PresentationState,
  type Slide,
  type SlideSummary,
} from "@preachsync/shared";
import { useEffect, useRef, useState } from "react";
import { HostUpload } from "@/components/host-upload";
import { RoomJoin } from "@/components/room-join";
import {
  connectPreachSyncSocket,
  type PreachSyncSocket,
} from "@/lib/preachsync-socket";
import { usePresentationRoom } from "@/lib/presentation-room";
import { useScreenWakeLock } from "@/lib/use-screen-wake-lock";
import { slideVisualSrc } from "@/lib/slide-visual";

type ConnectionState = "connecting" | "connected" | "disconnected";

export function PresentationController() {
  useScreenWakeLock();
  const room = usePresentationRoom();

  if (!room.ready) {
    return <main className="h-dvh bg-[#090b10]" />;
  }

  if (!room.roomId) {
    return (
      <RoomJoin
        title="Remote controller"
        invalidRoom={room.invalidRoom}
        onJoin={room.joinRoom}
      />
    );
  }

  return <PresentationControllerSession roomId={room.roomId} />;
}

function PresentationControllerSession({ roomId }: { roomId: string }) {
  const socketRef = useRef<PreachSyncSocket | null>(null);
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("connecting");
  const [presentationState, setPresentationState] =
    useState<PresentationState | null>(null);
  const [hostToken, setHostToken] = useState<string | null>(null);

  useEffect(() => {
    const socket = connectPreachSyncSocket("controller", roomId);
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
    socket.on(socketEvents.hostToken, ({ token }) => setHostToken(token));
    socket.on(socketEvents.error, ({ message }) => console.error(message));

    return () => {
      socketRef.current = null;
      socket.disconnect();
    };
  }, [roomId]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT")
      ) {
        return;
      }

      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        event.preventDefault();
        socketRef.current?.emit(socketEvents.next);
      } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        event.preventDefault();
        socketRef.current?.emit(socketEvents.previous);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
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

  function goToSlide(index: number): void {
    if (isConnected) {
      socketRef.current?.emit(socketEvents.goTo, index);
    }
  }

  return (
    <main className="flex h-dvh w-full flex-col overflow-hidden bg-[#090b10] px-4 py-2 text-white sm:px-6 sm:py-3">
      <ControllerHeader
        connectionState={connectionState}
        roomId={roomId}
        hostToken={hostToken}
      />

      <section className="flex min-h-0 flex-1 flex-col gap-2 py-2 sm:gap-3">
        {presentationState ? (
          <>
            <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 landscape:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] min-[900px]:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
              <CurrentSlideCard presentationState={presentationState} />
              <NextSlidePreview
                nextSlide={presentationState.nextSlide}
                nextIndex={presentationState.currentSlideIndex + 1}
                disabled={!isConnected || isAtLastSlide}
                onGoNext={() => sendCommand(socketEvents.next)}
              />
            </div>
            <SlideJumpList
              presentationState={presentationState}
              disabled={!isConnected}
              onGoTo={goToSlide}
            />
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-center">
            <div>
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
  roomId,
  hostToken,
}: {
  connectionState: ConnectionState;
  roomId: string;
  hostToken: string | null;
}) {
  const labels: Record<ConnectionState, string> = {
    connecting: "Connecting",
    connected: "Connected",
    disconnected: "Disconnected",
  };

  return (
    <header className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-baseline gap-3">
        <p className="shrink-0 text-xs font-bold tracking-[0.22em] text-amber-400 uppercase">
          PreachSync
        </p>
        <h1 className="truncate text-base font-semibold sm:text-lg">
          Remote controller · {roomId}
        </h1>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <HostUpload hostToken={hostToken} roomId={roomId} />
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
      </div>
    </header>
  );
}

function CurrentSlideCard({
  presentationState,
}: {
  presentationState: PresentationState;
}) {
  const visualSrc = slideVisualSrc(presentationState.currentSlide);

  return (
    <article
      className="flex h-full min-h-0 flex-col rounded-3xl border-2 border-amber-400 bg-amber-400/10 p-3 shadow-lg shadow-amber-400/10"
      aria-live="polite"
    >
      <div className="flex shrink-0 items-center gap-2">
        <span className="rounded-full bg-amber-400 px-2.5 py-1 text-xs font-black tracking-wide text-zinc-950">
          NOW
        </span>
        <p className="text-sm font-semibold text-amber-100">
          On screen · {presentationState.currentSlideIndex + 1} of{" "}
          {presentationState.totalSlides}
        </p>
      </div>
      {visualSrc ? (
        <div className="mt-2 flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-xl bg-black">
          <SlidePreviewImage src={visualSrc} className="max-h-full max-w-full" />
        </div>
      ) : (
        <div className="mt-2 min-h-0 flex-1 overflow-y-auto">
          <h2 className="text-3xl leading-tight font-bold tracking-tight">
            {presentationState.currentSlide.title}
          </h2>
          {presentationState.currentSlide.body ? (
            <p className="mt-3 line-clamp-6 whitespace-pre-line text-base leading-7 text-zinc-300">
              {presentationState.currentSlide.body}
            </p>
          ) : null}
        </div>
      )}
    </article>
  );
}

function NextSlidePreview({
  nextSlide,
  nextIndex,
  disabled,
  onGoNext,
}: {
  nextSlide: Slide | null;
  nextIndex: number;
  disabled: boolean;
  onGoNext: () => void;
}) {
  if (!nextSlide) {
    return (
      <div className="flex h-full min-h-32 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] px-4 text-sm text-zinc-500">
        This is the last slide.
      </div>
    );
  }

  const visualSrc = slideVisualSrc(nextSlide);

  return (
    <button
      type="button"
      className="flex h-full min-h-0 w-full flex-col rounded-2xl border border-dashed border-white/25 bg-black/30 p-3 text-left disabled:cursor-not-allowed disabled:opacity-40"
      onClick={onGoNext}
      disabled={disabled}
      aria-label={`Next slide: ${nextSlide.title}`}
    >
      <div className="flex shrink-0 items-center gap-2">
        <span className="rounded-full border border-white/20 bg-white/5 px-2.5 py-1 text-xs font-bold tracking-wide text-zinc-300">
          UP NEXT
        </span>
        <p className="text-xs font-medium text-zinc-500">
          Not on screen · {nextIndex + 1}
        </p>
      </div>
      <div className="mt-2 flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-xl bg-black">
        {visualSrc ? (
          <SlidePreviewImage
            src={visualSrc}
            className="max-h-[88%] max-w-full opacity-70 saturate-75"
          />
        ) : (
          <div className="flex h-full items-center justify-center px-4 text-center text-sm leading-6 text-zinc-300">
            {nextSlide.title}
          </div>
        )}
      </div>
    </button>
  );
}

function SlideJumpList({
  presentationState,
  disabled,
  onGoTo,
}: {
  presentationState: PresentationState;
  disabled: boolean;
  onGoTo: (index: number) => void;
}) {
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const list = listRef.current;
    const currentButton = list?.querySelector(
      `[data-slide-index="${presentationState.currentSlideIndex}"]`,
    );
    if (!list || !(currentButton instanceof HTMLElement)) {
      return;
    }

    const targetLeft =
      currentButton.offsetLeft - (list.clientWidth - currentButton.offsetWidth) / 2;
    list.scrollTo({ left: targetLeft, behavior: "smooth" });
  }, [presentationState.currentSlideIndex, presentationState.presentationId]);

  return (
    <section className="shrink-0">
      <div
        ref={listRef}
        className="flex gap-2 overflow-x-auto"
        role="list"
        aria-label="Jump to slide"
      >
        {presentationState.slides.map((slide, index) => (
          <SlideJumpButton
            key={slide.id}
            slide={slide}
            index={index}
            isCurrent={index === presentationState.currentSlideIndex}
            disabled={disabled}
            onGoTo={onGoTo}
          />
        ))}
      </div>
    </section>
  );
}

function SlideJumpButton({
  slide,
  index,
  isCurrent,
  disabled,
  onGoTo,
}: {
  slide: SlideSummary;
  index: number;
  isCurrent: boolean;
  disabled: boolean;
  onGoTo: (index: number) => void;
}) {
  const visualSrc = slideVisualSrc(slide);

  return (
    <button
      type="button"
      data-slide-index={index}
      className={`relative w-24 shrink-0 overflow-hidden rounded-lg border [@media(min-height:700px)]:w-36 ${
        isCurrent
          ? "border-amber-400"
          : "border-white/10"
      } disabled:cursor-not-allowed disabled:opacity-40`}
      onClick={() => onGoTo(index)}
      disabled={disabled || isCurrent}
      aria-label={`Go to slide ${index + 1}: ${slide.title}`}
      aria-current={isCurrent ? "true" : undefined}
    >
      <div className="aspect-video bg-black">
        {visualSrc ? (
          <SlidePreviewImage
            src={visualSrc}
            className="aspect-video h-full w-full"
          />
        ) : (
          <div className="flex aspect-video items-center justify-center px-1 text-center text-xs leading-4 text-zinc-400">
            {index + 1}
          </div>
        )}
      </div>
      <span className="absolute bottom-1 left-1 rounded bg-black/75 px-1.5 py-0.5 text-[10px] font-bold text-white">
        {index + 1}
      </span>
    </button>
  );
}

function SlidePreviewImage({
  src,
  className,
}: {
  src: string;
  className: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" className={`object-contain ${className}`} />
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
        className="min-h-12 touch-manipulation rounded-2xl border border-white/15 bg-white/[0.06] px-4 text-base font-bold text-white transition-colors hover:bg-white/10 active:bg-white/15 disabled:cursor-not-allowed disabled:opacity-35 [@media(min-height:700px)]:min-h-16"
        onClick={onPrevious}
        disabled={previousDisabled}
        aria-label="Previous slide"
      >
        <span aria-hidden="true">←</span> Previous
      </button>
      <button
        type="button"
        className="min-h-12 touch-manipulation rounded-2xl bg-amber-400 px-4 text-lg font-black text-zinc-950 shadow-lg shadow-amber-400/10 transition-colors hover:bg-amber-300 active:bg-amber-500 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400 disabled:shadow-none [@media(min-height:700px)]:min-h-16 [@media(min-height:700px)]:text-xl"
        onClick={onNext}
        disabled={nextDisabled}
        aria-label="Next slide"
      >
        Next <span aria-hidden="true">→</span>
      </button>
    </section>
  );
}
