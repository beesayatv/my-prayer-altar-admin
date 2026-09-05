"use client";

import { useState, useEffect } from "react";
import { EntityPickerModal } from "./EntityPickerModal";
import { adminAuthorizationHeader } from "@/lib/supabase";

export interface BibleBlockInput {
  id: string;
  type: "rich_text" | "image" | "scripture" | "entity_callout";
  content?: string;
  media_path?: string;
  caption?: string;
  entity_id?: string;
  entity_type?: string;
  custom_headline?: string;
  reference?: string;
  text?: string;
  visual_prompt?: string;
}

export function BlockEditor({
  blocks,
  onChange
}: {
  blocks: BibleBlockInput[];
  onChange: (blocks: BibleBlockInput[]) => void;
}) {
  const [activePickerIndex, setActivePickerIndex] = useState<number | null>(null);
  const [activePickerTag, setActivePickerTag] = useState<any | null>(null);
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);
  
  const [entities, setEntities] = useState<any[]>([]);
  const [loadingEntities, setLoadingEntities] = useState(true);

  useEffect(() => {
    async function loadEntities() {
      try {
        const authHeaders = await adminAuthorizationHeader();
        const res = await fetch("/api/admin/bible/entities", { headers: authHeaders });
        const json = await res.json();
        if (json.entities) {
          setEntities(json.entities);
        }
      } catch (err) {
        console.error("Failed to load entities for auditor", err);
      } finally {
        setLoadingEntities(false);
      }
    }
    loadEntities();
  }, []);

  const addBlock = (type: BibleBlockInput["type"]) => {
    const newBlock: BibleBlockInput = {
      id: "blk_" + Math.random().toString(36).substring(2, 9),
      type,
      content: type === "rich_text" ? "" : undefined,
      media_path: type === "image" ? "" : undefined,
      reference: type === "scripture" ? "" : undefined,
      text: type === "scripture" ? "" : undefined
    };
    onChange([...blocks, newBlock]);
  };

  const updateBlock = (index: number, fields: Partial<BibleBlockInput>) => {
    const updated = [...blocks];
    updated[index] = { ...updated[index], ...fields };
    onChange(updated);
  };

  const moveBlock = (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= blocks.length) return;
    const updated = [...blocks];
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;
    onChange(updated);
  };

  const removeBlock = (index: number) => {
    onChange(blocks.filter((_, i) => i !== index));
  };

  const handleImageUpload = async (index: number, file: File) => {
    setUploadingIndex(index);
    try {
      const authHeaders = await adminAuthorizationHeader();
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder", "bible/content");

      const res = await fetch("/api/admin/bible/upload-cover", {
        method: "POST",
        headers: authHeaders,
        body: formData
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);

      updateBlock(index, { media_path: json.storagePath });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Image upload failed.");
    } finally {
      setUploadingIndex(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-bold text-ink text-sm">Content Blocks Stream ({blocks.length})</h4>
        <div className="flex gap-2">
          <button type="button" onClick={() => addBlock("rich_text")} className="button secondary compact text-xs">
            + Text Block
          </button>
          <button type="button" onClick={() => addBlock("image")} className="button secondary compact text-xs">
            + Image
          </button>
          <button type="button" onClick={() => addBlock("scripture")} className="button secondary compact text-xs">
            + Scripture
          </button>
          <button type="button" onClick={() => addBlock("entity_callout")} className="button secondary compact text-xs">
            + Entity Callout
          </button>
        </div>
      </div>

      {blocks.length === 0 ? (
        <div className="p-8 border border-dashed border-line rounded-xl text-center text-muted text-sm">
          No content blocks added yet. Click an option above to build the chapter stream.
        </div>
      ) : (
        blocks.map((blk, idx) => (
          <div key={blk.id || idx} className="p-4 border border-line rounded-xl bg-white shadow-sm relative space-y-3">
            <div className="flex items-center justify-between border-b border-line/60 pb-2">
              <span className="text-xs font-bold text-amber-700 uppercase tracking-wider">
                #{idx + 1} {blk.type.replace("_", " ")}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={idx === 0}
                  onClick={() => moveBlock(idx, "up")}
                  className="px-2 py-0.5 text-xs bg-beige rounded disabled:opacity-30"
                >
                  ▲
                </button>
                <button
                  type="button"
                  disabled={idx === blocks.length - 1}
                  onClick={() => moveBlock(idx, "down")}
                  className="px-2 py-0.5 text-xs bg-beige rounded disabled:opacity-30"
                >
                  ▼
                </button>
                <button
                  type="button"
                  onClick={() => removeBlock(idx)}
                  className="px-2 py-0.5 text-xs bg-rose-100 text-rose-700 rounded hover:bg-rose-200"
                >
                  Remove
                </button>
              </div>
            </div>

            {/* Block Type Fields */}
            {blk.type === "rich_text" && (
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-semibold text-ink/70">Narrative Text</label>
                  <button
                    type="button"
                    onClick={() => {
                      setActivePickerIndex(idx);
                      setActivePickerTag(null);
                    }}
                    className="text-xs text-amber-700 font-semibold bg-amber-50 px-2 py-1 rounded hover:bg-amber-100"
                  >
                    + Link Entity (@)
                  </button>
                </div>
                <textarea
                  rows={4}
                  value={blk.content || ""}
                  onChange={(e) => updateBlock(idx, { content: e.target.value })}
                  placeholder="Write narrative content... Use '+ Link Entity' to tag canonical records."
                  className="textarea w-full text-sm"
                />
                
                {/* Entity Link Validation Auditor */}
                <EntityAuditor
                  content={blk.content || ""}
                  onUpdateContent={(newContent) => updateBlock(idx, { content: newContent })}
                  allEntities={entities}
                  onSearchAll={(tag) => {
                    setActivePickerIndex(idx);
                    setActivePickerTag(tag);
                  }}
                />
              </div>
            )}

            {blk.type === "image" && (
              <div className="space-y-2">
                <label className="text-xs font-semibold text-ink/70">Bunny CDN Image Storage Path</label>
                <input
                  type="text"
                  value={blk.media_path || ""}
                  onChange={(e) => updateBlock(idx, { media_path: e.target.value })}
                  placeholder="bible/stories/life-of-jesus/ch1.webp"
                  className="input w-full font-mono text-xs"
                />
                <div className="flex items-center gap-3 py-1">
                  <label
                    htmlFor={`file-upload-${blk.id || idx}`}
                    className="button secondary compact text-xs cursor-pointer flex items-center gap-1.5 font-semibold"
                  >
                    <svg className="w-3.5 h-3.5 text-amber-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    Upload Image File
                  </label>
                  <input
                    id={`file-upload-${blk.id || idx}`}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleImageUpload(idx, file);
                    }}
                    className="hidden"
                  />
                  {uploadingIndex === idx ? (
                    <span className="text-xs text-amber-600 font-semibold animate-pulse">Uploading to Bunny CDN...</span>
                  ) : blk.media_path ? (
                    <span className="text-xs text-emerald-700 font-medium">✓ Uploaded to Bunny CDN</span>
                  ) : null}
                </div>
                <input
                  type="text"
                  value={blk.caption || ""}
                  onChange={(e) => updateBlock(idx, { caption: e.target.value })}
                  placeholder="Optional image caption..."
                  className="input w-full text-xs"
                />
                <div className="pt-2">
                  <label className="text-xs font-semibold text-ink/70">AI Visual Prompt (For ChatGPT/Gemini)</label>
                  <textarea
                    rows={4}
                    value={blk.visual_prompt || ""}
                    onChange={(e) => updateBlock(idx, { visual_prompt: e.target.value })}
                    placeholder="AI generated copy-pasteable prompt for DALL-E or Gemini..."
                    className="textarea w-full text-xs font-mono bg-beige/10"
                  />
                </div>
              </div>
            )}

            {blk.type === "scripture" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-ink/70">Scripture Reference &amp; Passage</label>
                  <button
                    type="button"
                    onClick={() => {
                      setActivePickerIndex(idx);
                      setActivePickerTag(null);
                    }}
                    className="text-xs text-amber-700 font-semibold bg-amber-50 px-2 py-1 rounded hover:bg-amber-100"
                  >
                    + Pick Reusable Scripture Entity
                  </button>
                </div>
                <input
                  type="text"
                  value={blk.reference || ""}
                  onChange={(e) => updateBlock(idx, { reference: e.target.value })}
                  placeholder="Scripture Reference (e.g. Matthew 3:13-17)"
                  className="input w-full text-sm font-semibold"
                />
                <textarea
                  rows={3}
                  value={blk.text || ""}
                  onChange={(e) => updateBlock(idx, { text: e.target.value })}
                  placeholder="Passage text..."
                  className="textarea w-full text-sm font-serif"
                />
              </div>
            )}

            {blk.type === "entity_callout" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-ink/70">Attached Entity ID</label>
                  <button
                    type="button"
                    onClick={() => {
                      setActivePickerIndex(idx);
                      setActivePickerTag(null);
                    }}
                    className="button secondary compact text-xs"
                  >
                    {blk.entity_id ? "Change Entity" : "Select Entity"}
                  </button>
                </div>
                <input
                  type="text"
                  readOnly
                  value={blk.entity_id || "No entity selected"}
                  className="input w-full text-xs font-mono bg-sand/20"
                />
                <input
                  type="text"
                  value={blk.custom_headline || ""}
                  onChange={(e) => updateBlock(idx, { custom_headline: e.target.value })}
                  placeholder="Custom Headline (e.g. Key Person: John the Baptist)"
                  className="input w-full text-xs"
                />
              </div>
            )}
          </div>
        ))
      )}

      {/* Entity Picker Modal */}
      <EntityPickerModal
        isOpen={activePickerIndex !== null}
        onClose={() => {
          setActivePickerIndex(null);
          setActivePickerTag(null);
        }}
        onSelectEntity={(entity) => {
          if (activePickerIndex === null) return;
          const targetBlock = blocks[activePickerIndex];
          if (targetBlock.type === "rich_text") {
            if (activePickerTag) {
              const newToken = `[[entity:${entity.id}:${entity.entity_type}|${activePickerTag.label}]]`;
              const newContent = (targetBlock.content || "").replace(activePickerTag.raw, newToken);
              updateBlock(activePickerIndex, { content: newContent });
              setActivePickerTag(null);
            } else {
              const token = `[[entity:${entity.id}:${entity.entity_type}|${entity.name}]]`;
              updateBlock(activePickerIndex, {
                content: (targetBlock.content || "") + " " + token
              });
            }
          } else if (targetBlock.type === "scripture") {
            updateBlock(activePickerIndex, {
              entity_id: entity.id,
              reference: entity.name,
              text: targetBlock.text || entity.summary
            });
          } else if (targetBlock.type === "entity_callout") {
            updateBlock(activePickerIndex, {
              entity_id: entity.id,
              entity_type: entity.entity_type,
              custom_headline: `Key ${entity.entity_type.toUpperCase()}: ${entity.name}`
            });
          }
          setActivePickerIndex(null);
        }}
      />
    </div>
  );
}

