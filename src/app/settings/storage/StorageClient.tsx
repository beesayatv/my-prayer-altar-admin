"use client";

import { useEffect, useState } from "react";
import { adminAuthorizationHeader } from "@/lib/supabase";

type OrphanedFile = {
  id: string;
  storage_path: string;
  created_at: string;
};

export function StorageClient() {
  const [count, setCount] = useState<number | null>(null);
  const [files, setFiles] = useState<OrphanedFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [message, setMessage] = useState("");

  const fetchCount = async () => {
    try {
      const headers = await adminAuthorizationHeader();
      const res = await fetch("/api/admin/system/cleanup-audio", { headers });
      const json = await res.json();
      if (json.success) {
        setCount(json.count);
        setFiles(json.files || []);
      } else {
        setMessage(`Error fetching data: ${json.error}`);
        setCount(0);
        setFiles([]);
      }
    } catch (e) {
      console.error(e);
      setMessage("An unexpected error occurred while fetching.");
      setCount(0);
      setFiles([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCount();
  }, []);

  const handleCleanup = async () => {
    if (!confirm("Are you sure you want to permanently delete these orphaned audio files from Bunny CDN?")) return;
    
    setIsDeleting(true);
    setMessage("");
    try {
      const headers = await adminAuthorizationHeader();
      const res = await fetch("/api/admin/system/cleanup-audio", { 
        method: "POST",
        headers
      });
      const json = await res.json();
      if (json.success) {
        setMessage(`Success: ${json.message}`);
        fetchCount();
      } else {
        setMessage(`Error: ${json.error}`);
      }
    } catch (e) {
      setMessage("An unexpected error occurred.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex max-w-4xl flex-col gap-8 pb-16">
      <section className="card border-wine/30 bg-wine/5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-wine">Orphaned File Cleanup</h2>
            <p className="text-xs text-muted mt-1">
              There are currently <strong>{count ?? 0}</strong> orphaned MP3 files safely queued for deletion. These files take up space on Bunny CDN but are no longer used by the app.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button 
              className="button secondary compact text-xs whitespace-nowrap" 
              onClick={fetchCount}
              disabled={isDeleting}
            >
              Refresh Count
            </button>
            <button 
              className="button px-6 py-2.5 text-sm shadow flex items-center justify-center gap-2 whitespace-nowrap" 
              onClick={handleCleanup}
              disabled={isDeleting || count === 0}
            >
              {isDeleting ? (
                <>
                  <span className="animate-spin text-base">⏳</span>
                  <span>Cleaning...</span>
                </>
              ) : (
                "⚡ Clear Orphaned MP3s"
              )}
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="mt-4 p-4 rounded-xl bg-beige/30 border border-line flex items-center gap-3 animate-pulse">
            <span className="text-xl">🔍</span>
            <p className="text-xs text-muted m-0">Scanning database for orphaned audio files...</p>
          </div>
        ) : (
          <div className="mt-4 pt-4 border-t border-line/60">
            <div className="bg-white/60 rounded-xl border border-line overflow-hidden">
              <div className="px-4 py-2.5 bg-beige/40 border-b border-line text-xs font-semibold text-ink">
                Sample of orphaned files (Showing {files.length})
              </div>
              <div className="max-h-[300px] overflow-y-auto p-4">
                {files.length > 0 ? (
                  <ul className="space-y-1.5 text-xs">
                    {files.map(f => (
                      <li key={f.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4 bg-white/90 p-2.5 rounded-lg border border-line shadow-sm">
                        <span className="font-mono text-muted break-all">{f.storage_path}</span>
                        <span className="text-xs px-2 py-0.5 rounded bg-beige text-wine font-medium whitespace-nowrap">
                          {new Date(f.created_at).toLocaleDateString()}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted italic m-0">No orphaned files found in the database.</p>
                )}
              </div>
            </div>

            {message && (
              <div className={`mt-4 alert ${message.startsWith("Error") ? "error" : "success"}`} role="alert">
                {message}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

