"use client";

import { useEffect, useState } from "react";
import { Field } from "@/components/ContentEditor";
import { requireSupabase } from "@/lib/supabase";
import { DAILY_INSPIRATION } from "@/lib/contentConfiguration";

export type ImageStudioConfig = {
  defaultModel: string;
  defaultAspectRatio: string;
  defaultBorderStyle: string;
  defaultFooterText: string;
  defaultVisualDirection: string;
};

const DEFAULT_IMAGE_CONFIG: ImageStudioConfig = {
  defaultModel: "gpt-image-2",
  defaultAspectRatio: "4:5",
  defaultBorderStyle: "none",
  defaultFooterText: "MY PRAYER ALTAR",
  defaultVisualDirection: "quiet, warm, contemplative, editorial, and elegant.",
};

const MODEL_OPTIONS = [
  {
    value: "gpt-image-2",
    label: "GPT Image 2",
    sub: "Flagship, High Definition",
    description: "Best for high aesthetic fidelity, Catholic sacred art elements, and crisp typography ($0.08/card).",
    badge: "Recommended",
  },
  {
    value: "gpt-image-1.5",
    label: "GPT Image 1.5",
    sub: "Standard",
    description: "Well balanced for devotional cards and soft atmospheric textures ($0.04/card).",
    badge: "Balanced",
  },
  {
    value: "gpt-image-1-mini",
    label: "GPT Image 1 Mini",
    sub: "Budget Fast",
    description: "Fast generation with lighter token cost, best for rapid visual drafting ($0.02/card).",
    badge: "Budget",
  },
];

const ASPECT_RATIOS = [
  { value: "4:5", label: "4:5 — Portrait Devotional Card (Instagram & Feed optimal)" },
  { value: "9:16", label: "9:16 — Full Story / Mobile Screen (Reels & Stories)" },
  { value: "16:9", label: "16:9 — Landscape Banner (Desktop & Tablet)" },
];

const BORDER_STYLES = [
  { value: "none", label: "None — Clean, edge-to-edge photograph / artwork" },
  { value: "thin", label: "Thin Solid — 2–3px refined border in complementary hue" },
  { value: "decorative", label: "Decorative Filigree — Ornate gold sacred corner flourishes" },
  { value: "glow", label: "Soft Inner Glow — Subtle luminous gold halo framing" },
];

