"use client";

import { useState, useEffect } from "react";
import { requireSupabase } from "@/lib/supabase";

export interface NarrationManagerCardProps {
  contentId?: string;
  metadata?: Record<string, any>;
  onNarrationUpdated?: () => void;
  contentType?: string;
}

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
  { id: "Sulafat", label: "Sulafat (Female · Warm & devotional)", gender: "female" },
  { id: "Vindemiatrix", label: "Vindemiatrix (Female · Gentle & soft)", gender: "female" },
  { id: "Aoede", label: "Aoede (Female · Breezy & serene)", gender: "female" },
  { id: "Kore", label: "Kore (Female · Clear & solemn)", gender: "female" },
  { id: "Despina", label: "Despina (Female · Smooth & reflective)", gender: "female" },
  { id: "Achernar", label: "Achernar (Female · Soft & quiet)", gender: "female" },
  { id: "Zephyr", label: "Zephyr (Female · Bright & uplifting)", gender: "female" },
  // Male
  { id: "Schedar", label: "Schedar (Male · Even, calm & measured)", gender: "male" },
  { id: "Charon", label: "Charon (Male · Deep, solemn & contemplative)", gender: "male" },
  { id: "Algieba", label: "Algieba (Male · Smooth & reverent)", gender: "male" },
  { id: "Enceladus", label: "Enceladus (Male · Breathy & prayerful)", gender: "male" },
  { id: "Iapetus", label: "Iapetus (Male · Clear & grounded)", gender: "male" },
  { id: "Puck", label: "Puck (Male · Natural & warm)", gender: "male" },
];

