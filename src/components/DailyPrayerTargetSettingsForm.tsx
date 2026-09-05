"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Field } from "@/components/ContentEditor";
import { requireSupabase } from "@/lib/supabase";
import { DAILY_PRAYER, type AutomationConfigRecord } from "@/lib/contentConfiguration";

const DEFAULT_EDITORIAL_PROMPT = `You are an editorial assistant for "My Prayer Altar", a Catholic devotional application.
Your mission is to compose written prayers for daily reflection.

CRITICAL EDITORIAL STYLE RULES:
1. TONE: Deeply reverent, humble, compassionate, hopeful, and authentically Catholic in spirit.
2. DOCTRINE: Doctrinally careful. Avoid claiming absolute certainty about God's secret will or promising guaranteed temporal miracles.
3. AUTHENTICITY: Do NOT invent quotations, make up fake saint quotes, or construct false scripture references.
4. QUALITY: The prose should be dignified, beautifully structured, and suitable for public devotional publication.
5. NO EXTRA TEXT: Return ONLY a raw valid JSON object matching the requested schema. No markdown formatting outside the JSON, no code blocks, no conversational preamble.

SCHEMA REQUIREMENTS:
Return a JSON object with these exact string keys:
- "title": A clear, inspiring prayer title (e.g. "A Prayer for Peace in Times of Anxiety").
- "intention": A refined 3-6 word intention summary.
- "excerpt": A concise 1-2 sentence summary for a feed preview card.
- "body": The complete written prayer text formatted into clean paragraphs.`;

const OPENAI_VOICES = [
  { id: "ash", label: "Ash (Solemn, calm & reverent)" },
  { id: "cedar", label: "Cedar (Deep & resonant)" },
  { id: "marin", label: "Marin (Gentle & warm)" },
  { id: "nova", label: "Nova (Bright & energetic)" },
];

const TTS_MODELS = [
  { id: "gpt-4o-mini-tts", label: "gpt-4o-mini-tts (Fast & Efficient - Recommended)" },
  { id: "tts-1", label: "tts-1 (Standard OpenAI Speech)" },
  { id: "tts-1-hd", label: "tts-1-hd (High Definition Speech)" },
];

type TodayItemStatus = {
  id?: string;
  title?: string;
  status?: string;
  hasAudio?: boolean;
  scheduledDate?: string;
  loading: boolean;
};

