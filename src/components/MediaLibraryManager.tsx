"use client";

import { useState } from "react";
import { DailyPrayerVisualManager } from "@/components/DailyPrayerVisualManager";
import { AltarVideoManager } from "@/components/AltarVideoManager";

export function MediaLibraryManager() {
  const [activeTab, setActiveTab] = useState<"images" | "videos">("images");

  return (
    <div className="space-y-6">
      {/* Sub-tabs header */}
      <div className="flex border-b border-[#e5ded4] gap-4">
        <button
          type="button"
          onClick={() => setActiveTab("images")}
          className={`pb-3 px-2 text-sm font-medium transition-colors border-b-2 ${
            activeTab === "images"
              ? "border-[var(--wine)] text-[var(--wine)] font-semibold"
              : "border-transparent text-[var(--muted)] hover:text-[var(--ink)]"
          }`}
        >
          🖼️ Daily Prayer Images Pool
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("videos")}
          className={`pb-3 px-2 text-sm font-medium transition-colors border-b-2 ${
            activeTab === "videos"
              ? "border-[var(--wine)] text-[var(--wine)] font-semibold"
              : "border-transparent text-[var(--muted)] hover:text-[var(--ink)]"
          }`}
        >
          📹 My Altar Video Loops
        </button>
      </div>

      {activeTab === "images" && <DailyPrayerVisualManager />}
      {activeTab === "videos" && <AltarVideoManager />}
    </div>
  );
}
