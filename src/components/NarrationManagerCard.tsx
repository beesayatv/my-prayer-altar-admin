"use client";

import { useState, useEffect } from "react";
import { Field } from "@/components/ContentEditor";
import { requireSupabase } from "@/lib/supabase";

export interface NarrationManagerCardProps {
  contentId?: string;
  metadata?: Record<string, any>;
  onNarrationUpdated?: () => void;
  contentType?: string;
}

  const OPENAI_VOICES = [
    { id: "ash", label: "Ash (Solemn, calm & reverent)" },
    { id: "cedar", label: "Cedar (Deep & resonant)" },
    { id: "marin", label: "Marin (Gentle & warm)" },
    { id: "nova", label: "Nova (Bright & energetic)" },
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

  const [selectedProfile, setSelectedProfile] = useState<"gentle" | "solemn">(currentDefaultProfile);
  const activeProfileData = profiles[selectedProfile] || profiles[currentDefaultProfile];

  const [selectedVoice, setSelectedVoice] = useState(activeProfileData?.voice || "marin");
  const [selectedSpeed, setSelectedSpeed] = useState<number>(activeProfileData?.speed || 0.85);
  const [isGenerating, setIsGenerating] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [charCount, setCharCount] = useState(0);

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
        
        // Clean/normalize Amen padding like in the backend
        const base = assembledBody.replace(/(?:\s+|\n+)?amen[\.\!\?]*['"]?$/i, "").trim();
        const punctStripped = base.replace(/[\.\!\?\,]+$/, "");
        const bodyText = `${punctStripped}, Amen.`;

        const textToNarrate = `${title}.\n\n${bodyText}`;
        total = textToNarrate.length;
      } else {
        // Daily Prayer
        const base = body.replace(/(?:\s+|\n+)?amen[\.\!\?]*['"]?$/i, "").trim();
        const punctStripped = base.replace(/[\.\!\?\,]+$/, "");
        const bodyText = `${punctStripped}, Amen.`;

        const textToNarrate = `${title}.\n\n${bodyText}`;
        total = textToNarrate.length;
      }

      setCharCount(total);
    }

    // Run once initially
    calculateCount();

    // Listen to all inputs within document for changes
    document.addEventListener("input", calculateCount);
    return () => {
      document.removeEventListener("input", calculateCount);
    };
  }, [contentType]);

  // Sync selected profile, voice, and speed when metadata changes
  useEffect(() => {
    if (audioMetadata.default_profile) {
      setSelectedProfile(audioMetadata.default_profile as "gentle" | "solemn");
    }
  }, [audioMetadata.default_profile]);

  useEffect(() => {
    if (activeProfileData?.voice) {
      setSelectedVoice(activeProfileData.voice);
    }
    if (activeProfileData?.speed) {
      setSelectedSpeed(activeProfileData.speed);
    }
  }, [activeProfileData?.voice, activeProfileData?.speed, selectedProfile]);

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
        "An existing audio narration already exists for this prayer. Re-generating will overwrite the current audio and incur OpenAI TTS costs. Proceed?"
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
          profile: selectedProfile,
          voice: selectedVoice,
          speed: selectedSpeed,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to generate narration.");
      }

      setMessage({
        type: "success",
        text: `OpenAI TTS Narration generated successfully using '${selectedVoice}' voice!`,
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
      {/* Clean Header Bar */}
      <div className="flex items-center justify-between border-b border-line pb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">🎙️</span>
          <h3 className="text-base font-bold text-ink m-0 p-0 leading-tight">
            OpenAI Audio Narration
          </h3>
        </div>

        <div className="flex items-center">
          {hasAudio ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Ready
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
              <span className="w-2 h-2 rounded-full bg-amber-400"></span>
              No Audio
            </span>
          )}
        </div>
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

      {/* Audio Player Card */}
      {publicAudioUrl && (
        <div className="bg-beige/40 rounded-xl p-3.5 border border-line space-y-2.5">
          <div className="flex items-center justify-between text-xs text-muted">
            <span>Voice: <strong className="text-ink font-semibold">{activeProfileData?.voice || selectedVoice}</strong></span>
            <span>Model: <strong className="text-ink font-semibold">{activeProfileData?.model || "gpt-4o-mini-tts"}</strong></span>
          </div>
          <audio controls src={publicAudioUrl} className="w-full h-9 rounded-lg accent-wine" />
        </div>
      )}

      {/* Form Controls */}
      <div className="space-y-4 pt-1">
        <Field label="Voice Profile" help="Select tone profile style">
          <select
            className="select w-full cursor-pointer bg-white"
            value={selectedProfile}
            onChange={(e) => setSelectedProfile(e.target.value as "gentle" | "solemn")}
          >
            <option value="gentle">Gentle (Calm & Prayerful)</option>
            <option value="solemn">Solemn (Reverent & Deep)</option>
          </select>
        </Field>

        <Field label="OpenAI Voice" help="Select specific voice for this prayer">
          <select
            className="select w-full cursor-pointer bg-white"
            value={selectedVoice}
            onChange={(e) => setSelectedVoice(e.target.value)}
          >
            {OPENAI_VOICES.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Narration Speed" help="Controls speech rate of generated audio narration">
          <select
            className="select w-full cursor-pointer bg-white"
            value={selectedSpeed}
            onChange={(e) => setSelectedSpeed(Number(e.target.value))}
          >
            <option value={0.75}>0.75x (Calm & Unhurried)</option>
            <option value={0.85}>0.85x (Prayer Pace - Recommended)</option>
            <option value={1.00}>1.00x (Normal Default)</option>
            <option value={1.15}>1.15x (Brisk)</option>
          </select>
        </Field>

        {/* Real-time Character Counter warning */}
        <div className="pt-1">
          <div className="flex items-center justify-between text-xs font-semibold mb-1">
            <span className="text-muted">Total Script Length:</span>
            <span className={charCount > 1200 ? "text-rose-600 font-bold" : "text-emerald-600"}>
              {charCount.toLocaleString()} / 1,200 chars
            </span>
          </div>
          {charCount > 1200 ? (
            <p className="text-[10px] text-rose-500 font-medium leading-relaxed bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 p-2 rounded-lg">
              ⚠️ Warning: Script exceeds 1,200 characters. There is a high risk that the TTS model will cut off or swallow the final word "Amen". Consider shortening the text.
            </p>
          ) : (
            <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium leading-relaxed bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 p-2 rounded-lg">
              ✓ Length is optimal. The TTS model should generate the audio stable and speak "Amen" cleanly.
            </p>
          )}
        </div>

        <button
          type="button"
          className="button primary w-full py-2.5 text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer transition-all shadow-xs"
          onClick={handleGenerateNarration}
          disabled={isGenerating || !contentId}
        >
          {isGenerating ? (
            <span className="flex items-center gap-2">
              <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
              Generating OpenAI Audio…
            </span>
          ) : (
            <span>{hasAudio ? "🔄 Re-generate Narration" : "✦ Generate OpenAI Narration"}</span>
          )}
        </button>
      </div>
    </div>
  );
}
