"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminGate } from "@/components/AdminGate";
import { DevotionCoverManager } from "./DevotionCoverManager";
import { DevotionItemEditor } from "./DevotionItemEditor";
import { DevotionPreview } from "./DevotionPreview";
import { DEFAULT_SECTION_LABELS, DEVOTION_SECTION_KEYS, Devotion, DevotionItem, DevotionSection, ITEM_TYPE_LABELS, slugify } from "@/lib/devotions";
import { requireSupabase } from "@/lib/supabase";

type Tab = "overview" | "content" | "media" | "settings";
const itemColumns = "id,devotion_id,section_id,content_type,status,language_code,slug,title,summary,body,cover_image_path,location_name,address,map_url,video_url,source_name,source_url,metadata,sort_order";
const emptyDevotion = (): Devotion => ({ id: crypto.randomUUID(), slug: "", language_code: "en", title: "", short_description: "", description: "", cover_image_path: null, status: "draft", sort_order: 0 });

export function DevotionEditor({ devotionId }: { devotionId: string }) {
  const db = useMemo(() => requireSupabase(), []);
  const router = useRouter();
  const [devotion, setDevotion] = useState<Devotion>(() => emptyDevotion());
  const [sections, setSections] = useState<DevotionSection[]>([]);
  const [items, setItems] = useState<DevotionItem[]>([]);
  const [tab, setTab] = useState<Tab>("overview");
  const [editingItem, setEditingItem] = useState<DevotionItem | null | undefined>(undefined);
  const [confirmDeleteItem, setConfirmDeleteItem] = useState<string | null>(null);
  const [confirmDeleteDevotion, setConfirmDeleteDevotion] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(devotionId !== "new");
  const isNew = devotionId === "new";

  const loadContent = useCallback(async (id: string) => {
    const [sectionResult, itemResult] = await Promise.all([
      db.from("devotion_sections").select("id,devotion_id,section_key,display_label,sort_order,is_visible").eq("devotion_id", id).order("sort_order"),
      db.from("devotion_items").select(itemColumns).eq("devotion_id", id).order("sort_order"),
    ]);
    const error = sectionResult.error || itemResult.error;
    if (error) setMessage(error.message);
    else { setSections((sectionResult.data ?? []) as DevotionSection[]); setItems((itemResult.data ?? []) as DevotionItem[]); }
  }, [db]);

  useEffect(() => { let active = true; void (async () => { if (!isNew) { const result = await db.from("devotions").select("id,slug,language_code,title,short_description,description,cover_image_path,status,sort_order").eq("id", devotionId).single(); if (active) { if (result.error) setMessage(result.error.message); else { setDevotion(result.data as Devotion); await loadContent(devotionId); } } } if (active) setLoading(false); })(); return () => { active = false; }; }, [db, devotionId, isNew, loadContent]);

  function patch(values: Partial<Devotion>) { setDevotion(current => ({ ...current, ...values })); }

  async function save() {
    if (!devotion.title.trim() || !devotion.short_description.trim()) { setMessage("Add a title and short description before saving."); return; }
    const record = { ...devotion, slug: devotion.slug.trim() || slugify(devotion.title), short_description: devotion.short_description.trim() };
    const result = isNew ? await db.from("devotions").insert(record).select().single() : await db.from("devotions").update(record).eq("id", devotion.id).select().single();
    if (result.error) { setMessage(result.error.message); return; }
    const saved = result.data as Devotion;
    if (isNew) {
      const defaults = DEVOTION_SECTION_KEYS.map((key, index) => ({ devotion_id: saved.id, section_key: key, display_label: DEFAULT_SECTION_LABELS[key], sort_order: (index + 1) * 10 }));
      const sectionResult = await db.from("devotion_sections").insert(defaults);
      if (sectionResult.error) { setMessage(`Devotion saved, but its sections could not be created: ${sectionResult.error.message}`); return; }
      router.replace(`/devotions/${saved.id}`);
    }
    setDevotion(saved); setMessage("Devotion saved.");
  }

  async function updateSection(section: DevotionSection, values: Partial<DevotionSection>) {
    const { error } = await db.from("devotion_sections").update(values).eq("id", section.id).eq("devotion_id", devotion.id);
    if (error) setMessage(error.message); else await loadContent(devotion.id);
  }

  async function moveSection(section: DevotionSection, direction: -1 | 1) {
    const ordered = [...sections].sort((a, b) => a.sort_order - b.sort_order); const index = ordered.findIndex(row => row.id === section.id); const other = ordered[index + direction]; if (!other) return;
    const results = await Promise.all([db.from("devotion_sections").update({ sort_order: other.sort_order }).eq("id", section.id), db.from("devotion_sections").update({ sort_order: section.sort_order }).eq("id", other.id)]);
    const error = results.find(result => result.error)?.error; if (error) setMessage(error.message); else await loadContent(devotion.id);
  }

  async function moveItem(item: DevotionItem, direction: -1 | 1) {
    const peers = items.filter(row => row.section_id === item.section_id).sort((a, b) => a.sort_order - b.sort_order); const index = peers.findIndex(row => row.id === item.id); const other = peers[index + direction]; if (!other) return;
    const results = await Promise.all([db.from("devotion_items").update({ sort_order: other.sort_order }).eq("id", item.id), db.from("devotion_items").update({ sort_order: item.sort_order }).eq("id", other.id)]);
    const error = results.find(result => result.error)?.error; if (error) setMessage(error.message); else await loadContent(devotion.id);
  }

  async function archiveItem(item: DevotionItem) { const { error } = await db.from("devotion_items").update({ status: "archived" }).eq("id", item.id).eq("devotion_id", devotion.id); if (error) setMessage(error.message); else { await loadContent(devotion.id); setMessage("Devotional item archived."); } }
  async function deleteItem(item: DevotionItem) { const { error } = await db.from("devotion_items").delete().eq("id", item.id).eq("devotion_id", devotion.id); if (error) setMessage(error.message); else { setConfirmDeleteItem(null); await loadContent(devotion.id); setMessage("Devotional item permanently deleted."); } }
  async function deleteDraft() { if (devotion.status !== "draft") return; const { error } = await db.from("devotions").delete().eq("id", devotion.id).eq("status", "draft"); if (error) setMessage(error.message); else router.replace("/devotions"); }

  if (loading) return <AdminGate><main className="page"><p className="status-line">Loading devotion…</p></main></AdminGate>;
  return <AdminGate><main className="page devotion-editor">
    <div className="devotion-editor-head"><div><Link className="text-link" href="/devotions">← Devotions directory</Link><p className="eyebrow mt-4">{isNew ? "New devotion" : devotion.status === "ready" ? "Published devotion" : "Editorial draft"}</p><h1 className="title">{devotion.title || "Untitled devotion"}</h1></div><div className="devotion-editor-actions"><span className={`badge ${devotion.status}`}>{devotion.status === "ready" ? "Published" : devotion.status}</span><button className="button" type="button" onClick={() => void save()}>Save changes</button></div></div>
    <nav className="devotion-tabs" aria-label="Devotion editor sections">{(["overview", "content", "media", "settings"] as Tab[]).map(value => <button type="button" className={tab === value ? "active" : ""} onClick={() => setTab(value)} key={value}>{value[0].toUpperCase() + value.slice(1)}{value === "content" ? ` (${items.length})` : ""}</button>)}</nav>
    {message && <p className={`alert ${/(saved|archived|deleted)/i.test(message) ? "success" : "error"}`}>{message}</p>}
    {tab === "content" && !isNew && editingItem !== undefined && <DevotionItemEditor devotionId={devotion.id} sections={sections} initial={editingItem} onCancel={() => setEditingItem(undefined)} onSaved={() => { setEditingItem(undefined); void loadContent(devotion.id); setMessage("Devotional item saved."); }} />}
    <div className="devotion-workspace"><section className="devotion-editor-main">
      {tab === "overview" && <div className="card devotion-form"><div><p className="eyebrow">Identity</p><h2 className="card-title">Introduce the devotion</h2><p className="description">Write for the person discovering this devotion in the app.</p></div><label className="field"><span>Devotion title</span><input className="input" value={devotion.title} onChange={event => patch({ title: event.target.value })} /></label><label className="field"><span>Short description</span><textarea className="textarea" rows={3} value={devotion.short_description} onChange={event => patch({ short_description: event.target.value })} /></label><label className="field"><span>About this devotion</span><textarea className="textarea" rows={8} value={devotion.description ?? ""} onChange={event => patch({ description: event.target.value })} /></label></div>}
      {tab === "content" && <div className="devotion-content-stack"><div className="card"><div className="devotion-create-head"><div><p className="eyebrow">Independent collection</p><h2 className="card-title">Devotion-owned content</h2><p className="description">Publishing here affects only this devotion. It never creates Today placements or Videos tab entries.</p></div><button className="button" type="button" disabled={isNew || sections.length === 0} onClick={() => setEditingItem(null)}>+ Create content</button></div>{isNew && <p className="devotion-inline-message">Save the devotion before creating content.</p>}<div className="devotion-linked-list">{items.length === 0 && <p className="devotion-placeholder">No devotional content yet.</p>}{[...sections].sort((a, b) => a.sort_order - b.sort_order).map(section => items.filter(item => item.section_id === section.id).sort((a, b) => a.sort_order - b.sort_order).map(item => <article className="devotion-linked-card" key={item.id}><div className="devotion-linked-copy"><div><span className="devotion-section-label">{section.display_label}</span><h3>{item.title}</h3><p>{ITEM_TYPE_LABELS[item.content_type]} · {item.status}</p></div><span className={`badge ${item.status === "published" ? "ready" : item.status}`}>{item.status === "published" ? "Visible in devotion" : item.status}</span></div><div className="devotion-link-controls"><button className="button secondary" type="button" onClick={() => setEditingItem(item)}>Edit</button><button className="button secondary" type="button" aria-label="Move up" onClick={() => void moveItem(item, -1)}>↑</button><button className="button secondary" type="button" aria-label="Move down" onClick={() => void moveItem(item, 1)}>↓</button>{item.status !== "archived" && <button className="button secondary" type="button" onClick={() => void archiveItem(item)}>Archive</button>}{confirmDeleteItem === item.id ? <><button className="button danger" type="button" onClick={() => void deleteItem(item)}>Confirm permanent deletion</button><button className="button secondary" type="button" onClick={() => setConfirmDeleteItem(null)}>Cancel</button></> : <button className="button secondary" type="button" onClick={() => setConfirmDeleteItem(item.id)}>Delete permanently</button>}</div></article>))}</div></div>
        <div className="card"><p className="eyebrow">Sections</p><h2 className="card-title">Labels and ordering</h2><p className="description">The controlled section keys stay stable while their display labels and order remain editable. Empty sections are hidden in Android.</p><div className="devotion-linked-list">{[...sections].sort((a, b) => a.sort_order - b.sort_order).map(section => <article className="devotion-section-editor" key={section.id}><span className="devotion-section-label">{section.section_key}</span><input className="input" value={section.display_label} onChange={event => setSections(current => current.map(row => row.id === section.id ? { ...row, display_label: event.target.value } : row))} onBlur={() => void updateSection(section, { display_label: section.display_label })} /><label><input type="checkbox" checked={section.is_visible} onChange={event => void updateSection(section, { is_visible: event.target.checked })} /> Visible</label><button className="button secondary" type="button" onClick={() => void moveSection(section, -1)}>↑</button><button className="button secondary" type="button" onClick={() => void moveSection(section, 1)}>↓</button></article>)}</div></div></div>}
      {tab === "media" && <div className="card"><p className="eyebrow">Cover image</p><h2 className="card-title">Set the devotional atmosphere</h2><p className="description">Upload a dedicated cover, reuse Studio media, or retain a compatible CDN path.</p><DevotionCoverManager devotionId={isNew ? "new" : devotion.id} value={devotion.cover_image_path} onChange={value => patch({ cover_image_path: value })} /></div>}
      {tab === "settings" && <div className="card devotion-form"><div><p className="eyebrow">Publication</p><h2 className="card-title">Availability and organization</h2></div><label className="field"><span>Publication status</span><select className="select" value={devotion.status} onChange={event => patch({ status: event.target.value as Devotion["status"] })}><option value="draft">Draft — editors only</option><option value="ready">Published — available to the app</option><option value="archived">Archived — retained but hidden</option></select></label><label className="field"><span>Language</span><select className="select" value={devotion.language_code} onChange={event => patch({ language_code: event.target.value })}><option value="en">English</option><option value="fil">Filipino</option><option value="ceb">Cebuano</option></select></label><details className="devotion-advanced"><summary>Advanced identifiers and ordering</summary><div className="form-grid mt-5"><label className="field"><span>Slug</span><input className="input" value={devotion.slug} placeholder={slugify(devotion.title) || "devotion-slug"} onChange={event => patch({ slug: event.target.value })} /></label><label className="field"><span>Directory order</span><input className="input" type="number" value={devotion.sort_order} onChange={event => patch({ sort_order: Number(event.target.value) })} /></label></div></details>{!isNew && devotion.status === "draft" && <div className="devotion-danger-zone"><h3>Delete draft</h3><p>Deletes this draft and its devotion-owned sections and items.</p>{confirmDeleteDevotion ? <div className="flex gap-3"><button className="button danger" type="button" onClick={() => void deleteDraft()}>Confirm delete draft</button><button className="button secondary" type="button" onClick={() => setConfirmDeleteDevotion(false)}>Cancel</button></div> : <button className="button secondary" type="button" onClick={() => setConfirmDeleteDevotion(true)}>Delete this draft</button>}</div>}</div>}
    </section><DevotionPreview devotion={devotion} sections={sections} items={items} /></div>
  </main></AdminGate>;
}
