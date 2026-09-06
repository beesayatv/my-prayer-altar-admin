import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { generatePrayerDraft } from "@/lib/ai/prayerGenerator";
import { generateAndStoreProfileNarration } from "@/lib/ai/narrationGenerator";

export interface QueueProcessorResult {
  status: "off" | "success" | "partial_success" | "error";
  message: string;
  config?: {
    is_enabled: boolean;
    operating_mode: string;
    queue_length_days: number;
    time_zone: string;
    language_code: string;
    theme_strategy: string;
  };
  inspected_dates: string[];
  generated_count: number;
  skipped_dates: { date: string; reason: string }[];
  generated_prayers: {
    id?: string;
    scheduled_date: string;
    title: string;
    intention: string;
    status: string;
  }[];
  validation_failures: { date: string; reason: string }[];
  api_failures: { date: string; reason: string }[];
}

let isQueueRunning = false;

const WEEKLY_THEMES: Record<number, { intention: string; theme: string }> = {
  1: { intention: "Gratitude and Morning Offering", theme: "Beginning the week in faith, work, and dedication" },
  2: { intention: "Holy Spirit and Guidance", theme: "Wisdom, clarity, and discernment in daily choices" },
  3: { intention: "St. Joseph and Family Protection", theme: "Family, honest labor, and quiet strength" },
  4: { intention: "Holy Eucharist and Praise", theme: "Thanksgiving, Eucharistic adoration, and fellowship" },
  5: { intention: "Sacred Heart and Divine Mercy", theme: "Forgiveness, reconciliation, and healing" },
  6: { intention: "Blessed Virgin Mary and Peace", theme: "Serenity, Marian intercession, and quiet reflection" },
  0: { intention: "Lord's Day and Resurrection Joy", theme: "Praise, parish community, and spiritual renewal" },
};

/**
 * Computes exact UTC ISO string for a wall-clock local date and time in a target IANA timezone.
 * Example: formatLocalTimeToUtcIso("2026-08-08", "00:00", "Asia/Manila") -> "2026-08-07T16:00:00.000Z"
 */
export function formatLocalTimeToUtcIso(dateStr: string, timeStr: string, timeZone: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hour, minute] = (timeStr || "00:00").split(":").map(Number);

  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));

  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  } catch {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  }

  const parts = formatter.formatToParts(utcGuess);
  const getPart = (type: string) => Number(parts.find((p) => p.type === type)?.value || 0);

  const localYear = getPart("year");
  const localMonth = getPart("month");
  const localDay = getPart("day");
  let localHour = getPart("hour");
  if (localHour === 24) localHour = 0;
  const localMinute = getPart("minute");

  const expectedMs = Date.UTC(year, month - 1, day, hour, minute, 0);
  const actualMs = Date.UTC(localYear, localMonth - 1, localDay, localHour, localMinute, 0);

  const offsetMs = actualMs - expectedMs;
  const exactUtcDate = new Date(utcGuess.getTime() - offsetMs);
  return exactUtcDate.toISOString();
}

export function getTargetDates(queueLengthDays: number, timeZone: string, baseDate = new Date()): string[] {
  const dates: string[] = [];
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  }

  const dateStr = formatter.format(baseDate);
  const [y, m, d] = dateStr.split("-").map(Number);

  for (let i = 0; i < queueLengthDays; i++) {
    const anchor = new Date(Date.UTC(y, m - 1, d + i));
    dates.push(anchor.toISOString().slice(0, 10));
  }
  return dates;
}

