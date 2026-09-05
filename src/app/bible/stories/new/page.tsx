"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AdminGate } from "@/components/AdminGate";

import { adminAuthorizationHeader } from "@/lib/supabase";

export default function NewStoryPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [slug, setSlug] = useState("");
  const [summary, setSummary] = useState("");
  const [coverPath, setCoverPath] = useState("");
  const [accessLevel, setAccessLevel] = useState("free");
  const [status, setStatus] = useState("published");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleTitleChange = (val: string) => {
    setTitle(val);
    setSlug(val.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalSlug = (slug || title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (!title.trim() || !finalSlug.trim() || !summary.trim()) {
      setError("Title and summary are required.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const authHeaders = await adminAuthorizationHeader();
      const res = await fetch("/api/admin/bible/stories", {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          subtitle,
          slug: finalSlug,
          summary,
          cover_media_path: coverPath,
          access_level: accessLevel,
          status
        })
      });

      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || "Failed to create story.");

      router.push(`/bible/stories/${json.story.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AdminGate>
      <main className="page max-w-3xl">
        <div className="page-head">
          <div>
            <p className="eyebrow">My Bible Studio</p>
            <h1 className="title">Create New Story Journey</h1>
            <p className="description">
              Set up a top-level narrative journey (e.g. The Exodus, Paul&apos;s Missionary Journeys).
            </p>
          </div>
          <Link href="/bible/stories" className="button secondary">
            Cancel
          </Link>
        </div>

        {error && (
          <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-sm mt-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="content-card mt-6 space-y-4 p-6">
          <div>
            <label className="label">Story Title *</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="e.g. The Life of Jesus"
              className="input w-full"
            />
          </div>

          <div>
            <label className="label">Subtitle / Tagline</label>
            <input
              type="text"
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              placeholder="e.g. The Ministry, Miracles, and Resurrection of Christ"
              className="input w-full"
            />
          </div>

          <div>
            <label className="label">URL Slug *</label>
            <input
              type="text"
              required
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="the-life-of-jesus"
              className="input w-full font-mono text-sm"
            />
          </div>

          <div>
            <label className="label">Summary *</label>
            <textarea
              rows={3}
              required
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Brief summary of the story journey..."
              className="textarea w-full"
            />
          </div>

          <div>
            <label className="label">Bunny CDN Cover Storage Path</label>
            <input
              type="text"
              value={coverPath}
              onChange={(e) => setCoverPath(e.target.value)}
              placeholder="bible/stories/life-of-jesus/cover.webp"
              className="input w-full font-mono text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Access Level</label>
              <select
                value={accessLevel}
                onChange={(e) => setAccessLevel(e.target.value)}
                className="select w-full"
              >
                <option value="free">Free</option>
                <option value="premium">Premium</option>
              </select>
            </div>

            <div>
              <label className="label">Publication Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="select w-full"
              >
                <option value="published">Published</option>
                <option value="draft">Draft</option>
                <option value="ready">Ready</option>
              </select>
            </div>
          </div>

          <div className="pt-4 border-t border-line flex justify-end">
            <button type="submit" disabled={loading} className="button primary">
              {loading ? "Creating..." : "Save & Continue to Chapters"}
            </button>
          </div>
        </form>
      </main>
    </AdminGate>
  );
}