export function NarrationManagerCard({
  contentId,
  metadata = {},
  onNarrationUpdated,
  contentType,
}: NarrationManagerCardProps) {
  const audioMetadata = metadata?.audio || {};
  const profiles = audioMetadata.profiles || {};
  const hasAudio = Object.keys(profiles).length > 0 || Boolean(metadata?.audio_url);
  const currentDefaultProfile = (audioMetadata.default_profile as "gentle" | "solemn") || "gentle";
  const activeProfileData = profiles[currentDefaultProfile] || (Object.values(profiles)[0] as any);

  // Active generation choices (defaults to Studio presets, but customizable here)
  const [selectedProvider, setSelectedProvider] = useState<"google" | "openai">("google");
  const [selectedVoice, setSelectedVoice] = useState("Sulafat");
  const [selectedSpeed, setSelectedSpeed] = useState(0.85);
  const [showVoiceCustomizer, setShowVoiceCustomizer] = useState(false);

  const [isGenerating, setIsGenerating] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [charCount, setCharCount] = useState(0);

  // Load configured default engine and voice from Voice Studio (automation_configs)
  useEffect(() => {
    async function loadStudioAudioConfig() {
      try {
        const supabase = requireSupabase();
        const { data } = await supabase
          .from("automation_configs")
          .select("config_json")
          .eq("content_type", "daily_prayer")
          .maybeSingle();

        const audioConfig = (data?.config_json?.audio as Record<string, any>) || {};
        const studioProvider = (audioConfig.tts_provider as "google" | "openai") || "google";
        
        // If content already has a generated voice, honor it; otherwise load studio default
        if (activeProfileData?.provider) {
          setSelectedProvider(activeProfileData.provider as "google" | "openai");
        } else {
          setSelectedProvider(studioProvider);
        }

        if (activeProfileData?.voice) {
          setSelectedVoice(activeProfileData.voice);
        } else if (audioConfig.default_voice) {
          const v = String(audioConfig.default_voice);
          if (studioProvider === "google" && !GEMINI_VOICES.some((gv) => gv.id.toLowerCase() === v.toLowerCase())) {
            setSelectedVoice("Sulafat");
          } else {
            setSelectedVoice(v);
          }
        } else {
          setSelectedVoice(studioProvider === "google" ? "Sulafat" : "marin");
        }

        if (activeProfileData?.speed) {
          setSelectedSpeed(activeProfileData.speed);
        } else if (audioConfig.default_speed) {
          setSelectedSpeed(Number(audioConfig.default_speed));
        }
      } catch (err) {
        console.warn("Could not load Voice Studio audio config:", err);
      }
    }

    loadStudioAudioConfig();
  }, [activeProfileData?.provider, activeProfileData?.voice, activeProfileData?.speed]);

  // Hook to track the character count in real time from DOM inputs
  useEffect(() => {
    function calculateCount() {
      const titleEl = document.querySelector('[name="title"]') as HTMLInputElement | HTMLTextAreaElement | null;
      const bodyEl = document.querySelector('[name="body"]') as HTMLTextAreaElement | null;
      const introEl = document.querySelector('[name="introduction"]') as HTMLTextAreaElement | null;
      const questionEl = document.querySelector('[name="reflection_question"]') as HTMLTextAreaElement | null;
      const closingEl = document.querySelector('[name="closing_prayer"]') as HTMLTextAreaElement | null;

      const title = (titleEl?.value || "").trim();
      const body = (bodyEl?.value || "").trim();

      let total = 0;
      if (contentType === "bible_reading") {
        const intro = (introEl?.value || "").trim();
        const question = (questionEl?.value || "").trim();
        const closing = (closingEl?.value || "").trim();

        const parts = [];
        if (intro) parts.push(intro);
        if (body) parts.push(body);
        if (question) parts.push(question);
        if (closing) parts.push(closing);

        const assembledBody = parts.join("\n\n. . .\n\n");
        const base = assembledBody.replace(/(?:\s+|\n+)?amen[\.\!\?]*['"]?$/i, "").trim();
        const punctStripped = base.replace(/[\.\!\?\,]+$/, "");
        const bodyText = `${punctStripped}, Amen.`;

        const textToNarrate = `${title}.\n\n${bodyText}`;
        total = textToNarrate.length;
      } else {
        const base = body.replace(/(?:\s+|\n+)?amen[\.\!\?]*['"]?$/i, "").trim();
        const punctStripped = base.replace(/[\.\!\?\,]+$/, "");
        const bodyText = `${punctStripped}, Amen.`;

        const textToNarrate = `${title}.\n\n${bodyText}`;
        total = textToNarrate.length;
      }

      setCharCount(total);
    }

    calculateCount();
    document.addEventListener("input", calculateCount);
    return () => {
      document.removeEventListener("input", calculateCount);
    };
  }, [contentType]);

  // Construct audio storage URL if available
  const storagePath = activeProfileData?.storage_path;
  const publicAudioUrl = activeProfileData?.public_url || (storagePath
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/today-media/${storagePath}`
    : metadata?.audio_url || null);

  async function handleGenerateNarration() {
    if (!contentId) {
      setMessage({ type: "error", text: "Please save this draft first before generating audio narration." });
      return;
    }

    if (hasAudio) {
      const confirmed = window.confirm(
        `An existing audio narration already exists for this content. Generating again with voice '${selectedVoice}' will overwrite the current audio. Proceed?`
      );
      if (!confirmed) return;
    }

    setIsGenerating(true);
    setMessage(null);

    try {
      const { data: { session } } = await requireSupabase().auth.getSession();
      const token = session?.access_token;

      const res = await fetch("/api/admin/content/generate-narration", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          contentId,
          profile: currentDefaultProfile,
          provider: selectedProvider,
          voice: selectedVoice,
          speed: selectedSpeed,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to generate narration.");
      }

      const engineName = selectedProvider === "google" ? "Google Gemini" : "OpenAI";
      setMessage({
        type: "success",
        text: `Audio narration generated successfully via ${engineName} (${selectedVoice})!`,
      });

      if (onNarrationUpdated) {
        onNarrationUpdated();
      }
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Error generating narration.",
      });
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className="card space-y-4">
      {/* Header Bar */}
      <div className="flex items-center justify-between border-b border-line pb-3">
        <div className="flex items-center gap-2">
          <span className="text-base leading-none">🎙️</span>
          <h3 className="text-sm font-semibold tracking-tight text-ink m-0 p-0 leading-none">
            Audio Narration
          </h3>
        </div>

        {hasAudio ? (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 animate-pulse"></span>
            Ready
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap bg-stone-100 text-stone-600 border border-stone-200">
            <span className="w-1.5 h-1.5 rounded-full bg-stone-400 shrink-0"></span>
            No Audio
          </span>
        )}
      </div>

      {message && (
        <div
          className={`p-3 rounded-xl text-xs font-medium border ${
            message.type === "success"
              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
              : "bg-rose-50 text-rose-800 border-rose-200"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Audio Player & Active Configuration */}
      <div className="bg-ivory/80 rounded-xl p-3.5 border border-line space-y-3">
        {/* Voice, Engine & Speed display with Change Voice toggle */}
        <div className="flex items-center justify-between border-b border-line/60 pb-2.5">
          <div className="grid grid-cols-3 gap-3 text-xs flex-1">
            <div>
              <span className="text-muted block text-[10px] uppercase font-semibold tracking-wider">Voice</span>
              <strong className="text-ink font-semibold truncate block">
                {selectedVoice}
              </strong>
            </div>
            <div>
              <span className="text-muted block text-[10px] uppercase font-semibold tracking-wider">Engine</span>
              <strong className="text-ink font-semibold truncate block">
                {selectedProvider === "google" ? "Google Gemini" : "OpenAI"}
              </strong>
            </div>
            <div>
              <span className="text-muted block text-[10px] uppercase font-semibold tracking-wider">Speed</span>
              <strong className="text-ink font-semibold truncate block">
                {selectedSpeed}x
              </strong>
            </div>
          </div>

          <button
            type="button"
            className="text-xs text-wine font-medium hover:underline ml-2 cursor-pointer whitespace-nowrap"
            onClick={() => setShowVoiceCustomizer(!showVoiceCustomizer)}
          >
            {showVoiceCustomizer ? "Done" : "Change ▾"}
          </button>
        </div>

        {/* Expandable Voice & Engine Customizer */}
        {showVoiceCustomizer && (
          <div className="p-3 bg-white rounded-lg border border-line space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-semibold text-ink mb-1">TTS Engine</label>
                <select
                  className="input text-xs bg-ivory py-1.5 px-2"
                  value={selectedProvider}
                  onChange={(e) => {
                    const p = e.target.value as "google" | "openai";
                    setSelectedProvider(p);
                    setSelectedVoice(p === "google" ? "Sulafat" : "marin");
                  }}
                >
                  <option value="google">Google Gemini 3.1 Flash</option>
                  <option value="openai">OpenAI TTS</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-ink mb-1">Narration Speed</label>
                <select
                  className="input text-xs bg-ivory py-1.5 px-2"
                  value={selectedSpeed}
                  onChange={(e) => setSelectedSpeed(Number(e.target.value))}
                >
                  <option value={0.75}>0.75x (Unhurried)</option>
                  <option value={0.85}>0.85x (Prayer Pace)</option>
                  <option value={1.00}>1.00x (Normal)</option>
                  <option value={1.15}>1.15x (Brisk)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-ink mb-1">Voice Selection</label>
              <select
                className="input text-xs bg-ivory py-1.5 px-2 w-full font-medium"
                value={selectedVoice}
                onChange={(e) => setSelectedVoice(e.target.value)}
              >
                {selectedProvider === "google" ? (
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
          </div>
        )}

        {/* Audio Player (Always visible) */}
        {publicAudioUrl ? (
          <audio controls src={publicAudioUrl} className="w-full h-9 rounded-lg accent-wine" />
        ) : (
          <div className="flex items-center justify-between px-3 py-2 bg-stone-100/70 border border-dashed border-stone-200 rounded-lg text-xs text-stone-500">
            <span className="flex items-center gap-1.5">
              <span>🔇</span>
              <span>No audio generated yet</span>
            </span>
            <span className="text-[11px] text-stone-400">Press generate below</span>
          </div>
        )}
      </div>

      {/* Script Length Status */}
      <div className="pt-1">
        <div className="flex items-center justify-between text-xs font-semibold mb-1">
          <span className="text-muted">Script Length:</span>
          <span className={charCount > 1200 ? "text-rose-600 font-bold" : "text-emerald-600"}>
            {charCount.toLocaleString()} / 1,200 chars
          </span>
        </div>
        {charCount > 1200 && (
          <p className="text-[10px] text-rose-500 font-medium leading-relaxed bg-rose-50 border border-rose-100 p-2 rounded-lg">
            ⚠️ Warning: Script exceeds 1,200 characters. Consider shortening before generating audio.
          </p>
        )}
      </div>

      {/* Single Generation Button */}
      <div className="pt-1 space-y-2">
        <button
          type="button"
          className="button primary w-full py-2.5 text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition-all shadow-xs"
          onClick={handleGenerateNarration}
          disabled={isGenerating || !contentId}
        >
          {isGenerating ? (
            <>
              <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
              Generating {selectedProvider === "google" ? "Gemini" : "OpenAI"} Audio…
            </>
          ) : (
            <span>
              {hasAudio
                ? `🔄 Re-generate Audio (${selectedVoice})`
                : `✦ Generate Audio (${selectedVoice})`}
            </span>
          )}
        </button>

        <div className="text-center">
          <a
            href="/settings/voice-studio"
            className="text-[11px] text-muted hover:text-wine inline-flex items-center gap-1 transition-colors"
          >
            <span>Audition voices &amp; adjust studio defaults in Voice Studio</span>
            <span aria-hidden="true">↗</span>
          </a>
        </div>
      </div>
    </div>
  );
}
