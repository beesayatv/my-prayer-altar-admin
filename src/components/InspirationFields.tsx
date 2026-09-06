"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Field } from "@/components/ContentEditor";
import { requireSupabase } from "@/lib/supabase";
import { DAILY_INSPIRATION } from "@/lib/contentConfiguration";

const titleFor = () => `Daily Inspiration — ${new Date().toISOString().slice(0, 10)}`;

function isVideoUrl(url?: string | null): boolean {
  if (!url) return false;
  try {
    const cleanUrl = url.split("?")[0].split("#")[0];
    return cleanUrl.endsWith(".mp4") || cleanUrl.endsWith(".mov") || cleanUrl.endsWith(".webm");
  } catch {
    return false;
  }
}

const MODEL_ASPECT_RATIOS: Record<string, { value: string; label: string }[]> = {
  "gpt-image-2": [
    { value: "4:5",  label: "4:5 (Standard Devotional Card)" },
    { value: "9:16", label: "9:16 (Story / Full Portrait)" },
    { value: "16:9", label: "16:9 (Landscape Banner)" },
  ],
  "gpt-image-1.5": [
    { value: "4:5",  label: "4:5 (Standard Devotional Card)" },
    { value: "9:16", label: "9:16 (Story / Full Portrait)" },
    { value: "16:9", label: "16:9 (Landscape Banner)" },
  ],
  "gpt-image-1-mini": [
    { value: "4:5",  label: "4:5 (Standard Devotional Card)" },
    { value: "9:16", label: "9:16 (Story / Full Portrait)" },
    { value: "16:9", label: "16:9 (Landscape Banner)" },
  ],
};
const DEFAULT_RATIOS = MODEL_ASPECT_RATIOS["gpt-image-2"];

type Mode = "generate" | "upload";

