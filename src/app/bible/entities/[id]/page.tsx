"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { AdminGate } from "@/components/AdminGate";
import { BlockEditor, BibleBlockInput } from "@/components/bible/BlockEditor";

import { adminAuthorizationHeader } from "@/lib/supabase";

interface EntityDetail {
  id: string;
  entity_type: string;
  slug: string;
  name: string;
  short_title: string | null;
  summary: string;
  aliases: string[];
  cover_media_path: string | null;
  status: string;
  access_level: string;
  attributes: Record<string, unknown>;
  body_blocks: BibleBlockInput[];
}

export default function EditEntityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [entity, setEntity] = useState<EntityDetail | null>(null);
  const [aliasesStr, setAliasesStr] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    async function loadEntity() {
      setLoading(true);
      try {
        const authHeaders = await adminAuthorizationHeader();
        const res = await fetch(`/api/admin/bible/entities/${id}`, { headers: authHeaders });
        const json = await res.json();
        if (json.entity) {
          setEntity(json.entity);
          setAliasesStr((json.entity.aliases || []).join(", "));
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadEntity();
  }, [id]);

  const handleSave = async () => {
    if (!entity) return;
    setSaving(true);
    setMsg(null);

    const aliases = aliasesStr.split(",").map((a) => a.trim()).filter(Boolean);

    try {
      const authHeaders = await adminAuthorizationHeader();
      const res = await fetch(`/api/admin/bible/entities/${id}`, {
        method: "PUT",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          ...entity,
          aliases
        })
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || "Failed to update entity.");

      setEntity(json.entity);
      setMsg("Canonical entity saved successfully!");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this canonical entity? This cannot be undone.")) return;
    setSaving(true);
    setMsg(null);
    try {
      const authHeaders = await adminAuthorizationHeader();
      const res = await fetch(`/api/admin/bible/entities/${id}`, {
        method: "DELETE",
        headers: authHeaders
      });
      if (!res.ok) throw new Error("Failed to delete entity.");
      window.location.href = "/bible/entities";
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Delete failed.");
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <AdminGate>
        <main className="page"><p className="text-muted">Loading entity editor...</p></main>
      </AdminGate>
    );
  }

  if (!entity) {
    return (
      <AdminGate>
        <main className="page"><p className="text-muted">Entity not found.</p></main>
      </AdminGate>
    );
  }

  return (
    <AdminGate>
      <main className="page max-w-4xl">
        <div className="page-head">
          <div>
            <p className="eyebrow">My Bible Studio • Canonical Entity</p>
            <h1 className="title">{entity.name}</h1>
            <p className="description">Edit ground-truth record for type: <span className="uppercase font-bold text-amber-700">{entity.entity_type}</span></p>
          </div>
          <div className="flex gap-2">
            <Link href="/bible/entities" className="button secondary">Back to Entities</Link>
            <button type="button" onClick={handleSave} disabled={saving} className="button primary">
              {saving ? "Saving..." : "Save Entity"}
            </button>
          </div>
        </div>

        {msg && (
          <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-sm mt-4">
            {msg}
          </div>
        )}

        <div className="content-card mt-6 p-6 space-y-6">
          <h3 className="font-bold text-ink text-base border-b border-line pb-2">Entity Core Attributes</h3>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Entity Type</label>
              <input
                type="text"
                readOnly
                value={entity.entity_type.toUpperCase()}
                className="input w-full font-bold bg-sand/20"
              />
            </div>
            <div>
              <label className="label">Canonical Name / Title *</label>
              <input
                type="text"
                value={entity.name}
                onChange={(e) => setEntity({ ...entity, name: e.target.value })}
                className="input w-full text-sm font-bold"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Short Title / Badge Label</label>
              <input
                type="text"
                value={entity.short_title || ""}
                onChange={(e) => setEntity({ ...entity, short_title: e.target.value })}
                className="input w-full text-sm"
              />
            </div>
            <div>
              <label className="label">URL Slug *</label>
              <input
                type="text"
                value={entity.slug}
                onChange={(e) => setEntity({ ...entity, slug: e.target.value })}
                className="input w-full font-mono text-xs"
              />
            </div>
          </div>

          <div>
            <label className="label">Summary / Teaser *</label>
            <textarea
              rows={3}
              value={entity.summary}
              onChange={(e) => setEntity({ ...entity, summary: e.target.value })}
              className="textarea w-full text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Publication Status</label>
              <select
                value={entity.status || "published"}
                onChange={(e) => setEntity({ ...entity, status: e.target.value })}
                className="select w-full text-xs font-bold uppercase"
              >
                <option value="published">Published</option>
                <option value="draft">Draft</option>
                <option value="archived">Archived</option>
              </select>
            </div>
            <div>
              <label className="label">Access Level</label>
              <select
                value={entity.access_level || "free"}
                onChange={(e) => setEntity({ ...entity, access_level: e.target.value })}
                className="select w-full text-xs font-bold uppercase"
              >
                <option value="free">Free</option>
                <option value="premium">Premium</option>
              </select>
            </div>
          </div>

          <div>
            <label className="label">Aliases (Comma separated)</label>
            <input
              type="text"
              value={aliasesStr}
              onChange={(e) => setAliasesStr(e.target.value)}
              className="input w-full text-xs"
            />
          </div>

          <div>
            <label className="label">Bunny CDN Cover Image Path</label>
            {entity.cover_media_path && (
              <div className="my-2 rounded-lg overflow-hidden border border-line bg-sand/30 w-32 aspect-square relative group">
                <img
                  src={entity.cover_media_path.startsWith("http") ? entity.cover_media_path : `https://myprayeraltar-videos-sg.b-cdn.net/${entity.cover_media_path.replace(/^\//, "")}`}
                  alt="Cover Preview"
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            <div className="flex items-center gap-2 mt-1">
              <input
                type="text"
                value={entity.cover_media_path || ""}
                onChange={(e) => setEntity({ ...entity, cover_media_path: e.target.value })}
                placeholder="bible/entities/..."
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
                      setEntity((prev) => prev ? { ...prev, cover_media_path: json.storagePath } : null);
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

          {/* Long-Form Entity Body Blocks */}
          <div className="pt-4 border-t border-line">
            <BlockEditor
              blocks={entity.body_blocks || []}
              onChange={(newBlocks) => setEntity({ ...entity, body_blocks: newBlocks })}
            />
          </div>

          <div className="pt-4 border-t border-line flex justify-between">
            <button type="button" onClick={handleDelete} disabled={saving} className="button secondary bg-rose-50 text-rose-600 border-rose-200 hover:bg-rose-100 hover:border-rose-300">
              {saving ? "..." : "Delete Entity"}
            </button>
            <button type="button" onClick={handleSave} disabled={saving} className="button primary">
              {saving ? "Saving..." : "Save Canonical Entity"}
            </button>
          </div>
        </div>
      </main>
    </AdminGate>
  );
}
