"use client";

import { ChangeEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { adminAuthorizationHeader, requireSupabase } from "@/lib/supabase";
import { Field } from "@/components/ContentEditor";
import { useRef } from "react";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const BUCKET = "today-media";

type Media = {
  id: string;
  storage_path: string;
  alt_text: string;
  credit: string | null;
  public_url?: string | null;
  is_pool_asset?: boolean;
};

interface CoverUploadProps {
  contentId?: string;
  onCoverChange?: () => void;
}

export function CoverUpload({ contentId, onCoverChange }: CoverUploadProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [isLocalPreview, setIsLocalPreview] = useState(false);
  const [currentMedia, setCurrentMedia] = useState<Media | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Load existing cover
  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!contentId) return;
      try {
        const supabase = requireSupabase();
        const { data: item } = await supabase
          .from("content_items")
          .select("cover_media_id")
          .eq("id", contentId)
          .single();

        if (!active) return;
        if (!item?.cover_media_id) {
          // Pool visuals use a separate assignment table rather than cover_media_id.
          // Resolve them server-side so the cover preview does not depend on client RLS timing.
          const token = (await supabase.auth.getSession()).data.session?.access_token;
          const response = await fetch(`/api/admin/daily-prayer-visuals?contentId=${encodeURIComponent(contentId)}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
          if (response.ok) {
            const { assignedVisual: asset } = await response.json();
            if (asset?.preview_url) {
              setCurrentMedia({
                id: asset.id,
                storage_path: asset.storage_path || "",
                alt_text: asset.alt_text || asset.title,
                credit: "Daily Prayer Visual Pool",
                is_pool_asset: true,
              });
              setPreviewUrl(asset.preview_url);
              setIsLocalPreview(false);
              return;
            }
          }

          setCurrentMedia(null);
          setPreviewUrl("");
          return;
        }

        const { data: media, error: mediaError } = await supabase
          .from("content_media")
          .select("*")
          .eq("id", item.cover_media_id)
          .single();

        if (!active) return;
        if (mediaError || !media) {
          setCurrentMedia(null);
          setPreviewUrl("");
          return;
        }

        setCurrentMedia(media as Media);

        if (active) {
          if (media.public_url) {
            setPreviewUrl(media.public_url);
            setIsLocalPreview(false);
          } else {
            const { data: signed, error: urlError } = await supabase.storage.from(BUCKET).createSignedUrl(media.storage_path, 300);
            if (urlError) setStatusMessage("The current cover could not be previewed.");
            else if (signed?.signedUrl) {
              setPreviewUrl(signed.signedUrl);
              setIsLocalPreview(false);
            }
          }
        }
      } catch (err) {
        console.error("Cover load error:", err);
      }
    };
    void load();
    return () => { active = false; };
  }, [contentId, refreshKey]);

  // Revoke object URLs on cleanup or change
  useEffect(() => {
    return () => {
      if (isLocalPreview && previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl, isLocalPreview]);

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null;
    setStatusMessage("");
    setIsSuccess(false);

    if (!selected) return;

    if (!ALLOWED_TYPES.has(selected.type)) {
      setStatusMessage("Invalid file type. Please choose a JPEG, PNG, or WebP image.");
      return;
    }

    if (selected.size > MAX_BYTES) {
      setStatusMessage("File too large. Please choose an image smaller than 5 MB.");
      return;
    }

    if (isLocalPreview && previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setFile(selected);
    setPreviewUrl(URL.createObjectURL(selected));
    setIsLocalPreview(true);
  }

  async function handleUpload() {
    if (!contentId) {
      setStatusMessage("Draft must be saved first before uploading a cover image.");
      return;
    }
    if (!file) {
      setStatusMessage("Please choose an image first.");
      return;
    }

    setIsBusy(true);
    setStatusMessage("");
    setIsSuccess(false);

    const supabase = requireSupabase();
    let mediaId = "";
    let mediaRowDone = false;

    try {
      const effectiveAltText = file.name.replace(/\.[^/.]+$/, "");
      const formData = new FormData();
      formData.set("file", file);
      formData.set("contentId", contentId);
      formData.set("role", "thumbnail");
      formData.set("altText", effectiveAltText);
      formData.set("credit", "");

      const authHeaders = await adminAuthorizationHeader();
      const mediaResponse = await fetch("/api/admin/content-media", { method: "POST", headers: authHeaders, body: formData });
      const mediaPayload = await mediaResponse.json();
      if (!mediaResponse.ok) throw new Error(mediaPayload.error || "Upload failure");
      const media = mediaPayload.media as Media;
      mediaId = media.id;
      mediaRowDone = true;

      // 3. Assign cover_media_id to content_item
      const { error: assignError } = await supabase
        .from("content_items")
        .update({ cover_media_id: mediaId })
        .eq("id", contentId);

      if (assignError) throw new Error("Cover-assignment failure: " + assignError.message);

      // --- SUCCESS ---
      const oldMedia = currentMedia;
      setFile(null);
      setIsSuccess(true);
      setStatusMessage("Cover image saved.");

      // Update local state to reflect the new media
      setCurrentMedia(media as Media);
      setIsLocalPreview(false);

      // Trigger editor refresh if provided
      if (onCoverChange) onCoverChange();
      else router.refresh();

      // --- SAFE CLEANUP ---
      if (oldMedia && !oldMedia.is_pool_asset) {
        try {
          const { count, error: countError } = await supabase
            .from("content_items")
            .select("id", { count: "exact", head: true })
            .eq("cover_media_id", oldMedia.id);

          if (!countError && (count === 0)) {
            const cleanupResponse = await fetch("/api/admin/content-media", { method: "DELETE", headers: { ...authHeaders, "Content-Type": "application/json" }, body: JSON.stringify({ id: oldMedia.id }) });
            if (!cleanupResponse.ok) {
              setStatusMessage("New cover saved. The previous cover could not be fully cleaned up.");
              setIsSuccess(false);
            }
          }
        } catch (cleanupErr) {
          console.error("Cleanup warning:", cleanupErr);
          setStatusMessage("New cover saved. The previous cover could not be fully cleaned up.");
          setIsSuccess(false);
        }
      }

      setRefreshKey(prev => prev + 1);

    } catch (err) {
      console.error("Workflow error:", err);
      const mainError = err instanceof Error ? err.message : "Could not upload and assign cover.";
      setStatusMessage(mainError);

      // --- ROLLBACK ---
      const rollbackErrors: string[] = [];

      if (mediaRowDone) {
        const rollbackResponse = await fetch("/api/admin/content-media", { method: "DELETE", headers: { ...(await adminAuthorizationHeader()), "Content-Type": "application/json" }, body: JSON.stringify({ id: mediaId }) });
        if (!rollbackResponse.ok) rollbackErrors.push("Media rollback failed.");
      }

      if (rollbackErrors.length > 0) {
        setStatusMessage(`${mainError} Also: ${rollbackErrors.join("; ")}`);
      }
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <section className="card flex flex-col gap-8">
      <h3 className="card-title">Cover Image</h3>

      {previewUrl ? (
        <div className="relative group">
          <img
            src={previewUrl}
            alt={isLocalPreview ? "Selected cover preview" : (currentMedia?.alt_text || "Current cover")}
            className="w-full aspect-[16/10] rounded-2xl object-cover border border-line shadow-md transition-all group-hover:shadow-lg"
          />
          {!isLocalPreview && currentMedia && (
            <span className="absolute top-4 right-4 badge ready shadow-sm bg-white/95 backdrop-blur-md">
              Live
            </span>
          )}
          {file && (
            <span className="absolute top-4 right-4 badge draft shadow-sm bg-white/95 backdrop-blur-md">
              New Selection
            </span>
          )}
        </div>
      ) : (
        <div
          className="w-full aspect-[16/10] rounded-2xl bg-beige/40 border-2 border-dashed border-line/60 flex flex-col items-center justify-center text-muted gap-3 cursor-pointer hover:bg-beige/60 transition-colors"
          onClick={() => fileInputRef.current?.click()}
        >
          <span className="text-4xl opacity-50">📸</span>
          <div className="text-center">
            <p className="text-sm font-bold text-ink/70">No image assigned</p>
            <p className="text-xs opacity-70">Click to choose a photo</p>
          </div>
        </div>
      )}

      <div className="grid gap-6">
        <Field label="📸 Image Selection" help="Recommended: 1600x1000px, JPEG/PNG">
          <div className="flex flex-col gap-3">
            <input
              ref={fileInputRef}
              style={{ display: "none" }}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileChange}
              disabled={isBusy}
            />
            <button
              type="button"
              className="button secondary w-full text-xs py-2.5"
              onClick={() => fileInputRef.current?.click()}
              disabled={isBusy}
            >
              {file ? "Change Selection" : "Choose Photo"}
            </button>
            {file && (
              <p className="text-center text-xs font-medium text-gold bg-gold/5 py-1.5 rounded-lg border border-gold/10">
                📄 {file.name}
              </p>
            )}
          </div>
        </Field>
      </div>

      <div className="flex flex-col gap-3 pt-2">
        <button
          className="button w-full shadow-md"
          type="button"
          disabled={Boolean(isBusy || !file)}
          onClick={() => void handleUpload()}
        >
          {isBusy ? "Uploading..." : currentMedia ? "Update Cover Image" : "Upload & Save Cover"}
        </button>

        {file && !isBusy && (
          <button
            className="button secondary w-full text-xs underline"
            type="button"
            onClick={() => {
              setFile(null);
              setRefreshKey(prev => prev + 1);
            }}
          >
            Discard Selection
          </button>
        )}
      </div>

      {statusMessage && (
        <p className={`alert ${isSuccess ? "success" : "error"} text-xs text-center font-medium`} role="alert">
          {statusMessage}
        </p>
      )}
    </section>
  );
}
