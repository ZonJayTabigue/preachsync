"use client";

import { useEffect } from "react";

export function useScreenWakeLock(): void {
  useEffect(() => {
    let cancelled = false;
    let wakeLock: WakeLockSentinel | null = null;

    async function requestWakeLock(): Promise<void> {
      if (cancelled || document.visibilityState !== "visible") {
        return;
      }
      if (!("wakeLock" in navigator)) {
        return;
      }

      try {
        wakeLock = await navigator.wakeLock.request("screen");
      } catch (error: unknown) {
        console.error("Unable to keep the screen awake.", error);
      }
    }

    function handleVisibilityChange(): void {
      if (document.visibilityState === "visible") {
        void requestWakeLock();
      }
    }

    void requestWakeLock();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      void wakeLock?.release();
    };
  }, []);
}
