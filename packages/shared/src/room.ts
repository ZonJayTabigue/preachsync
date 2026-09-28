const ROOM_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;

/** Lowercase room code, or null when the value cannot name a church room. */
export function normalizeRoomId(value: string): string | null {
  const roomId = value
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  if (!ROOM_ID_PATTERN.test(roomId)) {
    return null;
  }

  return roomId;
}
