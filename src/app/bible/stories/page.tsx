"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AdminGate } from "@/components/AdminGate";
import { adminAuthorizationHeader, requireSupabase } from "@/lib/supabase";

interface Story {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  summary: string;
  status: string;
  access_level: string;
  created_at: string;
  updated_at: string;
}

export default function BibleStoriesPage() {
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [accessFilter, setAccessFilter] = useState<string>("all");

  // Selection & Bulk Actions state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isProcessingBulk, setIsProcessingBulk] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: "success" | "info" | "error"; text: string } | null>(null);

  const loadStories = async () => {
    setLoading(true);
    setFeedbackMessage(null);
    setSelectedIds([]);

    const supabase = requireSupabase();
    let query = supabase
      .from("bible_stories")
      .select("id, slug, title, subtitle, summary, status, access_level, created_at, updated_at")
      .order("created_at", { ascending: false });

    if (statusFilter !== "all") {
      query = query.eq("status", statusFilter);
    }
    if (accessFilter !== "all") {
      query = query.eq("access_level", accessFilter);
    }

    const { data, error } = await query;
    if (error) {
      setFeedbackMessage({ type: "error", text: "Failed to load stories." });
    } else {
      setStories(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadStories();
  }, [statusFilter, accessFilter]);

  // Selection handlers
  const allVisibleIds = stories.map((s) => s.id);
  const isAllSelected = allVisibleIds.length > 0 && allVisibleIds.every((id) => selectedIds.includes(id));

  const handleToggleSelectAll = () => {
    if (isAllSelected) setSelectedIds([]);
    else setSelectedIds(allVisibleIds);
  };

  const handleToggleSelectRow = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleUpdateStatus = async (storyId: string, newStatus: string) => {
    try {
      const authHeaders = await adminAuthorizationHeader();
      const res = await fetch(`/api/admin/bible/stories/${storyId}`, {
        method: "PUT",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus })
      });
      if (res.ok) {
        setStories((prev) => prev.map((s) => (s.id === storyId ? { ...s, status: newStatus } : s)));
        setFeedbackMessage({ type: "success", text: `Story status updated to ${newStatus}.` });
      }
    } catch (err) {
      setFeedbackMessage({ type: "error", text: "Failed to update status." });
    }
  };

  const handleSingleDelete = async (storyId: string, title: string) => {
    if (!confirm(`Are you sure you want to delete "${title}"? This will delete all chapters and Bunny CDN media.`)) return;
    try {
      const authHeaders = await adminAuthorizationHeader();
      const res = await fetch(`/api/admin/bible/stories/${storyId}`, {
        method: "DELETE",
        headers: authHeaders
      });
      if (res.ok) {
        setStories((prev) => prev.filter((s) => s.id !== storyId));
        setFeedbackMessage({ type: "success", text: `Story "${title}" permanently deleted.` });
      } else {
        alert("Failed to delete story.");
      }
    } catch (err) {
      alert("Delete failed.");
    }
  };

  // Bulk Archive Action
  const handleBulkArchive = async () => {
    if (selectedIds.length === 0 || isProcessingBulk) return;
    setIsProcessingBulk(true);
    setFeedbackMessage(null);

    try {
      const authHeaders = await adminAuthorizationHeader();
      const res = await fetch("/api/admin/bible/stories/bulk-archive", {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds })
      });

      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Failed to archive selected stories.");

      setFeedbackMessage({ type: "success", text: `${json.count} story journey(s) archived.` });
      setSelectedIds([]);
      await loadStories();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Bulk archive failed.";
      setFeedbackMessage({ type: "error", text: msg });
    } finally {
      setIsProcessingBulk(false);
    }
  };

  // Bulk Delete Action
  const handleBulkDelete = async () => {
    if (selectedIds.length === 0 || isProcessingBulk) return;

    const count = selectedIds.length;
    if (!confirm(`Permanently delete ${count} selected story journey(s)? All associated chapters and CDN media will be deleted. This cannot be undone.`)) {
      setFeedbackMessage({ type: "info", text: "Deletion cancelled." });
      return;
    }

    setIsProcessingBulk(true);
    setFeedbackMessage(null);

    try {
      const authHeaders = await adminAuthorizationHeader();
      const res = await fetch("/api/admin/bible/stories/bulk-delete", {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds })
      });

      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Failed to delete selected stories.");

      setFeedbackMessage({ type: "success", text: `${json.count} story journey(s) permanently deleted.` });
      setSelectedIds([]);
      await loadStories();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Bulk deletion failed.";
      setFeedbackMessage({ type: "error", text: msg });
    } finally {
      setIsProcessingBulk(false);
    }
  };

  // AI Generator Modal state
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiTopic, setAiTopic] = useState("");
  const [aiChapterCount, setAiChapterCount] = useState(5);
  const [generatingAi, setGeneratingAi] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const handleGenerateStory = async () => {
    if (!aiTopic.trim()) {
      setAiError("Please enter a story topic.");
      return;
    }
    setGeneratingAi(true);
    setAiError(null);

    try {
      const authHeaders = await adminAuthorizationHeader();
      const res = await fetch("/api/admin/bible/generate-story", {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ topic: aiTopic.trim(), chapter_count: aiChapterCount })
      });

      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || "AI Generation failed.");

      setShowAiModal(false);
      setAiTopic("");
      // Redirect to newly generated story
      window.location.href = `/bible/stories/${json.storyId}`;
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "Generation failed.");
    } finally {
      setGeneratingAi(false);
    }
  };

  return (
    <AdminGate>
      <main className="page">
        <div className="page-head">
          <div>
            <p className="eyebrow">My Bible Studio</p>
            <h1 className="title">Bible Stories &amp; Journeys</h1>
            <p className="description">
              Manage stories, chapter streams, and sequenced narratives for the My Bible section.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowAiModal(true)}
              className="button primary font-bold bg-amber-600 hover:bg-amber-700 text-white"
            >
              ✨ AI Generate Story
            </button>
            <Link href="/bible/entities" className="button secondary">
              Manage Entities
            </Link>
            <Link href="/bible/stories/new" className="button secondary">
              + New Manual Story
            </Link>
          </div>
        </div>

        {/* AI Story Generator Modal */}
        {showAiModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl p-6 max-w-lg w-full space-y-4 shadow-xl border border-line">
              <div className="flex items-center justify-between border-b border-line pb-3">
                <h3 className="font-bold text-ink text-base flex items-center gap-2">
                  <span className="text-amber-600 text-lg">✨</span> In-Studio OpenAI Story Generator
                </h3>
                <button
                  type="button"
                  onClick={() => setShowAiModal(false)}
                  disabled={generatingAi}
                  className="text-xs text-muted hover:text-ink font-bold"
                >
                  ✕ Close
                </button>
              </div>

              {aiError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs font-semibold">
                  {aiError}
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <label className="text-xs font-bold text-ink">Story Topic or Biblical Event *</label>
                  <input
                    type="text"
                    value={aiTopic}
                    onChange={(e) => setAiTopic(e.target.value)}
                    placeholder="e.g. Moses and the Burning Bush, The Parable of the Prodigal Son..."
                    className="input w-full text-sm mt-1"
                    disabled={generatingAi}
                  />
                  <p className="text-[11px] text-muted mt-1">
                    The AI will automatically query your database first to reuse existing canonical entities (e.g. Jordan River, John the Baptist).
                  </p>
                </div>

                <div>
                  <label className="text-xs font-bold text-ink">Number of Chapters</label>
                  <select
                    value={aiChapterCount}
                    onChange={(e) => setAiChapterCount(Number(e.target.value))}
                    className="select w-full text-xs mt-1"
                    disabled={generatingAi}
                  >
                    {[3, 4, 5, 6, 7, 8].map((n) => (
                      <option key={n} value={n}>
                        {n} Chapters
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="pt-4 border-t border-line flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAiModal(false)}
                  disabled={generatingAi}
                  className="button secondary compact text-xs"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleGenerateStory}
                  disabled={generatingAi}
                  className="button primary compact text-xs font-bold flex items-center gap-2"
                >
                  {generatingAi ? (
                    <>
                      <span className="animate-spin text-sm">⏳</span> Generating Story &amp; Entities...
                    </>
                  ) : (
                    "🚀 Generate Complete Story"
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Studio Admin Standard Toolbar Filters */}
        <div className="content-toolbar mt-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-xl border border-line bg-paper px-3 py-2 text-sm font-medium text-ink outline-none transition focus:border-wine focus:ring-2 focus:ring-wine/20"
              >
                <option value="all">All statuses</option>
                <option value="published">Published</option>
                <option value="draft">Draft</option>
                <option value="archived">Archived</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                Access Tier
              </label>
              <select
                value={accessFilter}
                onChange={(e) => setAccessFilter(e.target.value)}
                className="rounded-xl border border-line bg-paper px-3 py-2 text-sm font-medium text-ink outline-none transition focus:border-wine focus:ring-2 focus:ring-wine/20"
              >
                <option value="all">All tiers</option>
                <option value="free">Free</option>
                <option value="premium">Premium</option>
              </select>
            </div>
          </div>
        </div>

        {/* Feedback Alert Bar */}
        {feedbackMessage && (
          <div
            className={`alert mt-4 ${
              feedbackMessage.type === "success"
                ? "success"
                : feedbackMessage.type === "error"
                ? "error"
                : "info"
            }`}
            role="alert"
          >
            {feedbackMessage.text}
          </div>
        )}

        {/* Bulk Selection Bar */}
        {!loading && stories.length > 0 && (
          <div className="content-selection-bar mt-4">
            <label className="flex items-center gap-2 cursor-pointer font-semibold text-ink text-sm">
              <input
                type="checkbox"
                className="w-5 h-5 accent-wine cursor-pointer"
                checked={isAllSelected}
                onChange={handleToggleSelectAll}
              />
              <span>Select All Visible ({stories.length})</span>
            </label>

            {selectedIds.length > 0 && (
              <div className="flex items-center gap-3">
                <span className="badge ready font-bold">
                  {selectedIds.length} Selected
                </span>

                <button
                  type="button"
                  className="button secondary compact text-xs"
                  disabled={isProcessingBulk}
                  onClick={() => void handleBulkArchive()}
                >
                  {isProcessingBulk ? "Processing..." : "📦 Archive Selected"}
                </button>

                <button
                  type="button"
                  className="button danger compact text-xs"
                  disabled={isProcessingBulk}
                  onClick={() => void handleBulkDelete()}
                >
                  {isProcessingBulk ? "Processing..." : "🗑️ Delete Selected"}
                </button>

                <button
                  type="button"
                  className="button secondary compact text-xs"
                  disabled={isProcessingBulk}
                  onClick={() => setSelectedIds([])}
                >
                  Clear Selection
                </button>
              </div>
            )}
          </div>
        )}

        <div className="content-card mt-4">
          {loading ? (
            <p className="status-line p-4">Loading story journeys…</p>
          ) : stories.length === 0 ? (
            <p className="text-muted p-4">No stories found with the selected filters.</p>
          ) : (
            <div className="divide-y divide-line">
              {stories.map((story) => {
                const isSelected = selectedIds.includes(story.id);
                return (
                  <div
                    key={story.id}
                    className={`p-4 flex items-center justify-between transition-colors ${
                      isSelected ? "bg-amber-50/60" : "hover:bg-beige/30"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleSelectRow(story.id)}
                        className="w-5 h-5 accent-wine cursor-pointer mt-1"
                      />
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link
                            href={`/bible/stories/${story.id}`}
                            className="font-bold text-ink text-base hover:text-amber-700 transition-colors"
                          >
                            {story.title}
                          </Link>
                          <span
                            className={`badge text-xs font-semibold uppercase ${
                              story.access_level === "free" ? "bg-amber-100 text-amber-800" : "bg-purple-100 text-purple-800"
                            }`}
                          >
                            {story.access_level}
                          </span>
                          <select
                            value={story.status}
                            onChange={(e) => handleUpdateStatus(story.id, e.target.value)}
                            className={`text-xs font-bold uppercase rounded px-2 py-0.5 border cursor-pointer ${
                              story.status === "published"
                                ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                                : story.status === "draft"
                                ? "bg-amber-100 text-amber-800 border-amber-300"
                                : "bg-rose-100 text-rose-800 border-rose-300"
                            }`}
                          >
                            <option value="published">Published</option>
                            <option value="draft">Draft (Hidden)</option>
                            <option value="archived">Archived</option>
                          </select>
                        </div>
                        {story.subtitle && <p className="text-xs text-muted mt-0.5">{story.subtitle}</p>}
                        <p className="text-sm text-ink/80 mt-1 max-w-2xl line-clamp-2">{story.summary}</p>
                        <p className="text-xs text-muted mt-1">
                          Slug: <code className="bg-sand/40 px-1 py-0.5 rounded">{story.slug}</code>
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Link href={`/bible/stories/${story.id}`} className="button secondary compact text-xs">
                        Edit &amp; Chapters →
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleSingleDelete(story.id, story.title)}
                        className="px-2.5 py-1 text-xs bg-rose-100 text-rose-700 rounded hover:bg-rose-200 transition-colors font-medium"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </AdminGate>
  );
}
