"use client";

import { normalizeRoomId } from "@preachsync/shared";
import { useState } from "react";

export function RoomJoin({
  title,
  invalidRoom,
  onJoin,
}: {
  title: string;
  invalidRoom: boolean;
  onJoin: (value: string) => void;
}) {
  const [value, setValue] = useState("");
  const [localError, setLocalError] = useState(false);
  const showError = invalidRoom || localError;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#090b10] px-6 text-white">
      <form
        className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.04] p-8"
        onSubmit={(event) => {
          event.preventDefault();
          if (!normalizeRoomId(value)) {
            setLocalError(true);
            return;
          }

          setLocalError(false);
          onJoin(value);
        }}
      >
        <p className="text-xs font-bold tracking-[0.22em] text-amber-400 uppercase">
          PreachSync
        </p>
        <h1 className="mt-2 text-2xl font-semibold">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-400">
          Use the same room code on this church’s projector and phones. The
          other church uses a different code, so the two services stay separate.
        </p>
        <label className="mt-6 block text-sm font-semibold" htmlFor="room-code">
          Room code
        </label>
        <input
          id="room-code"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="mt-2 w-full rounded-xl border border-white/15 bg-black/40 px-4 py-3 text-lg outline-none focus:border-amber-400"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="north"
        />
        {showError ? (
          <p className="mt-2 text-sm text-red-300">
            Use 1–32 letters, numbers, or hyphens.
          </p>
        ) : null}
        <button
          type="submit"
          className="mt-6 w-full rounded-xl bg-amber-400 py-3 text-base font-black text-zinc-950"
        >
          Join room
        </button>
      </form>
    </main>
  );
}
