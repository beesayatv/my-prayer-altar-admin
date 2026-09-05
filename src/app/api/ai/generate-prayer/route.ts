import { NextResponse } from "next/server";
import { verifyAdminAuth } from "@/lib/authServer";
import { checkRateLimit } from "@/lib/ai/rateLimiter";
import { generatePrayerDraft, GeneratePrayerInput } from "@/lib/ai/prayerGenerator";

const ALLOWED_LANGUAGES = new Set(["en", "ceb", "fil"]);
const ALLOWED_LENGTHS = new Set(["short", "standard", "long"]);

export async function POST(request: Request) {
  try {
    // 1. Verify Authenticated Admin Session
    const auth = await verifyAdminAuth(request);
    if (!auth.authorized || !auth.userId) {
      return NextResponse.json(
        { success: false, error: auth.error || "Unauthorized access. Valid admin authentication required." },
        { status: 401 }
      );
    }

    // 2. Rate Limiting Check (Max 10 requests per minute per admin user)
    const rateCheck = checkRateLimit(auth.userId);
    if (!rateCheck.allowed) {
      const resetSec = Math.ceil(rateCheck.resetInMs / 1000);
      return NextResponse.json(
        { success: false, error: `Rate limit exceeded. Please wait ${resetSec} seconds before generating again.` },
        { status: 429 }
      );
    }

    // 3. Parse & Validate Payload
    let body: Partial<GeneratePrayerInput>;
    try {
      body = (await request.json()) as Partial<GeneratePrayerInput>;
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid JSON request body." },
        { status: 400 }
      );
    }

    // Intention: Required, 3..200 characters
    const rawIntention = typeof body.intention === "string" ? body.intention.trim() : "";
    if (!rawIntention || rawIntention.length < 3) {
      return NextResponse.json(
        { success: false, error: "Intention must be at least 3 characters long." },
        { status: 400 }
      );
    }
    if (rawIntention.length > 200) {
      return NextResponse.json(
        { success: false, error: "Intention must not exceed 200 characters." },
        { status: 400 }
      );
    }

    // Context: Optional, max 1000 characters
    const rawContext = typeof body.context === "string" ? body.context.trim() : "";
    if (rawContext.length > 1000) {
      return NextResponse.json(
        { success: false, error: "Context details must not exceed 1000 characters." },
        { status: 400 }
      );
    }

    // Inspiration: Optional, max 300 characters
    const rawInspiration = typeof body.inspiration === "string" ? body.inspiration.trim() : "";
    if (rawInspiration.length > 300) {
      return NextResponse.json(
        { success: false, error: "Inspiration reference must not exceed 300 characters." },
        { status: 400 }
      );
    }

    // Language: Must be one of ["en", "ceb", "fil"]
    const lang = typeof body.language === "string" && ALLOWED_LANGUAGES.has(body.language)
      ? (body.language as "en" | "ceb" | "fil")
      : "en";

    // Length: Must be one of ["short", "standard", "long"]
    const len = typeof body.length === "string" && ALLOWED_LENGTHS.has(body.length)
      ? (body.length as "short" | "standard" | "long")
      : "standard";

    // Load custom system prompt from settings if available
    const { data: configData } = await (await import("@/lib/supabase")).requireSupabase()
      .from("automation_configs")
      .select("config_json")
      .eq("content_type", "daily_prayer")
      .maybeSingle();

    const configJson = (configData?.config_json as Record<string, any>) || {};
    const customPrompt = (configJson.custom_system_instruction as string) || (configJson.ai?.prompt as string) || undefined;

    // 4. Invoke AI Generation Service
    const draft = await generatePrayerDraft({
      intention: rawIntention,
      context: rawContext || undefined,
      language: lang,
      length: len,
      inspiration: rawInspiration || undefined,
      systemPrompt: customPrompt,
    });

    const generatedAt = new Date().toISOString();

    return NextResponse.json({
      success: true,
      data: draft,
      metadata: {
        creation_mode: "ai_generated",
        ai_provider: "openai",
        ai_model: "gpt-4o-mini",
        generated_at: generatedAt,
        prompt_version: "1.0",
      },
    });

  } catch (error) {
    // Log complete error details to server console, but sanitize user-facing message
    console.error("AI Prayer Generation Server Error:", error);
    
    return NextResponse.json(
      {
        success: false,
        error: "Failed to generate prayer draft. Please verify server settings and try again.",
      },
      { status: 500 }
    );
  }
}
