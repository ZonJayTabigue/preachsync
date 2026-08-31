"use client";

import {
  socketEvents,
  type PresentationState,
  type Slide,
  type SlideSummary,
} from "@preachsync/shared";
import { useEffect, useRef, useState } from "react";
import {
  connectPreachSyncSocket,
  type PreachSyncSocket,
} from "@/lib/preachsync-socket";
import { slideVisualSrc } from "@/lib/slide-visual";

type ConnectionState = "connecting" | "connected" | "disconnected";

export function PresentationController() {
  const socketRef = useRef<PreachSyncSocket | null>(null);
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("connecting");
  const [presentationState, setPresentationState] =
    useState<PresentationState | null>(null);

  useEffect(() => {
    const socket = connectPreachSyncSocket("controller");
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

  function goToSlide(index: number): void {
    if (isConnected) {
      socketRef.current?.emit(socketEvents.goTo, index);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col bg-[#090b10] px-5 py-6 text-white sm:px-8">
      <ControllerHeader connectionState={connectionState} />

      <section className="flex flex-1 flex-col justify-center gap-4 py-6">
        {presentationState ? (
          <>
            <CurrentSlideCard presentationState={presentationState} />
            <NextSlidePreview
              nextSlide={presentationState.nextSlide}
              nextIndex={presentationState.currentSlideIndex + 1}
              disabled={!isConnected || isAtLastSlide}
              onGoNext={() => sendCommand(socketEvents.next)}
            />
            <SlideJumpList
              presentationState={presentationState}
              disabled={!isConnected}
              onGoTo={goToSlide}
            />
          </>
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
  const visualSrc = slideVisualSrc(presentationState.currentSlide);

  return (
    <article
      className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 shadow-2xl shadow-black/30"
      aria-live="polite"
    >
      <p className="text-sm font-bold tracking-[0.18em] text-amber-400 uppercase">
        Now · Slide {presentationState.currentSlideIndex + 1} of{" "}
        {presentationState.totalSlides}
      </p>
      {visualSrc ? (
        <SlidePreviewImage src={visualSrc} className="mt-4 max-h-48" />
      ) : (
        <>
          <h2 className="mt-4 text-3xl leading-tight font-bold tracking-tight">
            {presentationState.currentSlide.title}
          </h2>
          {presentationState.currentSlide.body ? (
            <p className="mt-3 line-clamp-4 whitespace-pre-line text-base leading-7 text-zinc-300">
              {presentationState.currentSlide.body}
            </p>
          ) : null}
        </>
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
      <p className="px-1 text-sm text-zinc-500">This is the last slide.</p>
    );
  }

  const visualSrc = slideVisualSrc(nextSlide);

  return (
    <button
      type="button"
      className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-left disabled:cursor-not-allowed disabled:opacity-40"
      onClick={onGoNext}
      disabled={disabled}
      aria-label={`Next slide: ${nextSlide.title}`}
    >
      <div className="h-16 w-24 shrink-0 overflow-hidden rounded-lg bg-black">
        {visualSrc ? (
          <SlidePreviewImage src={visualSrc} className="h-full max-h-16" />
        ) : (
          <div className="flex h-full items-center justify-center px-2 text-center text-[10px] leading-4 text-zinc-400">
            {nextSlide.title}
          </div>
        )}
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-bold tracking-[0.16em] text-zinc-500 uppercase">
          Up next · {nextIndex + 1}
        </p>
        <p className="mt-1 truncate text-sm font-semibold">{nextSlide.title}</p>
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
    const currentButton = listRef.current?.querySelector(
      `[data-slide-index="${presentationState.currentSlideIndex}"]`,
    );
    currentButton?.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  }, [presentationState.currentSlideIndex, presentationState.presentationId]);

  return (
    <section>
      <p className="mb-2 px-1 text-[11px] font-bold tracking-[0.16em] text-zinc-500 uppercase">
        Jump to slide
      </p>
      <div
        ref={listRef}
        className="flex gap-2 overflow-x-auto pb-1"
        role="list"
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
      className={`w-24 shrink-0 rounded-xl border p-1.5 text-left ${
        isCurrent
          ? "border-amber-400 bg-amber-400/10"
          : "border-white/10 bg-white/[0.03]"
      } disabled:cursor-not-allowed disabled:opacity-40`}
      onClick={() => onGoTo(index)}
      disabled={disabled || isCurrent}
      aria-label={`Go to slide ${index + 1}: ${slide.title}`}
      aria-current={isCurrent ? "true" : undefined}
    >
      <div className="mb-1.5 h-12 overflow-hidden rounded-lg bg-black">
        {visualSrc ? (
          <SlidePreviewImage src={visualSrc} className="h-full max-h-12" />
        ) : (
          <div className="flex h-full items-center justify-center px-1 text-center text-[10px] leading-3 text-zinc-400">
            {index + 1}
          </div>
        )}
      </div>
      <p className="text-[10px] font-bold text-zinc-400">{index + 1}</p>
      <p className="truncate text-[11px] font-semibold">{slide.title}</p>
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
    <img src={src} alt="" className={`w-full object-contain ${className}`} />
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
