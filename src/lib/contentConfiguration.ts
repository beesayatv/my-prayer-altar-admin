import { requireSupabase } from "@/lib/supabase";

export const DAILY_PRAYER = "daily_prayer" as const;
export const DAILY_INSPIRATION = "daily_inspiration" as const;

export const configurableContentTypes = {
  daily_prayer: "Daily Prayer",
  daily_inspiration: "Daily Inspiration",
  church_highlight: "Church Highlight",
  bible_reflection: "Bible Reflection",
  saint_of_the_day: "Saint of the Day",
  catholic_news: "Catholic News",
} as const;

export type ConfigurableContentType = keyof typeof configurableContentTypes;

export type AutomationConfigRecord = {
  content_type: ConfigurableContentType;
  is_enabled: boolean;
  operating_mode: "off" | "drafts_only" | "generate_and_schedule" | "fully_automatic";
  queue_length_days: number;
  publication_time: string;
  generation_time: string;
  time_zone: string;
  language_code: "en" | "ceb" | "fil";
  preferred_length: "short" | "standard" | "long";
  generation_quality: "fast" | "balanced" | "premium";
  theme_strategy: "ai_selected" | "rotation_enabled";
  config_json: Record<string, unknown>;
};

export type ConfigurationSection = "ai" | "audio" | "guardrails";

export async function loadConfigurationSection(contentType: ConfigurableContentType, section: ConfigurationSection) {
  const { data, error } = await requireSupabase()
    .from("automation_configs")
    .select("config_json")
    .eq("content_type", contentType)
    .maybeSingle();

  if (error) throw error;
  const config = (data?.config_json ?? {}) as Record<string, unknown>;
  const sectionValue = config[section];
  return typeof sectionValue === "object" && sectionValue !== null && !Array.isArray(sectionValue)
    ? sectionValue as Record<string, unknown>
    : {};
}

export async function saveConfigurationSection(contentType: ConfigurableContentType, section: ConfigurationSection, value: Record<string, unknown>) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.from("automation_configs").select("config_json").eq("content_type", contentType).maybeSingle();
  if (error) throw error;

  const existing = (data?.config_json ?? {}) as Record<string, unknown>;
  const { error: saveError } = await supabase.from("automation_configs").upsert({
    content_type: contentType,
    config_json: { ...existing, [section]: value },
  }, { onConflict: "content_type" });
  if (saveError) throw saveError;
}
