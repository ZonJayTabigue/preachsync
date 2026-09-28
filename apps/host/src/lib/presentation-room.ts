"use client";

import { normalizeRoomId } from "@preachsync/shared";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function usePresentationRoom(): {
  ready: boolean;
  roomId: string | null;
  invalidRoom: boolean;
  joinRoom: (value: string) => void;
} {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [invalidRoom, setInvalidRoom] = useState(false);

  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get("room");
    if (raw === null || raw.trim() === "") {
      setRoomId(null);
      setInvalidRoom(false);
    } else {
      const normalized = normalizeRoomId(raw);
      setRoomId(normalized);
      setInvalidRoom(normalized === null);
    }
    setReady(true);
  }, []);

  function joinRoom(value: string): void {
    const normalized = normalizeRoomId(value);
    if (!normalized) {
      setInvalidRoom(true);
      return;
    }

    const params = new URLSearchParams(window.location.search);
    params.set("room", normalized);
    router.replace(`${window.location.pathname}?${params.toString()}`);
    setRoomId(normalized);
    setInvalidRoom(false);
  }

  return { ready, roomId, invalidRoom, joinRoom };
}
