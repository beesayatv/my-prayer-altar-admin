import crypto from "node:crypto";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { bunnyPublicUrl, deleteFromBunny, uploadToBunny } from "@/lib/bunnyStorage";

export interface GenerateNarrationInput {
  contentId: string;
  title: string;
  body: string;
  contentType?: string;
  profile?: "gentle" | "solemn";
  voice?: string;
  model?: string;
  speed?: number;
  instructions?: string;
}

export interface ProfileNarrationMetadata {
  storage_path: string;
  public_url?: string;
  voice: string;
  model: string;
  speed?: number;
  status: "ready" | "failed" | "processing";
  text_hash: string;
  generated_at: string;
  attribution: string; // Required disclosure: "AI-generated narration"
  timestamps?: number[];
  error?: string;
}

export interface AudioContentMetadata {
  default_profile: "gentle" | "solemn";
  profiles: {
    gentle?: ProfileNarrationMetadata;
    solemn?: ProfileNarrationMetadata;
  };
}

export interface GenerateNarrationResult {
  success: boolean;
  profile: "gentle" | "solemn";
  metadata?: ProfileNarrationMetadata;
  error?: string;
}

const STORAGE_BUCKET = "today-media";
export const DEFAULT_TTS_MODEL = "gpt-4o-mini-tts";
export const ATTRIBUTION_DISCLOSURE = "AI-generated narration";

export const INSTRUCTION_PROFILES = {
  gentle: {
    name: "gentle",
    instructions: "Read slowly, warmly, and prayerfully. Use a calm devotional tone, natural pauses between sentences, restrained emotion, and clear pronunciation. Ensure the closing word Amen is spoken clearly and reverently.",
  },
  solemn: {
    name: "solemn",
    instructions: "Read in a reverent, measured, solemn tone. Use natural pauses and quiet conviction. Keep the delivery peaceful and restrained rather than dramatic. Ensure the closing word Amen is spoken clearly and reverently.",
  },
};

export function computeTextHash(title: string, body: string): string {
  const combined = `${title.trim()}.\n\n${body.trim()}`;
  return crypto.createHash("sha256").update(combined).digest("hex").substring(0, 16);
}

import { safeLogAdminAiUsage } from "./aiLogger";

/**
 * Direct fetch request helper for OpenAI Speech API (v1/audio/speech).
 * Uses exact payload structure: { model, voice, input, instructions, response_format }
 */
export async function callOpenAISpeechAPI(
  apiKey: string,
  payload: {
    model: string;
    voice: string;
    input: string;
    instructions: string;
    speed?: number;
    response_format: string;
  },
  featureName: string = "audio_narration",
  customFetch?: typeof fetch
): Promise<Buffer> {
  const fetchImpl = customFetch || fetch;
  const charCount = payload.input ? payload.input.length : 0;
  const usedModel = payload.model || "tts-1";

  let response: Response;
  try {
    response = await fetchImpl("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(60000),
    });
  } catch (err) {
    await safeLogAdminAiUsage({
      feature: featureName,
      model: usedModel,
      input_tokens: charCount,
      status: "failed",
      error_code: "network_error",
    });
    throw err;
  }

  const requestId = response.headers.get("x-request-id") || null;

  if (!response.ok) {
    const errText = await response.text();
    await safeLogAdminAiUsage({
      feature: featureName,
      model: usedModel,
      input_tokens: charCount,
      status: "failed",
      error_code: `tts_http_${response.status}`,
      request_id: requestId,
    });
    throw new Error(`OpenAI Speech API error (${response.status}): ${errText}`);
  }

  await safeLogAdminAiUsage({
    feature: featureName,
    model: usedModel,
    input_tokens: charCount,
    status: "success",
    request_id: requestId,
  });

  // Response is raw MP3 binary data
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Extracts segment timestamps using OpenAI Whisper API (v1/audio/transcriptions).
 */
