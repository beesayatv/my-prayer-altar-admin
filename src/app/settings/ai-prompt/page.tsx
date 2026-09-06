"use client";

import { useEffect, useState } from "react";
import { AdminGate } from "@/components/AdminGate";
import { Field } from "@/components/ContentEditor";
import { requireSupabase } from "@/lib/supabase";

interface AiPromptConfig {
  feature_key: string;
  system_instruction: string;
  min_words: number;
  max_words: number;
  include_jesus_name: boolean;
  include_mary_intercession: boolean;
  include_saints_intercession: boolean;
  include_holy_spirit: boolean;
  include_scripture_references: boolean;
  model_name: string;
  temperature: number;
  additional_rules: string;
  narration_enabled: boolean;
  narration_tts_model: string;
  narration_voice: string;
  narration_speed: number;
  narration_delivery_style: string;
  guide_enabled: boolean;
  guide_model_name: string;
  guide_max_followups: number;
  guide_max_options: number;
  premium_model_name: string;
  premium_min_words_standard: number;
  premium_max_words_standard: number;
  premium_min_words_long: number;
  premium_max_words_long: number;
}

const OPENAI_VOICES = [
  { id: "marin", label: "Marin (Female · Gentle & warm)" },
  { id: "coral", label: "Coral (Female · Soft & clear)" },
  { id: "nova", label: "Nova (Female · Bright & energetic)" },
  { id: "shimmer", label: "Shimmer (Female · Expressive)" },
  { id: "ash", label: "Ash (Male · Solemn & reverent)" },
  { id: "cedar", label: "Cedar (Male · Deep & resonant)" },
  { id: "onyx", label: "Onyx (Male · Grounded & serious)" },
  { id: "echo", label: "Echo (Male · Smooth & clear)" },
];

const GEMINI_VOICES = [
  { id: "Sulafat", label: "Sulafat (Female · Warm & devotional - Recommended)" },
  { id: "Vindemiatrix", label: "Vindemiatrix (Female · Gentle & soft)" },
  { id: "Aoede", label: "Aoede (Female · Breezy & serene)" },
  { id: "Kore", label: "Kore (Female · Clear & solemn)" },
  { id: "Despina", label: "Despina (Female · Smooth & reflective)" },
  { id: "Achernar", label: "Achernar (Female · Soft & quiet)" },
  { id: "Zephyr", label: "Zephyr (Female · Bright & uplifting)" },
  { id: "Schedar", label: "Schedar (Male · Even, calm & measured - Recommended)" },
  { id: "Charon", label: "Charon (Male · Deep, solemn & contemplative)" },
  { id: "Algieba", label: "Algieba (Male · Smooth & reverent)" },
  { id: "Enceladus", label: "Enceladus (Male · Breathy & prayerful)" },
  { id: "Iapetus", label: "Iapetus (Male · Clear & grounded)" },
  { id: "Puck", label: "Puck (Male · Natural & warm)" },
];

const DEFAULT_MY_ALTAR_PROMPT = `You write personal Catholic prayers for the My Prayer Altar app. Return your response strictly as a JSON object with keys "title", "prayer", and "theme".`;

