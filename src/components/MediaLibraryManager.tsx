"use client";

import { useState } from "react";
import { DailyPrayerVisualManager } from "@/components/DailyPrayerVisualManager";
import { AltarVideoManager } from "@/components/AltarVideoManager";
import { AmbientMusicManager } from "@/components/AmbientMusicManager";

export function MediaLibraryManager() {
  const [activeTab, setActiveTab] = useState<"images" | "videos" | "music">("images");

  return (
    <div className="space-y-6">
      {/* Sub-tabs header */}
      <div className="flex border-b border-[#e5ded4] gap-4">
        <button
          type="button"
          onClick={() => setActiveTab("images")}
          className={`pb-3 px-2 text-sm font-medium transition-colors border-b-2 cursor-pointer ${
            activeTab === "images"
              ? "border-[var(--wine)] text-[var(--wine)] font-semibold"
              : "border-transparent text-[var(--muted)] hover:text-[var(--ink)]"
          }`}
        >
          🖼️ Daily Prayer Images
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("videos")}
          className={`pb-3 px-2 text-sm font-medium transition-colors border-b-2 cursor-pointer ${
            activeTab === "videos"
              ? "border-[var(--wine)] text-[var(--wine)] font-semibold"
              : "border-transparent text-[var(--muted)] hover:text-[var(--ink)]"
          }`}
        >
          📹 Altar Video Loops
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("music")}
          className={`pb-3 px-2 text-sm font-medium transition-colors border-b-2 cursor-pointer ${
            activeTab === "music"
              ? "border-[var(--wine)] text-[var(--wine)] font-semibold"
              : "border-transparent text-[var(--muted)] hover:text-[var(--ink)]"
          }`}
        >
          🎵 Ambient Music Tracks
        </button>
      </div>

      {activeTab === "images" && <DailyPrayerVisualManager />}
      {activeTab === "videos" && <AltarVideoManager />}
      {activeTab === "music" && <AmbientMusicManager />}
    </div>
  );
}

