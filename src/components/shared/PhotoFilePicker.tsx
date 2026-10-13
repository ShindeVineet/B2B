"use client";
import { Camera, ImagePlus } from "lucide-react";
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
  onFiles: (files: FileList | null) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 mt-3">
      {[
        { camera: true, label: "Take Photo", icon: Camera },
        {
          camera: false,
          label: allowPdf ? "Upload image or PDF" : "Upload from gallery",
          icon: ImagePlus,
        },
      ].map((o) => (
        <label
          key={o.label}
          className="relative flex items-center gap-2 min-h-12 border rounded-xl px-4 py-3 text-sm cursor-pointer"
        >
          <o.icon size={18} />
          {o.label}
          <input
            id={!o.camera ? id : undefined}
            aria-label={`${label}: ${o.label}`}
            className="absolute inset-0 opacity-0 cursor-pointer w-full"
            type="file"
            accept={
              !o.camera && allowPdf
                ? "image/jpeg,image/png,image/webp,application/pdf"
                : "image/*"
            }
            capture={o.camera ? "environment" : undefined}
            multiple={!o.camera && multiple}
            onChange={(e) => {
              onFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      ))}
    </div>
  );
}
