"use client";

import { useEffect, useRef, useState } from "react";
import { Field } from "@/components/ContentEditor";
import { requireSupabase } from "@/lib/supabase";
import { MarkdownFormattingGuide } from "@/components/MarkdownFormattingGuide";


export type AiMetadataState = {
  creation_mode: "manual" | "ai_assisted" | "ai_generated";
  ai_provider: string;
  ai_model: string;
  generated_at: string;
  prompt_version: string;
};

type DraftPreviewData = {
  title: string;
  intention: string;
  excerpt: string;
  body: string;
  metadata: AiMetadataState;
};

export function PrayerFields({
  metadata = {},
  initialExcerpt = "",
  initialBody = "",
  contentId,
  onApplyAiDraft,
}: {
  metadata?: Record<string, string>;
  initialExcerpt?: string;
  initialBody?: string;
  contentId?: string;
  onApplyAiDraft?: (draft: { title: string; intention: string; excerpt: string; body: string; aiMetadata: AiMetadataState }) => void;
}) {
  const [isAssistantExpanded, setIsAssistantExpanded] = useState(false);


  // Form input states for AI Assistant
  const [aiIntention, setAiIntention] = useState(metadata.intention ?? "");
  const [aiContext, setAiContext] = useState("");
  const [aiLanguage, setAiLanguage] = useState<"en" | "ceb" | "fil">("en");
  const [aiLength, setAiLength] = useState<"short" | "standard" | "long">("standard");
  const [aiInspiration, setAiInspiration] = useState("");

  // Generation execution states
  const [isGenerating, setIsGenerating] = useState(false);
  const [genError, setGenError] = useState("");
  const [previewData, setPreviewData] = useState<DraftPreviewData | null>(null);

  // Form field states (controlled so AI draft can apply directly)
  const [formIntention, setFormIntention] = useState(metadata.intention ?? "");
  const [formAuthor, setFormAuthor] = useState(metadata.author ?? "");
  const [formExcerpt, setFormExcerpt] = useState(initialExcerpt);
  const [formBody, setFormBody] = useState(initialBody);
  const bodyTextareaRef = useRef<HTMLTextAreaElement>(null);

  async function handleGenerate(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!aiIntention.trim()) {
      setGenError("Please enter an Intention to generate a prayer draft.");
      return;
    }

    setIsGenerating(true);
    setGenError("");

    try {
      const supabase = requireSupabase();
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      const res = await fetch("/api/ai/generate-prayer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          intention: aiIntention,
          context: aiContext,
          language: aiLanguage,
          length: aiLength,
          inspiration: aiInspiration,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to generate prayer draft.");
      }

      setPreviewData({
        title: json.data.title,
        intention: json.data.intention,
        excerpt: json.data.excerpt,
        body: json.data.body,
        metadata: json.metadata,
      });
    } catch (err) {
      setGenError(err instanceof Error ? err.message : "Could not generate draft.");
    } finally {
      setIsGenerating(false);
    }
  }

  function handleApplyDraft() {
    if (!previewData) return;

    // Warning if form already contains text
    const hasExistingText = Boolean(formBody.trim() || formExcerpt.trim());
    if (hasExistingText) {
      const confirmReplace = window.confirm(
        "Your prayer form already contains text. Would you like to replace it with this AI draft?"
      );
      if (!confirmReplace) return;
    }

    // Apply values to local inputs
    setFormIntention(previewData.intention);
    setFormExcerpt(previewData.excerpt);
    setFormBody(previewData.body);

    // Forward to parent editor (Title, Excerpt, Body, Intention, AI Metadata)
    if (onApplyAiDraft) {
      onApplyAiDraft({
        title: previewData.title,
        intention: previewData.intention,
        excerpt: previewData.excerpt,
        body: previewData.body,
        aiMetadata: previewData.metadata,
      });
    }

    // Collapse preview and assistant panel
    setPreviewData(null);
    setIsAssistantExpanded(false);
  }

  return (
    <div className="card flex flex-col gap-6">
      <div className="flex justify-between items-center border-b border-line pb-3">
        <h3 className="card-title m-0 border-0 pb-0">Prayer</h3>

        <button
          type="button"
          className="button secondary compact flex items-center gap-2"
          onClick={() => setIsAssistantExpanded((prev) => !prev)}
        >
          <span>✨ AI Draft Assistant</span>
          <span className="text-xs">{isAssistantExpanded ? "▲" : "▼"}</span>
        </button>
      </div>

      {/* Expandable AI Draft Assistant */}
      {isAssistantExpanded && (
        <div className="bg-beige/40 border border-gold/30 rounded-xl p-5 flex flex-col gap-5">
          <div>
            <div className="flex items-center gap-2 font-bold text-wine text-base">
              <span>✨ AI Draft Assistant</span>
            </div>
            <p className="text-xs text-muted mt-1 m-0">
              Generate an editable draft. Nothing is saved or published until you approve it.
            </p>
          </div>

          <div className="form-grid">
            <div className="form-columns">
              <Field label="🙏 Intention (Required)" help="What or who is this prayer for?">
                <input
                  className="input"
                  value={aiIntention}
                  onChange={(e) => {
                    setAiIntention(e.target.value);
                    setFormIntention(e.target.value);
                  }}
                  placeholder="e.g. Guidance during difficult decisions"
                />
              </Field>

              <Field label="🌐 Language" help="Language for the generated draft">
                <select
                  className="select"
                  value={aiLanguage}
                  onChange={(e) => setAiLanguage(e.target.value as "en" | "ceb" | "fil")}
                >
                  <option value="en">English</option>
                  <option value="ceb">Cebuano</option>
                  <option value="fil">Filipino</option>
                </select>
              </Field>
            </div>

            <div className="form-columns">
              <Field label="📏 Length" help="Target prayer word count">
                <select
                  className="select"
                  value={aiLength}
                  onChange={(e) => setAiLength(e.target.value as "short" | "standard" | "long")}
                >
                  <option value="short">Short (~100 words)</option>
                  <option value="standard">Standard (~200 words)</option>
                  <option value="long">Long (~350 words)</option>
                </select>
              </Field>

              <Field label="📜 Optional Inspiration" help="Scripture reference, Saint, or specific Theme">
                <input
                  className="input"
                  value={aiInspiration}
                  onChange={(e) => setAiInspiration(e.target.value)}
                  placeholder="e.g. Inspired by Psalm 23, St. Thérèse"
                />
              </Field>
            </div>

            <Field label="📝 Context & Details (Optional)" help="Specific circumstances or intentions to weave in">
              <textarea
                className="textarea"
                style={{ minHeight: "70px" }}
                value={aiContext}
                onChange={(e) => setAiContext(e.target.value)}
                placeholder="e.g. For a family going through illness, asking for comfort and strength..."
              />
            </Field>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              className="button shadow-md text-xs py-2.5 flex items-center gap-2"
              disabled={isGenerating || !aiIntention.trim()}
              onClick={() => void handleGenerate()}
            >
              {isGenerating ? (
                <>
                  <span className="animate-spin">⏳</span>
                  <span>Composing prayer with reverence...</span>
                </>
              ) : (
                <>
                  <span>✨ Generate AI Draft</span>
                </>
              )}
            </button>
          </div>

          {genError && (
            <div className="alert error text-xs" role="alert">
              {genError}
            </div>
          )}

          {/* AI Draft Preview Card */}
          {previewData && (
            <div className="bg-white border-2 border-gold rounded-xl p-5 mt-2 flex flex-col gap-4 shadow-md">
              <div className="flex justify-between items-center border-b border-line pb-3">
                <div className="flex items-center gap-2">
                  <span className="badge ready">AI Draft Ready</span>
                  <span className="text-xs text-muted">Review before applying to form</span>
                </div>
              </div>

              <div className="flex flex-col gap-3 text-sm">
                <div>
                  <span className="text-xs font-bold text-muted uppercase">Suggested Title:</span>
                  <p className="font-bold text-ink text-base m-0">{previewData.title}</p>
                </div>

                <div>
                  <span className="text-xs font-bold text-muted uppercase">Refined Intention:</span>
                  <p className="font-semibold text-wine m-0">{previewData.intention}</p>
                </div>

                <div>
                  <span className="text-xs font-bold text-muted uppercase">Excerpt:</span>
                  <p className="italic text-muted m-0">{previewData.excerpt}</p>
                </div>

                <div>
                  <span className="text-xs font-bold text-muted uppercase">Prayer Body:</span>
                  <div className="bg-ivory/60 p-4 rounded-lg border border-line text-ink font-serif whitespace-pre-wrap leading-relaxed mt-1">
                    {previewData.body}
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-2 border-t border-line">
                <button
                  type="button"
                  className="button compact text-xs"
                  onClick={handleApplyDraft}
                >
                  ✓ Apply Draft to Form
                </button>

                <button
                  type="button"
                  className="button secondary compact text-xs"
                  disabled={isGenerating}
                  onClick={() => void handleGenerate()}
                >
                  🔄 Regenerate
                </button>

                <button
                  type="button"
                  className="button secondary compact text-xs text-danger"
                  onClick={() => setPreviewData(null)}
                >
                  ✕ Discard Preview
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Main Prayer Form Fields */}
      <div className="form-grid">
        <div className="form-columns">
          <Field label="🙏 Intention" help="Special intention or focus (e.g. Inner Peace, Guidance)">
            <input
              className="input"
              name="intention"
              placeholder="e.g. For Healing and Peace"
              value={formIntention}
              onChange={(e) => {
                setFormIntention(e.target.value);
                setAiIntention(e.target.value);
              }}
            />
          </Field>
          <Field label="✍️ Author / Source" help="Saint, author, or traditional source (human managed)">
            <input
              className="input"
              name="author"
              placeholder="e.g. St. Jude, Reinhold Niebuhr, Traditional"
              value={formAuthor}
              onChange={(e) => setFormAuthor(e.target.value)}
            />
          </Field>
        </div>

        <Field label="Excerpt" help="Short summary for feed preview (defaults to body snippet if empty)">
          <textarea
            className="textarea"
            name="excerpt"
            placeholder="A short snippet for the feed card"
            style={{ minHeight: "80px" }}
            value={formExcerpt}
            onChange={(e) => setFormExcerpt(e.target.value)}
          />
        </Field>

        <Field label="Prayer Body" help="The full prayer text to be read and prayed">
          <textarea
            ref={bodyTextareaRef}
            className="textarea"
            name="body"
            placeholder="Write or paste the full prayer text here..."
            style={{ minHeight: "360px" }}
            value={formBody}
            onChange={(e) => setFormBody(e.target.value)}
          />
          <MarkdownFormattingGuide
            textareaRef={bodyTextareaRef}
            value={formBody}
            onChange={(val) => setFormBody(val)}
          />
        </Field>
      </div>
    </div>
  );
}
