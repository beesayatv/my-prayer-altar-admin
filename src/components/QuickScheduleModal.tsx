"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";

type QuickScheduleModalProps = {
  item: {
    id: string;
    title: string;
    type: string;
    metadata: {
      publish_at?: string | null;
      expire_at?: string | null;
    };
  };
  onClose: () => void;
  onSave: (id: string, publishAt: string, expireAt: string) => Promise<void>;
};

const typeLabels: Record<string, string> = {
  daily_prayer: "Daily Prayer",
  daily_inspiration: "Daily Inspiration",
  church_highlight: "Church Highlight",
  bible_reading: "Bible Reading",
  saint_of_the_day: "Saint of the Day",
  catholic_news: "Catholic News",
  update: "Update",
  faith_story: "Faith Story",
};

function formatTypeLabel(type: string): string {
  if (typeLabels[type]) return typeLabels[type].toUpperCase();
  return type.replace(/_/g, " ").toUpperCase();
}

function toLocalDatetime(iso?: string) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  } catch { return ""; }
}

export function QuickScheduleModal({ item, onClose, onSave }: QuickScheduleModalProps) {
  const [publishAt, setPublishAt] = useState(item.metadata.publish_at || "");
  const [expireAt, setExpireAt] = useState(item.metadata.expire_at || "");
  const [isSaving, setIsSaving] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isSaving) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSaving, onClose]);

  const handleSave = async () => {
    setIsSaving(true);
    setError("");
    try {
      await onSave(item.id, publishAt, expireAt);
      onClose();
    } catch {
      setError("Could not update schedule. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const suggestNextSlot = async () => {
    if (item.type === "update") return;
    setIsSuggesting(true);
    setError("");
    try {
      const { requireSupabase } = await import("@/lib/supabase");
      const { data, error: suggestionError } = await requireSupabase().rpc("suggest_today_schedule", {
        requested_content_type: item.type,
        excluded_content_id: item.id,
      });
      if (suggestionError) throw suggestionError;
      const suggestion = data?.[0] as { publish_at?: string; expire_at?: string } | undefined;
      if (!suggestion?.publish_at || !suggestion.expire_at) throw new Error("No schedule was returned.");
      setPublishAt(suggestion.publish_at);
      setExpireAt(suggestion.expire_at);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not suggest a schedule.");
    } finally {
      setIsSuggesting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      onClick={() => {
        if (!isSaving) onClose();
      }}
    >
      <div
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden border border-line animate-in fade-in zoom-in duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-line bg-paper">
          <div className="flex justify-between items-start">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted">{formatTypeLabel(item.type)}</p>
                {expireAt && new Date(expireAt) <= new Date() && (
                  <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase bg-danger/10 text-danger rounded border border-danger/20">
                    Expired
                  </span>
                )}
              </div>
              <h2 className="text-lg font-bold text-ink leading-tight">{item.title}</h2>
            </div>
            <button onClick={onClose} className="text-muted hover:text-ink transition-colors p-1">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-6 flex flex-col gap-6">
          {error && <div className="alert error">{error}</div>}

          {item.type !== "update" && (
            <div>
              <button type="button" className="button secondary w-full" onClick={() => void suggestNextSlot()} disabled={isSaving || isSuggesting}>
                {isSuggesting ? "Finding next slot…" : "Suggest next slot"}
              </button>
              <p className="text-[10px] text-muted italic mt-2">Applies a suggestion only; save to keep it.</p>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-muted">🚀 Publish Date</label>
            <input
              type="datetime-local"
              className="input"
              value={toLocalDatetime(publishAt)}
              onChange={(e) => setPublishAt(e.target.value ? new Date(e.target.value).toISOString() : "")}
            />
            <p className="text-[10px] text-muted italic">When it appears in the Today feed.</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-muted">⌛ Expiry Date</label>
            <input
              type="datetime-local"
              className="input"
              value={toLocalDatetime(expireAt)}
              onChange={(e) => setExpireAt(e.target.value ? new Date(e.target.value).toISOString() : "")}
            />
            <p className="text-[10px] text-muted italic">Optional: when it leaves the Today feed.</p>
          </div>
        </div>

        <div className="p-6 border-t border-line bg-paper/30 flex flex-col gap-3">
          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={isSaving}
              className="button secondary flex-1"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="button flex-1"
            >
              {isSaving ? "Saving…" : "Save Changes"}
            </button>
          </div>

          <Link
            href={`/content/${item.id}`}
            className="text-xs font-bold text-wine hover:underline text-center py-2"
          >
            Full Edit &rarr;
          </Link>
        </div>
      </div>
    </div>
  );
}
