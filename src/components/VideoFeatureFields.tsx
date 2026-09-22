"use client";

import { useMemo, useState } from "react";
import { youtubeThumbnailUrl, youtubeVideoId } from "@/lib/youtube";
import { Field } from "@/components/ContentEditor";

export function VideoFeatureFields({ initialVideoUrl = "", initialVideoLabel = "", initialExcerpt = "", initialBody = "", initialSourceLocation = "" }: { initialVideoUrl?: string; initialVideoLabel?: string; initialExcerpt?: string; initialBody?: string; initialSourceLocation?: string | null }) {
  const [url, setUrl] = useState(initialVideoUrl);
  const videoId = useMemo(() => youtubeVideoId(url), [url]);
  return <div className="card">
    <h3 className="card-title">YouTube Video</h3>
    <div className="form-grid">
      <Field label="YouTube URL" help="Paste a YouTube watch, short, embed, or youtu.be URL.">
        <input className="input" name="video_url" type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://www.youtube.com/watch?v=..." required />
      </Field>
      <Field label="Video label" help="Optional. Shown with the video, for example “Mass Video”.">
        <input className="input" name="video_label" type="text" defaultValue={initialVideoLabel} maxLength={48} placeholder="Video" />
      </Field>
      <Field label="Source location" help="Required for a published video to appear in the Videos tab.">
        <select className="select" name="video_source_location" defaultValue={initialSourceLocation || ""} required>
          <option value="" disabled>Select a source location</option>
          <option value="cebu">Cebu</option>
          <option value="quiapo">Quiapo</option>
        </select>
      </Field>
      {url && !videoId && <p className="text-sm text-red-700">Enter a valid YouTube video URL.</p>}
      {videoId && <div className="col-span-full overflow-hidden rounded-xl border border-line bg-black">
        <img className="block aspect-video w-full object-cover" src={youtubeThumbnailUrl(videoId)} alt="Derived YouTube thumbnail preview" />
      </div>}
      <Field label="Excerpt" help="A short introduction shown with the video.">
        <textarea className="input min-h-24" name="excerpt" defaultValue={initialExcerpt} required />
      </Field>
      <Field label="Description" help="Optional supporting text displayed below the player.">
        <textarea className="input min-h-48" name="body" defaultValue={initialBody} />
      </Field>
    </div>
  </div>;
}