export function ImageStudioSettingsForm() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Configuration state
  const [config, setConfig] = useState<ImageStudioConfig>(DEFAULT_IMAGE_CONFIG);

  // Sandbox Audition / Testing state
  const [testModel, setTestModel] = useState("gpt-image-2");
  const [testAspectRatio, setTestAspectRatio] = useState("4:5");
  const [testBorderStyle, setTestBorderStyle] = useState("none");
  const [testFooterText, setTestFooterText] = useState("MY PRAYER ALTAR");
  const [testVisualDirection, setTestVisualDirection] = useState("quiet, warm, contemplative, editorial, and elegant.");
  const [testInstruction, setTestInstruction] = useState(
    '“Peace I leave with you; my peace I give to you. Not as the world gives do I give to you.” A solitary stone cross illuminated by dawn light on a quiet misty mountain hill.'
  );
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    dataUrl: string;
    elapsedMs: number;
    model: string;
    aspectRatio: string;
    sizeBytes: number;
  } | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  useEffect(() => {
    async function loadSettings() {
      try {
        setLoading(true);
        const supabase = requireSupabase();

        const { data } = await supabase
          .from("automation_configs")
          .select("config_json")
          .eq("content_type", DAILY_INSPIRATION)
          .maybeSingle();

        if (data?.config_json) {
          const stored = data.config_json as Partial<ImageStudioConfig>;
          const merged: ImageStudioConfig = {
            defaultModel: stored.defaultModel || DEFAULT_IMAGE_CONFIG.defaultModel,
            defaultAspectRatio: stored.defaultAspectRatio || DEFAULT_IMAGE_CONFIG.defaultAspectRatio,
            defaultBorderStyle: stored.defaultBorderStyle || DEFAULT_IMAGE_CONFIG.defaultBorderStyle,
            defaultFooterText: stored.defaultFooterText ?? DEFAULT_IMAGE_CONFIG.defaultFooterText,
            defaultVisualDirection: stored.defaultVisualDirection ?? DEFAULT_IMAGE_CONFIG.defaultVisualDirection,
          };
          setConfig(merged);
          setTestModel(merged.defaultModel);
          setTestAspectRatio(merged.defaultAspectRatio);
          setTestBorderStyle(merged.defaultBorderStyle);
          setTestFooterText(merged.defaultFooterText);
          setTestVisualDirection(merged.defaultVisualDirection);
        }
      } catch (err) {
        console.error("Failed to load Image Studio config:", err);
      } finally {
        setLoading(false);
      }
    }

    void loadSettings();
  }, []);

  async function handleSave() {
    setSaving(true);
    setMessage(null);

    try {
      const supabase = requireSupabase();

      const { data: existing } = await supabase
        .from("automation_configs")
        .select("config_json")
        .eq("content_type", DAILY_INSPIRATION)
        .maybeSingle();

      const updatedJson = {
        ...(existing?.config_json || {}),
        ...config,
      };

      const { error } = await supabase
        .from("automation_configs")
        .upsert(
          {
            content_type: DAILY_INSPIRATION,
            config_json: updatedJson,
          },
          { onConflict: "content_type" }
        );

      if (error) throw error;

      setMessage({ type: "success", text: "Image Studio defaults successfully saved!" });
    } catch (err) {
      console.error("Save error:", err);
      setMessage({ type: "error", text: "Failed to save configuration. Please check your connection." });
    } finally {
      setSaving(false);
    }
  }

  async function handleRunTest() {
    setTesting(true);
    setTestError(null);
    setTestResult(null);

    try {
      const supabase = requireSupabase();
      const session = (await supabase.auth.getSession()).data.session;
      const token = session?.access_token;

      if (!token) {
        throw new Error("You must be logged in as an administrator to run card auditions.");
      }

      const res = await fetch("/api/admin/image-studio/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          instruction: testInstruction,
          visualDirection: testVisualDirection,
          model: testModel,
          aspectRatio: testAspectRatio,
          footerText: testFooterText,
          borderStyle: testBorderStyle,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to generate card.");
      }

      setTestResult({
        dataUrl: data.dataUrl,
        elapsedMs: data.elapsedMs,
        model: data.model,
        aspectRatio: data.aspectRatio,
        sizeBytes: data.sizeBytes,
      });
    } catch (err) {
      setTestError(err instanceof Error ? err.message : "Card audition failed.");
    } finally {
      setTesting(false);
    }
  }

  if (loading) {
    return (
      <div className="card p-8 text-center text-muted">
        ✦ Loading Image Studio configuration…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 pb-16 max-w-5xl">
      {/* Top Action Banner */}
      <section className="card bg-beige/40">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-wine">🖼️ AI Image Studio (Devotional Card Defaults)</h2>
            <p className="text-xs text-muted mt-1">
              Configure the default AI generation model, aspect ratio, and sacred framing across Daily Inspiration cards.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="button primary text-xs cursor-pointer"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "Saving…" : "Save Image Defaults"}
            </button>
          </div>
        </div>
      </section>

      {/* Save feedback */}
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

      {/* SECTION 1: GLOBAL DEFAULTS */}
      <section className="card space-y-6">
        <div className="border-b border-line pb-3">
          <h2 className="card-title text-base font-bold text-ink m-0">🎨 Default AI Image Engine &amp; Card Style</h2>
          <p className="text-xs text-muted mt-0.5">
            Configure the default generator and styling inherited when creating Daily Inspiration cards.
          </p>
        </div>

        {/* Model Selection */}
        <div className="space-y-3">
          <label className="text-xs font-bold text-muted uppercase tracking-wider block">
            Default Card Generation Model
          </label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {MODEL_OPTIONS.map((opt) => {
              const selected = config.defaultModel === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    setConfig((c) => ({ ...c, defaultModel: opt.value }));
                    setTestModel(opt.value);
                  }}
                  className={`flex flex-col text-left p-4 rounded-xl border transition-all cursor-pointer ${
                    selected
                      ? "border-wine bg-wine/5 ring-1 ring-wine shadow-sm"
                      : "border-line bg-beige/30 hover:border-gold/60 hover:bg-white"
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <span className="font-semibold text-ink text-sm">{opt.label}</span>
                    <span
                      className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full font-bold ${
                        opt.badge === "Recommended"
                          ? "bg-amber-100 text-amber-800 border border-amber-200"
                          : "bg-gray-100 text-gray-700 border border-gray-200"
                      }`}
                    >
                      {opt.badge}
                    </span>
                  </div>
                  <span className="text-[11.5px] font-medium text-wine-light mb-1">{opt.sub}</span>
                  <p className="text-xs text-muted leading-relaxed flex-1">{opt.description}</p>
                  <span className="text-[11px] text-muted/80 font-mono mt-3">OpenAI Image API</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Aspect Ratio & Border Style */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-line">
          <Field label="Default Aspect Ratio" help="Select the default frame size for devotional cards.">
            <select
              className="input bg-white cursor-pointer font-medium"
              value={config.defaultAspectRatio}
              onChange={(e) => {
                const val = e.target.value;
                setConfig((c) => ({ ...c, defaultAspectRatio: val }));
                setTestAspectRatio(val);
              }}
            >
              {ASPECT_RATIOS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Default Border Framing" help="Subtle sacred border styling to apply around the card.">
            <select
              className="input bg-white cursor-pointer font-medium"
              value={config.defaultBorderStyle}
              onChange={(e) => {
                const val = e.target.value;
                setConfig((c) => ({ ...c, defaultBorderStyle: val }));
                setTestBorderStyle(val);
              }}
            >
              {BORDER_STYLES.map((b) => (
                <option key={b.value} value={b.value}>
                  {b.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {/* Footer Text & Visual Direction */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Default Card Footer Branding" help="Small text rendered at the bottom edge (e.g. app name).">
            <input
              type="text"
              className="input bg-white font-mono text-sm"
              value={config.defaultFooterText}
              onChange={(e) => {
                const val = e.target.value;
                setConfig((c) => ({ ...c, defaultFooterText: val }));
                setTestFooterText(val);
              }}
              placeholder="MY PRAYER ALTAR"
            />
          </Field>

          <Field label="Default Visual Direction" help="Tone and artistic palette guidance for the generator.">
            <input
              type="text"
              className="input bg-white text-sm"
              value={config.defaultVisualDirection}
              onChange={(e) => {
                const val = e.target.value;
                setConfig((c) => ({ ...c, defaultVisualDirection: val }));
                setTestVisualDirection(val);
              }}
              placeholder="quiet, warm, contemplative, editorial, and elegant."
            />
          </Field>
        </div>
      </section>

      {/* SECTION 2: LIVE CARD AUDITION & SANDBOX */}
      <section className="card space-y-6">
        <div className="border-b border-line pb-3">
          <h2 className="card-title text-base font-bold text-ink m-0">✦ Live Image Audition &amp; Sandbox</h2>
          <p className="text-xs text-muted mt-0.5">
            Test prompt instructions, quotes, and framing options. Generated cards render instantly in high-resolution WebP without saving to Today Feed drafts.
          </p>
        </div>

        {/* Sandbox Controls */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-beige/40 p-4 rounded-xl border border-line">
          <div>
            <label className="text-xs font-bold text-ink mb-1 block">Audition Model</label>
            <select
              className="input bg-white text-xs cursor-pointer font-medium py-2"
              value={testModel}
              onChange={(e) => setTestModel(e.target.value)}
            >
              <option value="gpt-image-2">GPT Image 2 ($0.08)</option>
              <option value="gpt-image-1.5">GPT Image 1.5 ($0.04)</option>
              <option value="gpt-image-1-mini">GPT Image 1 Mini ($0.02)</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-bold text-ink mb-1 block">Aspect Ratio</label>
            <select
              className="input bg-white text-xs cursor-pointer font-medium py-2"
              value={testAspectRatio}
              onChange={(e) => setTestAspectRatio(e.target.value)}
            >
              <option value="4:5">4:5 (Standard Devotional Card)</option>
              <option value="9:16">9:16 (Story / Full Portrait)</option>
              <option value="16:9">16:9 (Landscape Banner)</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-bold text-ink mb-1 block">Border Style</label>
            <select
              className="input bg-white text-xs cursor-pointer font-medium py-2"
              value={testBorderStyle}
              onChange={(e) => setTestBorderStyle(e.target.value)}
            >
              <option value="none">None (Clean)</option>
              <option value="thin">Thin Solid</option>
              <option value="decorative">Decorative Gold Filigree</option>
              <option value="glow">Luminous Inner Glow</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-bold text-ink mb-1 block">Footer Branding</label>
            <input
              type="text"
              className="input bg-white text-xs font-mono py-2"
              value={testFooterText}
              onChange={(e) => setTestFooterText(e.target.value)}
              placeholder="MY PRAYER ALTAR"
            />
          </div>
        </div>

        {/* Prompt Input */}
        <div className="space-y-4">
          <Field
            label="Visual Direction &amp; Color Palette"
            help="Artistic atmosphere instruction passed to the model."
          >
            <input
              type="text"
              className="input bg-white text-sm"
              value={testVisualDirection}
              onChange={(e) => setTestVisualDirection(e.target.value)}
            />
          </Field>

          <Field
            label="Card Reflection Instruction / Quoted Verse"
            help="Put quoted text inside quotation marks to reproduce it verbatim. Include any scene or devotional imagery description."
          >
            <textarea
              rows={3}
              className="textarea bg-white text-sm font-sans"
              value={testInstruction}
              onChange={(e) => setTestInstruction(e.target.value)}
            />
          </Field>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            <span className="text-xs text-muted">
              Estimated generation time: ~8–12 seconds per card render.
            </span>
            <button
              type="button"
              onClick={handleRunTest}
              disabled={testing || !testInstruction.trim()}
              className="button primary text-xs flex items-center gap-2 cursor-pointer self-start sm:self-auto"
            >
              {testing ? (
                <>
                  <span className="animate-spin text-sm">✦</span>
                  <span>Rendering Card…</span>
                </>
              ) : (
                <>
                  <span>✦ Generate Test Card</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Test Error */}
        {testError && (
          <div className="p-4 rounded-xl text-sm font-medium bg-rose-50 border border-rose-200 text-rose-800">
            <strong>Audition Error:</strong> {testError}
          </div>
        )}

        {/* Test Result Display */}
        {testResult && (
          <div className="space-y-4 pt-4 border-t border-line">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
              <div className="flex items-center gap-3">
                <span className="font-semibold text-ink">Model: {testResult.model}</span>
                <span>•</span>
                <span>Aspect Ratio: {testResult.aspectRatio}</span>
                <span>•</span>
                <span>Render Time: {(testResult.elapsedMs / 1000).toFixed(1)}s</span>
                <span>•</span>
                <span>Size: {(testResult.sizeBytes / 1024).toFixed(0)} KB (WebP)</span>
              </div>
              <a
                href={testResult.dataUrl}
                download={`devotional-card-${Date.now()}.webp`}
                className="text-wine hover:text-wine-dark underline font-bold"
              >
                Download Test Card ↓
              </a>
            </div>

            <div className="flex justify-center bg-beige/30 p-6 rounded-2xl border border-line">
              <div
                className={`relative overflow-hidden rounded-xl shadow-md border border-line ${
                  testResult.aspectRatio === "16:9"
                    ? "w-full max-w-xl aspect-video"
                    : testResult.aspectRatio === "9:16"
                    ? "w-64 aspect-[9/16]"
                    : "w-80 aspect-[4/5]"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={testResult.dataUrl}
                  alt="Audition card preview"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
