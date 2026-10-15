"use client";
import { Camera, ImagePlus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
/** Shared capture/gallery control for consultation photos and onboarding documents. */
export function PhotoFilePicker({
  label,
  id,
  multiple = true,
  allowPdf = false,
  onFiles,
}: {
  label: string;
  id?: string;
  multiple?: boolean;
  allowPdf?: boolean;
  onFiles: (files: FileList | File[] | null) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState("");
  useEffect(() => {
    if (videoRef.current && stream) videoRef.current.srcObject = stream;
    return () => stream?.getTracks().forEach((track) => track.stop());
  }, [stream]);
  async function openCamera() {
    setCameraError("");
    try {
      const next = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      setStream(next);
    } catch {
      setCameraError("Camera access was blocked. Allow camera permission and try again.");
    }
  }
  function closeCamera() {
    stream?.getTracks().forEach((track) => track.stop());
    setStream(null);
  }
  function capturePhoto() {
    const video = videoRef.current;
    if (!video?.videoWidth || !video.videoHeight) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      onFiles([new File([blob], `camera-${Date.now()}.jpg`, { type: "image/jpeg" })]);
      closeCamera();
    }, "image/jpeg", 0.92);
  }
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <button type="button" onClick={() => void openCamera()} className="flex min-h-12 items-center gap-2 rounded-xl border px-4 py-3 text-sm">
        <Camera size={18} /> Take Photo
      </button>
      <label className="relative flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border px-4 py-3 text-sm">
          <ImagePlus size={18} />
          {allowPdf ? "Upload image or PDF" : "Upload from gallery"}
          <input
            id={id}
            aria-label={`${label}: ${allowPdf ? "Upload image or PDF" : "Upload from gallery"}`}
            className="absolute inset-0 opacity-0 cursor-pointer w-full"
            type="file"
            accept={allowPdf ? "image/jpeg,image/png,image/webp,application/pdf" : "image/*"}
            multiple={multiple}
            onChange={(e) => {
              onFiles(e.target.files);
              e.target.value = "";
            }}
          />
      </label>
      {cameraError && <p role="alert" className="w-full text-sm text-red-700">{cameraError}</p>}
      {stream && <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/80 p-4" role="dialog" aria-modal="true" aria-label={`Take ${label}`}>
        <div className="w-full max-w-lg space-y-3 rounded-xl bg-white p-4">
          <video ref={videoRef} autoPlay playsInline muted className="max-h-[70dvh] w-full rounded-lg bg-black object-contain" />
          <div className="flex gap-3">
            <button type="button" onClick={capturePhoto} className="flex-1 rounded-lg bg-orange-600 px-4 py-3 font-semibold text-white">Capture photo</button>
            <button type="button" onClick={closeCamera} className="rounded-lg border px-4 py-3">Cancel</button>
          </div>
        </div>
      </div>}
    </div>
  );
}
