import { NextResponse } from "next/server";
import { verifyAdminAuth } from "@/lib/authServer";
import { checkRateLimit } from "@/lib/ai/rateLimiter";
import { generateDailyInspirationDraft } from "@/lib/ai/dailyInspirationGenerator";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
  const auth = await verifyAdminAuth(request);
  if (!auth.authorized) return NextResponse.json({ success: false, error: "A valid administrator session is required." }, { status: 401 });
  if (!checkRateLimit(auth.userId!).allowed) return NextResponse.json({ success: false, error: "Please wait a moment before generating another reflection." }, { status: 429 });
  try {
    const body = await request.json() as { theme?: unknown };
    const theme = typeof body.theme === "string" ? body.theme.trim().slice(0, 240) : "";
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    let config: Record<string, unknown> = {};
    if (url && key) {
      const client = createClient(url, key, { auth: { persistSession: false } });
      const { data } = await client.from("automation_configs").select("config_json").eq("content_type", "daily_inspiration").maybeSingle();
      config = (data?.config_json as Record<string, unknown>) || {};
    }
    const targetWords = Math.min(60, Math.max(12, Number(config.target_word_count) || 28));
    const draft = await generateDailyInspirationDraft({ theme, targetWords, systemPrompt: typeof config.custom_system_instruction === "string" ? config.custom_system_instruction : undefined, model: typeof config.ai_model === "string" ? config.ai_model : undefined });
    return NextResponse.json({ success: true, data: draft, metadata: { quote_type: "original_reflection", generation_method: "manual", ai_provider: "openai", ai_model: config.ai_model || "gpt-4o-mini" } });
  } catch (error) {
    console.error("Daily Inspiration generation failed:", error);
    return NextResponse.json({ success: false, error: "The reflection could not be generated. Please try again." }, { status: 500 });
  }
}
