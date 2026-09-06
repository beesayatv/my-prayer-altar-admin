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
5. ENDING: End the final sentence smoothly with ", Amen." (e.g. "...through Christ our Lord, Amen.").
6. NO EXTRA TEXT: Return ONLY a raw valid JSON object matching the requested schema. No markdown formatting outside the JSON, no code blocks, no conversational preamble.

SCHEMA REQUIREMENTS:
Return a JSON object with these exact string keys:
- "title": A clear, inspiring prayer title (e.g. "A Prayer for Peace in Times of Anxiety").
- "intention": A refined 3-6 word intention summary.
- "excerpt": A concise 1-2 sentence summary for a feed preview card.
- "body": The complete written prayer text formatted into clean paragraphs, ending with ", Amen.".`;

const DEFAULT_WEEKLY_INTENTIONS: Record<string, { intention: string; theme: string }> = {
  "1": { intention: "Gratitude and Morning Offering", theme: "Beginning the week in faith, work, and dedication" },
  "2": { intention: "Holy Spirit and Guidance", theme: "Wisdom, clarity, and discernment in daily choices" },
  "3": { intention: "St. Joseph and Family Protection", theme: "Family, honest labor, and quiet strength" },
  "4": { intention: "Holy Eucharist and Praise", theme: "Thanksgiving, Eucharistic adoration, and fellowship" },
  "5": { intention: "Sacred Heart and Divine Mercy", theme: "Forgiveness, reconciliation, and healing" },
  "6": { intention: "Blessed Virgin Mary and Peace", theme: "Serenity, Marian intercession, and quiet reflection" },
  "0": { intention: "Lord's Day and Resurrection Joy", theme: "Praise, parish community, and spiritual renewal" },
};

const DAY_NAMES: Record<string, string> = {
  "1": "Monday",
  "2": "Tuesday",
  "3": "Wednesday",
  "4": "Thursday",
  "5": "Friday",
  "6": "Saturday",
  "0": "Sunday",
};

export function DailyPrayerTargetSettingsForm() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [runningQueue, setRunningQueue] = useState(false);
  const [queueResult, setQueueResult] = useState<any | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

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
  const [languageCode, setLanguageCode] = useState<AutomationConfigRecord["language_code"]>("en");
  const [preferredLength, setPreferredLength] = useState<AutomationConfigRecord["preferred_length"]>("standard");
  const [generationQuality, setGenerationQuality] = useState<AutomationConfigRecord["generation_quality"]>("balanced");
  const [themeStrategy, setThemeStrategy] = useState<AutomationConfigRecord["theme_strategy"]>("rotation_enabled");

  // Weekly Intentions state
  const [weeklyIntentions, setWeeklyIntentions] = useState<Record<string, { intention: string; theme: string }>>(
    DEFAULT_WEEKLY_INTENTIONS
  );
  const [activeDayTab, setActiveDayTab] = useState<string>("1");

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
          setLanguageCode((data.language_code as any) || "en");
          setPreferredLength((data.preferred_length as any) || "standard");
          setGenerationQuality((data.generation_quality as any) || "balanced");
          setThemeStrategy((data.theme_strategy as any) || "rotation_enabled");

          const cJson = (data.config_json || {}) as Record<string, any>;

          // AI Model & System Instruction
          if (cJson.ai) {
            if (cJson.ai.prompt) setPrompt(String(cJson.ai.prompt));
            if (cJson.ai.model) setModel(String(cJson.ai.model));
          } else if (cJson.custom_system_instruction) {
            setPrompt(String(cJson.custom_system_instruction));
          }

          // Weekly Intentions
          if (cJson.weekly_intentions && typeof cJson.weekly_intentions === "object") {
            setWeeklyIntentions({
              ...DEFAULT_WEEKLY_INTENTIONS,
              ...(cJson.weekly_intentions as Record<string, { intention: string; theme: string }>),
            });
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
  }, []);

  const handleSave = async () => {
    try {
      setSaving(true);
      setMessage(null);
      const supabase = requireSupabase();

      // Load existing config_json to preserve any existing metadata
      const { data: existingData } = await supabase
        .from("automation_configs")
        .select("config_json")
        .eq("content_type", DAILY_PRAYER)
        .maybeSingle();

      const existingConfig = (existingData?.config_json || {}) as Record<string, any>;

      const updatedConfigJson = {
        ...existingConfig,
        custom_system_instruction: prompt,
        weekly_intentions: weeklyIntentions,
        ai: {
          ...(existingConfig.ai || {}),
          prompt,
          model,
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
        language_code: languageCode,
        preferred_length: preferredLength,
        generation_quality: generationQuality,
        theme_strategy: themeStrategy,
        config_json: updatedConfigJson,
      };

      const { error } = await supabase
        .from("automation_configs")
        .upsert(payload, { onConflict: "content_type" });

      if (error) throw error;

      setMessage({ type: "success", text: "Daily Prayer engine configuration saved successfully!" });
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

  return (
    <div className="flex flex-col gap-8 pb-16">
      {/* Action Header Card */}
      <section className="card bg-beige/40">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-wine">🎯 Daily Prayer Engine Settings</h2>
            <p className="text-xs text-muted mt-1">
              Govern how daily prayers are generated: drafting model, editorial prompt, weekly day intentions, and schedule horizon.
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
              {saving ? "Saving…" : "Save Engine Settings"}
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
      <section className="card">
        <h2 className="card-title">⏰ Schedule &amp; Queue Automation</h2>

        <div className="form-grid">
          <label className="flex items-center justify-between rounded-xl border border-line bg-beige/40 p-4 col-span-full cursor-pointer">
            <div>
              <strong className="block text-base text-ink">Enable Daily Prayer Queue Automation</strong>
              <span className="mt-0.5 block text-xs text-muted">
                Automatically generate and schedule upcoming daily prayers based on the rules below.
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
            <Field label="Operating Mode" help="Controls whether new prayers are saved as drafts or scheduled automatically.">
              <select
                className="input cursor-pointer bg-white"
                value={operatingMode}
                onChange={(e) => setOperatingMode(e.target.value as any)}
              >
                <option value="drafts_only">Drafts Only (Manual review required before live)</option>
                <option value="generate_and_schedule">Generate &amp; Schedule (Save as Ready at target time)</option>
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

      {/* 2. AI Editorial Prompt & Model Section */}
      <section className="card space-y-6">
        <div className="border-b border-line pb-3">
          <h2 className="card-title text-base font-bold text-ink m-0">✍️ AI Generation Engine &amp; Editorial Prompt</h2>
          <p className="text-xs text-muted mt-0.5">
            Configure the AI language model, language, length, and core theological instructions that govern prayer drafting.
          </p>
        </div>

        <div className="form-grid">
          <div className="bg-beige/30 p-3.5 rounded-xl border border-line flex flex-col sm:flex-row sm:items-center justify-between gap-3 col-span-full">
            <div>
              <span className="text-xs font-semibold text-ink flex items-center gap-1.5">
                <span>🤖</span> AI Drafting Model &amp; Language defaults are managed in <strong>Text Studio</strong>
              </span>
              <p className="text-[11px] text-muted mt-0.5">
                Current model: <strong className="text-wine">{model}</strong> · Language: <strong className="text-wine">{languageCode.toUpperCase()}</strong>
              </p>
            </div>
            <Link href="/settings/text-studio" className="button secondary text-xs whitespace-nowrap self-start sm:self-auto">
              Open Text Studio →
            </Link>
          </div>

          <div className="form-columns">
            <Field label="Target Prayer Length" help="Controls the length and structure of generated prayers.">
              <select
                className="input cursor-pointer bg-white"
                value={preferredLength}
                onChange={(e) => setPreferredLength(e.target.value as any)}
              >
                <option value="short">Short (~100 words)</option>
                <option value="standard">Standard (~200 words · Recommended)</option>
                <option value="long">Long (~350 words)</option>
              </select>
            </Field>

            <Field label="Theme Strategy" help="How daily prayer topics are determined across the week.">
              <select
                className="input cursor-pointer bg-white"
                value={themeStrategy}
                onChange={(e) => setThemeStrategy(e.target.value as any)}
              >
                <option value="rotation_enabled">📅 Weekly Day Rotation (Monday–Sunday themes below)</option>
                <option value="ai_selected">✨ AI Dynamic Theme Selection</option>
              </select>
            </Field>
          </div>

          <div className="col-span-full">
            <div className="flex items-center justify-between mb-1.5">
              <div>
                <label className="text-xs font-semibold text-ink">Daily Prayer Editorial System Instruction</label>
                <p className="text-[11px] text-muted mt-0.5">
                  The foundational prompt guiding the tone, structure, and doctrinal safeguards for every generated prayer.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPrompt(DEFAULT_EDITORIAL_PROMPT)}
                className="text-[11px] text-wine hover:underline cursor-pointer font-medium"
              >
                Reset to Default Prompt
              </button>
            </div>
            <textarea
              rows={11}
              className="input font-mono text-xs leading-relaxed bg-white w-full"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </div>
        </div>
      </section>

      {/* 3. Weekly Intention Rotation (Monday–Sunday) */}
      <section className="card space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-line pb-3 gap-2">
          <div>
            <h2 className="card-title text-base font-bold text-ink m-0">📅 Weekly Intention Rotation</h2>
            <p className="text-xs text-muted mt-0.5">
              Set the primary intention and devotional focus for each day of the week. Used by the queue generator when Weekly Day Rotation is active.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setWeeklyIntentions(DEFAULT_WEEKLY_INTENTIONS)}
            className="button secondary text-xs self-start sm:self-auto cursor-pointer"
          >
            Reset All Intentions
          </button>
        </div>

        {/* Day Tabs */}
        <div className="flex flex-wrap gap-1.5 border-b border-line pb-3">
          {["1", "2", "3", "4", "5", "6", "0"].map((dayKey) => (
            <button
              key={dayKey}
              type="button"
              onClick={() => setActiveDayTab(dayKey)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                activeDayTab === dayKey
                  ? "bg-wine text-white shadow-xs"
                  : "bg-beige/60 text-muted hover:bg-beige hover:text-ink"
              }`}
            >
              {DAY_NAMES[dayKey]}
            </button>
          ))}
        </div>

        {/* Active Day Editor */}
        {(() => {
          const currentDay = weeklyIntentions[activeDayTab] || { intention: "", theme: "" };
          return (
            <div className="bg-beige/30 p-4 rounded-xl border border-line space-y-3">
              <h3 className="text-xs font-bold text-wine uppercase tracking-wider m-0">
                {DAY_NAMES[activeDayTab]} Intention &amp; Theme
              </h3>

              <Field label="Primary Intention Title" help="Main intention topic for this day.">
                <input
                  type="text"
                  className="input bg-white"
                  value={currentDay.intention}
                  onChange={(e) =>
                    setWeeklyIntentions((prev) => ({
                      ...prev,
                      [activeDayTab]: { ...(prev[activeDayTab] || { intention: "", theme: "" }), intention: e.target.value },
                    }))
                  }
                  placeholder="e.g. Holy Spirit and Guidance"
                />
              </Field>

              <Field label="Inspiration & Theme Guidance" help="Guidance and focus areas given to the AI for this day's prayer.">
                <textarea
                  rows={2}
                  className="input text-xs bg-white w-full"
                  value={currentDay.theme}
                  onChange={(e) =>
                    setWeeklyIntentions((prev) => ({
                      ...prev,
                      [activeDayTab]: { ...(prev[activeDayTab] || { intention: "", theme: "" }), theme: e.target.value },
                    }))
                  }
                  placeholder="e.g. Wisdom, clarity, and discernment in daily choices..."
                />
              </Field>
            </div>
          );
        })()}
      </section>

      {/* Studio Cross-Links */}
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="card bg-beige/20 border border-line p-4 flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-wine block">✍️ Text Studio</span>
            <p className="text-[11px] text-muted mt-0.5">Centralized default AI drafting models across all features.</p>
          </div>
          <Link href="/settings/text-studio" className="button secondary text-xs whitespace-nowrap">
            Open Text Studio →
          </Link>
        </div>

        <div className="card bg-beige/20 border border-line p-4 flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-wine block">🎙️ Voice Studio</span>
            <p className="text-[11px] text-muted mt-0.5">Configure default TTS narration voices &amp; speeds.</p>
          </div>
          <Link href="/settings/voice-studio" className="button secondary text-xs whitespace-nowrap">
            Open Voice Studio →
          </Link>
        </div>
      </section>

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
