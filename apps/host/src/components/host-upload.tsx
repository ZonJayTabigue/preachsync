"use client";

import { useRef, useState } from "react";

type UploadStatus = "idle" | "uploading" | "success" | "error";

export function HostUpload({ hostToken }: { hostToken: string | null }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [statusMessage, setStatusMessage] = useState("");

  async function uploadFile(file: File): Promise<void> {
    if (!hostToken) {
      setStatus("error");
      setStatusMessage("Connect as the host before uploading.");
      return;
    }

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setStatus("error");
      setStatusMessage("Only .pdf files can be uploaded.");
      return;
    }

    setStatus("uploading");
    setStatusMessage("Reading PDF…");

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/presentation/upload", {
        method: "POST",
        headers: {
          "x-preachsync-host-token": hostToken,
        },
        body: formData,
      });

      const payload: unknown = await response.json();
      const errorMessage =
        typeof payload === "object" &&
        payload !== null &&
        "error" in payload &&
        typeof payload.error === "string"
          ? payload.error
          : "Upload failed.";

      if (!response.ok) {
        setStatus("error");
        setStatusMessage(errorMessage);
        return;
      }

      const slideCount =
        typeof payload === "object" &&
        payload !== null &&
        "slideCount" in payload &&
        typeof payload.slideCount === "number"
          ? payload.slideCount
          : 0;

      setStatus("success");
      setStatusMessage(`Loaded ${slideCount} slides from ${file.name}`);
    } catch (error: unknown) {
      console.error("PDF upload failed.", error);
      setStatus("error");
      setStatusMessage("Could not reach the PreachSync server.");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,application/pdf"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) {
            void uploadFile(file);
          }
        }}
      />
      <button
        type="button"
        className="rounded-lg border border-white/15 bg-white/[0.06] px-3 py-2 text-xs font-semibold text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
        disabled={!hostToken || status === "uploading"}
        onClick={() => fileInputRef.current?.click()}
      >
        {status === "uploading" ? "Uploading…" : "Upload PDF"}
      </button>
      {statusMessage ? (
        <p
          className={`text-xs ${
            status === "error" ? "text-red-300" : "text-zinc-400"
          }`}
          aria-live="polite"
        >
          {statusMessage}
        </p>
      ) : (
        <p className="text-xs text-zinc-500">.pdf only · host PC</p>
      )}
    </div>
  );
}
