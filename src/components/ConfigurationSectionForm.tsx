"use client";

import { useEffect, useState } from "react";
import { Field } from "@/components/ContentEditor";
import {
  DAILY_PRAYER,
  loadConfigurationSection,
  saveConfigurationSection,
  type ConfigurationSection,
} from "@/lib/contentConfiguration";

type SectionFormProps = {
  section: ConfigurationSection;
  title: string;
  description: string;
};

type SectionValues = Record<string, boolean | string>;

const defaults: Record<ConfigurationSection, SectionValues> = {
  ai: { preferred_model: "", instruction_profile: "", retain_editorial_review: "true" },
  audio: { narration_enabled: true, default_profile: "gentle", default_voice_gentle: "marin", default_voice_solemn: "ash", default_voice: "marin", tts_model: "gpt-4o-mini-tts", delivery_style: "calm, prayerful, and measured" },
  guardrails: { require_editorial_review: true, source_attribution_required: true, editorial_notes: "" },
};

export function ConfigurationSectionForm({ section, title, description }: SectionFormProps) {
  const [values, setValues] = useState<SectionValues>(defaults[section]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const saved = await loadConfigurationSection(DAILY_PRAYER, section);
        if (active) setValues({ ...defaults[section], ...saved } as SectionValues);
      } catch {
        if (active) setMessage({ type: "error", text: "These settings could not be loaded. Please refresh and try again." });
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [section]);

  function setValue(name: string, value: boolean | string) {
    setValues((current) => ({ ...current, [name]: value }));
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await saveConfigurationSection(DAILY_PRAYER, section, values);
      setMessage({ type: "success", text: `${title} settings have been saved for Daily Prayer.` });
    } catch {
      setMessage({ type: "error", text: "The settings could not be saved. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="status-line">Loading settings…</p>;

  return (
    <form onSubmit={save} className="flex flex-col gap-6 pb-16">
      <div className="card bg-beige/30"><p className="m-0 text-sm text-muted">{description} These preferences are stored for Daily Prayer only and do not activate any automated work.</p></div>
      {message && <div className={`alert ${message.type === "success" ? "success" : "error"}`} role="alert">{message.text}</div>}
      {section === "ai" && <AiFields values={values} setValue={setValue} />}
      {section === "audio" && <AudioFields values={values} setValue={setValue} />}
      {section === "guardrails" && <GuardrailFields values={values} setValue={setValue} />}
      <div><button className="button px-8 py-3 shadow-md" type="submit" disabled={saving}>{saving ? "Saving settings…" : "Save settings"}</button></div>
    </form>
  );
}

function AiFields({ values, setValue }: { values: SectionValues; setValue: (name: string, value: boolean | string) => void }) {
  return <section className="card"><h2 className="card-title">Default drafting preferences</h2><div className="form-grid"><Field label="Preferred model" help="A saved preference for future generation tools; it does not make a request from this page."><input className="input" value={String(values.preferred_model ?? "")} onChange={(event) => setValue("preferred_model", event.target.value)} placeholder="Choose when a generation provider is configured" /></Field><Field label="Instruction profile" help="A short editorial direction for future Daily Prayer drafts."><textarea className="textarea min-h-32" value={String(values.instruction_profile ?? "")} onChange={(event) => setValue("instruction_profile", event.target.value)} /></Field></div></section>;
}

function AudioFields({ values, setValue }: { values: SectionValues; setValue: (name: string, value: boolean | string) => void }) {
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

  return (
    <section className="card">
      <h2 className="card-title">OpenAI Narration Defaults</h2>
      <div className="form-grid">
        <label className="flex items-center justify-between rounded-xl border border-line bg-beige/40 p-4 col-span-full">
          <span>
            <strong className="block text-base text-ink">Enable Automated OpenAI Narration</strong>
            <span className="mt-0.5 block text-xs text-muted">Automatically generate and attach OpenAI TTS audio when daily prayers are processed or published.</span>
          </span>
          <input
            type="checkbox"
            className="h-6 w-6 cursor-pointer accent-wine"
            checked={Boolean(values.narration_enabled)}
            onChange={(event) => setValue("narration_enabled", event.target.checked)}
          />
        </label>

        <Field label="Default Voice Profile" help="Default tone profile for daily prayers.">
          <select
            className="input cursor-pointer bg-white"
            value={String(values.default_profile || "gentle")}
            onChange={(event) => setValue("default_profile", event.target.value)}
          >
            <option value="gentle">Gentle Profile (Calm & Prayerful)</option>
            <option value="solemn">Solemn Profile (Reverent & Deep)</option>
          </select>
        </Field>

        <Field label="Default OpenAI Voice" help="Default voice used when generating daily prayer audio.">
          <select
            className="input cursor-pointer bg-white"
            value={String(values.default_voice || "marin")}
            onChange={(event) => setValue("default_voice", event.target.value)}
          >
            {OPENAI_VOICES.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="OpenAI Speech Model" help="The AI voice synthesis model used to generate audio narration files.">
          <select
            className="input cursor-pointer bg-white"
            value={String(values.tts_model || "gpt-4o-mini-tts")}
            onChange={(event) => setValue("tts_model", event.target.value)}
          >
            {TTS_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </section>
  );
}

function GuardrailFields({ values, setValue }: { values: SectionValues; setValue: (name: string, value: boolean | string) => void }) {
  return <section className="card"><h2 className="card-title">Editorial safeguards</h2><div className="form-grid"><label className="flex items-center justify-between rounded-xl border border-line bg-beige/40 p-4"><span><strong className="block text-base text-ink">Require editorial review</strong><span className="mt-0.5 block text-xs text-muted">Records the review preference for future workflows.</span></span><input type="checkbox" className="h-6 w-6 cursor-pointer accent-wine" checked={Boolean(values.require_editorial_review)} onChange={(event) => setValue("require_editorial_review", event.target.checked)} /></label><label className="flex items-center justify-between rounded-xl border border-line bg-beige/40 p-4"><span><strong className="block text-base text-ink">Require source attribution</strong><span className="mt-0.5 block text-xs text-muted">Records the attribution preference for future editorial tools.</span></span><input type="checkbox" className="h-6 w-6 cursor-pointer accent-wine" checked={Boolean(values.source_attribution_required)} onChange={(event) => setValue("source_attribution_required", event.target.checked)} /></label><Field label="Editorial notes" help="Guidance saved for future content workflows."><textarea className="textarea min-h-32" value={String(values.editorial_notes ?? "")} onChange={(event) => setValue("editorial_notes", event.target.value)} /></Field></div></section>;
}
