"use client";

import { useEffect, useState } from "react";
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
const QUEUE_REQUEST_TIMEOUT_MS = 3 * 60 * 1000;

export function AutomationSettingsForm() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [runningQueue, setRunningQueue] = useState(false);
  const [queueResult, setQueueResult] = useState<any | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [configJson, setConfigJson] = useState<Record<string, unknown>>({});
  const [isEnabled, setIsEnabled] = useState(false);
  const [operatingMode, setOperatingMode] = useState<AutomationConfigRecord["operating_mode"]>("generate_and_schedule");
  const [queueLength, setQueueLength] = useState(7);
  const [publicationTime, setPublicationTime] = useState("00:00");
  const [generationTime, setGenerationTime] = useState("02:00");
  const [timeZone, setTimeZone] = useState("Asia/Manila");
  const [languageCode, setLanguageCode] = useState<AutomationConfigRecord["language_code"]>("en");
  const [preferredLength, setPreferredLength] = useState<AutomationConfigRecord["preferred_length"]>("standard");
  const [generationQuality, setGenerationQuality] = useState<AutomationConfigRecord["generation_quality"]>("balanced");
  const [themeStrategy, setThemeStrategy] = useState<AutomationConfigRecord["theme_strategy"]>("rotation_enabled");

  // Editable Prompt & Weekly Intentions
  const [customSystemInstruction, setCustomSystemInstruction] = useState(DEFAULT_EDITORIAL_PROMPT);
  const [weeklyIntentions, setWeeklyIntentions] = useState<Record<string, { intention: string; theme: string }>>(DEFAULT_WEEKLY_INTENTIONS);
  const [activeDayTab, setActiveDayTab] = useState("1");

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const { data, error } = await requireSupabase()
          .from("automation_configs")
          .select("*")
          .eq("content_type", DAILY_PRAYER)
          .maybeSingle();

        if (!active) return;
        if (error) {
          setMessage({ type: "error", text: "The Daily Prayer settings could not be loaded. Please refresh and try again." });
          return;
        }

        if (data) {
          setIsEnabled(data.is_enabled ?? false);
          setOperatingMode(data.operating_mode ?? "generate_and_schedule");
          setQueueLength(data.queue_length_days ?? 7);
          setPublicationTime(data.publication_time ?? "00:00");
          setGenerationTime(data.generation_time ?? "02:00");
          setTimeZone(data.time_zone ?? "Asia/Manila");
          setLanguageCode(data.language_code ?? "en");
          setPreferredLength(data.preferred_length ?? "standard");
          setGenerationQuality(data.generation_quality ?? "balanced");
          setThemeStrategy(data.theme_strategy ?? "rotation_enabled");
          
          const json = (data.config_json as Record<string, unknown>) || {};
          setConfigJson(json);

          if (json.custom_system_instruction) {
            setCustomSystemInstruction(String(json.custom_system_instruction));
          }
          if (json.weekly_intentions && typeof json.weekly_intentions === "object") {
            setWeeklyIntentions({ ...DEFAULT_WEEKLY_INTENTIONS, ...(json.weekly_intentions as any) });
          }
        }
      } catch {
        if (active) setMessage({ type: "error", text: "The Daily Prayer settings could not be loaded. Please refresh and try again." });
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => { active = false; };
  }, []);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const { error } = await requireSupabase().from("automation_configs").upsert({
        content_type: DAILY_PRAYER,
        is_enabled: isEnabled,
        operating_mode: operatingMode,
        queue_length_days: queueLength,
        publication_time: publicationTime,
        generation_time: generationTime,
        time_zone: timeZone,
        language_code: languageCode,
        preferred_length: preferredLength,
        generation_quality: generationQuality,
        theme_strategy: themeStrategy,
        config_json: {
          ...configJson,
          custom_system_instruction: customSystemInstruction,
          weekly_intentions: weeklyIntentions,
          last_saved_at: new Date().toISOString(),
        },
      }, { onConflict: "content_type" });

      setMessage(error
        ? { type: "error", text: "The settings could not be saved. Please try again." }
        : { type: "success", text: "Daily Prayer automation settings and custom AI instructions have been saved." });
    } catch {
      setMessage({ type: "error", text: "The settings could not be saved. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  async function handleRunQueueNow() {
    setRunningQueue(true);
    setQueueResult(null);
    try {
      const supabase = requireSupabase();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setQueueResult({ status: "error", message: "User session expired. Please log in again." });
        return;
      }

      const res = await fetch("/api/ai/run-queue", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(QUEUE_REQUEST_TIMEOUT_MS),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        setQueueResult({ status: "error", message: json.error || "Failed to execute queue processor." });
      } else {
        setQueueResult(json.result);
      }
    } catch (err: unknown) {
      const msg = err instanceof DOMException && err.name === "TimeoutError"
        ? "This queue run is taking longer than 3 minutes. It may still finish on the server; refresh this page in a few minutes to check the generated prayers."
        : err instanceof Error ? err.message : "An unexpected error occurred.";
      setQueueResult({ status: "error", message: msg });
    } finally {
      setRunningQueue(false);
    }
  }

  const handleWeeklyIntentionChange = (dayKey: string, field: "intention" | "theme", value: string) => {
    setWeeklyIntentions((prev) => ({
      ...prev,
      [dayKey]: {
        ...(prev[dayKey] || { intention: "", theme: "" }),
        [field]: value,
      },
    }));
  };

  const handleResetPromptToDefault = () => {
    setCustomSystemInstruction(DEFAULT_EDITORIAL_PROMPT);
  };

  const handleResetIntentionsToDefault = () => {
    setWeeklyIntentions(DEFAULT_WEEKLY_INTENTIONS);
  };

  if (loading) return <p className="status-line">Loading Daily Prayer settings…</p>;

  return (
    <div className="flex max-w-4xl flex-col gap-8 pb-16">
      {/* Manual Run Queue Card */}
      <section className="card border-wine/30 bg-wine/5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-wine">Run Automation Queue Now</h2>
            <p className="text-xs text-muted mt-1">
              Instantly inspect missing dates for the next {queueLength} days and generate required Daily Prayers using your custom system instructions and weekly themes below.
            </p>
          </div>
          <button
            type="button"
            onClick={handleRunQueueNow}
            disabled={runningQueue}
            className="button px-6 py-2.5 text-sm shadow flex items-center justify-center gap-2 whitespace-nowrap"
          >
            {runningQueue ? (
              <>
                <span className="animate-spin text-base">⏳</span>
                <span>Generating Prayers &amp; Audio…</span>
              </>
            ) : (
              "⚡ Run Queue Now"
            )}
          </button>
        </div>

        {/* Active Generation Progress Indicator */}
        {runningQueue && (
          <div className="mt-4 p-4 rounded-xl bg-amber-50/80 border border-amber-300/80 flex flex-col gap-2.5 animate-pulse">
            <div className="flex items-center gap-3">
              <span className="text-xl">✨</span>
              <div>
                <strong className="text-xs font-bold text-amber-900 uppercase tracking-wider block">
                  Automated Engine Active — Please Wait
                </strong>
                <p className="text-xs text-amber-800 m-0">
                  Generating the missing prayers and their audio. This can take a few minutes when several dates are missing.
                </p>
              </div>
            </div>
            <div className="w-full bg-amber-200 h-1.5 rounded-full overflow-hidden">
              <div className="bg-amber-600 h-full rounded-full animate-indeterminate" style={{ width: "60%" }} />
            </div>
          </div>
        )}

        {queueResult && !runningQueue && (
          <div className="mt-4 pt-4 border-t border-line/60 text-sm">
            <div className={`p-3 rounded-lg text-xs font-medium mb-3 ${
              queueResult.status === "success" ? "bg-emerald-100 text-emerald-900 border border-emerald-300" :
              queueResult.status === "off" ? "bg-amber-100 text-amber-900 border border-amber-300" :
              "bg-rose-100 text-rose-900 border border-rose-300"
            }`}>
              <strong>Status: {String(queueResult.status).toUpperCase()}</strong> — {queueResult.message}
            </div>

            {queueResult.api_failures && queueResult.api_failures.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-semibold text-rose-800 mb-1.5">
                  API / Database Failures ({queueResult.api_failures.length}):
                </p>
                <ul className="space-y-1.5 text-xs">
                  {queueResult.api_failures.map((f: any, idx: number) => (
                    <li key={idx} className="bg-rose-50 p-2.5 rounded-lg border border-rose-200 text-rose-900 font-mono">
                      <strong>{f.date}:</strong> {f.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {queueResult.skipped_dates && queueResult.skipped_dates.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-semibold text-muted mb-1">
                  Skipped Dates ({queueResult.skipped_dates.length}):
                </p>
                <ul className="space-y-1 text-xs">
                  {queueResult.skipped_dates.map((s: any, idx: number) => (
                    <li key={idx} className="text-muted">
                      • <span className="font-mono">{s.date}:</span> {s.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {queueResult.generated_prayers && queueResult.generated_prayers.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-semibold text-ink mb-1.5">
                  Generated {queueResult.generated_prayers.length} Prayer(s):
                </p>
                <ul className="space-y-1.5 text-xs">
                  {queueResult.generated_prayers.map((p: any, idx: number) => (
                    <li key={idx} className="flex items-center justify-between gap-2 bg-white/90 p-2.5 rounded-lg border border-line shadow-sm">
                      <span className="font-mono text-muted font-medium">{p.scheduled_date}</span>
                      <span className="font-semibold text-ink truncate max-w-md">{p.title}</span>
                      <span className="text-xs px-2 py-0.5 rounded bg-beige text-wine font-medium uppercase">{p.status}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>

      <form onSubmit={save} className="flex flex-col gap-8">
        {message && <div className={`alert ${message.type === "success" ? "success" : "error"}`} role="alert">{message.text}</div>}

        <section className="card">
          <h2 className="card-title">Automation Control</h2>
          <div className="form-grid">
            <label className="flex items-center justify-between rounded-xl border border-line bg-beige/40 p-4">
              <span>
                <strong className="block text-base text-ink">Enable Daily Prayer automation</strong>
                <span className="mt-0.5 block text-xs text-muted">
                  Controls whether background queue runs will generate and schedule upcoming prayers.
                </span>
              </span>
              <input type="checkbox" className="h-6 w-6 cursor-pointer accent-wine" checked={isEnabled} onChange={(event) => setIsEnabled(event.target.checked)} />
            </label>
            <Field label="Operating mode" help="How generated Daily Prayers should be prepared when automation runs.">
              <select className="select" value={operatingMode} onChange={(event) => setOperatingMode(event.target.value as AutomationConfigRecord["operating_mode"])}>
                <option value="off">Off — manual creation only</option>
                <option value="drafts_only">Drafts only — review required</option>
                <option value="generate_and_schedule">Generate and schedule</option>
                <option value="fully_automatic">Fully automatic</option>
              </select>
            </Field>
          </div>
        </section>

        {/* Editable AI System Instruction Section */}
        <section className="card">
          <div className="flex items-center justify-between border-b border-line pb-3 mb-4">
            <div>
              <h2 className="text-lg font-semibold text-ink">Custom AI System Instruction</h2>
              <p className="text-xs text-muted mt-0.5">
                Customize the exact Catholic editorial prompt and tone rules given to OpenAI.
              </p>
            </div>
            <button
              type="button"
              onClick={handleResetPromptToDefault}
              className="button secondary compact text-xs"
            >
              Reset to Default Prompt
            </button>
          </div>
          <textarea
            rows={12}
            className="input font-mono text-xs leading-relaxed"
            value={customSystemInstruction}
            onChange={(e) => setCustomSystemInstruction(e.target.value)}
            placeholder="Enter custom AI system instructions..."
          />
        </section>

        {/* Editable Weekly Intention Rotation Section */}
        <section className="card">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-line pb-4 mb-4 gap-4">
            <div>
              <h2 className="text-lg font-semibold text-ink">Weekly Intention Rotation (Monday – Sunday)</h2>
              <p className="text-xs text-muted mt-0.5">
                Customize the theme selection strategy and primary intention assigned to each day of the week.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-muted whitespace-nowrap">Strategy:</span>
                <select
                  className="select text-xs py-1.5 px-3 bg-white"
                  value={themeStrategy}
                  onChange={(e) => setThemeStrategy(e.target.value as AutomationConfigRecord["theme_strategy"])}
                >
                  <option value="rotation_enabled">📅 Weekly Day Rotation (Recommended)</option>
                  <option value="ai_selected">✨ AI Dynamic Theme Selection</option>
                </select>
              </div>
              <button
                type="button"
                onClick={handleResetIntentionsToDefault}
                className="button secondary compact text-xs whitespace-nowrap"
              >
                Reset Intentions
              </button>
            </div>
          </div>

          {/* Day Tabs Navigation */}
          <div className="flex flex-wrap gap-1.5 border-b border-line pb-3 mb-5">
            {["1", "2", "3", "4", "5", "6", "0"].map((dayKey) => (
              <button
                key={dayKey}
                type="button"
                onClick={() => setActiveDayTab(dayKey)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  activeDayTab === dayKey
                    ? "bg-wine text-white shadow-sm"
                    : "bg-beige/60 text-muted hover:bg-beige hover:text-ink"
                }`}
              >
                {DAY_NAMES[dayKey]}
              </button>
            ))}
          </div>

          {/* Active Day Tab Editor */}
          {(() => {
            const currentDay = weeklyIntentions[activeDayTab] || { intention: "", theme: "" };
            return (
              <div className="bg-beige/30 p-4 rounded-xl border border-line flex flex-col gap-4">
                <h3 className="text-sm font-bold text-wine uppercase tracking-wider">
                  {DAY_NAMES[activeDayTab]} Intention Settings
                </h3>

                <Field label="Primary Intention Title" help="Main intention topic for this day (e.g. Gratitude, Holy Spirit, St. Joseph).">
                  <input
                    type="text"
                    className="input"
                    value={currentDay.intention}
                    onChange={(e) => handleWeeklyIntentionChange(activeDayTab, "intention", e.target.value)}
                    placeholder="e.g. Holy Spirit and Guidance"
                  />
                </Field>

                <Field label="Inspiration & Theme Description" help="Detailed guidance on focus areas for the prayer.">
                  <textarea
                    rows={3}
                    className="input text-xs"
                    value={currentDay.theme}
                    onChange={(e) => handleWeeklyIntentionChange(activeDayTab, "theme", e.target.value)}
                    placeholder="e.g. Wisdom, clarity, and discernment in daily choices..."
                  />
                </Field>
              </div>
            );
          })()}
        </section>

        <section className="card"><h2 className="card-title">Rolling Queue Management</h2><Field label="Queue length" help="Number of upcoming days to keep prepared."><select className="select w-48" value={queueLength} onChange={(event) => setQueueLength(Number(event.target.value))}><option value={3}>3 days</option><option value={7}>7 days</option><option value={14}>14 days</option><option value={30}>30 days</option></select></Field></section>

        <section className="card"><h2 className="card-title">Schedule & Timings</h2><div className="form-grid"><div className="form-columns"><Field label="Generation time" help="Preferred queue-check time."><input type="time" className="input" value={generationTime} onChange={(event) => setGenerationTime(event.target.value)} /></Field><Field label="Publication time" help="Preferred time for a scheduled prayer to appear."><input type="time" className="input" value={publicationTime} onChange={(event) => setPublicationTime(event.target.value)} /></Field></div><Field label="Time zone" help="Standard time zone for this schedule."><select className="select w-72" value={timeZone} onChange={(event) => setTimeZone(event.target.value)}><option value="Asia/Manila">Asia/Manila (UTC+8)</option><option value="UTC">UTC</option><option value="America/New_York">America/New York</option><option value="Europe/London">Europe/London</option><option value="Asia/Tokyo">Asia/Tokyo</option></select></Field></div></section>

        <section className="card"><h2 className="card-title">Generation Defaults</h2><div className="form-grid"><div className="form-columns"><Field label="Default language" help="Primary language for Daily Prayer drafts."><select className="select" value={languageCode} onChange={(event) => setLanguageCode(event.target.value as AutomationConfigRecord["language_code"])}><option value="en">English</option><option value="ceb">Cebuano</option><option value="fil">Filipino</option></select></Field><Field label="Prayer length" help="Target length preference."><select className="select" value={preferredLength} onChange={(event) => setPreferredLength(event.target.value as AutomationConfigRecord["preferred_length"])}><option value="short">Short</option><option value="standard">Standard</option><option value="long">Long</option></select></Field></div><Field label="Generation model" help="Preferred AI model for drafting."><select className="select w-72" value={generationQuality} onChange={(event) => setGenerationQuality(event.target.value as AutomationConfigRecord["generation_quality"])}><option value="balanced">gpt-4o-mini (recommended)</option><option value="premium">gpt-4o</option></select></Field></div></section>



        <div><button type="submit" className="button px-8 py-3 shadow-md" disabled={saving}>{saving ? "Saving settings…" : "Save automation settings"}</button></div>
      </form>
    </div>
  );
}
