"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AdminGate } from "@/components/AdminGate";

import { adminAuthorizationHeader } from "@/lib/supabase";

export default function NewEntityPage() {
  const router = useRouter();
  const [entityType, setEntityType] = useState("person");
  const [name, setName] = useState("");
  const [shortTitle, setShortTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [summary, setSummary] = useState("");
  const [aliasesStr, setAliasesStr] = useState("");
  const [coverPath, setCoverPath] = useState("");
  const [accessLevel, setAccessLevel] = useState("free");
  const [status, setStatus] = useState("published");
  const [loading, setLoading] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleNameChange = (val: string) => {
    setName(val);
    setSlug(val.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalSlug = (slug || name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (!name.trim() || !finalSlug.trim() || !summary.trim()) {
      setError("Name and summary are required.");
      return;
    }

    setLoading(true);
    setError(null);

    const aliases = aliasesStr.split(",").map((a) => a.trim()).filter(Boolean);

    try {
      const authHeaders = await adminAuthorizationHeader();
      const res = await fetch("/api/admin/bible/entities", {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          entity_type: entityType,
          name: name.trim(),
          short_title: shortTitle.trim() || null,
          slug: finalSlug,
          summary: summary.trim(),
          aliases,
          cover_media_path: coverPath || null,
          access_level: accessLevel,
          status
        })
      });

      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || "Failed to create canonical entity.");

      router.push(`/bible/entities/${json.entity.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setLoading(false);
    }
  };

  const entityTypes = [
    "person", "place", "event", "scripture", "concept",
    "object", "explainer", "map", "timeline", "collection", "comparison"
  ];

  return (
    <AdminGate>
      <main className="page max-w-3xl">
        <div className="page-head">
          <div>
            <p className="eyebrow">My Bible Studio</p>
            <h1 className="title">Create Canonical Reusable Entity</h1>
            <p className="description">
              Create a ground-truth biblical record that can be linked from any story or chapter.
            </p>
          </div>
          <Link href="/bible/entities" className="button secondary">
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
            <label className="label">Canonical Entity Type *</label>
            <select
              value={entityType}
              onChange={(e) => setEntityType(e.target.value)}
              className="select w-full font-bold uppercase"
            >
              {entityTypes.map((t) => (
                <option key={t} value={t}>
                  {t.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Canonical Name / Title *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g. John the Baptist"
              className="input w-full"
            />
          </div>

          <div>
            <label className="label">Short Title / Badge Label</label>
            <input
              type="text"
              value={shortTitle}
              onChange={(e) => setShortTitle(e.target.value)}
              placeholder="e.g. St. John"
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
              placeholder="john-the-baptist"
              className="input w-full font-mono text-sm"
            />
          </div>

          <div>
            <label className="label">Summary / Teaser *</label>
            <textarea
              rows={3}
              required
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Ground-truth summary used in preview cards, tooltips, and search results..."
              className="textarea w-full"
            />
          </div>

          <div>
            <label className="label">Aliases (Comma separated for search &amp; duplicate check)</label>
            <input
              type="text"
              value={aliasesStr}
              onChange={(e) => setAliasesStr(e.target.value)}
              placeholder="Yochanan, John the Immerser"
              className="input w-full text-xs"
            />
          </div>

          <div>
            <label className="label">Bunny CDN Cover Image Path</label>
            {coverPath && (
              <div className="my-2 rounded-lg overflow-hidden border border-line bg-sand/30 w-32 aspect-square relative group">
                <img
                  src={coverPath.startsWith("http") ? coverPath : `https://myprayeraltar-videos-sg.b-cdn.net/${coverPath.replace(/^\//, "")}`}
                  alt="Cover Preview"
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            <div className="flex items-center gap-2 mt-1">
              <input
                type="text"
                value={coverPath}
                onChange={(e) => setCoverPath(e.target.value)}
                placeholder="bible/entities/portraits/john_baptist.webp"
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
                      formData.append("folder", "bible/entities");
                      const authHeaders = await adminAuthorizationHeader();
                      const res = await fetch("/api/admin/bible/upload-cover", {
                        method: "POST",
                        headers: authHeaders,
                        body: formData
                      });
                      const json = await res.json();
                      if (!res.ok || json.error) throw new Error(json.error || "Upload failed");
                      setCoverPath(json.storagePath);
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
              {loading ? "Creating..." : "Save Canonical Entity"}
            </button>
          </div>
        </form>
      </main>
    </AdminGate>
  );
}
