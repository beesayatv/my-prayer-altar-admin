"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { adminAuthorizationHeader } from "@/lib/supabase";

const PAGE_SIZE = 20;

export type VisualAsset = {
  id: string;
  title: string;
  storage_path: string;
  public_url: string | null;
  alt_text: string;
  is_active: boolean;
  created_at: string;
};

export function DailyPrayerVisualManager() {
  const [visualAssets, setVisualAssets] = useState<VisualAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchVisualAssets = useCallback(async (offset = 0, append = false) => {
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    try {
      const res = await fetch(`/api/admin/daily-prayer-visuals?limit=${PAGE_SIZE}&offset=${offset}`);
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Unable to load visual assets.");
      }
      if (data.visualAssets) {
        setVisualAssets((current) => (append ? [...current, ...data.visualAssets] : data.visualAssets));
        setHasMore(Boolean(data.hasMore));
      }
    } catch (err: unknown) {
      setMessage(`Error loading visual assets: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      if (append) {
        setLoadingMore(false);
      } else {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void fetchVisualAssets();
  }, [fetchVisualAssets]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (files.length === 0) {
      setMessage("Please select one or more image files to upload.");
      return;
    }

    setUploading(true);
    setMessage(null);

    try {
      const authHeaders = await adminAuthorizationHeader();

      if (files.length > 1) {
        const results = await Promise.all(files.map(async (selectedFile) => {
          const formData = new FormData();
          formData.append("file", selectedFile);
          const response = await fetch("/api/admin/daily-prayer-visuals", {
            method: "POST",
            headers: authHeaders,
            body: formData,
          });
          const data = await response.json();
          return response.ok && !data.error ? null : selectedFile.name;
        }));
        const failed = results.filter((name): name is string => name !== null);
        const uploaded = files.length - failed.length;
        setMessage(failed.length ? `${uploaded} uploaded. Could not upload: ${failed.join(", ")}.` : `${uploaded} images uploaded and added to the pool!`);
        setFiles([]);
        if (fileInputRef.current) fileInputRef.current.value = "";
        void fetchVisualAssets();
        return;
      }

      const formData = new FormData();
      formData.append("file", files[0]);

      const res = await fetch("/api/admin/daily-prayer-visuals", {
        method: "POST",
        headers: authHeaders,
        body: formData,
      });
      const data = await res.json();

      if (!res.ok || data.error) {
        setMessage(`Upload failed: ${data.error}`);
      } else {
        setMessage("✨ Visual asset uploaded and added to the pool!");
        setFiles([]);
        if (fileInputRef.current) fileInputRef.current.value = "";
        void fetchVisualAssets();
      }
    } catch (err: unknown) {
      setMessage(`Upload error: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setUploading(false);
    }
  };

  const handleToggleActive = async (id: string, currentActive: boolean) => {
    // Optimistic: flip immediately, revert if server rejects
    setTogglingId(id);
    setVisualAssets((current) => current.map((a) => a.id === id ? { ...a, is_active: !currentActive } : a));
    try {
      const authHeaders = await adminAuthorizationHeader();
      const res = await fetch("/api/admin/daily-prayer-visuals", {
        method: "PATCH",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ id, is_active: !currentActive }),
      });
      if (!res.ok) {
        setVisualAssets((current) => current.map((a) => a.id === id ? { ...a, is_active: currentActive } : a));
        setMessage("Failed to update status. Please try again.");
      }
    } catch (err: unknown) {
      setVisualAssets((current) => current.map((a) => a.id === id ? { ...a, is_active: currentActive } : a));
      setMessage(`Failed to update status: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this visual asset?")) return;
    // Optimistic: remove from list immediately, restore if server fails
    const removed = visualAssets.find((a) => a.id === id);
    setDeletingId(id);
    setVisualAssets((current) => current.filter((a) => a.id !== id));
    try {
      const authHeaders = await adminAuthorizationHeader();
      const res = await fetch(`/api/admin/daily-prayer-visuals?id=${id}`, {
        method: "DELETE",
        headers: authHeaders,
      });
      if (!res.ok) {
        if (removed) setVisualAssets((current) => [removed, ...current]);
        const payload = await res.json().catch(() => ({})) as { error?: string };
        setMessage(`Delete failed: ${payload.error || "Server error."}`);
      }
    } catch (err: unknown) {
      if (removed) setVisualAssets((current) => [removed, ...current]);
      setMessage(`Failed to delete visual asset: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-8">
      {/* Upload Box */}
      <div className="card p-6 bg-white border border-[#e5ded4] rounded-2xl shadow-sm">
        <h3 className="text-lg font-serif font-bold text-[var(--ink)] mb-1">
          Upload Daily Prayer Image Asset
        </h3>
        <p className="text-xs text-[var(--muted)] mb-5">
          Add images (JPEG, PNG, WebP) to the Daily Prayer image pool. Video loops are reserved for My Altar screen.
        </p>

        <form onSubmit={handleUpload} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase text-[var(--muted)] mb-1">
              Select Images (JPEG, PNG, WebP)
            </label>
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              multiple
              onChange={(e) => setFiles(Array.from(e.target.files || []))}
              className="file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-[var(--wine)] file:text-white hover:file:opacity-90 cursor-pointer text-xs"
            />
            {files.length > 0 && (
              <p className="mt-2 text-xs text-[var(--muted)]">
                {files.length} image{files.length === 1 ? "" : "s"} selected. Titles and accessibility text are created automatically from filenames.
              </p>
            )}
          </div>

          {message && (
            <div
              className={`p-3 rounded-lg text-xs ${
                message.includes("Error") || message.includes("failed")
                  ? "bg-red-50 text-red-700 border border-red-200"
                  : "bg-emerald-50 text-emerald-800 border border-emerald-200"
              }`}
            >
              {message}
            </div>
          )}

          <div className="pt-2">
            <button
              type="submit"
              disabled={uploading || files.length === 0}
              className="button text-xs py-2.5 px-6 flex items-center gap-2"
            >
              {uploading ? (
                <>
                  <span className="animate-spin">⏳</span> Uploading asset...
                </>
              ) : (
                <>✨ Upload Visual Asset</>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Visual Assets List */}
      <div className="card p-6 bg-white border border-[#e5ded4] rounded-2xl shadow-sm">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h3 className="text-lg font-serif font-bold text-[var(--ink)]">
              Daily Prayer Visual Pool ({visualAssets.length}{hasMore ? "+" : ""})
            </h3>
            <p className="text-xs text-[var(--muted)]">
              Assets active in this pool will be automatically or manually assigned to Daily Prayers.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void fetchVisualAssets()}
            className="button secondary compact text-xs"
          >
            🔄 Refresh Pool
          </button>
        </div>

        {loading ? (
          <div className="text-center py-10 text-xs text-[var(--muted)]">
            Loading visual asset pool...
          </div>
        ) : visualAssets.length === 0 ? (
          <div className="text-center py-10 text-xs text-[var(--muted)] border border-dashed border-[#e5ded4] rounded-xl">
            No visual assets uploaded yet. Upload your first image or video loop above!
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
            {visualAssets.map((asset) => {
              const isVideo = asset.storage_path.endsWith(".mp4") || asset.public_url?.endsWith(".mp4");

              return (
                <div
                  key={asset.id}
                  className={`border rounded-xl overflow-hidden flex flex-col justify-between transition-all ${
                    asset.is_active
                      ? "border-[#e5ded4] bg-white shadow-xs"
                      : "border-gray-200 bg-gray-50 opacity-60"
                  }`}
                >
                  <div className="relative aspect-video bg-black/5 overflow-hidden">
                    {isVideo ? (
                      <video
                        src={asset.public_url || undefined}
                        loop
                        muted
                        playsInline
                        preload="none"
                        className="w-full h-full object-cover"
                        onMouseEnter={(e) => { e.currentTarget.play().catch(() => {}); }}
                        onMouseLeave={(e) => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; }}
                      />
                    ) : asset.public_url ? (
                      <img
                        src={asset.public_url}
                        alt={asset.alt_text}
                        loading="eager"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs text-gray-400">
                        No Preview
                      </div>
                    )}
                    <span className="absolute top-2 right-2 bg-black/60 backdrop-blur-md text-white text-[10px] px-2 py-0.5 rounded-md uppercase tracking-wider">
                      {isVideo ? "📹 Video Loop" : "🖼️ Image"}
                    </span>
                  </div>

                  <div className="p-4 flex-1 flex flex-col justify-between">
                    <div>
                      <h4 className="font-semibold text-sm text-[var(--ink)] mb-1 line-clamp-1">
                        {asset.title}
                      </h4>
                      <p className="text-xs text-[var(--muted)] line-clamp-2 italic mb-3">
                        {asset.alt_text}
                      </p>
                    </div>

                    <div className="pt-3 border-t border-[#f0eaee] flex items-center justify-between">
                       <button
                        type="button"
                        onClick={() => handleToggleActive(asset.id, asset.is_active)}
                        disabled={togglingId === asset.id || deletingId === asset.id}
                        className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                          asset.is_active
                            ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200 disabled:opacity-50"
                            : "bg-gray-200 text-gray-700 hover:bg-gray-300 disabled:opacity-50"
                        }`}
                      >
                        {togglingId === asset.id ? "Updating…" : asset.is_active ? "● Active Pool" : "○ Inactive"}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDelete(asset.id)}
                        disabled={deletingId === asset.id || togglingId === asset.id}
                        className="text-xs text-red-600 hover:text-red-800 font-medium disabled:opacity-40"
                      >
                        {deletingId === asset.id ? "Deleting…" : "Delete"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!loading && hasMore && (
          <div className="mt-6 flex justify-center">
            <button
              type="button"
              onClick={() => void fetchVisualAssets(visualAssets.length, true)}
              disabled={loadingMore}
              className="button secondary compact text-xs"
            >
              {loadingMore ? "Loading more assets..." : "Load 20 more"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
