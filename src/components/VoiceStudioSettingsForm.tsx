"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Field } from "@/components/ContentEditor";
import { requireSupabase, adminAuthorizationHeader } from "@/lib/supabase";

import { DAILY_PRAYER } from "@/lib/contentConfiguration";

const OPENAI_VOICES = [
  { id: "marin", label: "Marin (Female · Gentle & warm)" },
  { id: "coral", label: "Coral (Female · Soft & clear)" },
  { id: "nova", label: "Nova (Female · Bright & energetic)" },
  { id: "shimmer", label: "Shimmer (Female · Expressive)" },
  { id: "ash", label: "Ash (Male · Solemn, calm & reverent)" },
  { id: "cedar", label: "Cedar (Male · Deep & resonant)" },
  { id: "onyx", label: "Onyx (Male · Grounded & serious)" },
  { id: "echo", label: "Echo (Male · Smooth & clear)" },
];

const GEMINI_VOICES = [
  // Female
  { id: "Sulafat", label: "Sulafat (Female · Warm & devotional - Recommended)", gender: "female" },
  { id: "Vindemiatrix", label: "Vindemiatrix (Female · Gentle & soft)", gender: "female" },
  { id: "Aoede", label: "Aoede (Female · Breezy & serene)", gender: "female" },
  { id: "Kore", label: "Kore (Female · Clear & solemn)", gender: "female" },
  { id: "Despina", label: "Despina (Female · Smooth & reflective)", gender: "female" },
  { id: "Achernar", label: "Achernar (Female · Soft & quiet)", gender: "female" },
  { id: "Zephyr", label: "Zephyr (Female · Bright & uplifting)", gender: "female" },
  // Male
  { id: "Schedar", label: "Schedar (Male · Even, calm & measured - Recommended)", gender: "male" },
  { id: "Charon", label: "Charon (Male · Deep, solemn & contemplative)", gender: "male" },
  { id: "Algieba", label: "Algieba (Male · Smooth & reverent)", gender: "male" },
  { id: "Enceladus", label: "Enceladus (Male · Breathy & prayerful)", gender: "male" },
  { id: "Iapetus", label: "Iapetus (Male · Clear & grounded)", gender: "male" },
  { id: "Puck", label: "Puck (Male · Natural & warm)", gender: "male" },
];

const TTS_ENGINES = [
  { id: "google", label: "Google Gemini 3.1 Flash TTS (Recommended · Cost-Effective)" },
  { id: "openai", label: "OpenAI Speech (gpt-4o-mini-tts)" },
];

