import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminAuth } from "@/lib/authServer";
import { generateAndStoreProfileNarration } from "@/lib/ai/narrationGenerator";
import { runtimeEnv } from "@/lib/runtimeEnv";

// Gemini may need more than a minute for longer Bible readings and prayers.
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    // 1. Verify Active Admin Session
    const auth = await verifyAdminAuth(request);
    if (!auth.authorized || !auth.userId) {
      return NextResponse.json(
        { success: false, error: auth.error || "Unauthorized access. Valid admin session required." },
        { status: 401 }
      );
    }

    // 2. Parse request payload
    const body = await request.json();
    const { contentId, profile, provider, voice, model, speed } = body as {
      contentId?: string;
      profile?: "gentle" | "solemn";
      provider?: "google" | "openai";
      voice?: string;
      model?: string;
      speed?: number;
    };

    if (!contentId) {
      return NextResponse.json(
        { success: false, error: "Content ID is required for narration generation." },
        { status: 400 }
      );
    }

    const url = runtimeEnv("NEXT_PUBLIC_SUPABASE_URL");
    const serviceKey = runtimeEnv("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = runtimeEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");

    if (!url || (!serviceKey && !anonKey)) {
      return NextResponse.json({ success: false, error: "Supabase server configuration is unavailable." }, { status: 500 });
    }

    const supabase = serviceKey
      ? createClient(url, serviceKey, { auth: { persistSession: false } })
      : createClient(url, anonKey!, {
          auth: { persistSession: false },
          global: { headers: auth.token ? { Authorization: `Bearer ${auth.token}` } : {} },
        });

    // 3. Fetch target content item
    const { data: item, error: fetchError } = await supabase
      .from("content_items")
      .select("id, title, body, type, metadata")
      .eq("id", contentId)
      .maybeSingle();

    if (fetchError || !item) {
      return NextResponse.json(
        { success: false, error: `Content item not found: ${fetchError?.message || "Invalid ID"}` },
        { status: 404 }
      );
    }

    let assembledBody = "";
    if (item.type === "bible_reading") {
      const metadata = (item.metadata as Record<string, any>) || {};
      const intro = (metadata.introduction || "").trim();
      const reflection = (item.body || "").trim();
      const question = (metadata.reflection_question || "").trim();
      const closing = (metadata.closing_prayer || "").trim();
      
      const parts = [];
      if (intro) parts.push(intro);
      if (reflection) parts.push(reflection);
      if (question) parts.push(question);
      if (closing) parts.push(closing);
      
      assembledBody = parts.join("\n\n. . .\n\n");
    } else {
      assembledBody = (item.body || "").trim();
    }

    if (!item.title || !assembledBody) {
      return NextResponse.json(
        { success: false, error: "Content item title or body is empty. Cannot generate narration." },
        { status: 400 }
      );
    }

    // 4. Generate audio narration via selected provider & upload to Bunny Storage
    const result = await generateAndStoreProfileNarration(
      {
        contentId: item.id,
        title: item.title,
        body: assembledBody,
        contentType: item.type,
        profile: profile || "gentle",
        provider,
        voice,
        model,
        speed: speed ? Number(speed) : undefined,
      },
      supabase
    );

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || "Failed to generate narration audio." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      profile: result.profile,
      metadata: result.metadata,
      message: `Audio narration profile '${result.profile}' generated and saved successfully.`,
    });
  } catch (err) {
    console.error("Generate Narration API Error:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Server error." },
      { status: 500 }
    );
  }
}