export function InspirationFields({ contentId, metadata, initialBody, onRendered }: {
  contentId?: string; metadata: Record<string, string>; initialExcerpt?: string; initialBody?: string;
  onApplyCandidate: (candidate: { title: string; quote_text: string; excerpt: string; metadata: { ai_model?: string } }) => void; onRendered?: () => void;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("upload");

  // --- Generate mode state ---
  const [instruction, setInstruction] = useState(initialBody || "");
  const [rendering, setRendering] = useState(false);
  const [selectedModel, setSelectedModel] = useState(metadata?.card_model || "gpt-image-2");
  const [selectedAspectRatio, setSelectedAspectRatio] = useState(metadata?.card_aspect_ratio || "4:5");
  const [footerText, setFooterText] = useState(metadata?.card_footer ?? "MY PRAYER ALTAR");
  const [borderStyle, setBorderStyle] = useState(metadata?.card_border_style ?? "none");

  // --- Upload mode state ---
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadAspectRatio, setUploadAspectRatio] = useState(metadata?.card_aspect_ratio || "4:5");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Shared state ---
  const [cardUrl, setCardUrl] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const isVideoFile = uploadFile?.type === "video/mp4" || (!uploadFile && isVideoUrl(cardUrl));

  const availableRatios = MODEL_ASPECT_RATIOS[selectedModel] ?? DEFAULT_RATIOS;

  function handleModelChange(model: string) {
    setSelectedModel(model);
    const ratios = MODEL_ASPECT_RATIOS[model] ?? DEFAULT_RATIOS;
    if (!ratios.some(r => r.value === selectedAspectRatio)) setSelectedAspectRatio("4:5");
  }

  function handleModeChange(next: Mode) {
    setMode(next);
    setMessage("");
  }

  // Studio defaults tracking for display
  const [studioDefaults, setStudioDefaults] = useState<{ model: string; border: string; visualDirection?: string }>({
    model: "GPT Image 2",
    border: "None",
  });

  // Load Image Studio defaults if editing a fresh card
  useEffect(() => {
    void (async () => {
      try {
        const client = requireSupabase();
        const { data } = await client
          .from("automation_configs")
          .select("config_json")
          .eq("content_type", DAILY_INSPIRATION)
          .maybeSingle();

        if (data?.config_json) {
          const cfg = data.config_json as {
            defaultModel?: string;
            defaultAspectRatio?: string;
            defaultBorderStyle?: string;
            defaultFooterText?: string;
            defaultVisualDirection?: string;
          };

          const modelLabels: Record<string, string> = {
            "gpt-image-2": "GPT Image 2 (HD Flagship)",
            "gpt-image-1.5": "GPT Image 1.5 (Standard)",
            "gpt-image-1-mini": "GPT Image 1 Mini (Fast)",
          };
          const borderLabels: Record<string, string> = {
            none: "None (Clean)",
            thin: "Thin Solid Border",
            decorative: "Decorative Gold Filigree",
            glow: "Luminous Inner Glow",
          };

          const currentModel = metadata?.card_model || cfg.defaultModel || "gpt-image-2";
          const currentBorder = metadata?.card_border_style || cfg.defaultBorderStyle || "none";

          setStudioDefaults({
            model: modelLabels[currentModel] || currentModel,
            border: borderLabels[currentBorder] || currentBorder,
            visualDirection: cfg.defaultVisualDirection,
          });

          if (!metadata?.card_model) {
            if (cfg.defaultModel) setSelectedModel(cfg.defaultModel);
            if (cfg.defaultAspectRatio) setSelectedAspectRatio(cfg.defaultAspectRatio);
            if (cfg.defaultBorderStyle) setBorderStyle(cfg.defaultBorderStyle);
            if (cfg.defaultFooterText !== undefined) setFooterText(cfg.defaultFooterText);
          }
        }
      } catch (err) {
        console.error("Failed to load Image Studio defaults:", err);
      }
    })();
  }, [metadata]);

  // Load existing cover image when editing an existing item
  useEffect(() => {
    if (!contentId) return;
    void (async () => {
      const client = requireSupabase();
      const { data: item } = await client.from("content_items").select("cover_media_id").eq("id", contentId).maybeSingle();
      if (!item?.cover_media_id) return;
      const { data: media } = await client.from("content_media").select("storage_path,public_url").eq("id", item.cover_media_id).maybeSingle();
      if (media?.public_url) setCardUrl(media.public_url);
      else if (media?.storage_path) setCardUrl(client.storage.from("today-media").getPublicUrl(media.storage_path).data.publicUrl);
    })();
  }, [contentId]);

  // Revoke object URL on unmount to avoid memory leaks
  useEffect(() => {
    return () => { if (uploadPreview) URL.revokeObjectURL(uploadPreview); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function token() { return (await requireSupabase().auth.getSession()).data.session?.access_token || ""; }

  /** Ensures a draft content_items row exists and returns its id. */
  async function ensureContentId(method: string): Promise<{ id: string; created: boolean }> {
    if (contentId) return { id: contentId, created: false };
    const client = requireSupabase();
    const title = titleFor();
    const slug = `daily-inspiration-${Date.now()}`;
    const { data, error } = await client.from("content_items").insert({
      type: "daily_inspiration",
      title,
      slug,
      language_code: "en",
      excerpt: title,
      body: null,
      content_status: "draft",
      metadata: {
        quote_type: method === "manual_upload" ? "uploaded_card" : "openai_generated_card",
        card_generation_method: method,
      },
    }).select("id").single();
    if (error || !data?.id) {
      console.error("[ensureContentId] Supabase insert error:", error);
      throw new Error(error?.message || "Could not create draft content item.");
    }
    return { id: data.id, created: true };
  }

  // ── Generate mode handler ──────────────────────────────────────────────────
  async function generateCard() {
    const prompt = instruction.trim();
    if (!prompt) { setMessage("Enter a short instruction before generating the card."); setTimeout(() => setMessage(""), 4000); return; }
    setRendering(true); setMessage("");
    try {
      const client = requireSupabase();
      const { id, created } = await ensureContentId("openai_image");
      // If just created, also persist instruction text
      if (created) {
        await client.from("content_items").update({
          excerpt: prompt.slice(0, 150),
          body: prompt,
          metadata: {
            quote_type: "openai_generated_card",
            generation_method: "openai_image",
            template_id: "openai_image_v1",
            card_generation_method: "openai_image",
            card_model: selectedModel,
            card_aspect_ratio: selectedAspectRatio,
          },
        }).eq("id", id);
      }
      const response = await fetch("/api/admin/daily-inspiration/render", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
        body: JSON.stringify({
          contentId: id,
          inspirationPrompt: prompt,
          model: selectedModel,
          aspectRatio: selectedAspectRatio,
          footerText: footerText.trim(),
          borderStyle,
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error();
      setCardUrl(json.publicUrl || client.storage.from("today-media").getPublicUrl(json.storagePath).data.publicUrl);
      setMessage("Card generated. Review it, then set visibility and scheduling when you are ready.");
      setTimeout(() => setMessage(""), 5000);
      if (created) router.replace(`/content/${id}`); else onRendered?.();
    } catch { 
      setMessage("The devotional card could not be created. Please try again."); 
      setTimeout(() => setMessage(""), 5000);
    }
    finally { setRendering(false); }
  }

  // ── Upload mode handler ────────────────────────────────────────────────────
  function handleFileChange(file: File | null) {
    if (uploadPreview) URL.revokeObjectURL(uploadPreview);
    setUploadFile(file);
    setUploadPreview(file ? URL.createObjectURL(file) : null);
    // Auto-select the natural aspect ratio for video
    if (file?.type === "video/mp4") setUploadAspectRatio("9:16");
    setMessage("");
  }

  async function uploadCard() {
    if (!uploadFile) { setMessage("Choose an image or video file first."); setTimeout(() => setMessage(""), 4000); return; }
    setUploading(true); setMessage("");
    try {
      const { id, created } = await ensureContentId("manual_upload");
      const fd = new FormData();
      fd.append("file", uploadFile);
      fd.append("contentId", id);
      fd.append("aspectRatio", uploadAspectRatio);
      const response = await fetch("/api/admin/daily-inspiration/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${await token()}` },
        body: fd,
      });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || "Upload failed.");
      setCardUrl(json.publicUrl);
      setUploadFile(null);
      if (uploadPreview) { URL.revokeObjectURL(uploadPreview); setUploadPreview(null); }
      setMessage(`${uploadFile?.type === "video/mp4" ? "Video" : "Image"} uploaded. Review it, then set visibility and scheduling when you are ready.`);
      setTimeout(() => setMessage(""), 5000);
      if (created) router.replace(`/content/${id}`); else onRendered?.();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "The image could not be uploaded. Please try again.");
      setTimeout(() => setMessage(""), 5000);
    } finally { setUploading(false); }
  }

  // ── Derived display values ─────────────────────────────────────────────────
  const activeAspectRatio = mode === "upload" ? uploadAspectRatio : selectedAspectRatio;
  const aspectClass = activeAspectRatio === "16:9"
    ? "aspect-[16/9]"
    : activeAspectRatio === "9:16"
    ? "aspect-[9/16]"
    : "aspect-[4/5]";
  const dimensionsText = activeAspectRatio === "16:9"
    ? "Final 1920 × 1080 card — review before approving."
    : activeAspectRatio === "9:16"
    ? "Final 1080 × 1920 card — review before approving."
    : "Final 1080 × 1350 card — review before approving.";

  const previewUrl = mode === "upload" ? (uploadPreview ?? cardUrl) : cardUrl;
  const previewWide = activeAspectRatio === "16:9";

  return <section className="card space-y-5">
    <input type="hidden" name="quote_type" value={mode === "upload" ? "uploaded_card" : "openai_generated_card"} />
    <input type="hidden" name="template_id" value="openai_image_v1" />
    <input type="hidden" name="generation_method" value={mode === "upload" ? "manual_upload" : "openai_image"} />
    <input type="hidden" name="card_generation_method" value={mode === "upload" ? "manual_upload" : "openai_image"} />
    <input type="hidden" name="card_model" value={selectedModel} />
    <input type="hidden" name="card_aspect_ratio" value={activeAspectRatio} />
    <input type="hidden" name="body" value={mode === "upload" ? "Uploaded daily inspiration card." : instruction} />
    <input type="hidden" name="excerpt" value={mode === "upload" ? titleFor() : (instruction.slice(0, 150) || titleFor())} />

    {/* Header */}
    <div>
      <p className="eyebrow">Daily Inspiration card</p>
      <h3 className="card-title mb-2">Create a devotional card</h3>
      <p className="text-sm text-muted">Generate a card with AI, or upload one you made outside the studio (e.g. in ChatGPT).</p>
    </div>

    {/* Mode toggle */}
    <div className="flex gap-2">
      <button
        type="button"
        id="inspiration-mode-upload"
        onClick={() => handleModeChange("upload")}
        className={`tab-button ${mode === "upload" ? "active" : ""}`}
      >
        ↑ Upload image
      </button>
      <button
        type="button"
        id="inspiration-mode-generate"
        onClick={() => handleModeChange("generate")}
        className={`tab-button ${mode === "generate" ? "active" : ""}`}
      >
        ✦ Generate with AI
      </button>
    </div>

    {/* ── Generate mode ── */}
    {mode === "generate" && <>
      <div className="p-3.5 bg-beige/50 border border-gold/40 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex flex-col gap-1 text-ink">
          <div className="flex items-center gap-2">
            <span className="text-gold font-bold">✦</span>
            <span className="font-semibold text-wine">Inherited Defaults from Image Studio:</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted text-[11.5px] pl-4">
            <span>
              Engine: <strong className="text-ink font-medium">{studioDefaults.model}</strong>
            </span>
            <span>•</span>
            <span>
              Border Style: <strong className="text-ink font-medium">{studioDefaults.border}</strong>
            </span>
            {studioDefaults.visualDirection && (
              <>
                <span>•</span>
                <span className="truncate max-w-xs">
                  Palette: <span className="text-ink italic font-normal">“{studioDefaults.visualDirection}”</span>
                </span>
              </>
            )}
          </div>
        </div>
        <Link href="/settings/image-studio" className="text-wine hover:text-wine-dark font-semibold underline shrink-0 self-start sm:self-auto pl-4 sm:pl-0">
          Change Defaults in Image Studio →
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Aspect Ratio" help="Select the dimensions for the card image">
          <select
            className="select w-full"
            value={selectedAspectRatio}
            onChange={(e) => setSelectedAspectRatio(e.target.value)}
          >
            {availableRatios.map(r => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </Field>

        <Field label="Footer branding text" help="Small text at the bottom edge. Clear to remove.">
          <input
            type="text"
            className="input"
            value={footerText}
            maxLength={60}
            onChange={(e) => setFooterText(e.target.value)}
            placeholder="e.g. MY PRAYER ALTAR — or leave blank for no footer"
          />
        </Field>
      </div>

      <Field label="Card instruction" help="Write naturally. Put exact message text in quotation marks; include any desired visual direction here too.">
        <textarea className="textarea min-h-36" value={instruction} maxLength={800} onChange={(event) => setInstruction(event.target.value)} placeholder={'Make me a devotional card image with the text "May the blessings of God be upon you and your family this Sunday morning!"'} />
      </Field>

      <button type="button" className="button" onClick={() => void generateCard()} disabled={rendering}>
        {rendering ? `Generating ${selectedAspectRatio} card...` : cardUrl ? "Generate another version" : `Generate ${selectedAspectRatio} card`}
      </button>
    </>}

    {/* ── Upload mode ── */}
    {mode === "upload" && <>
      <Field
        label={isVideoFile ? "Video aspect ratio" : "Target aspect ratio"}
        help={isVideoFile
          ? "Select the aspect ratio that matches your video — this is stored as metadata only, the video file is not re-encoded"
          : "The image will be cropped and resized to match the selected dimensions"
        }
      >
        <select
          className="select w-full max-w-xs"
          value={uploadAspectRatio}
          onChange={(e) => setUploadAspectRatio(e.target.value)}
        >
          <option value="4:5">4:5 — 1080 × 1350 (Standard Devotional Card)</option>
          <option value="9:16">9:16 — 1080 × 1920 (Story / Reels)</option>
        </select>
      </Field>

      {/* Drop zone / file picker */}
      <div
        role="button"
        tabIndex={0}
        id="inspiration-upload-dropzone"
        className="border-2 border-dashed border-line rounded-2xl p-8 flex flex-col items-center gap-3 text-center cursor-pointer hover:border-accent hover:bg-beige/30 transition-colors"
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click(); }}
        onDragOver={(e) => { e.preventDefault(); }}
        onDrop={(e) => {
          e.preventDefault();
          const dropped = e.dataTransfer.files[0];
          if (dropped) handleFileChange(dropped);
        }}
      >
        {uploadFile ? (
          isVideoFile ? (
            <span className="text-4xl">🎥</span>
          ) : (
            <span className="text-4xl">🖼️</span>
          )
        ) : isVideoUrl(cardUrl) ? (
          <span className="text-4xl">🎥</span>
        ) : cardUrl ? (
          <span className="text-4xl">🖼️</span>
        ) : (
          <span className="text-4xl opacity-30">📤</span>
        )}
        <p className="text-sm text-muted">
          {uploadFile ? (
            <><strong className="text-ink">{uploadFile.name}</strong> — click to change</>
          ) : cardUrl ? (
            <><strong className="text-ink">Current media loaded</strong> — click or drag to replace</>
          ) : (
            <>Click or drag a file here · JPEG, PNG, WebP, GIF, or MP4 video · up to 20 MB</>
          )}
        </p>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,video/mp4"
        className="sr-only"
        onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
      />

      <button
        type="button"
        className="button"
        onClick={() => void uploadCard()}
        disabled={uploading || !uploadFile}
      >
        {uploading ? "Uploading…" : cardUrl && !uploadFile ? `Upload a different ${isVideoFile ? "video" : "image"}` : `Upload ${isVideoFile ? "video" : "image"}`}
      </button>
    </>}

    {previewUrl && (
      <div className={`mx-auto ${previewWide ? "max-w-md" : "max-w-sm"}`}>
        {(mode === "upload" && isVideoFile)
          ? <video src={previewUrl} className={`w-full object-cover rounded-2xl border border-line shadow-sm ${aspectClass}`} muted loop autoPlay playsInline />
          : <img src={previewUrl} alt="Daily Inspiration card" className={`w-full object-cover rounded-2xl border border-line shadow-sm ${aspectClass}`} />
        }
        <p className="text-xs text-muted text-center mt-2">{dimensionsText}</p>
      </div>
    )}

    {message && <div className="alert info" role="status">{message}</div>}
  </section>;
}
