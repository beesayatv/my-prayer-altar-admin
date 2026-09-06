"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Field } from "@/components/ContentEditor";
import { requireSupabase } from "@/lib/supabase";
import { DAILY_PRAYER } from "@/lib/contentConfiguration";

type EngineModelConfig = {
  dailyPrayerModel: string;
  scriptureModel: string;
  updatesModel: string;
  bibleStoriesModel: string;
};

const DEFAULT_CONFIGS: EngineModelConfig = {
  dailyPrayerModel: "gemini-2.5-flash",
  scriptureModel: "gemini-2.5-flash",
  updatesModel: "gemini-2.5-flash",
  bibleStoriesModel: "gpt-4o",
};

export function TextStudioSettingsForm() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Default models & language for text drafting pipelines
  const [dailyPrayerModel, setDailyPrayerModel] = useState("gemini-2.5-flash");
  const [dailyPrayerLanguage, setDailyPrayerLanguage] = useState<"en" | "ceb" | "fil">("en");
  const [scriptureModel, setScriptureModel] = useState("gemini-2.5-flash");
  const [updatesModel, setUpdatesModel] = useState("gemini-2.5-flash");
  const [bibleStoriesModel, setBibleStoriesModel] = useState("gpt-4o");

  // Sandbox Audition / Testing state
  const [testModel, setTestModel] = useState("gemini-2.5-flash");
  const [testIntention, setTestIntention] = useState("A prayer for family peace, reconciliation, and quiet trust in God's will");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    draft: { title: string; intention: string; excerpt: string; body: string };
    elapsedMs: number;
    provider: string;
    model: string;
  } | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  useEffect(() => {
    async function loadSettings() {
      try {
        setLoading(true);
        const supabase = requireSupabase();

        // 1. Load Daily Prayer config
        const { data: dpData } = await supabase
          .from("automation_configs")
          .select("config_json, language_code")
          .eq("content_type", DAILY_PRAYER)
          .maybeSingle();

        if (dpData?.language_code) {
          setDailyPrayerLanguage(dpData.language_code as any);
        }

        const dpConfig = (dpData?.config_json || {}) as Record<string, any>;
        if (dpConfig.ai?.model) {
          setDailyPrayerModel(String(dpConfig.ai.model));
        }

        // 2. Load Bible Reflection config
        const { data: brData } = await supabase
          .from("automation_configs")
          .select("config_json")
          .eq("content_type", "bible_reflection")
          .maybeSingle();

        const brConfig = (brData?.config_json || {}) as Record<string, any>;
        if (brConfig.ai?.model) {
          setScriptureModel(String(brConfig.ai.model));
        }

        // 3. Load Catholic News / Updates config
        const { data: newsData } = await supabase
          .from("automation_configs")
          .select("config_json")
          .eq("content_type", "catholic_news")
          .maybeSingle();

        const newsConfig = (newsData?.config_json || {}) as Record<string, any>;
        if (newsConfig.ai?.model) {
          setUpdatesModel(String(newsConfig.ai.model));
        }
      } catch (err) {
        console.error("Failed to load text studio configs:", err);
      } finally {
        setLoading(false);
      }
    }

    loadSettings();
  }, []);

  const handleSave = async () => {
    try {
      setSaving(true);
      setMessage(null);
      const supabase = requireSupabase();

      // 1. Update Daily Prayer config_json.ai.model and language_code
      const { data: dpData } = await supabase
        .from("automation_configs")
        .select("config_json")
        .eq("content_type", DAILY_PRAYER)
        .maybeSingle();

      const dpConfig = (dpData?.config_json || {}) as Record<string, any>;
      await supabase
        .from("automation_configs")
        .upsert({
          content_type: DAILY_PRAYER,
          language_code: dailyPrayerLanguage,
          config_json: {
            ...dpConfig,
            ai: {
              ...(dpConfig.ai || {}),
              model: dailyPrayerModel,
            },
          },
        }, { onConflict: "content_type" });

      // 2. Update Bible Reflection config_json.ai.model
      const { data: brData } = await supabase
        .from("automation_configs")
        .select("config_json")
        .eq("content_type", "bible_reflection")
        .maybeSingle();

      const brConfig = (brData?.config_json || {}) as Record<string, any>;
      await supabase
        .from("automation_configs")
        .upsert({
          content_type: "bible_reflection",
          config_json: {
            ...brConfig,
            ai: {
              ...(brConfig.ai || {}),
              model: scriptureModel,
            },
          },
        }, { onConflict: "content_type" });

      // 3. Update Catholic News config_json.ai.model
      const { data: newsData } = await supabase
        .from("automation_configs")
        .select("config_json")
        .eq("content_type", "catholic_news")
        .maybeSingle();

      const newsConfig = (newsData?.config_json || {}) as Record<string, any>;
      await supabase
        .from("automation_configs")
        .upsert({
          content_type: "catholic_news",
          config_json: {
            ...newsConfig,
            ai: {
              ...(newsConfig.ai || {}),
              model: updatesModel,
            },
          },
        }, { onConflict: "content_type" });

      setMessage({ type: "success", text: "Text Studio default drafting models saved successfully!" });
    } catch (err) {
      console.error("Error saving text studio settings:", err);
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to save text settings." });
    } finally {
      setSaving(false);
    }
  };

  const handleTestRun = async () => {
    try {
      setTesting(true);
      setTestError(null);
      setTestResult(null);

      const { data: { session } } = await requireSupabase().auth.getSession();
      const token = session?.access_token;

      const res = await fetch("/api/admin/ai/test-text", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          model: testModel,
          intention: testIntention,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Audition drafting failed.");
      }

      setTestResult(data);
    } catch (err) {
      console.error("Error in sandbox audition:", err);
      setTestError(err instanceof Error ? err.message : "Failed to run test generation.");
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return <div className="card p-8 text-center text-muted">Loading Text Studio defaults…</div>;
  }

  return (
    <div className="flex flex-col gap-8 pb-16">
      {/* Action Header Card */}
      <section className="card bg-beige/40">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-wine">✍️ Text Studio (AI Drafting Defaults)</h2>
            <p className="text-xs text-muted mt-1">
              Configure the default AI language models across every text generation pipeline. Google Gemini offers 50% lower cost and high speed.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="button primary text-xs"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "Saving…" : "Save Text Defaults"}
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

      {/* 1. Core Pipelines Model Assignment */}
      <section className="card space-y-6">
        <div className="border-b border-line pb-3">
          <h2 className="card-title text-base font-bold text-ink m-0">📋 Pipeline AI Model Assignments</h2>
          <p className="text-xs text-muted mt-0.5">
            Choose which AI model handles automated and manual drafting for each content type.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          {/* Daily Prayer */}
          <div className="bg-beige/30 p-5 rounded-xl border border-line flex flex-col gap-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <strong className="text-sm text-ink">Daily Prayer Drafting</strong>
                <span className="text-[10.5px] px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold">Today Feed</span>
              </div>
              <p className="text-xs text-muted m-0">
                Used by background queue automation and manual draft generators for daily devotional prayers.
              </p>
            </div>
            <div className="space-y-3 pt-1 border-t border-line/50">
              <Field label="Default Drafting Model">
                <select
                  className="input bg-white cursor-pointer font-medium"
                  value={dailyPrayerModel}
                  onChange={(e) => setDailyPrayerModel(e.target.value)}
                >
                  <optgroup label="Google Gemini (Recommended · Cost-Effective)">
                    <option value="gemini-2.5-flash">Gemini 2.5 Flash ($0.075/1M · Recommended)</option>
                    <option value="gemini-2.5-pro">Gemini 2.5 Pro (Deep theological reasoning)</option>
                  </optgroup>
                  <optgroup label="OpenAI">
                    <option value="gpt-4o-mini">gpt-4o-mini (OpenAI Fast standard)</option>
                    <option value="gpt-4o">gpt-4o (OpenAI High capacity)</option>
                  </optgroup>
                </select>
              </Field>

              <Field label="Default Language">
                <select
                  className="input bg-white cursor-pointer font-medium"
                  value={dailyPrayerLanguage}
                  onChange={(e) => setDailyPrayerLanguage(e.target.value as any)}
                >
                  <option value="en">English</option>
                  <option value="ceb">Cebuano</option>
                  <option value="fil">Filipino (Tagalog)</option>
                </select>
              </Field>
            </div>
          </div>

          {/* Daily Scripture & Reflections */}
          <div className="bg-beige/30 p-5 rounded-xl border border-line flex flex-col gap-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <strong className="text-sm text-ink">Daily Scripture &amp; Reflections</strong>
                <span className="text-[10.5px] px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold">Today Feed</span>
              </div>
              <p className="text-xs text-muted m-0">
                Used to compose daily biblical reflection introductions, commentaries, and closing prayers.
              </p>
            </div>
            <div className="pt-1 border-t border-line/50">
              <Field label="Default Reflection Model">
                <select
                  className="input bg-white cursor-pointer font-medium"
                  value={scriptureModel}
                  onChange={(e) => setScriptureModel(e.target.value)}
                >
                  <optgroup label="Google Gemini (Recommended · Cost-Effective)">
                    <option value="gemini-2.5-flash">Gemini 2.5 Flash ($0.075/1M · Recommended)</option>
                    <option value="gemini-2.5-pro">Gemini 2.5 Pro (Deep biblical commentary)</option>
                  </optgroup>
                  <optgroup label="OpenAI">
                    <option value="gpt-4o-mini">gpt-4o-mini (OpenAI Fast standard)</option>
                    <option value="gpt-4o">gpt-4o (OpenAI High capacity)</option>
                  </optgroup>
                </select>
              </Field>
            </div>
          </div>

          {/* Updates & Catholic News */}
          <div className="bg-beige/30 p-5 rounded-xl border border-line flex flex-col gap-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <strong className="text-sm text-ink">Updates &amp; Catholic News</strong>
                <span className="text-[10.5px] px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-semibold">URL Import</span>
              </div>
              <p className="text-xs text-muted m-0">
                Used when importing and summarizing Catholic news articles and parish announcements from web links.
              </p>
            </div>
            <div className="pt-1 border-t border-line/50">
              <Field label="Default News Summarizer Model">
                <select
                  className="input bg-white cursor-pointer font-medium"
                  value={updatesModel}
                  onChange={(e) => setUpdatesModel(e.target.value)}
                >
                  <optgroup label="Google Gemini (Recommended · Cost-Effective)">
                    <option value="gemini-2.5-flash">Gemini 2.5 Flash (Fast factual extraction)</option>
                  </optgroup>
                  <optgroup label="OpenAI">
                    <option value="gpt-4o-mini">gpt-4o-mini (OpenAI standard)</option>
                  </optgroup>
                </select>
              </Field>
            </div>
          </div>

          {/* My Bible Studio */}
          <div className="bg-beige/30 p-5 rounded-xl border border-line flex flex-col gap-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <strong className="text-sm text-ink">My Bible Studio (Story Journeys)</strong>
                <span className="text-[10.5px] px-2 py-0.5 rounded bg-purple-100 text-purple-800 font-semibold">Evergreen Library</span>
              </div>
              <p className="text-xs text-muted m-0">
                Used for multi-chapter biblical story synthesis, canonical entity linkage, and rich content blocks.
              </p>
            </div>
            <div className="pt-1 border-t border-line/50">
              <Field label="Story Generation Model">
                <select
                  className="input bg-white cursor-pointer font-medium"
                  value={bibleStoriesModel}
                  onChange={(e) => setBibleStoriesModel(e.target.value)}
                >
                  <optgroup label="High-Capacity Reasoning">
                    <option value="gpt-4o">gpt-4o (High capacity structured schema · Recommended)</option>
                    <option value="gemini-2.5-pro">Gemini 2.5 Pro (Google deep reasoning)</option>
                  </optgroup>
                </select>
              </Field>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Live Text Audition Sandbox */}
      <section className="card space-y-4">
        <div className="border-b border-line pb-3">
          <h2 className="card-title text-base font-bold text-ink m-0">🧪 Live Model Audition &amp; Latency Test</h2>
          <p className="text-xs text-muted mt-0.5">
            Test and benchmark how Google Gemini and OpenAI compare in tone, prose quality, and response latency.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Audition Model">
            <select
              className="input bg-white cursor-pointer font-medium"
              value={testModel}
              onChange={(e) => setTestModel(e.target.value)}
            >
              <optgroup label="Google Gemini">
                <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
              </optgroup>
              <optgroup label="OpenAI">
                <option value="gpt-4o-mini">gpt-4o-mini</option>
                <option value="gpt-4o">gpt-4o</option>
              </optgroup>
            </select>
          </Field>

          <div className="md:col-span-2">
            <Field label="Test Intention Prompt">
              <input
                type="text"
                className="input bg-white"
                value={testIntention}
                onChange={(e) => setTestIntention(e.target.value)}
                placeholder="Enter sample intention..."
              />
            </Field>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            className="button secondary text-xs"
            onClick={handleTestRun}
            disabled={testing || !testIntention.trim()}
          >
            {testing ? "⚡ Drafting Test Content…" : `✦ Run Test Draft (${testModel})`}
          </button>
          {testResult && (
            <span className="text-xs text-muted">
              Response time: <strong className="text-emerald-700">{testResult.elapsedMs} ms</strong> via <strong>{testResult.provider}</strong>
            </span>
          )}
        </div>

        {testError && (
          <div className="p-3 rounded-lg text-xs bg-rose-50 text-rose-800 border border-rose-200">
            {testError}
          </div>
        )}

        {testResult && (
          <div className="bg-white p-4 rounded-xl border border-line space-y-3 mt-4">
            <div className="flex items-center justify-between border-b border-line pb-2">
              <span className="text-xs font-bold text-wine">
                {testResult.draft.title}
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-gray-100 text-muted uppercase">
                {testResult.model}
              </span>
            </div>
            <p className="text-xs text-muted italic m-0">
              "{testResult.draft.excerpt}"
            </p>
            <div className="text-xs text-ink whitespace-pre-line leading-relaxed bg-beige/20 p-3 rounded-lg">
              {testResult.draft.body}
            </div>
          </div>
        )}
      </section>

      {/* Cross-Link to Voice Studio & Prayer Studio */}
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="card bg-beige/20 border border-line p-4 flex items-center justify-between">
          <div>
            <strong className="text-xs text-wine block">🎙️ Voice Studio</strong>
            <p className="text-[11px] text-muted mt-0.5">Configure default TTS narration voices &amp; speeds.</p>
          </div>
          <Link href="/settings/voice-studio" className="button secondary text-xs">
            Open Voice Studio →
          </Link>
        </div>

        <div className="card bg-beige/20 border border-line p-4 flex items-center justify-between">
          <div>
            <strong className="text-xs text-wine block">🎯 Prayer Studio</strong>
            <p className="text-[11px] text-muted mt-0.5">Manage daily prayer schedules and weekly intentions.</p>
          </div>
          <Link href="/settings/daily-prayer" className="button secondary text-xs">
            Open Prayer Studio →
          </Link>
        </div>
      </section>
    </div>
  );
}
