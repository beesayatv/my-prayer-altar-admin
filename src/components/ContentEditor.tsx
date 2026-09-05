"use client";

import { FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { requireSupabase } from "@/lib/supabase";
import { CoverUpload } from "@/components/CoverUpload";
import { ChurchFields } from "@/components/ChurchFields";
import { PrayerFields, AiMetadataState } from "@/components/PrayerFields";
import { InspirationFields } from "@/components/InspirationFields";
import { NarrationManagerCard } from "@/components/NarrationManagerCard";
import { UpdateFields } from "@/components/UpdateFields";
import { BibleReadingFields } from "@/components/BibleReadingFields";


export type EditorContentItem = {
  id: string;
  type?: string;
  title: string;
  slug: string;
  language_code: string;
  excerpt: string;
  body: string | null;
  location_name: string | null;
  map_url: string | null;
  source_name: string | null;
  source_url: string | null;
  metadata: Record<string, string>;
  content_status: "draft" | "ready" | "archived";
  cover_media_id: string | null;
};

function toLocalDatetime(iso?: string) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  } catch { return ""; }
}

export function ContentEditor({
  initial,
  contentType = "church_highlight",
  onCoverChange
}: {
  initial?: EditorContentItem;
  contentType?: string;
  onCoverChange?: () => void;
}) {
  const router = useRouter();
  const activeType = initial?.type || contentType || "church_highlight";
  const typeLabel = activeType === "daily_prayer"
    ? "Daily Prayer"
    : activeType === "daily_inspiration"
      ? "Daily Inspiration"
      : activeType === "update"
        ? "Update"
        : activeType === "faith_story"
          ? "Faith Story"
        : activeType === "bible_reading"
          ? "Scripture & Reflection"
          : "Church Highlight";

  const [message, setMessage] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const [articlePreview, setArticlePreview] = useState<{ excerpt: string; body: string } | null>(null);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [slugEdited, setSlugEdited] = useState(Boolean(initial));
  const [intent, setIntent] = useState<"draft" | "ready" | "archived">("draft");
  const [isSaving, setIsSaving] = useState(false);

  const metadata = initial?.metadata ?? {};
  const [publishAt, setPublishAt] = useState(metadata.publish_at || "");
  const [expireAt, setExpireAt] = useState(metadata.expire_at || "");
  const [isSuggestingSchedule, setIsSuggestingSchedule] = useState(false);
  const [appliedAiMetadata, setAppliedAiMetadata] = useState<AiMetadataState | null>(null);
  const [hasBibleDraft, setHasBibleDraft] = useState(Boolean(metadata.scripture_reference && metadata.scripture_text));

  // Status calculation
  const now = new Date();
  const pubDate = publishAt ? new Date(publishAt) : null;
  const expDate = expireAt ? new Date(expireAt) : null;
  const isFuture = pubDate && pubDate > now;

  let statusBadge = { label: "Draft", class: "draft" };
  if (initial?.content_status === "ready") {
    if (expDate && expDate <= now) statusBadge = { label: "Expired", class: "archived" };
    else if (isFuture) statusBadge = { label: "Scheduled", class: "scheduled" };
    else statusBadge = { label: "Live", class: "ready" };
  } else if (initial?.content_status === "archived") {
    statusBadge = { label: "Archived", class: "archived" };
  }

  async function save(
    event: FormEvent<HTMLFormElement>,
    status: "draft" | "ready" | "archived",
  ) {
    event.preventDefault();
    setIsSaving(true);
    setMessage("");

    const f = new FormData(event.currentTarget);
    let enteredTitle = String(f.get("title") || "").trim();
    let enteredSlug = String(f.get("slug") || "").trim();
    const enteredExcerpt = String(f.get("excerpt") || "").trim();
    const enteredBody = String(f.get("body") || "").trim();

    // These are deliberately not editable for image-first Daily Inspirations.
    // Reuse the internal draft values created with the card, or recover safely
    // if an older draft predates the simplified editor.
    if (activeType === "daily_inspiration") {
      enteredTitle = enteredTitle || initial?.title || `Daily Inspiration — ${new Date().toISOString().slice(0, 10)}`;
      enteredSlug = enteredSlug || initial?.slug || `daily-inspiration-${initial?.id || Date.now()}`;
    }

    // Validation checks for Ready status
    if (status === "ready") {
      if (!enteredTitle || !enteredSlug) {
        setMessage("Title and Slug are required to publish or schedule.");
        setTimeout(() => setMessage(""), 5000);
        setIsSaving(false);
        return;
      }

      if (activeType === "daily_prayer" || activeType === "daily_inspiration") {
        if (!enteredBody) {
          setMessage(activeType === "daily_inspiration"
            ? "Generate and keep a reflection before approving this Daily Inspiration."
            : "A Prayer Body is required before marking a Daily Prayer as Ready.");
          setTimeout(() => setMessage(""), 5000);
          setIsSaving(false);
          return;
        }
      }

      if (activeType === "bible_reading") {
        const requiredReadingFields = [
          enteredExcerpt,
          enteredBody,
          String(f.get("scripture_reference") || "").trim(),
          String(f.get("scripture_text") || "").trim(),
          String(f.get("introduction") || "").trim(),
          String(f.get("reflection_question") || "").trim(),
          String(f.get("closing_prayer") || "").trim(),
        ];
        if (requiredReadingFields.some((value) => !value)) {
          setMessage("Generate a complete Scripture & Reflection, then review all devotional sections before marking it Ready.");
          setTimeout(() => setMessage(""), 6000);
          setIsSaving(false);
          return;
        }
      }

      if (activeType === "faith_story" && (!enteredExcerpt || !enteredBody)) {
        setMessage("Add an excerpt and body before marking this Faith Story ready.");
        setTimeout(() => setMessage(""), 5000);
        setIsSaving(false);
        return;
      }
    }

    // Build payload based on active content type (Merge existing metadata)
    const finalPublishAt = publishAt || (status === "ready" ? new Date().toISOString() : null);
    if (finalPublishAt && !publishAt) setPublishAt(finalPublishAt);

    const payloadMetadata: Record<string, string | null> = {
      ...(initial?.metadata ?? {}),
      publish_at: finalPublishAt,
      expire_at: expireAt || null,
    };

    let locationName: string | null = null;
    let finalExcerpt = enteredExcerpt;

    if (activeType === "daily_prayer") {
      const intention = String(f.get("intention") || "").trim();
      const author = String(f.get("author") || "").trim();
      if (intention) payloadMetadata.intention = intention;
      if (author) payloadMetadata.author = author;
      if (!finalExcerpt && enteredBody) {
        finalExcerpt = enteredBody.slice(0, 150) + (enteredBody.length > 150 ? "..." : "");
      }

      // Metadata tracking
      if (appliedAiMetadata) {
        payloadMetadata.creation_mode = appliedAiMetadata.creation_mode;
        payloadMetadata.ai_provider = appliedAiMetadata.ai_provider;
        payloadMetadata.ai_model = appliedAiMetadata.ai_model;
        payloadMetadata.generated_at = appliedAiMetadata.generated_at;
        payloadMetadata.prompt_version = appliedAiMetadata.prompt_version;
      } else if (metadata.creation_mode) {
        payloadMetadata.creation_mode = metadata.creation_mode;
        payloadMetadata.ai_provider = metadata.ai_provider || null;
        payloadMetadata.ai_model = metadata.ai_model || null;
        payloadMetadata.generated_at = metadata.generated_at || null;
        payloadMetadata.prompt_version = metadata.prompt_version || null;
      } else {
        payloadMetadata.creation_mode = "manual";
      }
    } else if (activeType === "daily_inspiration") {
      payloadMetadata.quote_type = String(f.get("quote_type") || "original_reflection");
      payloadMetadata.template_id = "openai_image_v1";
      payloadMetadata.generation_method = String(f.get("generation_method") || "manual");
      payloadMetadata.card_generation_method = "openai_image";
      payloadMetadata.card_model = String(f.get("card_model") || "gpt-image-2");
      payloadMetadata.card_aspect_ratio = String(f.get("card_aspect_ratio") || "4:5");
      delete payloadMetadata.focus_phrase;
      delete payloadMetadata.structure;
      if (!finalExcerpt && enteredBody) finalExcerpt = enteredBody.slice(0, 150) + (enteredBody.length > 150 ? "…" : "");
    } else if (activeType === "bible_reading") {
      payloadMetadata.scripture_reference = String(f.get("scripture_reference") || "").trim();
      payloadMetadata.scripture_text = String(f.get("scripture_text") || "").trim();
      payloadMetadata.scripture_verses_json = String(f.get("scripture_verses_json") || "").trim() || null;
      payloadMetadata.introduction = String(f.get("introduction") || "").trim();
      payloadMetadata.reflection = enteredBody;
      payloadMetadata.reflection_highlight = String(f.get("reflection_highlight") || "").trim() || null;
      payloadMetadata.reflection_question = String(f.get("reflection_question") || "").trim();
      payloadMetadata.closing_prayer = String(f.get("closing_prayer") || "").trim();
      payloadMetadata.theme = String(f.get("theme") || "").trim();
      delete payloadMetadata.tags_csv;
      payloadMetadata.creation_mode = "ai_assisted";
    } else if (activeType === "church_highlight") {
      // Church Highlight
      payloadMetadata.church_classification = String(f.get("classification") || "").trim();
      delete payloadMetadata.visitor_information;
      delete payloadMetadata.visiting_hours;
      delete payloadMetadata.mass_schedule;

      locationName = String(f.get("location") || "").trim() || null;
    }

    const payload = {
      type: activeType,
      title: enteredTitle,
      slug: enteredSlug,
      language_code: activeType === "bible_reading"
        ? "en"
        : activeType === "church_highlight" || activeType === "update" || activeType === "faith_story"
          ? initial?.language_code || "en"
          : String(f.get("language") || "en"),
      excerpt: finalExcerpt,
      body: enteredBody || null,
      location_name: locationName,
      content_status: status,
      metadata: payloadMetadata,
      source_name: activeType === "church_highlight" || activeType === "update"
        ? initial?.source_name ?? null
        : String(f.get("sourceName") || "").trim() || null,
      source_url: activeType === "church_highlight" || activeType === "update"
        ? initial?.source_url ?? null
        : String(f.get("sourceUrl") || "").trim() || null,
    };

    const c = requireSupabase();
    const result = initial
      ? await c
          .from("content_items")
          .update(payload)
          .eq("id", initial.id)
          .select("id")
          .single()
      : await c.from("content_items").insert(payload).select("id").single();

    if (result.error) {
      if (result.error.message?.includes("ready church highlights require")) {
        setMessage("A cover image is required before this Church Highlight can be marked Ready. Save it as a draft for now.");
      } else if (result.error.message?.includes("ready Daily Inspirations require")) {
        setMessage("Render the devotional card before approving this Daily Inspiration.");
      } else if (result.error.message?.includes("ready Updates require")) {
        setMessage("Add an excerpt, body, and cover image before marking this Update ready.");
      } else if (result.error.message?.includes("ready Faith Stories require")) {
        setMessage("Add an excerpt, body, and cover image before marking this Faith Story ready.");
      } else {
        setMessage(`Could not save this ${typeLabel}: ${result.error.message || result.error.details}`);
        console.error("Supabase Save Error:", result.error);
      }
      setTimeout(() => setMessage(""), 8000);
      setIsSaving(false);
      return;
    }

    if (!initial && result.data) {
      router.replace(`/content/${result.data.id}`);
    }

    const savedId = initial?.id || result.data?.id;
    if (savedId && (activeType === "daily_prayer" || activeType === "bible_reading")) {
      const selectedVisualAssetId = String(f.get("visual_asset_id") || "auto");
      const chosenAsset = selectedVisualAssetId !== "auto" ? selectedVisualAssetId : null;
      await c.rpc("assign_daily_prayer_visual", {
        target_content_id: savedId,
        chosen_asset_id: chosenAsset,
        source: chosenAsset ? "manual" : "automatic",
      });
    }

    // A notification is an announcement that a devotional has become available,
    // not an alert for every later edit. Future-dated entries are sent by the
    // scheduled publisher when their publish time arrives.
    const publishedAt = finalPublishAt ? new Date(finalPublishAt) : new Date();
    const previousPublishedAt = initial?.metadata?.publish_at
      ? new Date(initial.metadata.publish_at)
      : null;
    const isLiveNow = status === "ready" && !Number.isNaN(publishedAt.getTime()) && publishedAt <= new Date();
    const wasLive = initial?.content_status === "ready" &&
      (!previousPublishedAt || (!Number.isNaN(previousPublishedAt.getTime()) && previousPublishedAt <= new Date()));

    if (
      savedId &&
      isLiveNow &&
      !wasLive &&
      (activeType === "bible_reading" || activeType === "daily_prayer")
    ) {
      const { error: notificationError } = await c.functions.invoke(
        "send-published-content-push",
        {
          body: {
            content_type: activeType,
            content_id: savedId,
          },
        },
      );

      if (notificationError) {
        console.error("Published content push notification failed", notificationError);
      }
    }

    setMessage(
      status === "archived"
        ? `${typeLabel} archived.`
        : status === "ready"
          ? `${typeLabel} updated and live.`
          : "Draft saved.",
    );
    setTimeout(() => setMessage(""), 4000);
    setIsSaving(false);
  }

  function handleApplyAiDraft(draft: {
    title: string;
    intention: string;
    excerpt: string;
    body: string;
    aiMetadata: AiMetadataState;
  }) {
    setTitle(draft.title);
    if (!slugEdited) {
      setSlug(
        draft.title
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
      );
    }
    setAppliedAiMetadata(draft.aiMetadata);
  }

  function openArticlePreview() {
    if (!formRef.current) return;
    const form = new FormData(formRef.current);
    setArticlePreview({
      excerpt: String(form.get("excerpt") || "").trim(),
      body: String(form.get("body") || "").trim(),
    });
  }

  async function suggestNextSchedule() {
    setIsSuggestingSchedule(true);
    setMessage("");
    try {
      const { data, error } = await requireSupabase().rpc("suggest_today_schedule", {
        requested_content_type: activeType,
        excluded_content_id: initial?.id ?? null,
      });
      if (error) throw error;
      const suggestion = data?.[0] as { publish_at?: string; expire_at?: string } | undefined;
      if (!suggestion?.publish_at || !suggestion.expire_at) throw new Error("No schedule was returned.");
      setPublishAt(suggestion.publish_at);
      setExpireAt(suggestion.expire_at);
      setMessage("Suggested next slot applied. Review it, then save when ready.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not suggest a schedule.");
    } finally {
      setIsSuggestingSchedule(false);
    }
  }

  async function deleteDailyInspiration() {
    if (!initial?.id || !window.confirm("Delete this Daily Inspiration draft? This cannot be undone.")) return;
    setIsSaving(true);
    const client = requireSupabase();
    const token = (await client.auth.getSession()).data.session?.access_token;
    const response = await fetch("/api/admin/content/bulk-delete", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ ids: [initial.id] }),
    });
    if (response.ok) router.push("/content");
    else { setMessage("Could not delete this Daily Inspiration."); setIsSaving(false); }
  }

  return (
    <form ref={formRef} onSubmit={(event) => void save(event, intent)}>
      {/* Sticky Action Header */}
      <header className="sticky-header">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-semibold m-0">{title || `Untitled ${typeLabel}`}</h2>
          <span className={`badge ${statusBadge.class}`}>{statusBadge.label}</span>
          <span className="text-xs font-bold text-muted bg-beige px-2.5 py-1 rounded-md border border-line/60">
            {typeLabel}
          </span>
        </div>
        <div className="flex gap-3">
          {(activeType === "update" || activeType === "faith_story") && (
            <button className="button secondary" type="button" onClick={openArticlePreview} disabled={isSaving}>
              Preview
            </button>
          )}
          {activeType === "daily_inspiration" && !initial ? (
            <>
              <span className="text-sm text-muted self-center hidden sm:inline">Generate the card to create its draft.</span>
              <button className="button secondary" type="button" disabled>Save Draft</button>
              <button className="button" type="button" disabled>Publish Now</button>
            </>
          ) : activeType === "bible_reading" && !initial && !hasBibleDraft ? (
            <>
              <span className="text-sm text-muted self-center hidden sm:inline">Generate a reading to create its draft.</span>
              <button className="button secondary" type="button" disabled>Save Draft</button>
              <button className="button" type="button" disabled>Publish Now</button>
            </>
          ) : initial?.content_status === "ready" ? (
            <>
              <button
                className="button secondary"
                type="submit"
                onClick={() => setIntent("draft")}
                disabled={isSaving}
              >
                {isSaving && intent === "draft" ? "Removing..." : "Move to Draft"}
              </button>
              <button
                className="button"
                type="submit"
                onClick={() => setIntent("ready")}
                disabled={isSaving}
              >
                {isSaving && intent === "ready" ? "Saving..." : (isFuture ? "Save Schedule" : "Save Changes")}
              </button>
            </>
          ) : (
            <>
              <button
                className="button secondary"
                type="submit"
                onClick={() => setIntent("draft")}
                disabled={isSaving}
              >
                {isSaving && intent === "draft" ? "Saving..." : "Save Draft"}
              </button>
              <button
                className="button"
                type="submit"
                onClick={() => setIntent("ready")}
                disabled={isSaving}
              >
                {isSaving && intent === "ready" ? (activeType === "daily_inspiration" ? "Approving..." : isFuture ? "Scheduling..." : "Publishing...") : (activeType === "daily_inspiration" ? "Approve for Publishing" : isFuture ? "Schedule Publication" : "Publish Now")}
              </button>
            </>
          )}
        </div>
      </header>

      {articlePreview && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-6" role="dialog" aria-modal="true" aria-label={`${typeLabel} preview`}>
          <article className="card max-h-[85vh] w-full max-w-2xl overflow-y-auto bg-white p-8 shadow-2xl">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="eyebrow">Android article preview</p>
                <h2 className="title text-3xl">{title || `Untitled ${typeLabel}`}</h2>
              </div>
              <button className="button secondary compact" type="button" onClick={() => setArticlePreview(null)}>Close</button>
            </div>
            {articlePreview.excerpt && <p className="mb-6 font-serif text-lg leading-relaxed text-muted font-normal">{articlePreview.excerpt}</p>}
            <div className="whitespace-pre-wrap leading-7 text-ink">{articlePreview.body || "No body has been written yet."}</div>
          </article>
        </div>
      )}

      <div className="px-10 pb-20 mt-12">
        {message && (
          <p
            className={`alert mb-6 ${message.startsWith("Could") || message.startsWith("Choose") || message.startsWith("A cover") || message.includes("required") ? "error" : "success"}`}
            role="alert"
          >
            {message}
          </p>
        )}

        <div className="studio-layout">
          {/* Main Content Column */}
          <div className="editor-main">
            
            {/* Daily Inspiration creates its internal title, slug, and language automatically. */}
            {activeType !== "daily_inspiration" && <div className="card">
              <h3 className="card-title">
                {activeType === "daily_prayer" ? "Prayer Information" : activeType === "update" ? "Update Information" : activeType === "faith_story" ? "Faith Story Information" : activeType === "bible_reading" ? "Reading Information" : "Church Information"}
              </h3>
              <div className="form-grid">
                <div className="form-columns">
                  <Field label="Title">
                    <input
                      className="input"
                      name="title"
                      required
                      value={title}
                      onChange={(event) => {
                        const val = event.target.value;
                        setTitle(val);
                        if (!slugEdited) {
                          setSlug(val.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
                        }
                      }}
                    />
                  </Field>
                  <Field label="Slug">
                    <input
                      className="input"
                      name="slug"
                      required
                      value={slug}
                      onChange={(event) => {
                        setSlugEdited(true);
                        setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-"));
                      }}
                    />
                  </Field>
                </div>
                {activeType !== "bible_reading" && activeType !== "church_highlight" && activeType !== "update" && activeType !== "faith_story" && <Field label="🌐 Language" help="Primary language of this entry">
                  <select
                    className="select w-48"
                    name="language"
                    defaultValue={initial?.language_code ?? "en"}
                  >
                    <option value="en">English</option>
                    <option value="ceb">Cebuano</option>
                    <option value="fil">Filipino</option>
                  </select>
                </Field>}
              </div>
            </div>}

            {/* Type-Specific Fields Module */}
            {activeType === "daily_prayer" ? (
              <PrayerFields
                metadata={metadata}
                initialExcerpt={initial?.excerpt}
                initialBody={initial?.body ?? ""}
                contentId={initial?.id}
                onApplyAiDraft={handleApplyAiDraft}
              />
            ) : activeType === "daily_inspiration" ? (
              <InspirationFields
                contentId={initial?.id}
                metadata={metadata}
                initialExcerpt={initial?.excerpt}
                initialBody={initial?.body ?? ""}
                onApplyCandidate={(candidate) => {
                  setTitle(candidate.title);
                  if (!slugEdited) setSlug(candidate.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
                }}
                onRendered={onCoverChange}
              />
            ) : activeType === "update" ? (
              <UpdateFields
                contentId={initial?.id}
                initialExcerpt={initial?.excerpt}
                initialBody={initial?.body ?? ""}
                onApplyGenerated={(draft) => {
                  setTitle(draft.title);
                  if (!slugEdited) setSlug(draft.slug);
                }}
              />
            ) : activeType === "faith_story" ? (
              <UpdateFields
                contentId={initial?.id}
                initialExcerpt={initial?.excerpt}
                initialBody={initial?.body ?? ""}
                heading="Faith Story"
                bodyHelp="Tell the person’s story of faith with enough context for the full article."
              />
            ) : activeType === "bible_reading" ? (
              <BibleReadingFields
                metadata={metadata}
                initialExcerpt={initial?.excerpt}
                initialBody={initial?.body ?? ""}
                onApplyGenerated={(draft) => {
                  setTitle(draft.title);
                  if (!slugEdited) setSlug(draft.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
                  setHasBibleDraft(true);
                }}
              />
            ) : (
              <ChurchFields
                metadata={metadata}
                contentId={initial?.id}
                initialExcerpt={initial?.excerpt}
                initialBody={initial?.body ?? ""}
                initialLocation={initial?.location_name ?? ""}
              />
            )}
          </div>

          {/* Sidebar Column */}
          <div className="editor-sidebar">
            {/* Auto-assign notice for content types that use the shared visual pool */}
            {(activeType === "daily_prayer" || activeType === "bible_reading") && (
              <div className="card flex gap-3 items-start py-4">
                <span className="text-2xl leading-none mt-0.5">🖼️</span>
                <div>
                  <p className="font-semibold text-sm text-ink">Cover auto-assigned from pool</p>
                  <p className="text-xs text-muted mt-1 leading-relaxed">
                    A background image is automatically selected and rotated from the <strong>Daily Prayer Images Pool</strong>. No upload needed — manage images in <em>Media Library</em>.
                  </p>
                </div>
              </div>
            )}

            {(activeType === "daily_prayer" || activeType === "daily_inspiration" || activeType === "church_highlight" || activeType === "update" || activeType === "faith_story" || activeType === "bible_reading") && <div className="card">
              <h3 className="card-title">Visibility & Scheduling</h3>
              <div className="form-grid">
                {activeType !== "update" && (
                  <div className="col-span-full">
                    <button
                      type="button"
                      className="button secondary w-full"
                      onClick={() => void suggestNextSchedule()}
                      disabled={isSaving || isSuggestingSchedule}
                    >
                      {isSuggestingSchedule ? "Finding next slot…" : "Suggest next slot"}
                    </button>
                    <p className="text-xs text-muted mt-2">Uses this content type’s scheduling rule and the latest existing expiry. You can still edit the dates before saving.</p>
                  </div>
                )}
                <Field label="🚀 Publish Date" help="When it appears in Today (defaults to Now)">
                  <input
                    type="datetime-local"
                    className="input"
                    value={toLocalDatetime(publishAt)}
                    onChange={(e) => setPublishAt(e.target.value ? new Date(e.target.value).toISOString() : "")}
                  />
                </Field>
                <Field label="⌛ Expiry Date" help="When it automatically leaves Today (optional)">
                  <input
                    type="datetime-local"
                    className="input"
                    value={toLocalDatetime(expireAt)}
                    onChange={(e) => setExpireAt(e.target.value ? new Date(e.target.value).toISOString() : "")}
                  />
                </Field>

                {initial?.content_status === "ready" && (
                   <p className="text-xs text-muted italic text-center border-t border-line pt-4">
                    Content is currently managed by the automated placement trigger.
                   </p>
                )}
              </div>
            </div>}


            {/* Daily Prayer and Scripture & Reflection visuals always come from the shared pool. */}
            {activeType !== "daily_inspiration" && activeType !== "daily_prayer" && activeType !== "bible_reading" && <CoverUpload contentId={initial?.id} onCoverChange={onCoverChange}/>}

            {/* OpenAI Audio Narration Management */}
            {(activeType === "daily_prayer" || activeType === "bible_reading") && (
              <NarrationManagerCard
                contentId={initial?.id}
                metadata={metadata}
                onNarrationUpdated={onCoverChange}
                contentType={activeType}
              />
            )}

            {initial && activeType === "daily_inspiration" && (
              <button className="button danger w-full" type="button" onClick={() => void deleteDailyInspiration()} disabled={isSaving}>Delete Daily Inspiration</button>
            )}
            {initial && activeType !== "daily_inspiration" && (
              <button
                className="button danger w-full"
                type="submit"
                onClick={() => setIntent("archived")}
                disabled={isSaving}
              >
                Archive {typeLabel}
              </button>
            )}
          </div>
        </div>
      </div>
    </form>
  );
}

export function Field({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <label>{label}</label>
      {help && <small>{help}</small>}
      <div className="mt-1">{children}</div>
    </div>
  );
}