function EntityAuditor({
  content,
  onUpdateContent,
  allEntities,
  onSearchAll
}: {
  content: string;
  onUpdateContent: (newContent: string) => void;
  allEntities: any[];
  onSearchAll: (tag: any) => void;
}) {
  const [openDropdownIdx, setOpenDropdownIdx] = useState<number | null>(null);

  // Parse tags using robust regex matching up to next colon
  const regex = /\[\[entity:([^:]+):([a-z_]+)\|([^\]]+)\]\]/g;
  const tags: Array<{
    raw: string;
    idOrSlug: string;
    type: string;
    label: string;
    index: number;
  }> = [];

  let match;
  while ((match = regex.exec(content)) !== null) {
    tags.push({
      raw: match[0],
      idOrSlug: match[1],
      type: match[2],
      label: match[3],
      index: match.index
    });
  }

  if (tags.length === 0) return null;

  return (
    <div className="mt-2 p-3 bg-beige/10 border border-line rounded-lg space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-ink/75">
        <svg className="w-3.5 h-3.5 text-amber-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span>Entity Links Auditor</span>
      </div>

      <div className="flex flex-wrap gap-2">
        {tags.map((tag, idx) => {
          // Resolve entity by ID or Slug
          const resolved = allEntities.find(
            e => e.id === tag.idOrSlug || e.slug === tag.idOrSlug
          );

          let status: "ok" | "mismatch" | "not_found" = "ok";
          if (!resolved) {
            status = "not_found";
          } else {
            const labelLower = tag.label.toLowerCase();
            const nameMatch = resolved.name.toLowerCase() === labelLower ||
                              resolved.short_title?.toLowerCase() === labelLower ||
                              resolved.slug.toLowerCase() === labelLower;
            if (!nameMatch) {
              status = "mismatch";
            }
          }

          // Suggest matches fuzzy
          const labelLower = tag.label.toLowerCase();
          const suggestions = allEntities.filter(e => {
            if (resolved && e.id === resolved.id) return false;
            return (
              e.name.toLowerCase().includes(labelLower) ||
              labelLower.includes(e.name.toLowerCase()) ||
              e.short_title?.toLowerCase()?.includes(labelLower) ||
              e.slug.toLowerCase().includes(labelLower) ||
              (e.aliases && e.aliases.some((a: string) => a.toLowerCase().includes(labelLower)))
            );
          }).slice(0, 4);

          // Badge style
          let badgeClass = "bg-emerald-50 border-emerald-200 text-emerald-800";
          let statusIcon = "✓";
          let statusText = `linked to ${resolved?.name} (${resolved?.entity_type})`;

          if (status === "mismatch") {
            badgeClass = "bg-amber-50 border-amber-300 text-amber-900";
            statusIcon = "⚠️";
            statusText = `resolves to ${resolved?.name} (mismatch)`;
          } else if (status === "not_found") {
            badgeClass = "bg-rose-50 border-rose-200 text-rose-800";
            statusIcon = "❌";
            statusText = "Entity Not Found";
          }

          const isOpen = openDropdownIdx === idx;

          return (
            <div key={idx} className="relative">
              <button
                type="button"
                onClick={() => setOpenDropdownIdx(isOpen ? null : idx)}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-xs border rounded-lg font-medium transition-all shadow-sm ${badgeClass} hover:brightness-95`}
              >
                <span>{statusIcon}</span>
                <span className="font-bold border-b border-dotted border-current">{tag.label}</span>
                <span className="opacity-75 font-normal text-[10px]">({statusText})</span>
                <span className="text-[9px] opacity-60">▼</span>
              </button>

              {isOpen && (
                <div className="absolute left-0 mt-1 w-72 bg-white border border-line rounded-xl shadow-xl z-30 p-3 space-y-3">
                  <div className="flex items-center justify-between border-b border-line pb-1.5">
                    <span className="text-xs font-bold text-ink">Entity Correction</span>
                    <button
                      type="button"
                      onClick={() => setOpenDropdownIdx(null)}
                      className="text-muted hover:text-ink text-sm"
                    >
                      ✕
                    </button>
                  </div>

                  {/* Suggestions List */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-muted block">Suggested Matches</span>
                    {suggestions.length === 0 ? (
                      <span className="text-xs text-muted italic block py-0.5">No similar entities found.</span>
                    ) : (
                      <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                        {suggestions.map((sug) => (
                          <div
                            key={sug.id}
                            className="p-2 border border-line rounded-lg bg-beige/5 hover:bg-beige/10 flex flex-col gap-1 text-left"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-ink">{sug.name} <span className="text-[9px] opacity-60">({sug.entity_type})</span></span>
                              <button
                                type="button"
                                onClick={() => {
                                  const newToken = `[[entity:${sug.id}:${sug.entity_type}|${tag.label}]]`;
                                  const newContent = content.replace(tag.raw, newToken);
                                  onUpdateContent(newContent);
                                  setOpenDropdownIdx(null);
                                }}
                                className="px-2 py-0.5 bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-800 text-[10px] font-bold rounded"
                              >
                                Select
                              </button>
                            </div>
                            {sug.summary && (
                              <p className="text-[10px] text-muted line-clamp-2">
                                {sug.summary.split('. ')[0]}.
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Actions Block */}
                  <div className="border-t border-line pt-2 flex flex-col gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        onSearchAll(tag);
                        setOpenDropdownIdx(null);
                      }}
                      className="w-full text-left px-2 py-1 text-xs text-amber-800 font-semibold hover:bg-amber-50 rounded"
                    >
                      🔍 Search all entities...
                    </button>
                    
                    <button
                      type="button"
                      onClick={() => {
                        const newContent = content.replace(tag.raw, tag.label);
                        onUpdateContent(newContent);
                        setOpenDropdownIdx(null);
                      }}
                      className="w-full text-left px-2 py-1 text-xs text-rose-700 font-semibold hover:bg-rose-50 rounded"
                    >
                      🗑 Remove link (keep plain text)
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
