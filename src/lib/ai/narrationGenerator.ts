import crypto from "node:crypto";
// @ts-ignore - lamejs lacks bundled type definitions
import lamejs from "lamejs";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { bunnyPublicUrl, deleteFromBunny, uploadToBunny } from "@/lib/bunnyStorage";

export interface GenerateNarrationInput {
  contentId: string;
  title: string;
  body: string;
  contentType?: string;
  profile?: "gentle" | "solemn";
  provider?: "google" | "openai";
  voice?: string;
  model?: string;
  speed?: number;
  instructions?: string;
}

export interface ProfileNarrationMetadata {
  storage_path: string;
  public_url?: string;
  provider?: "google" | "openai";
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

export const DEFAULT_GEMINI_TTS_MODEL = "gemini-3.1-flash-tts-preview";

export const GEMINI_TTS_VOICES = [
  // Female voices
  { id: "Sulafat", label: "Sulafat (Female · Warm & devotional)", gender: "female" },
  { id: "Vindemiatrix", label: "Vindemiatrix (Female · Gentle & soft)", gender: "female" },
  { id: "Aoede", label: "Aoede (Female · Breezy & serene)", gender: "female" },
  { id: "Kore", label: "Kore (Female · Clear & firm solemn)", gender: "female" },
  { id: "Despina", label: "Despina (Female · Smooth & reflective)", gender: "female" },
  { id: "Achernar", label: "Achernar (Female · Soft & quiet)", gender: "female" },
  { id: "Zephyr", label: "Zephyr (Female · Bright & uplifting)", gender: "female" },
  // Male voices
  { id: "Schedar", label: "Schedar (Male · Even, calm & measured)", gender: "male" },
  { id: "Charon", label: "Charon (Male · Deep, solemn & contemplative)", gender: "male" },
  { id: "Algieba", label: "Algieba (Male · Smooth & reverent)", gender: "male" },
  { id: "Enceladus", label: "Enceladus (Male · Breathy & prayerful)", gender: "male" },
  { id: "Iapetus", label: "Iapetus (Male · Clear & grounded)", gender: "male" },
  { id: "Puck", label: "Puck (Male · Natural & warm)", gender: "male" },
];

/**
 * Encodes 16-bit linear PCM audio into compressed MP3 format using lamejs.
 * Compresses raw 24kHz PCM from ~4-8MB down to ~300-500KB (over 85% size reduction).
 */
export function encodePcmToMp3(
  pcmBuffer: Buffer,
  sampleRate: number = 24000,
  numChannels: number = 1,
  kbps: number = 128
): Buffer {
  try {
    const mp3encoder = new lamejs.Mp3Encoder(numChannels, sampleRate, kbps);
    const samples = new Int16Array(
      pcmBuffer.buffer,
      pcmBuffer.byteOffset,
      Math.floor(pcmBuffer.byteLength / 2)
    );

    const mp3Data: Uint8Array[] = [];
    const sampleBlockSize = 1152;
    for (let i = 0; i < samples.length; i += sampleBlockSize) {
      const sampleChunk = samples.subarray(i, i + sampleBlockSize);
      const mp3buf = mp3encoder.encodeBuffer(sampleChunk);
      if (mp3buf && mp3buf.length > 0) {
        mp3Data.push(new Uint8Array(mp3buf));
      }
    }

    const mp3buf = mp3encoder.flush();
    if (mp3buf && mp3buf.length > 0) {
      mp3Data.push(new Uint8Array(mp3buf));
    }

    return Buffer.concat(mp3Data);
  } catch (err) {
    console.error("PCM to MP3 compression fallback to WAV:", err);
    const header = createWavHeader(pcmBuffer.length, sampleRate, numChannels, 16);
    return Buffer.concat([header, pcmBuffer]);
  }
}

/**
 * Creates standard 44-byte RIFF/WAVE header for linear PCM raw audio.
 */
export function createWavHeader(
  pcmLength: number,
  sampleRate: number = 24000,
  numChannels: number = 1,
  bitsPerSample: number = 16
): Buffer {
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const buffer = Buffer.alloc(44);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + pcmLength, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // Linear PCM
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(pcmLength, 40);
  return buffer;
}

/**
 * Direct fetch request helper for Google Gemini 3.1 Flash TTS API.
 * Uses generateContent with responseModalities: ["AUDIO"] and speechConfig.
 */
export async function callGeminiFlashTTS(
  apiKey: string,
  payload: {
    model?: string;
    voice: string;
    input: string;
    instructions?: string;
    format?: "mp3" | "wav";
  },
  featureName: string = "audio_narration",
  customFetch?: typeof fetch
): Promise<Buffer> {
  const fetchImpl = customFetch || fetch;
  const model = payload.model || DEFAULT_GEMINI_TTS_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  // Combine instructions with input text for natural delivery
  const promptText = payload.instructions
    ? `${payload.instructions.trim()}\n\nText to read:\n"${payload.input.trim()}"`
    : payload.input.trim();

  const reqBody = {
    contents: [
      {
        role: "user",
        parts: [{ text: promptText }],
      },
    ],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: payload.voice || "Sulafat",
          },
        },
      },
    },
  };

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(reqBody),
      signal: AbortSignal.timeout(60000),
    });
  } catch (err) {
    await safeLogAdminAiUsage({
      feature: featureName,
      provider: "google",
      model,
      input_tokens: payload.input.length,
      status: "failed",
      error_code: "network_error",
    });
    throw err;
  }

  if (!response.ok) {
    const errText = await response.text();
    await safeLogAdminAiUsage({
      feature: featureName,
      provider: "google",
      model,
      input_tokens: payload.input.length,
      status: "failed",
      error_code: `gemini_tts_http_${response.status}`,
    });
    throw new Error(`Gemini TTS API error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const part = data.candidates?.[0]?.content?.parts?.[0];
  const base64Audio = part?.inlineData?.data;

  if (!base64Audio) {
    throw new Error("Gemini TTS response did not return audio data.");
  }

  const pcmBuffer = Buffer.from(base64Audio, "base64");

  // Log usage tokens from usageMetadata if available
  const usage = data.usageMetadata;
  await safeLogAdminAiUsage({
    feature: featureName,
    provider: "google",
    model,
    input_tokens: usage?.promptTokenCount ?? Math.ceil(promptText.length / 4),
    output_tokens: usage?.candidatesTokenCount ?? Math.ceil(pcmBuffer.length / 320),
    total_tokens: usage?.totalTokenCount ?? null,
    status: "success",
  });

  // Default to compressed MP3 for fast network uploads and light CDN caching
  if (payload.format === "wav") {
    const header = createWavHeader(pcmBuffer.length, 24000, 1, 16);
    return Buffer.concat([header, pcmBuffer]);
  }

  return encodePcmToMp3(pcmBuffer, 24000, 1, 128);
}

/**
 * Extracts segment timestamps using OpenAI Whisper API (v1/audio/transcriptions).
 */
export async function extractAudioSegmentTimestamps(
  audioBuffer: Buffer,
  apiKey: string,
  customFetch?: typeof fetch,
  mimeType: string = "audio/mpeg",
  filename: string = "narration.mp3"
): Promise<number[]> {
  try {
    const fetchImpl = customFetch || fetch;
    const formData = new FormData();
    const blob = new Blob([Uint8Array.from(audioBuffer)], { type: mimeType });
    formData.append("file", blob, filename);
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

  const provider = input.provider || (input.voice && GEMINI_TTS_VOICES.some((v) => v.id === input.voice) ? "google" : "openai");
  const profileKey = input.profile || "gentle";
  const instructions = input.instructions || INSTRUCTION_PROFILES[profileKey].instructions;
  const speed = input.speed ? Number(input.speed) : 1.0;

  // Determine provider API keys and models
  let apiKey = "";
  let model = "";
  let voice = "";

  if (provider === "google") {
    apiKey = process.env.GEMINI_API_KEY || "";
    if (!apiKey) {
      return {
        success: false,
        profile: profileKey,
        error: "GEMINI_API_KEY environment variable is missing on the server.",
      };
    }
    model = input.model || DEFAULT_GEMINI_TTS_MODEL;
    const defaultVoice = profileKey === "solemn" ? "Charon" : "Sulafat";
    // Ensure voice belongs to Gemini TTS voices; otherwise fallback to default Gemini voice
    const isGeminiVoice = input.voice && GEMINI_TTS_VOICES.some((v) => v.id.toLowerCase() === input.voice?.toLowerCase());
    voice = isGeminiVoice ? input.voice! : defaultVoice;
  } else {
    apiKey = process.env.OPENAI_API_KEY || "";
    if (!apiKey) {
      return {
        success: false,
        profile: profileKey,
        error: "OPENAI_API_KEY environment variable is missing on the server.",
      };
    }
    model = input.model || process.env.OPENAI_TTS_MODEL || DEFAULT_TTS_MODEL;
    const defaultVoice = profileKey === "solemn"
      ? (process.env.OPENAI_TTS_VOICE_SOLEMN || "ash")
      : (process.env.OPENAI_TTS_VOICE_GENTLE || "coral");
    // Ensure voice does not belong to Gemini when using OpenAI
    const isGeminiVoice = input.voice && GEMINI_TTS_VOICES.some((v) => v.id.toLowerCase() === input.voice?.toLowerCase());
    voice = isGeminiVoice || !input.voice ? defaultVoice : input.voice;
  }

  // Normalize the prayer ending for TTS:
  // Strip any trailing punctuation/newlines and connect as ", Amen." so the TTS model
  // treats "Amen" as the natural closing cadence word of the sentence.
  const cleanBody = input.body.trim();
  const base = cleanBody.replace(/(?:\s+|\n+)?amen[\.\!\?]*['"]?$/i, "").trim();
  const punctStripped = base.replace(/[\.\!\?\,]+$/, "");
  const bodyText = `${punctStripped}, Amen.`;

  const textToNarrate = `${input.title.trim()}.\n\n${bodyText}`;
  const textHash = computeTextHash(input.title, input.body);
  const speedTag = speed !== 1.0 ? `-spd${speed.toString().replace(".", "p")}` : "";
  const ext = "mp3";
  const mimeType = "audio/mpeg";
  const storagePath = `audio/daily-prayers/${input.contentId}/${textHash}-${profileKey}-${voice}${speedTag}-${Date.now()}.${ext}`;

  const featureName = input.contentType === "bible_reading" ? "scripture_narration" : "daily_prayer_narration";

  try {
    let audioBuffer: Buffer;

    if (provider === "google") {
      audioBuffer = await callGeminiFlashTTS(
        apiKey,
        {
          model,
          voice,
          input: textToNarrate,
          instructions,
          format: "mp3",
        },
        featureName,
        customFetch
      );
    } else {
      audioBuffer = await callOpenAISpeechAPI(
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
    }

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

    // Fast upload of compressed MP3 (~300KB instead of 6MB uncompressed WAV)
    await uploadToBunny(storagePath, audioBuffer, mimeType);
    const publicUrl = bunnyPublicUrl(storagePath);

    // 3. Construct profile metadata with disclosure attribution
    const profileMeta: ProfileNarrationMetadata = {
      storage_path: storagePath,
      public_url: publicUrl,
      provider,
      voice,
      model,
      speed,
      status: "ready",
      text_hash: textHash,
      generated_at: new Date().toISOString(),
      attribution: ATTRIBUTION_DISCLOSURE,
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
