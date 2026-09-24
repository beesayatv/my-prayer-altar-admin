"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AdminGate } from "@/components/AdminGate";
import { adminAuthorizationHeader } from "@/lib/supabase";

interface BibleTag {
  id: string;
  slug: string;
  display_name: string;
  sort_order: number;
  is_active: boolean;
}

export default function BibleTagsPage() {
  const [tags, setTags] = useState<BibleTag[]>([]);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadTags = async () => {
    const headers = await adminAuthorizationHeader();
    const response = await fetch("/api/admin/bible/tags", { headers });
    const json = await response.json();
    if (!response.ok) throw new Error(json.error || "Failed to load Bible filters.");
    setTags(json.tags || []);
  };

  useEffect(() => { loadTags().catch((error) => setMessage(error.message)); }, []);

  const createTag = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const headers = await adminAuthorizationHeader();
      const response = await fetch("/api/admin/bible/tags", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: name, slug, sort_order: (tags.length + 1) * 10, is_active: true })
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Failed to create filter.");
      setName("");
      setSlug("");
      await loadTags();
      setMessage("Bible filter created.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to create filter.");
    } finally { setBusy(false); }
  };

  const saveTag = async (tag: BibleTag) => {
    setBusy(true);
    setMessage(null);
    try {
      const headers = await adminAuthorizationHeader();
      const response = await fetch("/api/admin/bible/tags", {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(tag)
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Failed to save filter.");
      await loadTags();
      setMessage("Bible filter saved. The app will use the updated list automatically.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save filter.");
    } finally { setBusy(false); }
  };

  return (
    <AdminGate>
      <main className="page">
        <div className="page-head">
          <div>
            <p className="eyebrow">My Bible Studio</p>
            <h1 className="title">Story Filters</h1>
            <p className="description">Manage the filter pills shown in the Bible tab. Slugs are used for story matching.</p>
          </div>
          <Link href="/bible/stories" className="button secondary">Back to Stories</Link>
        </div>

        {message && <div className="content-card p-3 mt-4 text-sm">{message}</div>}

        <section className="content-card p-5 mt-6 space-y-4">
          <h2 className="font-bold text-ink">Add filter</h2>
          <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3">
            <input className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Display name, e.g. Family" />
            <input className="input font-mono" value={slug} onChange={(event) => setSlug(event.target.value)} placeholder="slug (generated if blank)" />
            <button className="button primary" onClick={createTag} disabled={busy || !name.trim()}>Add Filter</button>
          </div>
        </section>

        <section className="content-card p-5 mt-6 space-y-3">
          {tags.map((tag, index) => (
            <div key={tag.id} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_100px_110px_auto] gap-3 items-center border-b border-line pb-3">
              <input className="input" value={tag.display_name} onChange={(event) => setTags((items) => items.map((item, i) => i === index ? { ...item, display_name: event.target.value } : item))} />
              <input className="input font-mono" value={tag.slug} onChange={(event) => setTags((items) => items.map((item, i) => i === index ? { ...item, slug: event.target.value } : item))} />
              <input className="input" type="number" value={tag.sort_order} onChange={(event) => setTags((items) => items.map((item, i) => i === index ? { ...item, sort_order: Number(event.target.value) } : item))} />
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={tag.is_active} onChange={(event) => setTags((items) => items.map((item, i) => i === index ? { ...item, is_active: event.target.checked } : item))} /> Active</label>
              <button className="button secondary" onClick={() => saveTag(tag)} disabled={busy}>Save</button>
            </div>
          ))}
        </section>
      </main>
    </AdminGate>
  );
}
