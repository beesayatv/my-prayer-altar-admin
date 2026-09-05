"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { AdminGate } from "@/components/AdminGate";
import { BlockEditor, BibleBlockInput } from "@/components/bible/BlockEditor";

import { adminAuthorizationHeader } from "@/lib/supabase";

interface Story {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  summary: string;
  cover_media_path: string | null;
  status: string;
  access_level: string;
  tags: string[];
  created_at?: string;
}

interface Chapter {
  id: string;
  story_id: string;
  chapter_number: number;
  slug: string;
  title: string;
  summary: string | null;
  access_level: string;
  content_blocks: BibleBlockInput[];
}

export default function EditStoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [story, setStory] = useState<Story | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [activeChapter, setActiveChapter] = useState<Chapter | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // New Chapter modal state
  const [showNewChapterModal, setShowNewChapterModal] = useState(false);
  const [newChTitle, setNewChTitle] = useState("");
  const [newChSlug, setNewChSlug] = useState("");

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const authHeaders = await adminAuthorizationHeader();
        const res = await fetch(`/api/admin/bible/stories/${id}`, { headers: authHeaders });
        const json = await res.json();
        if (json.story) {
          setStory(json.story);
          setChapters(json.chapters || []);
          if (json.chapters && json.chapters.length > 0) {
            setActiveChapter(json.chapters[0]);
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [id]);

  const handleSaveStory = async () => {
    if (!story) return;
    setSaving(true);
    setMsg(null);
    try {
      const authHeaders = await adminAuthorizationHeader();
      const res = await fetch(`/api/admin/bible/stories/${id}`, {
        method: "PUT",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify(story)
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || "Failed to update story.");
      setMsg("Story metadata saved successfully!");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveActiveChapter = async () => {
    if (!activeChapter) return;
    setSaving(true);
    setMsg(null);
    try {
      const authHeaders = await adminAuthorizationHeader();
      const res = await fetch(`/api/admin/bible/stories/${id}/chapters`, {
        method: "PUT",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          chapter_id: activeChapter.id,
          ...activeChapter
        })
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || "Failed to update chapter.");

      // Update local state
      setChapters((prev) => prev.map((c) => (c.id === json.chapter.id ? json.chapter : c)));
      setActiveChapter(json.chapter);
      setMsg(`Chapter '${json.chapter.title}' saved successfully!`);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const handleCreateChapter = async () => {
    const finalSlug = (newChSlug || newChTitle).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (!newChTitle.trim() || !finalSlug.trim()) return;
    setSaving(true);
    try {
      const authHeaders = await adminAuthorizationHeader();
      const nextNum = chapters.length + 1;
      const res = await fetch(`/api/admin/bible/stories/${id}/chapters`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newChTitle.trim(),
          slug: finalSlug,
          chapter_number: nextNum,
          content_blocks: []
        })
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || "Failed to create chapter.");

      setChapters((prev) => [...prev, json.chapter]);
      setActiveChapter(json.chapter);
      setShowNewChapterModal(false);
      setNewChTitle("");
      setNewChSlug("");
      setMsg(`New Chapter #${nextNum} created!`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Chapter creation failed.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <AdminGate>
        <main className="page"><p className="text-muted">Loading story editor...</p></main>
      </AdminGate>
    );
  }

  if (!story) {
    return (
      <AdminGate>
        <main className="page"><p className="text-muted">Story not found.</p></main>
      </AdminGate>
    );
  }

  return (
    <AdminGate>
      <main className="page">
        <div className="page-head">
          <div>
            <p className="eyebrow">My Bible Studio • Story Journey</p>
            <h1 className="title">{story.title}</h1>
            <p className="description">Manage story details, chapter sequence, and visual content block streams.</p>
          </div>
          <div className="flex gap-2">
            <Link href="/bible/stories" className="button secondary">Back to Stories</Link>
          </div>
        </div>

        {msg && (
          <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-sm mt-4">
            {msg}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
          {/* Column 1: Story Details & Chapter List */}
          <div className="space-y-6">
            {/* Story Details Card */}
            <div className="content-card p-5 space-y-3">
              <h3 className="font-bold text-ink text-sm border-b border-line pb-2">Story Journey Metadata</h3>

              <div>
                <label className="text-xs font-semibold text-ink/70">Title</label>
                <input
                  type="text"
                  value={story.title}
                  onChange={(e) => setStory({ ...story, title: e.target.value })}
                  className="input w-full text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-ink/70">Subtitle</label>
                <input
                  type="text"
                  value={story.subtitle || ""}
                  onChange={(e) => setStory({ ...story, subtitle: e.target.value })}
                  className="input w-full text-xs"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-ink/70">Slug</label>
                <input
                  type="text"
                  value={story.slug}
                  onChange={(e) => setStory({ ...story, slug: e.target.value })}
                  className="input w-full font-mono text-xs"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-ink/70">Summary</label>
                <textarea
                  rows={2}
                  value={story.summary}
                  onChange={(e) => setStory({ ...story, summary: e.target.value })}
                  className="textarea w-full text-xs"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-ink/70">Tags (comma separated)</label>
                <input
                  type="text"
                  value={story.tags?.join(",") || ""}
                  onChange={(e) => {
                    setStory({ ...story, tags: e.target.value.split(",") });
                  }}
                  onBlur={() => {
                    const cleaned = (story.tags || []).map(t => t.trim()).filter(Boolean);
                    setStory({ ...story, tags: cleaned });
                  }}
                  className="input w-full text-xs"
                  placeholder="e.g. Faith, Miracles"
                />
              </div>

              {story.created_at && (
                <div>
                  <label className="text-xs font-semibold text-ink/70">Published Date (Read Only)</label>
                  <input
                    type="text"
                    readOnly
                    value={new Date(story.created_at).toLocaleString('en-US', { 
                      month: 'numeric', 
                      day: 'numeric', 
                      year: 'numeric', 
                      hour: 'numeric', 
                      minute: '2-digit', 
                      hour12: true 
                    }).replace(',', '').toLowerCase().replace(' am', 'am').replace(' pm', 'pm')}
                    className="input w-full text-xs bg-sand/30 text-ink/60"
                  />
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-ink/70">Publication Status</label>
                <select
                  value={story.status}
                  onChange={(e) => setStory({ ...story, status: e.target.value })}
                  className="select w-full text-xs font-bold uppercase"
                >
                  <option value="published">Published (Visible in App)</option>
                  <option value="draft">Draft (Hidden in App)</option>
                  <option value="archived">Archived</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-ink/70">Access Level</label>
                <select
                  value={story.access_level}
                  onChange={(e) => setStory({ ...story, access_level: e.target.value })}
                  className="select w-full text-xs"
                >
                  <option value="free">Free</option>
                  <option value="premium">Premium</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-ink/70">Story Cover Image</label>
                {story.cover_media_path && (
                  <div className="my-2 rounded-lg overflow-hidden border border-line bg-sand/30 aspect-video relative group">
                    <img
                      src={story.cover_media_path.startsWith("http") ? story.cover_media_path : `https://myprayeraltar-videos-sg.b-cdn.net/${story.cover_media_path.replace(/^\//, "")}`}
                      alt="Cover Preview"
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="text"
                    value={story.cover_media_path || ""}
                    onChange={(e) => setStory({ ...story, cover_media_path: e.target.value })}
                    placeholder="bible/covers/..."
                    className="input flex-1 font-mono text-xs"
                  />
                  <label className="button secondary compact text-xs cursor-pointer flex-shrink-0">
                    {uploadingCover ? "Uploading..." : "📷 Upload Cover"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={uploadingCover}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setUploadingCover(true);
                        try {
                          const formData = new FormData();
                          formData.append("file", file);
                          formData.append("folder", "bible/covers");
                          const authHeaders = await adminAuthorizationHeader();
                          const res = await fetch("/api/admin/bible/upload-cover", {
                            method: "POST",
                            headers: authHeaders,
                            body: formData
                          });
                          const json = await res.json();
                          if (!res.ok || json.error) throw new Error(json.error || "Upload failed");
                          setStory((prev) => prev ? { ...prev, cover_media_path: json.storagePath } : null);
                        } catch (err) {
                          alert(err instanceof Error ? err.message : "Upload failed");
                        } finally {
                          setUploadingCover(false);
                        }
                      }}
                    />
                  </label>
                </div>
              </div>

              <div className="pt-2 flex flex-col gap-2">
                <button type="button" onClick={handleSaveStory} disabled={saving} className="button secondary w-full text-xs font-bold">
                  {saving ? "Saving..." : "Save Story Metadata"}
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!confirm(`Are you sure you want to delete "${story.title}"? This will delete all chapters and Bunny CDN media.`)) return;
                    try {
                      const authHeaders = await adminAuthorizationHeader();
                      const res = await fetch(`/api/admin/bible/stories/${id}`, { method: "DELETE", headers: authHeaders });
                      if (res.ok) window.location.href = "/bible/stories";
                      else alert("Delete failed.");
                    } catch (err) {
                      alert("Delete failed.");
                    }
                  }}
                  className="px-3 py-1.5 bg-rose-100 text-rose-700 rounded-lg text-xs font-semibold hover:bg-rose-200 w-full text-center"
                >
                  Delete Story &amp; Media
                </button>
              </div>
            </div>

            {/* Chapters Sequence Card */}
            <div className="content-card p-5 space-y-3">
              <div className="flex items-center justify-between border-b border-line pb-2">
                <h3 className="font-bold text-ink text-sm">Chapter Stream ({chapters.length})</h3>
                <button
                  type="button"
                  onClick={() => setShowNewChapterModal(true)}
                  className="button primary compact text-xs"
                >
                  + Add Chapter
                </button>
              </div>

              <div className="space-y-2">
                {chapters.map((ch) => (
                  <div
                    key={ch.id}
                    onClick={() => setActiveChapter(ch)}
                    className={`p-3 rounded-lg border text-sm cursor-pointer transition-colors ${
                      activeChapter?.id === ch.id
                        ? "bg-amber-50 border-amber-400 font-bold text-amber-900"
                        : "bg-beige/20 border-line hover:bg-beige/50 text-ink"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span>#{ch.chapter_number} {ch.title}</span>
                      <span className="text-xs text-muted font-normal">{ch.content_blocks.length} blocks</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Column 2 & 3: Selected Chapter Block Editor */}
          <div className="lg:col-span-2 space-y-6">
            {activeChapter ? (
              <div className="content-card p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-line pb-3">
                  <div>
                    <span className="text-xs text-amber-700 font-bold uppercase">Editing Chapter #{activeChapter.chapter_number}</span>
                    <h2 className="text-lg font-bold text-ink">{activeChapter.title}</h2>
                  </div>
                  <button
                    type="button"
                    onClick={handleSaveActiveChapter}
                    disabled={saving}
                    className="button primary text-sm"
                  >
                    {saving ? "Saving Chapter..." : "Save Chapter Blocks"}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-4 bg-beige/30 p-3 rounded-xl">
                  <div>
                    <label className="text-xs font-semibold text-ink/70">Chapter Title</label>
                    <input
                      type="text"
                      value={activeChapter.title}
                      onChange={(e) => setActiveChapter({ ...activeChapter, title: e.target.value })}
                      className="input w-full text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-ink/70">Chapter Slug</label>
                    <input
                      type="text"
                      value={activeChapter.slug}
                      onChange={(e) => setActiveChapter({ ...activeChapter, slug: e.target.value })}
                      className="input w-full font-mono text-xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-ink/70">Chapter Summary / Teaser</label>
                  <input
                    type="text"
                    value={activeChapter.summary || ""}
                    onChange={(e) => setActiveChapter({ ...activeChapter, summary: e.target.value })}
                    className="input w-full text-xs"
                  />
                </div>

                {/* Visual Block Editor */}
                <BlockEditor
                  blocks={activeChapter.content_blocks}
                  onChange={(newBlocks) => setActiveChapter({ ...activeChapter, content_blocks: newBlocks })}
                />

                <div className="pt-4 border-t border-line flex justify-end">
                  <button
                    type="button"
                    onClick={handleSaveActiveChapter}
                    disabled={saving}
                    className="button primary text-sm"
                  >
                    {saving ? "Saving Chapter..." : "Save Chapter Blocks"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="content-card p-12 text-center text-muted">
                Select a chapter on the left to edit its visual content block stream.
              </div>
            )}
          </div>
        </div>

        {/* Modal to add new chapter */}
        {showNewChapterModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
              <h3 className="font-bold text-ink text-base">Add New Chapter #{chapters.length + 1}</h3>

              <div>
                <label className="label">Chapter Title *</label>
                <input
                  type="text"
                  required
                  value={newChTitle}
                  onChange={(e) => {
                    const val = e.target.value;
                    setNewChTitle(val);
                    setNewChSlug(val.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
                  }}
                  placeholder="e.g. Ministry in Galilee"
                  className="input w-full"
                />
              </div>

              <div>
                <label className="label">Chapter Slug *</label>
                <input
                  type="text"
                  required
                  value={newChSlug}
                  onChange={(e) => setNewChSlug(e.target.value)}
                  placeholder="ministry-in-galilee"
                  className="input w-full font-mono text-sm"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewChapterModal(false)}
                  className="button secondary"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreateChapter}
                  disabled={saving}
                  className="button primary"
                >
                  Create Chapter
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </AdminGate>
  );
}