export function validateGeneratedContent(
  draft: { title: string; intention: string; excerpt: string; body: string },
  preferredLength: "short" | "standard" | "long",
  existingTitles: string[]
): { valid: boolean; reason?: string } {
  if (!draft.title || !draft.title.trim()) {
    return { valid: false, reason: "Title is missing." };
  }
  if (!draft.intention || !draft.intention.trim()) {
    return { valid: false, reason: "Intention is missing." };
  }
  if (!draft.excerpt || !draft.excerpt.trim()) {
    return { valid: false, reason: "Excerpt is missing." };
  }
  if (!draft.body || !draft.body.trim()) {
    return { valid: false, reason: "Prayer body is missing." };
  }

  // Artifact check
  if (draft.body.includes("```") || draft.excerpt.includes("```")) {
    return { valid: false, reason: "Generated content contains raw code block artifacts." };
  }

  // Word count check
  const wordCount = draft.body.trim().split(/\s+/).length;
  const minWords = preferredLength === "short" ? 25 : preferredLength === "long" ? 100 : 40;
  const maxWords = preferredLength === "short" ? 250 : preferredLength === "long" ? 600 : 450;

  if (wordCount < minWords || wordCount > maxWords) {
    return { valid: false, reason: `Word count (${wordCount} words) is outside bounds for ${preferredLength} setting.` };
  }

  // Duplicate title check
  const normalizedTitle = draft.title.toLowerCase().trim();
  const isDuplicate = existingTitles.some((t) => t.toLowerCase().trim() === normalizedTitle);
  if (isDuplicate) {
    return { valid: false, reason: `Title "${draft.title}" duplicates a recent prayer.` };
  }

  return { valid: true };
}

