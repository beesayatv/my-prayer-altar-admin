"use client";

import React, { useState } from "react";

interface MarkdownFormattingGuideProps {
  textareaId?: string;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
  value?: string;
  onChange?: (newValue: string) => void;
  showToolbar?: boolean;
}

export function MarkdownFormattingGuide({
  textareaRef,
  value,
  onChange,
  showToolbar = true,
}: MarkdownFormattingGuideProps) {
  const [showCheatSheet, setShowCheatSheet] = useState(false);

  const applyFormat = (prefix: string, suffix: string = "", defaultText: string = "text") => {
    if (!textareaRef?.current || onChange === undefined || value === undefined) return;

    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = value.substring(start, end) || defaultText;

    const replacement = `${prefix}${selectedText}${suffix}`;
    const newValue = value.substring(0, start) + replacement + value.substring(end);

    onChange(newValue);

    // Restore focus and cursor selection
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(
        start + prefix.length,
        start + prefix.length + selectedText.length
      );
    }, 0);
  };

  return (
    <div
      className="mt-2 text-xs rounded-lg p-2.5 space-y-2"
      style={{
        backgroundColor: "var(--paper)",
        borderColor: "var(--line)",
        borderWidth: "1px",
        borderStyle: "solid",
        color: "var(--muted)",
      }}
    >
      {showToolbar && (
        <div
          className="flex flex-wrap items-center gap-1.5 pb-1.5"
          style={{ borderBottom: "1px solid var(--line)" }}
        >
          <span
            className="font-semibold mr-1 text-[11px] uppercase tracking-wider"
            style={{ color: "var(--ink)" }}
          >
            Format:
          </span>
          <button
            type="button"
            onClick={() => applyFormat("**", "**", "bold text")}
            className="px-2 py-0.5 rounded font-bold cursor-pointer transition-colors"
            style={{
              backgroundColor: "var(--ivory)",
              borderColor: "var(--line)",
              borderWidth: "1px",
              borderStyle: "solid",
              color: "var(--ink)",
            }}
            title="Bold text"
          >
            B
          </button>
          <button
            type="button"
            onClick={() => applyFormat("*", "*", "italic text")}
            className="px-2 py-0.5 rounded italic cursor-pointer transition-colors"
            style={{
              backgroundColor: "var(--ivory)",
              borderColor: "var(--line)",
              borderWidth: "1px",
              borderStyle: "solid",
              color: "var(--ink)",
            }}
            title="Italic text"
          >
            I
          </button>
          <button
            type="button"
            onClick={() => applyFormat("> ", "", "Quoted reflection or verse")}
            className="px-2 py-0.5 rounded cursor-pointer transition-colors"
            style={{
              backgroundColor: "var(--ivory)",
              borderColor: "var(--line)",
              borderWidth: "1px",
              borderStyle: "solid",
              color: "var(--ink)",
            }}
            title="Quote / Callout block"
          >
            &quot; Quote
          </button>
          <button
            type="button"
            onClick={() => applyFormat("[", "](https://)", "link text")}
            className="px-2 py-0.5 rounded cursor-pointer transition-colors font-medium underline"
            style={{
              backgroundColor: "var(--ivory)",
              borderColor: "var(--line)",
              borderWidth: "1px",
              borderStyle: "solid",
              color: "var(--ink)",
            }}
            title="Link (href)"
          >
            🔗 Link
          </button>
          <button
            type="button"
            onClick={() => applyFormat("- ", "", "List item")}
            className="px-2 py-0.5 rounded cursor-pointer transition-colors"
            style={{
              backgroundColor: "var(--ivory)",
              borderColor: "var(--line)",
              borderWidth: "1px",
              borderStyle: "solid",
              color: "var(--ink)",
            }}
            title="Bullet point"
          >
            • Bullet
          </button>

          <button
            type="button"
            onClick={() => setShowCheatSheet(!showCheatSheet)}
            className="ml-auto text-[11px] font-medium hover:underline cursor-pointer"
            style={{ color: "var(--wine)" }}
          >
            {showCheatSheet ? "Hide Guide ▲" : "Formatting Guide ▼"}
          </button>
        </div>
      )}

      {(!showToolbar || showCheatSheet) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 pt-1 text-[11px] leading-relaxed">
          <div>
            <span
              className="font-mono px-1 py-0.5 rounded"
              style={{
                backgroundColor: "var(--ivory)",
                border: "1px solid var(--line)",
                color: "var(--ink)",
              }}
            >
              **Bold Text**
            </span>{" "}
            &rarr; <strong style={{ color: "var(--ink)" }}>Bold Text</strong> in App
          </div>
          <div>
            <span
              className="font-mono px-1 py-0.5 rounded"
              style={{
                backgroundColor: "var(--ivory)",
                border: "1px solid var(--line)",
                color: "var(--ink)",
              }}
            >
              *Italic Text*
            </span>{" "}
            &rarr; <em style={{ color: "var(--ink)" }}>Italic Text</em> in App
          </div>
          <div>
            <span
              className="font-mono px-1 py-0.5 rounded"
              style={{
                backgroundColor: "var(--ivory)",
                border: "1px solid var(--line)",
                color: "var(--ink)",
              }}
            >
              &gt; Quote sentence
            </span>{" "}
            &rarr; Indented Reflection Quote
          </div>
          <div>
            <span
              className="font-mono px-1 py-0.5 rounded"
              style={{
                backgroundColor: "var(--ivory)",
                border: "1px solid var(--line)",
                color: "var(--ink)",
              }}
            >
              - Bullet item
            </span>{" "}
            &rarr; • Bullet point
          </div>
          <div>
            <span
              className="font-mono px-1 py-0.5 rounded"
              style={{
                backgroundColor: "var(--ivory)",
                border: "1px solid var(--line)",
                color: "var(--ink)",
              }}
            >
              [Text](url)
            </span>{" "}
            &rarr; <span style={{ color: "var(--wine)", textDecoration: "underline" }}>Text (Link)</span>
          </div>
          <div
            className="col-span-1 sm:col-span-2 font-medium pt-1"
            style={{ color: "var(--ink)" }}
          >
            💡 <span className="underline decoration-dotted">Paragraph Spacing</span>: Press{" "}
            <kbd
              className="px-1 py-0.5 rounded font-mono text-[10px]"
              style={{
                backgroundColor: "var(--ivory)",
                border: "1px solid var(--line)",
                color: "var(--ink)",
              }}
            >
              Enter
            </kbd>{" "}
            twice to create clear paragraph breaks.
          </div>
        </div>
      )}
    </div>
  );
}

