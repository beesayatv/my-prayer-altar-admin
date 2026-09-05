"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { adminAuthorizationHeader } from "@/lib/supabase";

const PAGE_SIZE = 20;

type VideoLoop = {
  id: string;
  title: string;
  description: string;
  storage_path: string;
  public_url: string;
  is_active: boolean;
  created_at: string;
};

export function AltarVideoManager() {
  const [videoLoops, setVideoLoops] = useState<VideoLoop[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchVideoLoops = useCallback(async (offset = 0, append = false) => {
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    try {
      const res = await fetch(`/api/admin/altar-videos?limit=${PAGE_SIZE}&offset=${offset}`);
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Unable to load video loops.");
      }
      if (data.videoLoops) {
        setVideoLoops((current) => (append ? [...current, ...data.videoLoops] : data.videoLoops));
        setHasMore(Boolean(data.hasMore));
      }
    } catch (err: unknown) {
      setMessage(`Error loading video loops: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      if (append) {
        setLoadingMore(false);
      } else {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void fetchVideoLoops();
  }, [fetchVideoLoops]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setMessage("Please select a 16:9 MP4 video file to upload.");
      return;
    }

    setUploading(true);
    setMessage(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const authHeaders = await adminAuthorizationHeader();
      const res = await fetch("/api/admin/altar-videos", {
        method: "POST",
        headers: authHeaders,
        body: formData
      });
      const data = await res.json();

      if (!res.ok || data.error) {
        setMessage(`Upload failed: ${data.error}`);
      } else {
        setMessage("✨ Altar video loop uploaded successfully!");
        setFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        void fetchVideoLoops();
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
    setVideoLoops((current) => current.map((v) => v.id === id ? { ...v, is_active: !currentActive } : v));
    try {
      const authHeaders = await adminAuthorizationHeader();
      const res = await fetch("/api/admin/altar-videos", {
        method: "PATCH",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ id, is_active: !currentActive }),
      });
      if (!res.ok) {
        setVideoLoops((current) => current.map((v) => v.id === id ? { ...v, is_active: currentActive } : v));
        setMessage("Failed to update status. Please try again.");
      }
    } catch (err: unknown) {
      setVideoLoops((current) => current.map((v) => v.id === id ? { ...v, is_active: currentActive } : v));
      setMessage(`Failed to update status: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this video loop?")) return;
    // Optimistic: remove from list immediately, restore if server fails
    const removed = videoLoops.find((v) => v.id === id);
    setDeletingId(id);
    setVideoLoops((current) => current.filter((v) => v.id !== id));
    try {
      const authHeaders = await adminAuthorizationHeader();
      const res = await fetch(`/api/admin/altar-videos?id=${id}`, {
        method: "DELETE",
        headers: authHeaders,
      });
      if (!res.ok) {
        if (removed) setVideoLoops((current) => [removed, ...current]);
        const payload = await res.json().catch(() => ({})) as { error?: string };
        setMessage(`Delete failed: ${payload.error || "Server error."}`);
      }
    } catch (err: unknown) {
      if (removed) setVideoLoops((current) => [removed, ...current]);
      setMessage(`Delete failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-8">
      {/* Upload New Video Loop Section */}
      <section className="bg-white border border-[#e5ded4] rounded-xl p-6 shadow-sm">
        <div className="mb-6 border-b border-[#f0eae1] pb-4">
          <h2 className="text-xl font-bold text-[#6B2D39] flex items-center gap-2">
            <span>🎬</span> Upload New Altar Video Loop
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Upload 16:9 landscape MP4 video loops (recommended: 6–12 seconds, under 10MB) for the My Altar header banner.
          </p>
        </div>

        {message && (
          <div
            className={`p-4 mb-6 rounded-lg text-sm font-medium ${
              message.includes("Error") || message.includes("failed")
                ? "bg-red-50 text-red-700 border border-red-200"
                : "bg-emerald-50 text-emerald-800 border border-emerald-200"
            }`}
          >
            {message}
          </div>
        )}

        <form onSubmit={handleUpload} className="space-y-4 max-w-2xl">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Video File (MP4, 16:9 Landscape) <span className="text-red-500">*</span>
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/mp4,video/*"
              required
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) setFile(e.target.files[0]);
              }}
              className="w-full text-sm text-gray-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-[#6B2D39]/10 file:text-[#6B2D39] hover:file:bg-[#6B2D39]/20 transition cursor-pointer"
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={uploading}
              className="button text-xs py-2.5 px-6 flex items-center gap-2"
            >
              {uploading ? (
                <>
                  <span className="animate-spin text-base">⏳</span> Uploading Video Loop...
                </>
              ) : (
                <>
                  <span>✨</span> Upload to Storage
                </>
              )}
            </button>
          </div>
        </form>
      </section>

      {/* Active & Uploaded Video Loops List */}
      <section className="bg-white border border-[#e5ded4] rounded-xl p-6 shadow-sm">
        <div className="mb-6 border-b border-[#f0eae1] pb-4 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Altar Video Loops Library</h2>
            <p className="text-sm text-gray-500 mt-1">
              Active video loops will be randomly assigned to personal prayers generated in My Altar.
            </p>
          </div>
          <span className="text-xs font-semibold px-3 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-full">
            {videoLoops.filter((v) => v.is_active).length} Active Loops
          </span>
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-500 text-sm">
            <span className="animate-spin inline-block mr-2">⏳</span> Loading video library...
          </div>
        ) : videoLoops.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-xl">
            <p className="text-gray-500 text-sm font-medium">No altar video loops uploaded yet.</p>
            <p className="text-xs text-gray-400 mt-1">Use the uploader above to add 16:9 ambient MP4 video loops.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {videoLoops.map((item) => (
              <div
                key={item.id}
                className={`border rounded-xl overflow-hidden transition shadow-sm bg-white flex flex-col justify-between ${
                  item.is_active ? "border-[#C5A059] ring-1 ring-[#C5A059]/40" : "border-gray-200 opacity-75"
                }`}
              >
                {/* 16:9 Video Loop Player Preview */}
                <div className="relative aspect-video bg-black overflow-hidden group">
                  <video
                    src={item.public_url}
                    loop
                    muted
                    playsInline
                    preload="metadata"
                    className="w-full h-full object-cover"
                    onMouseEnter={(e) => { e.currentTarget.play().catch(() => {}); }}
                    onMouseLeave={(e) => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; }}
                  />
                  {/* Hover hint — fades out when video starts playing */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-100 group-hover:opacity-0 transition-opacity duration-300 pointer-events-none">
                    <span className="text-white/70 text-xs font-medium bg-black/50 px-3 py-1 rounded-full backdrop-blur-sm">
                      Hover to preview
                    </span>
                  </div>
                  <div className="absolute top-2 right-2">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-xs font-bold shadow-sm ${
                        item.is_active ? "bg-emerald-600 text-white" : "bg-gray-700 text-gray-300"
                      }`}
                    >
                      {item.is_active ? "Active" : "Inactive"}
                    </span>
                  </div>
                </div>

                {/* Card Content */}
                <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                  <div className="flex items-center justify-between pt-3 border-t border-gray-100 text-xs">
                     <button
                      type="button"
                      onClick={() => handleToggleActive(item.id, item.is_active)}
                      disabled={togglingId === item.id || deletingId === item.id}
                      className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                        item.is_active
                          ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200 disabled:opacity-50"
                          : "bg-gray-200 text-gray-700 hover:bg-gray-300 disabled:opacity-50"
                      }`}
                    >
                      {togglingId === item.id ? "Updating…" : item.is_active ? "● Active Pool" : "○ Inactive"}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDelete(item.id)}
                      disabled={deletingId === item.id || togglingId === item.id}
                      className="text-xs text-red-600 hover:text-red-800 font-medium disabled:opacity-40"
                    >
                      {deletingId === item.id ? "Deleting…" : "Delete"}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && hasMore && (
          <div className="mt-6 flex justify-center">
            <button
              type="button"
              onClick={() => void fetchVideoLoops(videoLoops.length, true)}
              disabled={loadingMore}
              className="button secondary compact text-xs"
            >
              {loadingMore ? "Loading more loops..." : "Load 20 more"}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