export async function processDailyPrayerQueue(
  userId: string,
  tokenOrClient?: string | SupabaseClient
): Promise<QueueProcessorResult> {
  if (isQueueRunning) {
    return {
      status: "error",
      message: "A queue generation run is already in progress. Please wait for it to finish.",
      inspected_dates: [],
      generated_count: 0,
      skipped_dates: [],
      generated_prayers: [],
      validation_failures: [],
      api_failures: [],
    };
  }

  isQueueRunning = true;
  const queueRunId = `run-${Date.now()}`;

  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    let supabase: SupabaseClient | null = null;
    if (typeof tokenOrClient === "object" && tokenOrClient !== null) {
      supabase = tokenOrClient;
    } else {
      const userToken = typeof tokenOrClient === "string" ? tokenOrClient : undefined;
      if (url && (serviceKey || anonKey)) {
        supabase = serviceKey
          ? createClient(url, serviceKey, { auth: { persistSession: false } })
          : createClient(url, anonKey!, {
              auth: { persistSession: false },
              global: { headers: userToken ? { Authorization: `Bearer ${userToken}` } : {} },
            });
      }
    }

    if (!supabase) {
      throw new Error("Supabase client configuration unavailable.");
    }

    // 1. Fetch automation_configs row for daily_prayer
    const { data: config, error: configErr } = await supabase
      .from("automation_configs")
      .select("*")
      .eq("content_type", "daily_prayer")
      .maybeSingle();

    if (configErr) {
      throw new Error(`Failed to load automation_configs: ${configErr.message}`);
    }

    const isEnabled = config?.is_enabled ?? false;
    const opMode = config?.operating_mode ?? "off";

    const configSummary = {
      is_enabled: isEnabled,
      operating_mode: opMode,
      queue_length_days: config?.queue_length_days ?? 7,
      time_zone: config?.time_zone ?? "Asia/Manila",
      language_code: config?.language_code ?? "en",
      theme_strategy: config?.theme_strategy ?? "rotation_enabled",
    };

    if (!isEnabled || opMode === "off") {
      return {
        status: "off",
        message: "Daily Prayer automation is turned off in settings.",
        config: configSummary,
        inspected_dates: [],
        generated_count: 0,
        skipped_dates: [],
        generated_prayers: [],
        validation_failures: [],
        api_failures: [],
      };
    }

    // 2. Compute target rolling dates
    const targetDates = getTargetDates(configSummary.queue_length_days, configSummary.time_zone);

    // 3. Fetch existing daily_prayer content items to check scheduled_date / publish_at
    const { data: existingItems, error: itemsErr } = await supabase
      .from("content_items")
      .select("id, title, metadata, content_status")
      .eq("type", "daily_prayer");

    if (itemsErr) {
      throw new Error(`Failed to query existing daily_prayer content: ${itemsErr.message}`);
    }

    const existingScheduledDates = new Set<string>();
    const existingTitles: string[] = [];

    (existingItems || []).forEach((item) => {
      if (item.title) existingTitles.push(item.title);
      const meta = (item.metadata as Record<string, string>) || {};

      if (meta.scheduled_date) {
        existingScheduledDates.add(meta.scheduled_date);
      }
      if (meta.publish_at) {
        const pubDateStr = meta.publish_at.slice(0, 10);
        existingScheduledDates.add(pubDateStr);
      }
    });

    const skippedDates: { date: string; reason: string }[] = [];
    const datesToGenerate: string[] = [];

    targetDates.forEach((dateStr) => {
      if (existingScheduledDates.has(dateStr)) {
        skippedDates.push({ date: dateStr, reason: "Content already exists for this target date." });
      } else {
        datesToGenerate.push(dateStr);
      }
    });

    // Safely process requested queue length up to 30 items
    const MAX_GENERATIONS = Math.min(configSummary.queue_length_days, 30);
    const cappedDatesToGenerate = datesToGenerate.slice(0, MAX_GENERATIONS);

    if (datesToGenerate.length > MAX_GENERATIONS) {
      datesToGenerate.slice(MAX_GENERATIONS).forEach((dateStr) => {
        skippedDates.push({ date: dateStr, reason: `Capped by max run batch limit (${MAX_GENERATIONS} items).` });
      });
    }

    const generatedPrayers: QueueProcessorResult["generated_prayers"] = [];
    const validationFailures: { date: string; reason: string }[] = [];
    const apiFailures: { date: string; reason: string }[] = [];

    const now = new Date();

    // 4. Generate missing dates
    for (const targetDate of cappedDatesToGenerate) {
      try {
        const dateObj = new Date(targetDate);
        const dayOfWeek = dateObj.getUTCDay();

        let intentionInput = "Daily Peace and Guidance";
        let inspirationInput = "";

        const customSystemPrompt =
          (config?.config_json?.custom_system_instruction as string) ||
          (config?.config_json?.ai as any)?.prompt ||
          undefined;
        const configuredAiModel = (config?.config_json?.ai as any)?.model || undefined;
        const customWeeklyIntentions = (config?.config_json?.weekly_intentions as Record<string, { intention: string; theme: string }>) || null;

        if (configSummary.theme_strategy === "rotation_enabled") {
          const customDay = customWeeklyIntentions?.[String(dayOfWeek)];
          if (customDay && customDay.intention?.trim()) {
            intentionInput = customDay.intention.trim();
            inspirationInput = customDay.theme?.trim() || "";
          } else {
            const rotation = WEEKLY_THEMES[dayOfWeek] || WEEKLY_THEMES[1];
            intentionInput = rotation.intention;
            inspirationInput = rotation.theme;
          }
        }

        // Call AI Draft Generator
        const draft = await generatePrayerDraft({
          intention: intentionInput,
          language: (config?.language_code as "en" | "ceb" | "fil") || "en",
          length: (config?.preferred_length as "short" | "standard" | "long") || "standard",
          inspiration: inspirationInput || undefined,
          recentTopics: existingTitles.slice(-10),
          systemPrompt: customSystemPrompt,
          model: configuredAiModel,
        });

        // Validate draft
        const valCheck = validateGeneratedContent(
          draft,
          (config?.preferred_length as "short" | "standard" | "long") || "standard",
          existingTitles
        );

        if (!valCheck.valid) {
          validationFailures.push({ date: targetDate, reason: valCheck.reason || "Validation failed." });
          continue;
        }

        // Real IANA Timezone Conversion for Target Publication Instant
        const pubTime = config?.publication_time || "00:00";
        const publishAtUtc = formatLocalTimeToUtcIso(targetDate, pubTime, configSummary.time_zone);
        const publishAtDate = new Date(publishAtUtc);

        // TODAY / PAST TIME BEHAVIOR RULE:
        // If target date is Today and the configured publication time has already passed in UTC,
        // save as 'draft' status so an item is never retroactively scheduled in the past without review.
        let itemStatus: "draft" | "ready" = "ready";
        if (opMode === "drafts_only") {
          itemStatus = "draft";
        } else if (publishAtDate < now) {
          itemStatus = "draft"; // Today's publication time already passed -> Save as draft
        }

        // Generate clean unique slug matching constraint ^[a-z0-9]+(?:-[a-z0-9]+)*$
        const slugBase = draft.title
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9]+/g, "-")
          .slice(0, 30)
          .replace(/^-+|-+$/g, "");
        const uniqueSlug = `daily-prayer-${targetDate}-${slugBase || "prayer"}`;

        // Calculate 23:59:59 end-of-day expiration ISO string for targetDate
        const expireAtUtc = formatLocalTimeToUtcIso(targetDate, "23:59:59", configSummary.time_zone);

        const itemPayload = {
          type: "daily_prayer",
          title: draft.title,
          slug: uniqueSlug,
          language_code: config?.language_code || "en",
          excerpt: draft.excerpt,
          body: draft.body,
          content_status: itemStatus,
          created_by: userId,
          metadata: {
            intention: draft.intention,
            scheduled_date: targetDate,
            creation_mode: "ai_generated",
            automation_generated: "true",
            is_locked: "false",
            ai_provider: "openai",
            ai_model: "gpt-4o-mini",
            generation_quality: config?.generation_quality || "balanced",
            generated_at: new Date().toISOString(),
            prompt_version: "1.0",
            queue_run_id: queueRunId,
            publish_at: itemStatus === "ready" ? publishAtUtc : null,
            expire_at: itemStatus === "ready" ? expireAtUtc : null,
          },
        };

        const { data: inserted, error: insertErr } = await supabase
          .from("content_items")
          .insert(itemPayload)
          .select("id")
          .single();

        if (!insertErr && inserted?.id) {
          const { error: visualError } = await supabase.rpc("assign_daily_prayer_visual", {
            target_content_id: inserted.id,
            chosen_asset_id: null,
            source: "automatic",
          });
          if (visualError) throw new Error("A Daily Prayer visual could not be assigned.");

          // Automated OpenAI TTS narration is now disabled by default as per user preference.
          // It will only run if explicitly set to true in the configuration.
          const audioConfig = (config?.config_json?.audio as Record<string, any>) || {};
          const isAudioEnabled = audioConfig.narration_enabled === true; 

          if (isAudioEnabled) {
            try {
              await generateAndStoreProfileNarration(
                {
                  contentId: inserted.id,
                  title: draft.title,
                  body: draft.body,
                  profile: (audioConfig.default_profile as "gentle" | "solemn") || "gentle",
                  provider: (audioConfig.tts_provider as "google" | "openai") || "google",
                  voice: audioConfig.default_voice || (audioConfig.tts_provider === "openai" ? "coral" : "Sulafat"),
                  speed: audioConfig.default_speed ? Number(audioConfig.default_speed) : 0.85,
                  model: audioConfig.tts_model,
                },
                supabase
              );
            } catch (audioErr) {
              console.error(`Automatic TTS narration generation failed for ${targetDate}:`, audioErr);
            }
          }
        }

        if (insertErr) {
          // Catch PostgreSQL partial unique constraint violation (code 23505) gracefully
          if (insertErr.code === "23505" || insertErr.message?.includes("unique")) {
            skippedDates.push({ date: targetDate, reason: "Date already processed by concurrent request or constraint." });
          } else {
            apiFailures.push({ date: targetDate, reason: `Database insert failed: ${insertErr.message}` });
          }
        } else {
          existingTitles.push(draft.title);
          generatedPrayers.push({
            id: inserted?.id,
            scheduled_date: targetDate,
            title: draft.title,
            intention: draft.intention,
            status: itemStatus,
          });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "AI generation failed.";
        apiFailures.push({ date: targetDate, reason: msg });
      }
    }

    const generatedCount = generatedPrayers.length;
    const hasFailures = validationFailures.length > 0 || apiFailures.length > 0;
    const finalStatus = generatedCount > 0 ? (hasFailures ? "partial_success" : "success") : (hasFailures ? "error" : "success");

    let statusMsg = `Queue processor executed. Inspected ${targetDates.length} date(s): ${generatedCount} generated, ${skippedDates.length} skipped.`;
    if (hasFailures) {
      statusMsg += ` (${validationFailures.length} validation failures, ${apiFailures.length} API failures).`;
    }

    return {
      status: finalStatus,
      message: statusMsg,
      config: configSummary,
      inspected_dates: targetDates,
      generated_count: generatedCount,
      skipped_dates: skippedDates,
      generated_prayers: generatedPrayers,
      validation_failures: validationFailures,
      api_failures: apiFailures,
    };
  } finally {
    isQueueRunning = false;
  }
}
