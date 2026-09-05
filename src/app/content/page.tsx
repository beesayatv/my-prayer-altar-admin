"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AdminGate } from "@/components/AdminGate";
import { ContentList } from "@/components/ContentList";

export default function Page() {
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, []);

  return (
    <AdminGate>
      <main className="page today-feed-workspace">
        <div className="page-head">
          <div>
            <p className="eyebrow">Editorial content</p>
            <h1 className="title">Today Feed Content</h1>
            <p className="description">
              Create, review, and schedule the editorial content that appears in My Prayer Altar.
            </p>
          </div>

          <div className="relative" ref={dropdownRef}>
            <button
              className="button flex items-center gap-2"
              onClick={() => setShowDropdown((prev) => !prev)}
            >
              <span>+ New Content</span>
              <span className="text-xs">▼</span>
            </button>

            {showDropdown && (
              <div
                className="absolute right-0 mt-2 w-56 bg-white border border-line rounded-xl shadow-lg p-2 z-50 flex flex-col gap-1"
                onClick={() => setShowDropdown(false)}
              >
                <Link
                  href="/content/new?type=church_highlight"
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold text-ink hover:bg-beige/60 transition-colors"
                >
                  <span className="text-base">🏛️</span>
                  <div>
                    <div>Church Highlight</div>
                    <div className="text-xs font-normal text-muted">Feature a local church</div>
                  </div>
                </Link>
                <Link
                  href="/content/new?type=daily_prayer"
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold text-ink hover:bg-beige/60 transition-colors"
                >
                  <span className="text-base">🙏</span>
                  <div>
                    <div>Daily Prayer</div>
                    <div className="text-xs font-normal text-muted">Publish a prayer entry</div>
                  </div>
                </Link>
                <Link href="/content/new?type=daily_inspiration" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold text-ink hover:bg-beige/60 transition-colors">
                  <span className="text-base">✦</span><div><div>Daily Inspiration</div><div className="text-xs font-normal text-muted">Create a shareable reflection card</div></div>
                </Link>
                <Link
                  href="/content/new?type=bible_reading"
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold text-ink hover:bg-beige/60 transition-colors"
                >
                  <span className="text-base">📖</span>
                  <div>
                    <div>Scripture & Reflection</div>
                    <div className="text-xs font-normal text-muted">Publish a scripture passage with a reflection</div>
                  </div>
                </Link>
                <Link href="/content/new?type=update" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold text-ink hover:bg-beige/60 transition-colors">
                  <span className="text-base">📣</span>
                  <div>
                    <div>Update</div>
                    <div className="text-xs font-normal text-muted">Share timely Catholic news and announcements</div>
                  </div>
                </Link>
                <Link href="/content/new?type=faith_story" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold text-ink hover:bg-beige/60 transition-colors">
                  <span className="text-base">✦</span>
                  <div>
                    <div>Faith Story</div>
                    <div className="text-xs font-normal text-muted">Feature a remarkable person of faith</div>
                  </div>
                </Link>
              </div>
            )}
          </div>
        </div>

        <Suspense fallback={<p className="status-line">Loading…</p>}>
          <ContentList />
        </Suspense>
      </main>
    </AdminGate>
  );
}
