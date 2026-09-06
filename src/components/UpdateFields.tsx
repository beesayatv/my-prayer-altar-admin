"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Field } from "@/components/ContentEditor";
import { MediaGallery } from "@/components/MediaGallery";
import { MarkdownFormattingGuide } from "@/components/MarkdownFormattingGuide";
import { requireSupabase, adminAuthorizationHeader } from "@/lib/supabase";

export function UpdateFields({
  contentId,
  initialExcerpt = "",
  initialBody = "",
  heading = "Update",
  bodyHelp = "Write the announcement, event, or timely Catholic news story.",
  showImportUrl = true,
  onApplyGenerated,
}: {
  contentId?: string;
  initialExcerpt?: string;
  initialBody?: string;
  heading?: string;
  bodyHelp?: string;
  showImportUrl?: boolean;
  onApplyGenerated?: (draft: { title: string; slug: string; excerpt: string; body: string }) => void;
}) {
  const [excerptValue, setExcerptValue] = useState(initialExcerpt);
  const [bodyValue, setBodyValue] = useState(initialBody);
  const bodyTextareaRef = useRef<HTMLTextAreaElement>(null);

  const [importUrl, setImportUrl] = useState("");
  const [importLength, setImportLength] = useState<"short" | "standard" | "long">("standard");
  const [isImporting, setIsImporting] = useState(false);
  const [importMessage, setImportMessage] = useState("");
  const [defaultModelLabel, setDefaultModelLabel] = useState("Gemini 2.5 Flash (Recommended)");

  // Load configured default model from Text Studio
  useEffect(() => {
    void (async () => {
      try {
        const client = requireSupabase();
        const { data } = await client
          .from("automation_configs")
          .select("config_json")
          .eq("content_type", "catholic_news")
          .maybeSingle();

        const model = (data?.config_json as { ai?: { model?: string } })?.ai?.model || "gpt-4o-mini";
        const modelNames: Record<string, string> = {
          "gemini-3.6-flash": "Google Gemini 3.6 Flash (Fast factual extraction)",
          "gemini-2.5-pro": "Google Gemini 2.5 Pro (Deep Theological Reasoning)",
          "gpt-4o-mini": "OpenAI GPT-4o Mini (Fast Standard)",
          "gpt-4o": "OpenAI GPT-4o (Flagship)",
        };
        setDefaultModelLabel(modelNames[model] || model);
      } catch (err) {
        console.error("Failed to load news drafting model config:", err);
      }
    })();
  }, []);

  // Update internal state if props change (e.g. switching between items)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setExcerptValue(initialExcerpt);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBodyValue(initialBody);
  }, [initialExcerpt, initialBody]);

  async function handleImportUrl() {
    if (!importUrl) {
      setImportMessage("Please enter a valid URL.");
      return;
    }

    setIsImporting(true);
    setImportMessage("");

    try {
      const authHeaders = await adminAuthorizationHeader();
      
      const response = await fetch("/api/admin/content/import-update", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          ...authHeaders
        },
        body: JSON.stringify({ url: importUrl, length: importLength }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to import from URL.");
      }

      setExcerptValue(data.draft.excerpt);
      setBodyValue(data.draft.body);

      if (onApplyGenerated) {
        onApplyGenerated(data.draft);
      }

      setImportMessage("Draft generated successfully! Review the content below.");
      setImportUrl("");
    } catch (error) {
      setImportMessage(error instanceof Error ? error.message : "An unexpected error occurred.");
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <>
      {showImportUrl && (
        <div className="card mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
            <h3 className="card-title m-0">✨ Import from URL</h3>
            <span className="text-[11.5px] px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold self-start sm:self-auto border border-amber-200">
              AI Assistant
            </span>
          </div>
          <p className="text-sm text-muted mb-4">
            Paste a link to a Catholic news article, event, or announcement to automatically generate a draft update.
          </p>

          {/* Inherited Engine Banner */}
          <div className="mb-5 p-3 bg-beige/50 border border-gold/40 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 text-ink">
              <span className="text-gold font-bold">✦</span>
              <span>
                Drafting Engine: <strong className="font-semibold text-wine">{defaultModelLabel}</strong>
              </span>
            </div>
            <Link href="/settings/text-studio" className="text-wine hover:text-wine-dark font-semibold underline shrink-0">
              Change in Text Studio →
            </Link>
          </div>

          <div className="form-grid">
            <Field label="Source URL" help="Must be a public webpage (e.g. a Vatican News article).">
              <input
                type="url"
                className="input w-full"
                placeholder="https://..."
                value={importUrl}
                onChange={(e) => setImportUrl(e.target.value)}
                disabled={isImporting}
              />
            </Field>
            <div className="flex gap-4 items-end">
              <Field label="Target Length">
                <select
                  className="select w-48"
                  value={importLength}
                  onChange={(e) => setImportLength(e.target.value as "short" | "standard" | "long")}
                  disabled={isImporting}
                >
                  <option value="short">Short (~150 words)</option>
                  <option value="standard">Standard (~300 words)</option>
                  <option value="long">Long (~500 words)</option>
                </select>
              </Field>
              <div className="field">
                <div className="mt-1">
                  <button
                    type="button"
                    className="button secondary"
                    onClick={handleImportUrl}
                    disabled={isImporting || !importUrl}
                  >
                    {isImporting ? "Importing..." : "Generate Draft"}
                  </button>
                </div>
              </div>
            </div>
          </div>
          {importMessage && (
            <p className={`mt-4 text-sm font-medium ${importMessage.includes("success") ? "text-green-600" : "text-red-600"}`}>
              {importMessage}
            </p>
          )}
        </div>
      )}

      <div className="card">
        <h3 className="card-title">{heading}</h3>
        <div className="form-grid">
          <Field label="Excerpt" help="A short introduction for the Today feed.">
            <textarea
              className="textarea"
              name="excerpt"
              required
              style={{ minHeight: "80px" }}
              value={excerptValue}
              onChange={(e) => setExcerptValue(e.target.value)}
            />
          </Field>
          <Field label="Body" help={bodyHelp}>
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