export async function extractAudioSegmentTimestamps(
  audioBuffer: Buffer,
  apiKey: string,
  customFetch?: typeof fetch
): Promise<number[]> {
  try {
    const fetchImpl = customFetch || fetch;
    const formData = new FormData();
    const blob = new Blob([Uint8Array.from(audioBuffer)], { type: "audio/mpeg" });
    formData.append("file", blob, "narration.mp3");
    formData.append("model", "whisper-1");
    formData.append("response_format", "verbose_json");
    formData.append("timestamp_granularities[]", "segment");

    const res = await fetchImpl("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
      signal: AbortSignal.timeout(60000),
    });

    if (!res.ok) {
      console.warn(`Whisper API timestamp extraction warning (${res.status}): ${await res.text()}`);
      return [];
    }

    const json = await res.json();
    const segments = json.segments || [];
    if (Array.isArray(segments) && segments.length > 0) {
      return segments.map((s: { start: number }) => Number(Number(s.start).toFixed(2)));
    }
  } catch (err) {
    console.warn("Failed to extract Whisper segment timestamps:", err);
  }
  return [];
}

/**
 * Generates audio narration using direct OpenAI Speech API (v1/audio/speech),
 * uploads MP3 to Bunny, records it for lifecycle cleanup, and updates
 * public.content_items.metadata under the specified profile.
 */
