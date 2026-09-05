"use client";

import { useState, useRef } from "react";
import { Field } from "@/components/ContentEditor";
import { MediaGallery } from "@/components/MediaGallery";
import { MarkdownFormattingGuide } from "@/components/MarkdownFormattingGuide";

export function ChurchFields({
  metadata = {},
  contentId,
  initialExcerpt = "",
  initialBody = "",
  initialLocation = "",
}: {
  metadata?: Record<string, string>;
  contentId?: string;
  initialExcerpt?: string;
  initialBody?: string;
  initialLocation?: string;
}) {
  const [bodyValue, setBodyValue] = useState(initialBody);
  const bodyTextareaRef = useRef<HTMLTextAreaElement>(null);

  const classifications = [
    "Parish Church", "Cathedral", "Minor Basilica", "Major Basilica",
    "National Shrine", "Diocesan Shrine", "Chapel", "Oratory",
  ];

  return (
    <>
      <div className="card">
        <h3 className="card-title">Church Context</h3>
        <div className="form-columns">
          <Field label="Classification" help="Its church designation, if useful to the story.">
            <select className="select" name="classification" defaultValue={metadata.church_classification ?? ""}>
              <option value="">Select status...</option>
              {classifications.map((classification) => <option key={classification} value={classification}>{classification}</option>)}
            </select>
          </Field>
          <Field label="Location" help="An area or city shown as context in the story.">
            <input className="input" name="location" placeholder="Area or city" defaultValue={initialLocation} />
          </Field>
        </div>
      </div>

      <div className="card">
        <h3 className="card-title">The Church Story</h3>
        <div className="form-grid">
          <Field label="Excerpt" help="A short introduction for the Today feed.">
            <textarea className="textarea" name="excerpt" required style={{ minHeight: "80px" }} defaultValue={initialExcerpt} />
          </Field>
          <Field label="Story" help="Tell the church's history, character, and significance.">
            <textarea
              ref={bodyTextareaRef}
              className="textarea"
              name="body"
              style={{ minHeight: "400px" }}
              value={bodyValue}
              onChange={(e) => setBodyValue(e.target.value)}
            />
            <MarkdownFormattingGuide
              textareaRef={bodyTextareaRef}
              value={bodyValue}
              onChange={(val) => setBodyValue(val)}
            />
          </Field>
        </div>
      </div>

      <MediaGallery contentId={contentId} />
    </>
  );
}

