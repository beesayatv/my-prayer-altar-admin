"use client";

import { useState, useRef, useEffect } from "react";
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
  onApplyGenerated,
}: {
  contentId?: string;
  initialExcerpt?: string;
  initialBody?: string;
  heading?: string;
  bodyHelp?: string;
  onApplyGenerated?: (draft: { title: string; slug: string; excerpt: string; body: string }) => void;
}) {
  const [excerptValue, setExcerptValue] = useState(initialExcerpt);
  const [bodyValue, setBodyValue] = useState(initialBody);
  const bodyTextareaRef = useRef<HTMLTextAreaElement>(null);

  const [importUrl, setImportUrl] = useState("");
  const [importLength, setImportLength] = useState<"short" | "standard" | "long">("standard");
  const [isImporting, setIsImporting] = useState(false);
  const [importMessage, setImportMessage] = useState("");

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
      <div className="card mb-8">
        <h3 className="card-title">✨ Import from URL</h3>
        <p className="text-sm text-muted mb-4">
          Paste a link to a Catholic news article, event, or announcement to automatically generate a draft update.
        </p>
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