export async function generateAndStoreProfileNarration(
  input: GenerateNarrationInput,
  customDbClient?: SupabaseClient,
  customFetch?: typeof fetch
): Promise<GenerateNarrationResult> {
  if (!input.contentId || !input.title || !input.body) {
    return {
      success: false,
      profile: input.profile || "gentle",
      error: "Missing required content parameters (contentId, title, body).",
    };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      success: false,
      profile: input.profile || "gentle",
      error: "OPENAI_API_KEY environment variable is missing on the server.",
    };
  }

  const profileKey = input.profile || "gentle";
  const model = input.model || process.env.OPENAI_TTS_MODEL || DEFAULT_TTS_MODEL;
  const defaultVoice = profileKey === "solemn"
    ? (process.env.OPENAI_TTS_VOICE_SOLEMN || "ash")
    : (process.env.OPENAI_TTS_VOICE_GENTLE || "coral");
  const voice = input.voice || defaultVoice;
  const instructions = input.instructions || INSTRUCTION_PROFILES[profileKey].instructions;
  const speed = input.speed ? Number(input.speed) : 1.0;

  // Normalize the prayer ending for OpenAI TTS:
  // Strip any trailing punctuation/newlines and connect as ", Amen." so the TTS model
  // treats "Amen" as the natural closing cadence word of the sentence.
  const cleanBody = input.body.trim();
  const base = cleanBody.replace(/(?:\s+|\n+)?amen[\.\!\?]*['"]?$/i, "").trim();
  const punctStripped = base.replace(/[\.\!\?\,]+$/, "");
  const bodyText = `${punctStripped}, Amen.`;

  const textToNarrate = `${input.title.trim()}.\n\n${bodyText}`;
  const textHash = computeTextHash(input.title, input.body);
  const speedTag = speed !== 1.0 ? `-spd${speed.toString().replace(".", "p")}` : "";
  const storagePath = `audio/daily-prayers/${input.contentId}/${textHash}-${profileKey}-${voice}${speedTag}-${Date.now()}.mp3`;

  const featureName = input.contentType === "bible_reading" ? "scripture_narration" : "daily_prayer_narration";

  try {
    // 1. Call OpenAI Speech API directly with model, voice, input, instructions, speed, response_format
    const audioBuffer = await callOpenAISpeechAPI(
      apiKey,
      {
        model,
        voice,
        input: textToNarrate,
        instructions,
        speed,
        response_format: "mp3",
      },
      featureName,
      customFetch
    );

    // 2. Keep Supabase for metadata, but deliver shared narration from Bunny.
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    const supabase = customDbClient || (url && (serviceKey || anonKey)
      ? createClient(url, serviceKey || anonKey!, { auth: { persistSession: false } })
      : null);

    if (!supabase) {
      return {
        success: false,
        profile: profileKey,
        error: "Supabase client configuration unavailable for storage upload.",
      };
    }

    await uploadToBunny(storagePath, audioBuffer, "audio/mpeg");
    const publicUrl = bunnyPublicUrl(storagePath);

    // 3. Extract exact Whisper segment timestamps for frame-perfect sentence sync
    const timestamps = await extractAudioSegmentTimestamps(audioBuffer, apiKey, customFetch);

    // 4. Construct profile metadata with disclosure attribution and timestamps
    const profileMeta: ProfileNarrationMetadata = {
      storage_path: storagePath,
      public_url: publicUrl,
      voice,
      model,
      speed,
      status: "ready",
      text_hash: textHash,
      generated_at: new Date().toISOString(),
      attribution: ATTRIBUTION_DISCLOSURE,
      timestamps: timestamps.length > 0 ? timestamps : undefined,
    };

    // 4. Update content_items metadata without overwriting other profiles or fields
    const { data: existingRow } = await supabase
      .from("content_items")
      .select("metadata")
      .eq("id", input.contentId)
      .maybeSingle();

    const currentMeta = (existingRow?.metadata as Record<string, unknown>) || {};
    const existingAudio = (currentMeta.audio as AudioContentMetadata) || {
      default_profile: "gentle",
      profiles: {},
    };
    const previousProfile = existingAudio.profiles[profileKey];

    const updatedAudio: AudioContentMetadata = {
      default_profile: profileKey,
      profiles: {
        ...existingAudio.profiles,
        [profileKey]: profileMeta,
      },
    };

    const updatedMetadata = {
      ...currentMeta,
      audio: updatedAudio,
    };

    const { error: updateError } = await supabase
      .from("content_items")
      .update({ metadata: updatedMetadata })
      .eq("id", input.contentId);

    if (updateError) {
      await deleteFromBunny(storagePath);
      return {
        success: false,
        profile: profileKey,
        error: `Database metadata update failed: ${updateError.message}`,
      };
    }

    // Keep a durable file history so replacing/deleting a Daily Prayer never
    // loses track of an older narration URL.
    const { error: registerNewError } = await supabase
      .from("daily_prayer_audio_assets")
      .upsert({
        content_id: input.contentId,
        profile: profileKey,
        storage_path: storagePath,
        public_url: publicUrl,
        provider: "bunny",
        is_current: true,
        deleted_at: null,
      }, { onConflict: "storage_path" });

    if (registerNewError) {
      console.error("Narration asset registry warning:", registerNewError.message);
    } else {
      await supabase
        .from("daily_prayer_audio_assets")
        .update({ is_current: false })
        .eq("content_id", input.contentId)
        .eq("profile", profileKey)
        .neq("storage_path", storagePath)
        .is("deleted_at", null);
    }

    // Only remove the old narration after the new URL is already live in the
    // content metadata. A failed cleanup is retained in the registry for the
    // content-deletion flow to retry later.
    if (previousProfile?.storage_path && previousProfile.storage_path !== storagePath) {
      const previousProvider = previousProfile.public_url ? "bunny" : "supabase";
      await supabase.from("daily_prayer_audio_assets").upsert({
        content_id: input.contentId,
        profile: profileKey,
        storage_path: previousProfile.storage_path,
        public_url: previousProfile.public_url || null,
        provider: previousProvider,
        is_current: false,
      }, { onConflict: "storage_path" });

      try {
        if (previousProvider === "bunny") await deleteFromBunny(previousProfile.storage_path);
        else {
          const { error: removeError } = await supabase.storage.from(STORAGE_BUCKET).remove([previousProfile.storage_path]);
          if (removeError) throw removeError;
        }
        await supabase.from("daily_prayer_audio_assets").update({ deleted_at: new Date().toISOString() }).eq("storage_path", previousProfile.storage_path);
      } catch (cleanupError) {
        console.error("Previous narration cleanup warning:", cleanupError);
      }
    }

    return {
      success: true,
      profile: profileKey,
      metadata: profileMeta,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected narration error.";
    return { success: false, profile: profileKey, error: msg };
  }
}
