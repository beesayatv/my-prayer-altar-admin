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
    const sourceLocation = String(form.get("default_video_source_location") || "").trim();
    const prefix = String(form.get("title_prefix") || "").trim();
    const keywords = String(form.get("title_keywords") || "").split(",").map((word) => word.trim()).filter(Boolean);
    if (!CHANNEL_ID.test(channelId)) {
      setMessage({ type: "error", text: "Enter the channel ID beginning with UC (not the @handle)." });
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
            <label className="field"><span>Default source location <small className="text-muted">optional</small></span><select name="default_video_source_location" className="select" defaultValue=""><option value="">Choose during review</option><option value="cebu">Cebu</option><option value="quiapo">Quiapo</option></select></label>
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
                <p className="mt-1 text-xs text-muted">{source.default_video_label || "Video"} · {source.default_video_source_location || "location chosen during review"}{source.title_keywords?.length ? ` · titles: ${source.title_keywords.join(", ")}` : " · all uploads"}</p>
                <p className="mt-1 text-xs text-muted">Last successful check: {formatDate(source.last_success_at)}</p>
                {source.last_error && <p className="mt-2 text-xs text-rose-700">Last error: {source.last_error}</p>}
              </div>
              <button type="button" className="button secondary compact" onClick={() => void toggleSource(source)}>{source.is_enabled ? "Pause" : "Resume"}</button>
            </div>
          </article>)}
        </div>}
      </section>
    </div>
  );
}
