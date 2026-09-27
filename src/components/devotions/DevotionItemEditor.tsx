"use client";

import { FormEvent, useEffect, useState } from "react";
import { DevotionItem, DevotionItemStatus, DevotionItemType, DevotionSection, ITEM_TYPE_LABELS, defaultSectionKey, devotionImageUrl, slugify } from "@/lib/devotions";
import { requireSupabase } from "@/lib/supabase";

type MediaAsset = { id: string; storage_path: string; public_url: string | null; alt_text: string | null };

export function DevotionItemEditor({ devotionId, sections, initial, onSaved, onCancel }: { devotionId: string; sections: DevotionSection[]; initial?: DevotionItem | null; onSaved: () => void; onCancel: () => void }) {
  const [type, setType] = useState<DevotionItemType>(initial?.content_type ?? "prayer");
  const defaultSection = sections.find(section => section.section_key === defaultSectionKey(type)) ?? sections[0];
  const [sectionId, setSectionId] = useState(initial?.section_id ?? defaultSection?.id ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [summary, setSummary] = useState(initial?.summary ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [language, setLanguage] = useState(initial?.language_code ?? "en");
  const [status, setStatus] = useState<DevotionItemStatus>(initial?.status ?? "draft");
  const [cover, setCover] = useState(initial?.cover_image_path ?? "");
  const [location, setLocation] = useState(initial?.location_name ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [mapUrl, setMapUrl] = useState(initial?.map_url ?? "");
  const [videoUrl, setVideoUrl] = useState(initial?.video_url ?? "");
  const [sourceName, setSourceName] = useState(initial?.source_name ?? "");
  const [sourceUrl, setSourceUrl] = useState(initial?.source_url ?? "");
  const [media, setMedia] = useState<MediaAsset[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => { let active = true; void requireSupabase().from("content_media").select("id,storage_path,public_url,alt_text").eq("media_type", "image").order("created_at", { ascending: false }).limit(12).then(({ data }) => { if (active) setMedia((data ?? []) as MediaAsset[]); }); return () => { active = false; }; }, []);

  function changeType(next: DevotionItemType) {
    setType(next);
    const nextSection = sections.find(section => section.section_key === defaultSectionKey(next));
    if (nextSection) setSectionId(nextSection.id);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || !sectionId) { setMessage("Add a title and choose a section."); return; }
    if (status === "published" && (type === "prayer" || type === "article") && !body.trim()) { setMessage("Published prayers and articles require body text."); return; }
    if (status === "published" && type === "video" && !/^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(videoUrl)) { setMessage("Published videos require a valid YouTube URL."); return; }
    setBusy(true); setMessage("");
    const peers = await requireSupabase().from("devotion_items").select("sort_order").eq("devotion_id", devotionId).eq("section_id", sectionId).order("sort_order", { ascending: false }).limit(1);
    const record = {
      devotion_id: devotionId, section_id: sectionId, content_type: type, status, language_code: language,
      slug: initial?.slug || slugify(title) || `${type}-${crypto.randomUUID().slice(0, 8)}`, title: title.trim(),
      summary: summary.trim() || null, body: body.trim() || null, cover_image_path: cover.trim() || null,
      location_name: type === "place" ? location.trim() || title.trim() : null, address: type === "place" ? address.trim() || null : null,
      map_url: type === "place" ? mapUrl.trim() || null : null, video_url: type === "video" ? videoUrl.trim() || null : null,
      source_name: type === "video" ? sourceName.trim() || null : null, source_url: type === "video" ? sourceUrl.trim() || null : null,
      sort_order: initial?.sort_order ?? ((peers.data?.[0]?.sort_order ?? -1) + 1), metadata: initial?.metadata ?? {},
    };
    const db = requireSupabase();
    const result = initial ? await db.from("devotion_items").update(record).eq("id", initial.id) : await db.from("devotion_items").insert(record);
    setBusy(false);
    if (result.error) { setMessage(result.error.message); return; }
    onSaved();
  }

  return <form className="card devotion-create-content" onSubmit={submit}>
    <div className="devotion-create-head"><div><p className="eyebrow">Devotion-owned content</p><h2 className="card-title">{initial ? `Edit ${ITEM_TYPE_LABELS[type]}` : "Create devotional content"}</h2><p className="description">This record belongs only to this devotion and never enters Today or the Videos tab.</p></div><button className="button secondary" type="button" onClick={onCancel}>Close</button></div>
    <div className="form-grid">
      <label className="field"><span>Content type</span><select className="select" value={type} disabled={Boolean(initial)} onChange={event => changeType(event.target.value as DevotionItemType)}>{Object.entries(ITEM_TYPE_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      <label className="field"><span>Section</span><select className="select" value={sectionId} onChange={event => setSectionId(event.target.value)}>{sections.map(section => <option value={section.id} key={section.id}>{section.display_label}</option>)}</select></label>
      <label className="field col-span-full"><span>{type === "place" ? "Place name" : "Title"}</span><input className="input" value={title} onChange={event => setTitle(event.target.value)} /></label>
      {(type === "article" || type === "place" || type === "video") && <label className="field col-span-full"><span>{type === "article" ? "Summary" : "Description"}</span><textarea className="textarea" rows={3} value={summary} onChange={event => setSummary(event.target.value)} /></label>}
      {(type === "prayer" || type === "article") && <label className="field col-span-full"><span>{type === "prayer" ? "Prayer text" : "Article body"}</span><textarea className="textarea" rows={10} value={body} onChange={event => setBody(event.target.value)} /></label>}
      {type === "place" && <><label className="field"><span>Location</span><input className="input" value={location} onChange={event => setLocation(event.target.value)} /></label><label className="field"><span>Address</span><input className="input" value={address} onChange={event => setAddress(event.target.value)} /></label><label className="field col-span-full"><span>Map URL</span><input className="input" type="url" value={mapUrl} onChange={event => setMapUrl(event.target.value)} /></label></>}
      {type === "video" && <><label className="field col-span-full"><span>YouTube URL</span><input className="input" type="url" value={videoUrl} onChange={event => setVideoUrl(event.target.value)} /></label><label className="field"><span>Source name</span><input className="input" value={sourceName} onChange={event => setSourceName(event.target.value)} /></label><label className="field"><span>Source URL</span><input className="input" type="url" value={sourceUrl} onChange={event => setSourceUrl(event.target.value)} /></label></>}
      <label className="field"><span>Language</span><select className="select" value={language} onChange={event => setLanguage(event.target.value)}><option value="en">English</option><option value="fil">Filipino</option><option value="ceb">Cebuano</option></select></label>
      <label className="field"><span>Publication status</span><select className="select" value={status} onChange={event => setStatus(event.target.value as DevotionItemStatus)}><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select></label>
      {(type === "article" || type === "place" || type === "video") && <label className="field col-span-full"><span>Optional cover CDN path or URL</span><input className="input" value={cover} onChange={event => setCover(event.target.value)} /></label>}
    </div>
    {(type === "article" || type === "place" || type === "video") && media.length > 0 && <div><p className="description">Or choose an existing Studio image.</p><div className="devotion-media-grid">{media.map(asset => { const value = asset.public_url || asset.storage_path; return <button type="button" className={cover === value ? "selected" : ""} key={asset.id} onClick={() => setCover(value)}><img src={asset.public_url || devotionImageUrl(asset.storage_path)} alt={asset.alt_text || "Existing media"} /></button>; })}</div></div>}
    {message && <p className="alert error">{message}</p>}
    <div className="flex gap-3"><button className="button" type="submit" disabled={busy}>{busy ? "Saving…" : initial ? "Save item" : "Create item"}</button><button className="button secondary" type="button" onClick={onCancel}>Cancel</button></div>
  </form>;
}