export function DailyPrayerTargetSettingsForm() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [runningQueue, setRunningQueue] = useState(false);
  const [queueResult, setQueueResult] = useState<any | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Active section tab
  const [activeTab, setActiveTab] = useState<"all" | "schedule" | "ai" | "audio">("all");

  // Automation / Schedule state
  const [isEnabled, setIsEnabled] = useState(true);
  const [operatingMode, setOperatingMode] = useState<AutomationConfigRecord["operating_mode"]>("generate_and_schedule");
  const [queueLength, setQueueLength] = useState(7);
  const [publicationTime, setPublicationTime] = useState("00:00");
  const [generationTime, setGenerationTime] = useState("02:00");
  const [timeZone, setTimeZone] = useState("Asia/Manila");

  // AI Prompt & Model state
  const [model, setModel] = useState("gpt-4o-mini");
  const [prompt, setPrompt] = useState(DEFAULT_EDITORIAL_PROMPT);
  const [generationQuality, setGenerationQuality] = useState<AutomationConfigRecord["generation_quality"]>("balanced");

  // Audio / OpenAI Narration state
  const [narrationEnabled, setNarrationEnabled] = useState(true);
  const [defaultProfile, setDefaultProfile] = useState("gentle");
  const [defaultVoice, setDefaultVoice] = useState("marin");
  const [defaultSpeed, setDefaultSpeed] = useState(0.85);
  const [ttsModel, setTtsModel] = useState("gpt-4o-mini-tts");

  // Today's Daily Prayer Item Status & Actions
  const [todayItem, setTodayItem] = useState<TodayItemStatus>({ loading: true });
  const [generatingTodayAudio, setGeneratingTodayAudio] = useState(false);

  const getTodayIso = () => {
    return new Date().toISOString().split("T")[0];
  };

  const fetchTodayPrayer = async () => {
    try {
      setTodayItem((prev) => ({ ...prev, loading: true }));
      const supabase = requireSupabase();
      const todayStr = getTodayIso();
      const { data, error } = await supabase
        .from("content_items")
        .select("id, title, content_status, metadata")
        .eq("type", "daily_prayer")
        .eq("metadata->>scheduled_date", todayStr)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        const metadata = (data.metadata || {}) as Record<string, any>;
        const audioMetadata = metadata?.audio || {};
        const profiles = audioMetadata?.profiles || {};
        const hasAudio =
          Object.keys(profiles).length > 0 ||
          Boolean(metadata.audio_url) ||
          Boolean(metadata.narration_profile_gentle) ||
          Boolean(metadata.narration_profile_solemn);

        setTodayItem({
          id: data.id,
          title: data.title,
          status: data.content_status,
          hasAudio,
          scheduledDate: todayStr,
          loading: false,
        });
      } else {
        setTodayItem({
          scheduledDate: todayStr,
          loading: false,
        });
      }
    } catch (err) {
      console.error("Error fetching today's prayer:", err);
      setTodayItem({ loading: false });
    }
  };

  useEffect(() => {
    async function loadConfig() {
      try {
        setLoading(true);
        const supabase = requireSupabase();
        const { data, error } = await supabase
          .from("automation_configs")
          .select("*")
          .eq("content_type", DAILY_PRAYER)
          .maybeSingle();

        if (error) throw error;

        if (data) {
          setIsEnabled(Boolean(data.is_enabled));
          setOperatingMode(data.operating_mode || "generate_and_schedule");
          setQueueLength(data.queue_length_days || 7);
          setPublicationTime(data.publication_time || "00:00");
          setGenerationTime(data.generation_time || "02:00");
          setTimeZone(data.time_zone || "Asia/Manila");
          setGenerationQuality(data.generation_quality || "balanced");

          const cJson = (data.config_json || {}) as Record<string, any>;

          // AI Section
          if (cJson.ai) {
            if (cJson.ai.prompt) setPrompt(String(cJson.ai.prompt));
            if (cJson.ai.model) setModel(String(cJson.ai.model));
          }

          // Audio Section
          if (cJson.audio) {
            if (cJson.audio.narration_enabled !== undefined) setNarrationEnabled(Boolean(cJson.audio.narration_enabled));
            if (cJson.audio.default_profile) setDefaultProfile(String(cJson.audio.default_profile));
            if (cJson.audio.default_voice) setDefaultVoice(String(cJson.audio.default_voice));
            if (cJson.audio.default_speed) setDefaultSpeed(Number(cJson.audio.default_speed));
            if (cJson.audio.tts_model) setTtsModel(String(cJson.audio.tts_model));
          }
        }
      } catch (err) {
        console.error("Failed loading daily prayer config:", err);
        setMessage({ type: "error", text: "Failed loading target configuration." });
      } finally {
        setLoading(false);
      }
    }

    loadConfig();
    fetchTodayPrayer();
  }, []);

  const handleSave = async () => {
    try {
      setSaving(true);
      setMessage(null);
      const supabase = requireSupabase();

      // Load existing config_json to avoid wiping unrelated keys
      const { data: existingData } = await supabase
        .from("automation_configs")
        .select("config_json")
        .eq("content_type", DAILY_PRAYER)
        .maybeSingle();

      const existingConfig = (existingData?.config_json || {}) as Record<string, any>;

      const updatedConfigJson = {
        ...existingConfig,
        ai: {
          ...(existingConfig.ai || {}),
          prompt,
          model,
        },
        audio: {
          ...(existingConfig.audio || {}),
          narration_enabled: narrationEnabled,
          default_profile: defaultProfile,
          default_voice: defaultVoice,
          default_speed: defaultSpeed,
          tts_model: ttsModel,
        },
      };

      const payload = {
        content_type: DAILY_PRAYER,
        is_enabled: isEnabled,
        operating_mode: operatingMode,
        queue_length_days: Number(queueLength),
        publication_time: publicationTime,
        generation_time: generationTime,
        time_zone: timeZone,
        generation_quality: generationQuality,
        config_json: updatedConfigJson,
      };

      const { error } = await supabase
        .from("automation_configs")
        .upsert(payload, { onConflict: "content_type" });

      if (error) throw error;

      setMessage({ type: "success", text: "Daily Prayer target configuration saved successfully!" });
    } catch (err) {
      console.error("Error saving daily prayer settings:", err);
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to save configuration." });
    } finally {
      setSaving(false);
    }
  };

  const handleRunQueue = async () => {
    try {
      setRunningQueue(true);
      setQueueResult(null);
      setMessage(null);

      const { data: { session } } = await requireSupabase().auth.getSession();
      const token = session?.access_token;

      const res = await fetch("/api/ai/run-queue", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ contentType: DAILY_PRAYER }),
        signal: AbortSignal.timeout(3 * 60 * 1000),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Queue execution failed.");
      }

      setQueueResult(data.result);
      setMessage({ type: "success", text: "Daily Prayer queue processor completed." });
      await fetchTodayPrayer();
    } catch (err) {
      console.error("Queue execution error:", err);
      const text = err instanceof DOMException && err.name === "TimeoutError"
        ? "This queue run is taking longer than 3 minutes. It may still finish on the server; refresh in a few minutes to check the generated prayers."
        : err instanceof Error ? err.message : "Failed executing queue processor.";
      setMessage({ type: "error", text });
    } finally {
      setRunningQueue(false);
    }
  };

  const handleGenerateTodayNarration = async () => {
    if (!todayItem.id) return;
    try {
      setGeneratingTodayAudio(true);
      setMessage(null);

      const { data: { session } } = await requireSupabase().auth.getSession();
      const token = session?.access_token;

      const res = await fetch("/api/admin/content/generate-narration", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          contentId: todayItem.id,
          profile: defaultProfile,
          voice: defaultVoice,
          model: ttsModel,
          speed: defaultSpeed,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Narration generation failed.");
      }

      setMessage({ type: "success", text: `OpenAI Audio Narration generated successfully for Today's Prayer!` });
      await fetchTodayPrayer();
    } catch (err) {
      console.error("Error generating today's audio:", err);
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to generate narration." });
    } finally {
      setGeneratingTodayAudio(false);
    }
  };

  if (loading) {
    return (
      <div className="card p-8 text-center text-muted">
        Loading Daily Prayer target configuration…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 pb-16">
      {/* Action Header Card */}
      <section className="card bg-beige/40">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-wine">🎯 Target: Daily Prayer (Today)</h2>
            <p className="text-xs text-muted mt-1">
              Configure automation schedules, AI system prompts, and OpenAI TTS narration defaults for daily prayers.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="button secondary text-xs"
              onClick={handleRunQueue}
              disabled={runningQueue}
            >
              {runningQueue ? "Running Queue…" : "⚡ Run Daily Prayer Queue"}
            </button>
            <button
              type="button"
              className="button primary text-xs"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "Saving…" : "Save Target Settings"}
            </button>
          </div>
        </div>
      </section>

      {message && (
        <div
          className={`p-4 rounded-xl text-sm font-medium border ${
            message.type === "success"
              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
              : "bg-rose-50 text-rose-800 border-rose-200"
          }`}
        >
          {message.text}
        </div>
      )}





      {/* 1. Schedule & Automation Section */}
      {(activeTab === "all" || activeTab === "schedule") && (
        <section className="card">
          <h2 className="card-title">⏰ Today's Schedule & Queue Automation</h2>

          <div className="form-grid">
            <label className="flex items-center justify-between rounded-xl border border-line bg-beige/40 p-4 col-span-full cursor-pointer">
              <div>
                <strong className="block text-base text-ink">Enable Daily Prayer Queue Automation</strong>
                <span className="mt-0.5 block text-xs text-muted">
                  Automatically generate, review, and schedule daily prayers into the future.
                </span>
              </div>
              <input
                type="checkbox"
                className="h-5 w-5 cursor-pointer accent-wine"
                checked={isEnabled}
                onChange={(e) => setIsEnabled(e.target.checked)}
              />
            </label>

            <div className="form-columns">
              <Field label="Operating Mode" help="Controls whether new prayers are saved as drafts or published automatically.">
                <select
                  className="input cursor-pointer bg-white"
                  value={operatingMode}
                  onChange={(e) => setOperatingMode(e.target.value as any)}
                >
                  <option value="drafts_only">Drafts Only (Manual review required before live)</option>
                  <option value="generate_and_schedule">Generate & Schedule (Save as Ready at target time)</option>
                  <option value="fully_automatic">Fully Automatic (Instant live publishing)</option>
                  <option value="off">Off (Disable automatic queue worker)</option>
                </select>
              </Field>

              <Field label="Queue Horizon (Days)" help="Number of upcoming days to keep pre-populated with daily prayers.">
                <input
                  type="number"
                  min={1}
                  max={30}
                  className="input bg-white"
                  value={queueLength}
                  onChange={(e) => setQueueLength(Number(e.target.value))}
                />
              </Field>
            </div>

            <div className="form-columns">
              <Field label="Daily Publication Time (UTC)" help="Target UTC time of day when prayers become visible.">
                <input
                  type="time"
                  className="input bg-white"
                  value={publicationTime}
                  onChange={(e) => setPublicationTime(e.target.value)}
                />
              </Field>

              <Field label="Generation Time (UTC)" help="Target UTC time when background generation runs.">
                <input
                  type="time"
                  className="input bg-white"
                  value={generationTime}
                  onChange={(e) => setGenerationTime(e.target.value)}
                />
              </Field>
            </div>

            <Field label="Time Zone" help="Local timezone reference for date calculations.">
              <input
                type="text"
                className="input bg-white"
                value={timeZone}
                onChange={(e) => setTimeZone(e.target.value)}
              />
            </Field>
          </div>
        </section>
      )}

      {/* 2. AI Editorial Prompt & Model Section */}
      {(activeTab === "all" || activeTab === "ai") && (
        <section className="card">
          <h2 className="card-title">✍️ OpenAI System Prompt & Editorial Controls</h2>

          <div className="form-grid">
            <div className="form-columns">
              <Field label="OpenAI AI Model" help="OpenAI chat model used for composing daily prayer text.">
                <select
                  className="input cursor-pointer bg-white"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                >
                  <option value="gpt-4o-mini">gpt-4o-mini (Fast, cost-effective & recommended)</option>
                  <option value="gpt-4o">gpt-4o (High-capacity reasoning)</option>
                </select>
              </Field>

              <Field label="Generation Model" help="Preferred drafting AI model.">
                <select
                  className="input cursor-pointer bg-white"
                  value={generationQuality}
                  onChange={(e) => setGenerationQuality(e.target.value as any)}
                >
                  <option value="balanced">gpt-4o-mini (recommended)</option>
                  <option value="premium">gpt-4o</option>
                </select>
              </Field>
            </div>

            <div className="col-span-full">
              <Field label="Daily Prayer Editorial System Prompt" help="Primary instruction system prompt provided to OpenAI when generating Daily Prayers.">
                <textarea
                  rows={10}
                  className="input font-mono text-xs leading-relaxed bg-white"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                />
              </Field>
            </div>
          </div>
        </section>
      )}

      {/* 3. OpenAI Audio Narration Defaults Section */}
      {(activeTab === "all" || activeTab === "audio") && (
        <section className="card">
          <h2 className="card-title">🎙️ OpenAI Audio Narration Defaults</h2>

          <div className="form-grid">
            <label className="flex items-center justify-between rounded-xl border border-line bg-beige/40 p-4 col-span-full cursor-pointer">
              <div>
                <strong className="block text-base text-ink">Enable Automated OpenAI Narration</strong>
                <span className="mt-0.5 block text-xs text-muted">
                  Automatically generate and attach OpenAI TTS audio when daily prayers are processed or published.
                </span>
              </div>
              <input
                type="checkbox"
                className="h-5 w-5 cursor-pointer accent-wine"
                checked={narrationEnabled}
                onChange={(e) => setNarrationEnabled(e.target.checked)}
              />
            </label>

            <div className="form-columns">
              <Field label="Default Voice Profile" help="Default tone profile for daily prayers.">
                <select
                  className="input cursor-pointer bg-white"
                  value={defaultProfile}
                  onChange={(e) => setDefaultProfile(e.target.value)}
                >
                  <option value="gentle">Gentle Profile (Calm & Prayerful)</option>
                  <option value="solemn">Solemn Profile (Reverent & Deep)</option>
                </select>
              </Field>

              <Field label="Default OpenAI Voice" help="Default voice used when generating daily prayer audio.">
                <select
                  className="input cursor-pointer bg-white"
                  value={defaultVoice}
                  onChange={(e) => setDefaultVoice(e.target.value)}
                >
                  {OPENAI_VOICES.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="form-columns">
              <Field label="OpenAI Speech Model" help="The AI voice synthesis model used to generate audio narration files.">
                <select
                  className="input cursor-pointer bg-white"
                  value={ttsModel}
                  onChange={(e) => setTtsModel(e.target.value)}
                >
                  {TTS_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Default Narration Speed" help="Speech rate multiplier used when generating daily prayer audio.">
                <select
                  className="input cursor-pointer bg-white"
                  value={defaultSpeed}
                  onChange={(e) => setDefaultSpeed(Number(e.target.value))}
                >
                  <option value={0.75}>0.75x (Calm & Unhurried)</option>
                  <option value={0.85}>0.85x (Prayer Pace - Recommended)</option>
                  <option value={1.00}>1.00x (Normal Default)</option>
                  <option value={1.15}>1.15x (Brisk)</option>
                </select>
              </Field>
            </div>
          </div>
        </section>
      )}

      {/* Queue Processing Execution Results */}
      {queueResult && (
        <section className="card bg-gray-50 border border-line">
          <h3 className="text-sm font-bold text-ink mb-2">Queue Processor Execution Log</h3>
          <p className="text-xs text-muted mb-3">{queueResult.message}</p>

          {queueResult.generated_prayers?.length > 0 && (
            <div className="space-y-2">
              <span className="text-xs font-semibold text-emerald-800">Generated Prayers:</span>
              <ul className="text-xs space-y-1">
                {queueResult.generated_prayers.map((gp: any, idx: number) => (
                  <li key={idx} className="flex items-center justify-between border-b border-gray-200 pb-1">
                    <span>📅 {gp.scheduled_date}: <strong>{gp.title}</strong> ({gp.intention})</span>
                    <span className="uppercase text-[10px] px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">{gp.status}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
