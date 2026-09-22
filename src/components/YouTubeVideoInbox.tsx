"use client";

import { useEffect, useState } from "react";
import { requireSupabase } from "@/lib/supabase";

type Source = {
  id: string;
  channel_id: string;
  channel_name: string;
  channel_url: string;
  default_video_label: string | null;
  default_video_source_location: string | null;
  auto_publish: boolean;
  title_prefix: string | null;
  title_keywords: string[];
  is_enabled: boolean;
  last_checked_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
};

const CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/;

function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Not checked yet";
}

export function YouTubeVideoInbox() {
  const [sources, setSources] = useState<Source[]>([]);
  const [editingSource, setEditingSource] = useState<Source | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await requireSupabase().from("youtube_video_sources").select("*").order("created_at", { ascending: true });
    if (error) setMessage({ type: "error", text: "Could not load video sources. Apply the Video inbox database migration first." });
    else setSources((data ?? []) as Source[]);
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  async function addSource(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const channelId = String(form.get("channel_id") || "").trim();
    const channelName = String(form.get("channel_name") || "").trim();
    const channelUrl = String(form.get("channel_url") || "").trim();
    const label = String(form.get("default_video_label") || "").trim();
    const sourceLocation = String(form.get("default_video_source_location") || "").trim().toLowerCase();
    const autoPublish = form.get("auto_publish") === "on";
    const prefix = String(form.get("title_prefix") || "").trim();
    const keywords = String(form.get("title_keywords") || "").split(",").map((word) => word.trim()).filter(Boolean);
    if (!CHANNEL_ID.test(channelId)) {
      setMessage({ type: "error", text: "Enter the channel ID beginning with UC (not the @handle)." });
      return;
    }
    if (autoPublish && !sourceLocation) {
      setMessage({ type: "error", text: "Enter a source location before enabling auto-publish." });
      return;
    }
    setSaving(true);
    setMessage(null);
    const { error } = await requireSupabase().from("youtube_video_sources").insert({
      channel_id: channelId,
      channel_name: channelName,
      channel_url: channelUrl,
      default_video_label: label || null,
      default_video_source_location: sourceLocation || null,
      auto_publish: autoPublish,
      title_prefix: prefix || null,
      title_keywords: keywords,
    });
    setSaving(false);
    if (error) {
      setMessage({ type: "error", text: error.code === "23505" ? "That channel is already in the Video inbox." : error.message });
      return;
    }
    event.currentTarget.reset();
    setMessage({ type: "success", text: "Channel added. Run a check now or wait for the next 15-minute check." });
    await load();
  }

  async function toggleSource(source: Source) {
    const { error } = await requireSupabase().from("youtube_video_sources").update({ is_enabled: !source.is_enabled }).eq("id", source.id);
    if (error) setMessage({ type: "error", text: "Could not update this source." });
    else await load();
  }

  async function deleteSource(source: Source) {
    const confirmed = window.confirm(`Delete ${source.channel_name}? This removes the source and its import history. Existing video drafts or published videos will remain.`);
    if (!confirmed) return;
    setMessage(null);
    const { error } = await requireSupabase().from("youtube_video_sources").delete().eq("id", source.id);
    if (error) {
      setMessage({ type: "error", text: "Could not delete this source." });
      return;
    }
    setMessage({ type: "success", text: "Video source deleted. Existing video content was preserved." });
    await load();
  }

  async function updateSource(event: React.FormEvent<HTMLFormElement>, source: Source) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const channelName = String(form.get("channel_name") || "").trim();
    const channelUrl = String(form.get("channel_url") || "").trim();
    const label = String(form.get("default_video_label") || "").trim();
    const sourceLocation = String(form.get("default_video_source_location") || "").trim().toLowerCase();
    const autoPublish = form.get("auto_publish") === "on";
    const prefix = String(form.get("title_prefix") || "").trim();
    const keywords = String(form.get("title_keywords") || "").split(",").map((word) => word.trim()).filter(Boolean);
    if (autoPublish && !sourceLocation) {
      setMessage({ type: "error", text: "Enter a source location before enabling auto-publish." });
      return;
    }
    setSaving(true);
    setMessage(null);
    const { error } = await requireSupabase().from("youtube_video_sources").update({
      channel_name: channelName,
      channel_url: channelUrl,
      default_video_label: label || null,
      default_video_source_location: sourceLocation || null,
      auto_publish: autoPublish,
      title_prefix: prefix || null,
      title_keywords: keywords,
    }).eq("id", source.id);
    setSaving(false);
    if (error) {
      setMessage({ type: "error", text: "Could not update this source." });
      return;
    }
    setEditingSource(null);
    setMessage({ type: "success", text: "Video source updated." });
    await load();
  }

  async function checkNow() {
    setChecking(true);
    setMessage(null);
    const { data, error } = await requireSupabase().functions.invoke("import-youtube-video-drafts", { body: {} });
    setChecking(false);
    if (error) {
      setMessage({ type: "error", text: "The inbox check could not run. Confirm that the importer function has been deployed." });
      return;
    }
    const result = data as { checked?: number; imported?: number; results?: Array<{ error?: string }> };
    const failed = result.results?.filter((item) => item.error).length ?? 0;
    setMessage({ type: failed ? "info" : "success", text: `${result.imported ?? 0} draft${result.imported === 1 ? "" : "s"} imported from ${result.checked ?? 0} source${result.checked === 1 ? "" : "s"}${failed ? `; ${failed} source needs attention.` : "."}` });
    await load();
  }

  return (
    <div className="flex max-w-5xl flex-col gap-7 pb-16">
      {message && <div className={`alert ${message.type}`} role="alert">{message.text}</div>}
      <section className="card border-wine/25 bg-wine/5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="eyebrow">Review-only automation</p>
            <h2 className="text-lg font-semibold text-ink">Video inbox</h2>
            <p className="mt-1 text-sm text-muted">Only recent uploads (within 36 hours) become video drafts. Nothing is published until you review it for the Videos tab.</p>
          </div>
          <button className="button whitespace-nowrap" type="button" onClick={() => void checkNow()} disabled={checking || !sources.some((source) => source.is_enabled)}>
            {checking ? "Checking YouTube…" : "Check now"}
          </button>
        </div>
      </section>

      <section className="card">
        <h2 className="card-title">Add a YouTube channel</h2>
        <p className="mb-5 text-sm text-muted">Use the channel ID from its YouTube URL, beginning with <code>UC</code>. A handle such as <code>@bmsncebu</code> is not enough for the reliable channel feed.</p>
        <form className="flex flex-col gap-5" onSubmit={(event) => void addSource(event)}>
          <div className="form-grid">
            <label className="field"><span>Channel name</span><input required name="channel_name" className="input" placeholder="Basilica Minore del Santo Niño de Cebu" /></label>
            <label className="field"><span>YouTube channel ID</span><input required name="channel_id" className="input" placeholder="UC…" /></label>
            <label className="field"><span>Channel URL</span><input required name="channel_url" type="url" className="input" placeholder="https://www.youtube.com/@…" /></label>
            <label className="field"><span>Video label</span><input name="default_video_label" maxLength={48} className="input" placeholder="Mass Video" /></label>
            <label className="field"><span>Default source location <small className="text-muted">optional</small></span><input name="default_video_source_location" className="input" placeholder="Cebu" maxLength={48} /></label>
            <label className="field col-span-full flex cursor-pointer items-center justify-between rounded-xl border border-line bg-beige/40 p-4"><span><strong className="block text-sm text-ink">Auto-publish new videos</strong><small className="text-muted">For trusted sources only. New eligible uploads publish directly to Videos instead of becoming drafts.</small></span><input name="auto_publish" type="checkbox" className="h-5 w-5 accent-wine" /></label>
            <label className="field"><span>Title prefix <small className="text-muted">optional</small></span><input name="title_prefix" maxLength={80} className="input" placeholder="Sto. Niño Cebu" /></label>
            <label className="field"><span>Only titles containing <small className="text-muted">comma-separated, optional</small></span><input name="title_keywords" className="input" placeholder="Mass, Eucharist" /></label>
          </div>
          <div><button className="button" type="submit" disabled={saving}>{saving ? "Adding…" : "Add channel"}</button></div>
        </form>
      </section>

      <section className="card">
        <h2 className="card-title">Subscribed channels</h2>
        {loading ? <p className="status-line">Loading video sources…</p> : !sources.length ? <p className="text-sm text-muted">No channels yet. Add your first source above.</p> : <div className="flex flex-col gap-3">
          {sources.map((source) => <article key={source.id} className="rounded-xl border border-line bg-white p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex items-center gap-2"><h3 className="font-semibold text-ink">{source.channel_name}</h3><span className={`badge ${source.is_enabled ? "ready" : "archived"}`}>{source.is_enabled ? "Watching" : "Paused"}</span></div>
                <p className="mt-1 text-xs text-muted">{source.default_video_label || "Video"} · {source.default_video_source_location || "location chosen during review"} · {source.auto_publish ? "auto-publish on" : "draft review"}{source.title_keywords?.length ? ` · titles: ${source.title_keywords.join(", ")}` : " · all uploads"}</p>
                <p className="mt-1 text-xs text-muted">Last successful check: {formatDate(source.last_success_at)}</p>
                {source.last_error && <p className="mt-2 text-xs text-rose-700">Last error: {source.last_error}</p>}
              </div>
              <div className="flex gap-2">
                <button type="button" className="button secondary compact" onClick={() => setEditingSource(source)}>Edit</button>
                <button type="button" className="button secondary compact" onClick={() => void toggleSource(source)}>{source.is_enabled ? "Pause" : "Resume"}</button>
                <button type="button" className="button secondary compact text-rose-700" onClick={() => void deleteSource(source)}>Delete</button>
              </div>
            </div>
            {editingSource?.id === source.id && <form className="mt-4 border-t border-line pt-4" onSubmit={(event) => void updateSource(event, source)}>
              <div className="form-grid">
                <label className="field"><span>Channel name</span><input required name="channel_name" className="input" defaultValue={source.channel_name} /></label>
                <label className="field"><span>YouTube channel ID <small className="text-muted">kept fixed to preserve import history</small></span><input className="input" value={source.channel_id} disabled /></label>
                <label className="field"><span>Channel URL</span><input required name="channel_url" type="url" className="input" defaultValue={source.channel_url} /></label>
                <label className="field"><span>Video label</span><input name="default_video_label" maxLength={48} className="input" defaultValue={source.default_video_label ?? ""} /></label>
                <label className="field"><span>Default source location</span><input name="default_video_source_location" className="input" defaultValue={source.default_video_source_location ?? ""} placeholder="Cebu" maxLength={48} /></label>
                <label className="field col-span-full flex cursor-pointer items-center justify-between rounded-xl border border-line bg-beige/40 p-4"><span><strong className="block text-sm text-ink">Auto-publish new videos</strong><small className="text-muted">For trusted sources only. New eligible uploads publish directly to Videos instead of becoming drafts.</small></span><input name="auto_publish" type="checkbox" className="h-5 w-5 accent-wine" defaultChecked={source.auto_publish} /></label>
                <label className="field"><span>Title prefix <small className="text-muted">optional</small></span><input name="title_prefix" maxLength={80} className="input" defaultValue={source.title_prefix ?? ""} /></label>
                <label className="field col-span-full"><span>Only titles containing <small className="text-muted">comma-separated, optional</small></span><input name="title_keywords" className="input" defaultValue={(source.title_keywords ?? []).join(", ")} /></label>
              </div>
              <div className="mt-4 flex gap-2"><button className="button" type="submit" disabled={saving}>{saving ? "Saving…" : "Save changes"}</button><button className="button secondary" type="button" onClick={() => setEditingSource(null)}>Cancel</button></div>
            </form>}
          </article>)}
        </div>}
      </section>
    </div>
  );
}
