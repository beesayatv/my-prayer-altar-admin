"use client";

import { useEffect, useState, useRef } from "react";

type Track = {
  id: string;
  title: string;
  description: string;
  storage_path: string;
  public_url: string;
  is_active: boolean;
  created_at: string;
};

export function AmbientMusicManager() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchTracks = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/ambient-music");
      const data = await res.json();
      if (data.tracks) {
        setTracks(data.tracks);
      }
    } catch (err: any) {
      setMessage(`Error loading tracks: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTracks();
  }, []);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setMessage("Please select an MP3 or audio file to upload.");
      return;
    }

    setUploading(true);
    setMessage(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("title", title || file.name.replace(/\.[^/.]+$/, ""));
    formData.append("description", description);

    try {
      const res = await fetch("/api/admin/ambient-music", {
        method: "POST",
        body: formData
      });
      const data = await res.json();

      if (!res.ok || data.error) {
        setMessage(`Upload failed: ${data.error}`);
      } else {
        setMessage("✨ Ambient music track uploaded successfully!");
        setTitle("");
        setDescription("");
        setFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        fetchTracks();
      }
    } catch (err: any) {
      setMessage(`Upload error: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleToggleActive = async (id: string, currentActive: boolean) => {
    try {
      const res = await fetch("/api/admin/ambient-music", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, is_active: !currentActive })
      });
      if (res.ok) {
        fetchTracks();
      }
    } catch (err: any) {
      setMessage(`Failed to update status: ${err.message}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this ambient track?")) return;
    try {
      const res = await fetch(`/api/admin/ambient-music?id=${id}`, {
        method: "DELETE"
      });
      if (res.ok) {
        if (playingTrackId === id && audioRef.current) {
          audioRef.current.pause();
          setPlayingTrackId(null);
        }
        fetchTracks();
      }
    } catch (err: any) {
      setMessage(`Delete failed: ${err.message}`);
    }
  };

  const handlePlayPreview = (url: string, id: string) => {
    if (playingTrackId === id) {
      audioRef.current?.pause();
      setPlayingTrackId(null);
    } else {
      if (audioRef.current) {
        audioRef.current.src = url;
        audioRef.current.play();
        setPlayingTrackId(id);
      }
    }
  };

  return (
    <section className="card space-y-6">
      <audio ref={audioRef} onEnded={() => setPlayingTrackId(null)} className="hidden" />

      <div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">🎵 Ambient Background Music Library</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Upload and manage background instrumental audio tracks for prayer narration and meditation.
        </p>
      </div>

      {message && (
        <div className={`p-4 rounded-lg text-sm ${message.includes("failed") || message.includes("Error") ? "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300" : "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"}`}>
          {message}
        </div>
      )}

      {/* Upload Form */}
      <form onSubmit={handleUpload} className="rounded-xl border border-line bg-beige/35 p-5 space-y-4">
        <h3 className="font-semibold text-amber-900 dark:text-amber-200 text-base">✦ Upload New Ambient Track</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400 mb-1">
              Track Title
            </label>
            <input
              type="text"
              placeholder="e.g. Sacred Cathedral Organ Pad"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input text-sm"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400 mb-1">
              Audio File (.mp3, .wav, .m4a)
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-amber-600 file:text-white hover:file:bg-amber-700 cursor-pointer"
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400 mb-1">
            Description / Mood
          </label>
          <input
            type="text"
            placeholder="e.g. Deep 432Hz ambient organ chord loop for quiet contemplation"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="input text-sm"
          />
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={uploading}
            className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium text-sm transition-colors shadow-sm disabled:opacity-50"
          >
            {uploading ? "Uploading Audio..." : "✦ Upload Ambient Track"}
          </button>
        </div>
      </form>

      {/* Tracks List */}
      <div className="space-y-3">
        <h3 className="font-semibold text-gray-900 dark:text-white text-base">Active Ambient Tracks ({tracks.length})</h3>

        {loading ? (
          <p className="text-sm text-gray-500 py-4">Loading audio tracks...</p>
        ) : tracks.length === 0 ? (
          <div className="text-center py-8 border border-dashed border-line rounded-xl">
            <p className="text-sm text-gray-500 dark:text-gray-400">No custom ambient tracks uploaded yet. Upload your first MP3 above!</p>
          </div>
        ) : (
          <div className="divide-y divide-line border border-line rounded-xl overflow-hidden">
            {tracks.map((track) => (
              <div key={track.id} className="p-4 flex items-center justify-between hover:bg-beige/30 transition-colors">
                <div className="flex items-center space-x-4">
                  <button
                    onClick={() => handlePlayPreview(track.public_url, track.id)}
                    className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 flex items-center justify-center font-bold text-lg hover:scale-105 transition-transform"
                    title={playingTrackId === track.id ? "Pause Preview" : "Play Preview"}
                  >
                    {playingTrackId === track.id ? "⏸" : "▶"}
                  </button>

                  <div>
                    <h4 className="font-semibold text-gray-900 dark:text-white text-sm flex items-center gap-2">
                      {track.title}
                      {track.is_active ? (
                        <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">Active</span>
                      ) : (
                        <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">Disabled</span>
                      )}
                    </h4>
                    {track.description && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{track.description}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <button
                    onClick={() => handleToggleActive(track.id, track.is_active)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${track.is_active ? "bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
                  >
                    {track.is_active ? "Disable" : "Enable"}
                  </button>

                  <button
                    onClick={() => handleDelete(track.id)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
