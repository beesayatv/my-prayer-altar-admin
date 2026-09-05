"use client";

import { ChangeEvent, useEffect, useState, useRef } from "react";
import { adminAuthorizationHeader, requireSupabase } from "@/lib/supabase";
import { Field } from "@/components/ContentEditor";

const BUCKET = "today-media";

type MediaItem = {
  id: string;
  storage_path: string;
  alt_text: string;
  caption: string | null;
  sort_order: number;
  url?: string;
  public_url?: string | null;
};

interface MediaGalleryProps {
  contentId?: string;
}

export function MediaGallery({ contentId }: MediaGalleryProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState("");

  const loadGallery = async () => {
    if (!contentId) return;
    const supabase = requireSupabase();
    const { data, error } = await supabase
      .from("content_media")
      .select("*")
      .eq("content_id", contentId)
      .eq("role", "gallery")
      .order("sort_order", { ascending: true });

    if (error) {
      setError("Could not load gallery.");
      return;
    }

    const media = data as MediaItem[];
    // Get signed URLs for all
    const signedItems = await Promise.all(
      media.map(async (item) => {
        if (item.public_url) return { ...item, url: item.public_url };
        const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(item.storage_path, 3600);
        return { ...item, url: signed?.signedUrl };
      })
    );
    setItems(signedItems);
  };

  useEffect(() => {
    void loadGallery();
  }, [contentId]);

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length || !contentId) return;

    setIsBusy(true);
    setError("");
    try {
      for (const file of files) {
        const formData = new FormData(); formData.set("file", file); formData.set("contentId", contentId); formData.set("role", "gallery"); formData.set("altText", file.name); formData.set("sortOrder", String(items.length + 1));
        const response = await fetch("/api/admin/content-media", { method: "POST", headers: await adminAuthorizationHeader(), body: formData });
        if (!response.ok) throw new Error((await response.json()).error || "Upload failed");
      }
      await loadGallery();
    } catch (err: any) {
      setError(err.message || "Upload failed");
    } finally {
      setIsBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const deleteItem = async (item: MediaItem) => {
    if (!confirm("Remove this image?")) return;
    setIsBusy(true);
    try {
      const response = await fetch("/api/admin/content-media", { method: "DELETE", headers: { ...(await adminAuthorizationHeader()), "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id }) });
      if (!response.ok) throw new Error("Delete failed");
      await loadGallery();
    } catch (err) {
      setError("Delete failed");
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <section className="card flex flex-col gap-6">
      <div className="flex justify-between items-center">
        <h3 className="card-title m-0 border-none pb-0">Media Gallery</h3>
        <button
          type="button"
          className="button secondary compact"
          onClick={() => fileInputRef.current?.click()}
          disabled={isBusy || !contentId}
        >
          + Add Photos
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {!contentId && (
        <p className="text-sm text-muted italic">Save draft first to enable gallery.</p>
      )}

      {error && <p className="alert error text-xs">{error}</p>}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {items.map((item) => (
          <div key={item.id} className="relative group aspect-square rounded-xl overflow-hidden border border-line shadow-sm">
            {item.url && (
              <img src={item.url} className="w-full h-full object-cover" alt={item.alt_text} />
            )}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
              <button
                type="button"
                className="p-2 bg-white rounded-full text-danger hover:scale-110 transition-transform"
                onClick={() => void deleteItem(item)}
              >
                🗑️
              </button>
            </div>
          </div>
        ))}
        {contentId && items.length === 0 && !isBusy && (
          <div
            className="aspect-square rounded-xl border-2 border-dashed border-line flex flex-col items-center justify-center text-muted gap-2 cursor-pointer hover:bg-beige/40 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <span className="text-2xl">📸</span>
            <span className="text-[10px] uppercase font-bold tracking-wider">Empty Gallery</span>
          </div>
        )}
      </div>

      {isBusy && <p className="text-center text-xs animate-pulse text-gold font-bold">Processing Media...</p>}
    </section>
  );
}