export default function AiPromptSettingsPage() {
  const [config, setConfig] = useState<AiPromptConfig>({
    feature_key: "my_altar_prayer",
    system_instruction: DEFAULT_MY_ALTAR_PROMPT,
    min_words: 180,
    max_words: 250,
    include_jesus_name: true,
    include_mary_intercession: false,
    include_saints_intercession: false,
    include_holy_spirit: false,
    include_scripture_references: false,
    model_name: "gpt-4o-mini",
    temperature: 0.70,
    additional_rules: "- Address God directly with warm, reverent language.\n- Do not preach or judge.\n- End with \"Amen.\"",
    narration_enabled: true,
    narration_tts_model: "gpt-4o-mini-tts",
    narration_voice: "marin",
    narration_speed: 0.85,
    narration_delivery_style: "Speak calmly, prayerfully, and with a warm, measured pace.",
    guide_enabled: true,
    guide_model_name: "gpt-4o-mini",
    guide_max_followups: 2,
    guide_max_options: 4,
    premium_model_name: "gpt-4o",
    premium_min_words_standard: 180,
    premium_max_words_standard: 250,
    premium_min_words_long: 300,
    premium_max_words_long: 400,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    let active = true;
    async function loadConfig() {
      try {
        const supabase = requireSupabase();
        const { data, error } = await supabase
          .from("ai_prompt_configs")
          .select("*")
          .eq("feature_key", "my_altar_prayer")
          .maybeSingle();

        if (error) throw error;
        if (data && active) {
          setConfig({
            feature_key: data.feature_key,
            system_instruction: data.system_instruction || DEFAULT_MY_ALTAR_PROMPT,
            min_words: data.min_words ?? 180,
            max_words: data.max_words ?? 250,
            include_jesus_name: Boolean(data.include_jesus_name),
            include_mary_intercession: Boolean(data.include_mary_intercession),
            include_saints_intercession: Boolean(data.include_saints_intercession),
            include_holy_spirit: Boolean(data.include_holy_spirit),
            include_scripture_references: Boolean(data.include_scripture_references),
            model_name: data.model_name || "gpt-4o-mini",
            temperature: Number(data.temperature) || 0.70,
            additional_rules: data.additional_rules || "",
            narration_enabled: data.narration_enabled ?? true,
            narration_tts_model: data.narration_tts_model || "gpt-4o-mini-tts",
            narration_voice: data.narration_voice || "marin",
            narration_speed: Number(data.narration_speed) || 0.85,
            narration_delivery_style: data.narration_delivery_style || "Speak calmly, prayerfully, and with a warm, measured pace.",
            guide_enabled: data.guide_enabled ?? true,
            guide_model_name: data.guide_model_name || "gpt-4o-mini",
            guide_max_followups: Number(data.guide_max_followups) || 2,
            guide_max_options: Number(data.guide_max_options) || 4,
            premium_model_name: data.premium_model_name || "gpt-4o",
            premium_min_words_standard: data.premium_min_words_standard ?? 180,
            premium_max_words_standard: data.premium_max_words_standard ?? 250,
            premium_min_words_long: data.premium_min_words_long ?? 300,
            premium_max_words_long: data.premium_max_words_long ?? 400,
          });
        }
      } catch (err: unknown) {
        console.error("Failed to load prompt config:", err);
        if (active) setMessage({ type: "error", text: "Could not load AI prompt configuration from Supabase." });
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadConfig();
    return () => { active = false; };
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const supabase = requireSupabase();
      const { error } = await supabase.from("ai_prompt_configs").upsert({
        feature_key: "my_altar_prayer",
        system_instruction: config.system_instruction,
        min_words: Number(config.min_words),
        max_words: Number(config.max_words),
        include_jesus_name: config.include_jesus_name,
        include_mary_intercession: config.include_mary_intercession,
        include_saints_intercession: config.include_saints_intercession,
        include_holy_spirit: config.include_holy_spirit,
        include_scripture_references: config.include_scripture_references,
        model_name: config.model_name,
        temperature: Number(config.temperature),
        additional_rules: config.additional_rules,
        narration_enabled: config.narration_enabled,
        narration_tts_model: config.narration_tts_model,
        narration_voice: config.narration_voice,
        narration_speed: Number(config.narration_speed),
        narration_delivery_style: config.narration_delivery_style,
        guide_enabled: config.guide_enabled,
        guide_model_name: config.guide_model_name,
        guide_max_followups: Number(config.guide_max_followups),
        guide_max_options: Number(config.guide_max_options),
        premium_model_name: config.premium_model_name,
        premium_min_words_standard: Number(config.premium_min_words_standard),
        premium_max_words_standard: Number(config.premium_max_words_standard),
        premium_min_words_long: Number(config.premium_min_words_long),
        premium_max_words_long: Number(config.premium_max_words_long),
        updated_at: new Date().toISOString(),
      }, { onConflict: "feature_key" });

      if (error) throw error;
      setMessage({ type: "success", text: "My Altar Prayer AI prompt configuration saved! Changes are now live for app users." });
    } catch (err: unknown) {
      console.error("Save error:", err);
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to save configuration." });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="status-line">Loading My Altar Prayer settings…</p>;

  return (
    <AdminGate>
      <main className="page">
        <div className="page-head">
          <div>
            <p className="eyebrow">Settings · Personal Prayer AI</p>
            <h1 className="title">Personal Prayer AI</h1>
            <p className="description">
              Configure the personal-prayer experience: generation, guided questions, and optional narration.
            </p>
          </div>
        </div>

        <div className="flex max-w-4xl flex-col gap-8 pb-16">
          <form onSubmit={handleSave} className="flex flex-col gap-8">
            {message && <div className={`alert ${message.type === "success" ? "success" : "error"}`} role="alert">{message.text}</div>}

            <section className="card">
              <div className="border-b border-line pb-3 mb-4">
                <h2 className="card-title">Guided Questions</h2>
                <p className="text-xs text-muted">Personalize optional follow-up questions while keeping AI usage strictly bounded. Generate prayer now remains available after the first answer.</p>
              </div>
              <div className="form-grid">
                <label className="flex items-center justify-between rounded-xl border border-line bg-beige/40 p-4 col-span-full">
                  <span><strong className="block text-base text-ink">Enable AI-guided follow-ups</strong><span className="mt-0.5 block text-xs text-muted">If unavailable, users can still generate from their first answer.</span></span>
                  <input type="checkbox" className="h-5 w-5 cursor-pointer accent-wine" checked={config.guide_enabled} onChange={(e) => setConfig({ ...config, guide_enabled: e.target.checked })} />
                </label>
                <div className="form-columns">
                  <Field label="Guide model" help="Used only for brief questions and options, not the final prayer.">
                    <select className="select" value={config.guide_model_name} onChange={(e) => setConfig({ ...config, guide_model_name: e.target.value })}>
                      <optgroup label="Google Gemini (Recommended · Fast & Cost-Effective)">
                        <option value="gemini-2.5-flash">Gemini 2.5 Flash (Ultra-fast, lowest cost · Recommended)</option>
                        <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
                      </optgroup>
                      <optgroup label="OpenAI">
                        <option value="gpt-4o-mini">gpt-4o-mini (Fast standard)</option>
                        <option value="gpt-4o">gpt-4o (High capacity)</option>
                      </optgroup>
                    </select>
                  </Field>
                  <Field label="Maximum follow-ups" help="Hard cap after the first answer.">
                    <select className="select" value={config.guide_max_followups} onChange={(e) => setConfig({ ...config, guide_max_followups: Number(e.target.value) })}>
                      <option value={0}>0 — generate immediately</option><option value={1}>1 follow-up</option><option value={2}>2 follow-ups</option>
                    </select>
                  </Field>
                </div>
                <Field label="Suggested options" help="Number of short AI suggestions per follow-up.">
                  <select className="select" value={config.guide_max_options} onChange={(e) => setConfig({ ...config, guide_max_options: Number(e.target.value) })}>
                    <option value={3}>3 options</option><option value={4}>4 options</option>
                  </select>
                </Field>
              </div>
            </section>

            {/* Sacred Invocations Card */}
            <section className="card">
              <h2 className="card-title">Personal Prayer</h2>
              <p className="text-xs text-muted mt-1 mb-4">Choose the spiritual foundations used when writing each personal prayer.</p>
              <div className="form-grid">
                <label className="flex items-center justify-between rounded-xl border border-line bg-beige/40 p-4">
                  <span>
                    <strong className="block text-base text-ink">Invoke Jesus Christ</strong>
                    <span className="mt-0.5 block text-xs text-muted">
                      Explicitly address or invoke the name of Jesus Christ in the generated prayer.
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    className="h-6 w-6 cursor-pointer accent-wine"
                    checked={config.include_jesus_name}
                    onChange={(e) => setConfig({ ...config, include_jesus_name: e.target.checked })}
                  />
                </label>

                <label className="flex items-center justify-between rounded-xl border border-line bg-beige/40 p-4">
                  <span>
                    <strong className="block text-base text-ink">Blessed Virgin Mary Intercession</strong>
                    <span className="mt-0.5 block text-xs text-muted">
                      Allow the generated prayer to include a reverent request for the Blessed Virgin Mary&apos;s intercession.
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    className="h-6 w-6 cursor-pointer accent-wine"
                    checked={config.include_mary_intercession}
                    onChange={(e) => setConfig({ ...config, include_mary_intercession: e.target.checked })}
                  />
                </label>

                <label className="flex items-center justify-between rounded-xl border border-line bg-beige/40 p-4">
                  <span>
                    <strong className="block text-base text-ink">Saints&apos; Intercession</strong>
                    <span className="mt-0.5 block text-xs text-muted">
                      Allow the prayer to ask for the intercession of Catholic saints when naturally appropriate to the user&apos;s intention.
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    className="h-6 w-6 cursor-pointer accent-wine"
                    checked={config.include_saints_intercession}
                    onChange={(e) => setConfig({ ...config, include_saints_intercession: e.target.checked })}
                  />
                </label>

                <label className="flex items-center justify-between rounded-xl border border-line bg-beige/40 p-4">
                  <span>
                    <strong className="block text-base text-ink">Holy Spirit Invocation</strong>
                    <span className="mt-0.5 block text-xs text-muted">
                      Allow the prayer to invoke the Holy Spirit for guidance, wisdom, strength, comfort, or discernment.
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    className="h-6 w-6 cursor-pointer accent-wine"
                    checked={config.include_holy_spirit}
                    onChange={(e) => setConfig({ ...config, include_holy_spirit: e.target.checked })}
                  />
                </label>

                <label className="flex items-center justify-between rounded-xl border border-line bg-beige/40 p-4">
                  <span>
                    <strong className="block text-base text-ink">Scripture References</strong>
                    <span className="mt-0.5 block text-xs text-muted">
                      Allow the prayer to naturally incorporate or reference Scripture when relevant (no fabricated quotes).
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    className="h-6 w-6 cursor-pointer accent-wine"
                    checked={config.include_scripture_references}
                    onChange={(e) => setConfig({ ...config, include_scripture_references: e.target.checked })}
                  />
                </label>
              </div>
            </section>

            {/* Free Prayer Generation Settings Card */}
            <section className="card">
              <h2 className="card-title">Free Prayer Generation Settings</h2>
              <p className="text-xs text-muted mt-1 mb-4">Configure AI prayer drafting settings for guest and free signed-in accounts.</p>
              <div className="form-grid">
                <div className="form-columns">
                  <Field label="Minimum target words" help="Lower length boundary for generated prayers.">
                    <input
                      type="number"
                      className="input"
                      value={config.min_words}
                      onChange={(e) => setConfig({ ...config, min_words: parseInt(e.target.value) || 60 })}
                    />
                  </Field>
                  <Field label="Maximum target words" help="Upper length boundary for generated prayers.">
                    <input
                      type="number"
                      className="input"
                      value={config.max_words}
                      onChange={(e) => setConfig({ ...config, max_words: parseInt(e.target.value) || 90 })}
                    />
                  </Field>
                </div>
                <div className="form-columns">
                  <Field label="AI Drafting Model (Free Tier)" help="Select the model tier for free prayer generation.">
                    <select
                      className="select"
                      value={config.model_name}
                      onChange={(e) => setConfig({ ...config, model_name: e.target.value })}
                    >
                      <optgroup label="Google Gemini (Recommended · Fast & Cost-Effective)">
                        <option value="gemini-2.5-flash">Gemini 2.5 Flash ($0.075/1M · Recommended)</option>
                        <option value="gemini-2.5-pro">Gemini 2.5 Pro (Deep reasoning)</option>
                      </optgroup>
                      <optgroup label="OpenAI">
                        <option value="gpt-4o-mini">gpt-4o-mini (Fast standard)</option>
                        <option value="gpt-4o">gpt-4o (High capacity)</option>
                      </optgroup>
                    </select>
                  </Field>
                  <Field label={`Creativity / Temperature (${config.temperature})`} help="Higher values increase stylistic variety.">
                    <input
                      type="range"
                      min="0.1"
                      max="1.0"
                      step="0.05"
                      className="w-full mt-2 accent-wine"
                      value={config.temperature}
                      onChange={(e) => setConfig({ ...config, temperature: parseFloat(e.target.value) })}
                    />
                  </Field>
                </div>
              </div>
            </section>

            {/* Premium Prayer Generation Settings Card */}
            <section className="card">
              <h2 className="card-title">Premium Prayer Generation Settings</h2>
              <p className="text-xs text-muted mt-1 mb-4">Configure AI prayer drafting settings for premium subscription accounts.</p>
              <div className="form-grid">
                <div className="form-columns">
                  <Field label="AI Drafting Model (Premium Tier)" help="Select the model tier for premium prayer generation.">
                    <select
                      className="select"
                      value={config.premium_model_name}
                      onChange={(e) => setConfig({ ...config, premium_model_name: e.target.value })}
                    >
                      <optgroup label="Google Gemini (Recommended)">
                        <option value="gemini-2.5-pro">Gemini 2.5 Pro (Deep Theological Synthesis · Recommended)</option>
                        <option value="gemini-2.5-flash">Gemini 2.5 Flash (Ultra-Fast)</option>
                      </optgroup>
                      <optgroup label="OpenAI">
                        <option value="gpt-4o">gpt-4o (OpenAI Flagship)</option>
                        <option value="gpt-4o-mini">gpt-4o-mini (Fast standard)</option>
                      </optgroup>
                    </select>
                  </Field>
                </div>
                
                <div className="border-t border-line pt-4 mt-2">
                  <h3 className="text-sm font-semibold text-ink mb-3">Standard Length Option</h3>
                  <div className="form-columns">
                    <Field label="Min words (Standard)" help="Lower boundary for standard premium prayers.">
                      <input
                        type="number"
                        className="input"
                        value={config.premium_min_words_standard}
                        onChange={(e) => setConfig({ ...config, premium_min_words_standard: parseInt(e.target.value) || 180 })}
                      />
                    </Field>
                    <Field label="Max words (Standard)" help="Upper boundary for standard premium prayers.">
                      <input
                        type="number"
                        className="input"
                        value={config.premium_max_words_standard}
                        onChange={(e) => setConfig({ ...config, premium_max_words_standard: parseInt(e.target.value) || 250 })}
                      />
                    </Field>
                  </div>
                </div>

                <div className="border-t border-line pt-4 mt-2">
                  <h3 className="text-sm font-semibold text-ink mb-3">Long Length Option</h3>
                  <div className="form-columns">
                    <Field label="Min words (Long)" help="Lower boundary for long premium prayers.">
                      <input
                        type="number"
                        className="input"
                        value={config.premium_min_words_long}
                        onChange={(e) => setConfig({ ...config, premium_min_words_long: parseInt(e.target.value) || 300 })}
                      />
                    </Field>
                    <Field label="Max words (Long)" help="Upper boundary for long premium prayers.">
                      <input
                        type="number"
                        className="input"
                        value={config.premium_max_words_long}
                        onChange={(e) => setConfig({ ...config, premium_max_words_long: parseInt(e.target.value) || 400 })}
                      />
                    </Field>
                  </div>
                </div>
              </div>
            </section>

            <section className="card">
              <div className="flex flex-col gap-1 border-b border-line pb-3 mb-4">
                <h2 className="card-title">Voice Generation Settings</h2>
                <p className="text-xs text-muted">
                  Configure speech synthesis for the "Listen" feature on personal prayers. Audio is generated on-demand only when a user taps "Listen".
                </p>
              </div>

              <div className="form-grid">
                <label className="flex items-center justify-between rounded-xl border border-line bg-beige/40 p-4 col-span-full cursor-pointer">
                  <span>
                    <strong className="block text-base text-ink">Enable AI Narration for Personal Prayers</strong>
                    <span className="mt-0.5 block text-xs text-muted">
                      When enabled, users will see the "Listen" button on their generated personal prayer.
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    className="h-5 w-5 cursor-pointer accent-wine"
                    checked={config.narration_enabled}
                    onChange={(e) => setConfig({ ...config, narration_enabled: e.target.checked })}
                  />
                </label>

                <div className="form-columns">
                  <Field label="TTS Speech Engine / Model" help="Engine used to narrate personal altar prayers.">
                    <select
                      className="select"
                      value={config.narration_tts_model}
                      onChange={(e) => {
                        const val = e.target.value;
                        const isGem = val.toLowerCase().includes("gemini");
                        setConfig({
                          ...config,
                          narration_tts_model: val,
                          narration_voice: isGem ? "Sulafat" : "marin",
                        });
                      }}
                    >
                      <optgroup label="Google Gemini TTS (Recommended · Natural & Cost-Effective)">
                        <option value="gemini-3.1-flash-tts-preview">Gemini 3.1 Flash TTS (Ultra-Fast MP3 · Recommended)</option>
                      </optgroup>
                      <optgroup label="OpenAI Speech">
                        <option value="gpt-4o-mini-tts">gpt-4o-mini-tts (OpenAI Standard)</option>
                        <option value="tts-1">tts-1</option>
                        <option value="tts-1-hd">tts-1-hd</option>
                      </optgroup>
                    </select>
                  </Field>

                  <Field label="Default Voice" help="The voice heard by users when listening to personal prayers.">
                    <select
                      className="select"
                      value={config.narration_voice}
                      onChange={(e) => setConfig({ ...config, narration_voice: e.target.value })}
                    >
                      {config.narration_tts_model.toLowerCase().includes("gemini") ? (
                        <optgroup label="Gemini Devotional Voices">
                          {GEMINI_VOICES.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.label}
                            </option>
                          ))}
                        </optgroup>
                      ) : (
                        <optgroup label="OpenAI Voices">
                          {OPENAI_VOICES.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.label}
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </Field>
                </div>

                <div className="form-columns">
                  <Field label="Narration speed" help="The server sends this pace when generating the cached audio file.">
                    <select
                      className="select"
                      value={config.narration_speed}
                      onChange={(e) => setConfig({ ...config, narration_speed: Number(e.target.value) })}
                    >
                      <option value={0.75}>0.75x — calm and unhurried</option>
                      <option value={0.85}>0.85x — prayer pace (recommended)</option>
                      <option value={1}>1.00x — normal</option>
                      <option value={1.15}>1.15x — brisk</option>
                    </select>
                  </Field>
                  <Field label="Delivery style" help="A short instruction used to keep My Altar narrations consistent.">
                    <textarea
                      rows={3}
                      className="input text-sm leading-relaxed"
                      value={config.narration_delivery_style}
                      onChange={(e) => setConfig({ ...config, narration_delivery_style: e.target.value })}
                    />
                  </Field>
                </div>
              </div>
            </section>

            {/* Custom AI System Instruction Card */}
            <section className="card">
              <div className="flex items-center justify-between border-b border-line pb-3 mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-ink">Advanced: Base System Instruction</h2>
                  <p className="text-xs text-muted mt-0.5">
                    Primary system prompt instructing the AI model on structure, keys, and Catholic devotional tone.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setConfig({ ...config, system_instruction: DEFAULT_MY_ALTAR_PROMPT })}
                  className="button secondary compact text-xs"
                >
                  Reset to Default Prompt
                </button>
              </div>
              <textarea
                rows={5}
                className="input font-mono text-xs leading-relaxed"
                value={config.system_instruction}
                onChange={(e) => setConfig({ ...config, system_instruction: e.target.value })}
                placeholder="Enter base system instructions..."
              />
            </section>

            {/* Specific Generation Rules Card */}
            <section className="card">
              <h2 className="card-title">Advanced: Editorial & Tone Rules</h2>
              <p className="text-xs text-muted -mt-3 mb-3">
                List specific rules (one per line). These are appended to the system prompt dynamically.
              </p>
              <textarea
                rows={5}
                className="input font-mono text-xs leading-relaxed"
                value={config.additional_rules}
                onChange={(e) => setConfig({ ...config, additional_rules: e.target.value })}
                placeholder="- Address God directly with warm, reverent language&#10;- End with Amen."
              />
            </section>

            <div>
              <button type="submit" className="button px-8 py-3 shadow-md" disabled={saving}>
                {saving ? "Saving settings…" : "Save AI prompt settings"}
              </button>
            </div>
          </form>
        </div>
      </main>
    </AdminGate>
  );
}