export function VoiceStudioSettingsForm() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Audio / Narration state
  const [narrationEnabled, setNarrationEnabled] = useState(true);
  const [ttsProvider, setTtsProvider] = useState<"google" | "openai">("google");
  const [defaultProfile, setDefaultProfile] = useState("gentle");
  const [defaultVoice, setDefaultVoice] = useState("Sulafat");
  const [defaultSpeed, setDefaultSpeed] = useState(0.85);
  const [ttsModel, setTtsModel] = useState("gemini-3.1-flash-tts-preview");

  // Voice audition preview state
  const [previewVoice, setPreviewVoice] = useState("Sulafat");
  const [previewProvider, setPreviewProvider] = useState<"google" | "openai">("google");
  const [previewText, setPreviewText] = useState(
    "Heavenly Father, we humbly present our day to You. Grant us Your peace, illuminate our path, and strengthen our faith in all circumstances. Amen."
  );
  const [previewAudioUrl, setPreviewAudioUrl] = useState<string | null>(null);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    async function loadConfig() {
      try {
        setLoading(true);
        const supabase = requireSupabase();
        const { data, error } = await supabase
          .from("automation_configs")
          .select("config_json")
          .eq("content_type", DAILY_PRAYER)
          .maybeSingle();

        if (error) throw error;

        const cJson = (data?.config_json || {}) as Record<string, any>;
        if (cJson.audio) {
          if (cJson.audio.narration_enabled !== undefined) setNarrationEnabled(Boolean(cJson.audio.narration_enabled));
          if (cJson.audio.tts_provider) {
            setTtsProvider(cJson.audio.tts_provider as "google" | "openai");
            setPreviewProvider(cJson.audio.tts_provider as "google" | "openai");
          }
          if (cJson.audio.default_profile) setDefaultProfile(String(cJson.audio.default_profile));
          if (cJson.audio.default_voice) {
            const v = String(cJson.audio.default_voice);
            setDefaultVoice(v);
            setPreviewVoice(v);
          }
          if (cJson.audio.default_speed) setDefaultSpeed(Number(cJson.audio.default_speed));
          if (cJson.audio.tts_model) setTtsModel(String(cJson.audio.tts_model));
        }
      } catch (err) {
        console.error("Failed loading audio config:", err);
        setMessage({ type: "error", text: "Failed loading Voice Studio settings." });
      } finally {
        setLoading(false);
      }
    }

    loadConfig();
  }, []);

  const handleAudition = async () => {
    try {
      setIsPlayingPreview(true);
      setPreviewError(null);
      // Get admin auth header
      const authHeader = await adminAuthorizationHeader();
      const res = await fetch("/api/admin/tts/preview", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeader,
        },
        body: JSON.stringify({
          provider: previewProvider,
          voice: previewVoice,
          text: previewText,
          speed: defaultSpeed,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to generate preview audio.");
      }
      setPreviewAudioUrl(data.audioUrl);
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : "Error auditioning voice.");
    } finally {
      setIsPlayingPreview(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setMessage(null);
      const supabase = requireSupabase();

      // Get existing config_json to merge
      const { data: existingData } = await supabase
        .from("automation_configs")
        .select("config_json")
        .eq("content_type", DAILY_PRAYER)
        .maybeSingle();

      const existingConfig = (existingData?.config_json || {}) as Record<string, any>;

      const updatedConfigJson = {
        ...existingConfig,
        audio: {
          ...(existingConfig.audio || {}),
          narration_enabled: narrationEnabled,
          tts_provider: ttsProvider,
          default_profile: defaultProfile,
          default_voice: defaultVoice,
          default_speed: defaultSpeed,
          tts_model: ttsModel,
        },
      };

      const { error } = await supabase
        .from("automation_configs")
        .update({
          config_json: updatedConfigJson,
        })
        .eq("content_type", DAILY_PRAYER);

      if (error) throw error;

      setMessage({ type: "success", text: "Voice Studio settings saved successfully! New prayer narrations will use these defaults." });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to save Voice Studio settings.",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="card p-8 text-center text-muted">
        Loading Voice Studio configuration…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 pb-16">
      {/* Top Banner */}
      <section className="card bg-beige/40">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-wine">🎙️ AI Voice &amp; Narration Studio</h2>
            <p className="text-xs text-muted mt-1">
              Test and configure voice providers, vocal characteristics, and narration pace for Today Feed audio.
            </p>
          </div>
          <button
            type="button"
            className="button primary text-xs self-start sm:self-auto cursor-pointer"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save Voice Studio Settings"}
          </button>
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

      {/* Main Settings Card */}
      <section className="card space-y-6">
        <div className="flex items-center justify-between border-b border-line pb-3">
          <div>
            <h2 className="card-title text-base font-bold text-ink m-0">Default Audio Settings</h2>
            <p className="text-xs text-muted mt-0.5">
              These defaults are automatically used when you click "Generate Audio" in Today Feed.
            </p>
          </div>
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
            ttsProvider === "google"
              ? "bg-blue-50 text-blue-700 border border-blue-200"
              : "bg-purple-50 text-purple-700 border border-purple-200"
          }`}>
            Active Engine: {ttsProvider === "google" ? "Google Gemini" : "OpenAI"}
          </span>
        </div>

        <div className="form-grid">
          <label className="flex items-center justify-between rounded-xl border border-line bg-beige/40 p-4 col-span-full cursor-pointer">
            <div>
              <strong className="block text-base text-ink">Enable Automated Daily Narration</strong>
              <span className="mt-0.5 block text-xs text-muted">
                Automatically generate audio when prayers are generated by the background queue.
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
            <Field label="Active TTS Engine / Provider" help="Select primary synthesis provider for audio generation.">
              <select
                className="input cursor-pointer bg-white font-medium"
                value={ttsProvider}
                onChange={(e) => {
                  const nextProvider = e.target.value as "google" | "openai";
                  setTtsProvider(nextProvider);
                  if (nextProvider === "google") {
                    setDefaultVoice("Sulafat");
                    setTtsModel("gemini-3.1-flash-tts-preview");
                    setPreviewProvider("google");
                    setPreviewVoice("Sulafat");
                  } else {
                    setDefaultVoice("marin");
                    setTtsModel("gpt-4o-mini-tts");
                    setPreviewProvider("openai");
                    setPreviewVoice("marin");
                  }
                }}
              >
                {TTS_ENGINES.map((eng) => (
                  <option key={eng.id} value={eng.id}>
                    {eng.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Default Voice Profile" help="Default tone profile for daily devotional prayers.">
              <select
                className="input cursor-pointer bg-white"
                value={defaultProfile}
                onChange={(e) => setDefaultProfile(e.target.value)}
              >
                <option value="gentle">Gentle Profile (Calm &amp; Devotional)</option>
                <option value="solemn">Solemn Profile (Reverent &amp; Measured)</option>
              </select>
            </Field>
          </div>

          <div className="form-columns">
            <Field
              label={ttsProvider === "google" ? "Default Google Voice" : "Default OpenAI Voice"}
              help="Categorized into Female and Male prayer tones."
            >
              <select
                className="input cursor-pointer bg-white font-medium"
                value={defaultVoice}
                onChange={(e) => {
                  setDefaultVoice(e.target.value);
                  setPreviewVoice(e.target.value);
                }}
              >
                {ttsProvider === "google" ? (
                  <>
                    <optgroup label="── 👩 Female Voices ──">
                      {GEMINI_VOICES.filter((v) => v.gender === "female").map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.label}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="── 👨 Male Voices ──">
                      {GEMINI_VOICES.filter((v) => v.gender === "male").map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.label}
                        </option>
                      ))}
                    </optgroup>
                  </>
                ) : (
                  <>
                    <optgroup label="── 👩 Female Voices ──">
                      {OPENAI_VOICES.filter((v) => v.label.includes("Female")).map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.label}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="── 👨 Male Voices ──">
                      {OPENAI_VOICES.filter((v) => v.label.includes("Male")).map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.label}
                        </option>
                      ))}
                    </optgroup>
                  </>
                )}
              </select>
            </Field>

            <Field label="Default Narration Speed" help="Speech rate multiplier used when generating prayer audio.">
              <select
                className="input cursor-pointer bg-white"
                value={defaultSpeed}
                onChange={(e) => setDefaultSpeed(Number(e.target.value))}
              >
                <option value={0.75}>0.75x (Calm &amp; Unhurried)</option>
                <option value={0.85}>0.85x (Prayer Pace - Recommended)</option>
                <option value={1.00}>1.00x (Normal Default)</option>
                <option value={1.15}>1.15x (Brisk)</option>
              </select>
            </Field>
          </div>
        </div>

        {/* Interactive Voice Audition Tester */}
        <div className="rounded-xl border border-line bg-gradient-to-br from-beige/60 to-white p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-base">🎧</span>
              <h3 className="text-sm font-bold text-ink m-0">Live Voice Audition &amp; Tester</h3>
            </div>
            <span className="text-xs text-muted">Audition any voice in real time before choosing it</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-ink mb-1">Audition Voice</label>
              <select
                className="input cursor-pointer bg-white text-xs w-full"
                value={previewVoice}
                onChange={(e) => setPreviewVoice(e.target.value)}
              >
                {previewProvider === "google" ? (
                  <>
                    <optgroup label="── 👩 Female Voices ──">
                      {GEMINI_VOICES.filter((v) => v.gender === "female").map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.label}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="── 👨 Male Voices ──">
                      {GEMINI_VOICES.filter((v) => v.gender === "male").map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.label}
                        </option>
                      ))}
                    </optgroup>
                  </>
                ) : (
                  <>
                    <optgroup label="── 👩 Female Voices ──">
                      {OPENAI_VOICES.filter((v) => v.label.includes("Female")).map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.label}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="── 👨 Male Voices ──">
                      {OPENAI_VOICES.filter((v) => v.label.includes("Male")).map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.label}
                        </option>
                      ))}
                    </optgroup>
                  </>
                )}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink mb-1">Audition Engine</label>
              <select
                className="input cursor-pointer bg-white text-xs w-full"
                value={previewProvider}
                onChange={(e) => {
                  const p = e.target.value as "google" | "openai";
                  setPreviewProvider(p);
                  setPreviewVoice(p === "google" ? "Sulafat" : "marin");
                }}
              >
                <option value="google">Google Gemini 3.1 Flash</option>
                <option value="openai">OpenAI TTS</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink mb-1">Sample Prayer Script</label>
            <textarea
              rows={2}
              className="input text-xs bg-white w-full"
              value={previewText}
              onChange={(e) => setPreviewText(e.target.value)}
            />
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3">
            <button
              type="button"
              className="button secondary text-xs w-full sm:w-auto cursor-pointer"
              onClick={handleAudition}
              disabled={isPlayingPreview}
            >
              {isPlayingPreview ? (
                <>
                  <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"></span>
                  Synthesizing Sample…
                </>
              ) : (
                "▶ Audition Voice Sample"
              )}
            </button>

            {previewAudioUrl && (
              <audio controls autoPlay src={previewAudioUrl} className="w-full sm:w-80 h-8 accent-wine" />
            )}
          </div>

          {previewError && (
            <p className="text-xs text-rose-600 bg-rose-50 p-2.5 rounded-lg border border-rose-100">
              {previewError}
            </p>
          )}
        </div>
      </section>

      {/* Cross-Link Card */}
      <section className="card bg-ivory/50 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-ink">Need to edit daily prayer editorial prompts or schedules?</h3>
          <p className="text-xs text-muted mt-0.5">
            Head to Prayer Studio to adjust AI drafting prompts, daily queue times, and publication rules.
          </p>
        </div>
        <Link href="/settings/daily-prayer" className="button secondary text-xs whitespace-nowrap">
          Open Prayer Studio ↗
        </Link>
      </section>
    </div>
  );
}
