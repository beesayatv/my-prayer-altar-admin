import { NextRequest, NextResponse } from "next/server";
import { verifyAdminAuth } from "@/lib/authServer";
import { generatePrayerDraft } from "@/lib/ai/prayerGenerator";

export async function POST(request: NextRequest) {
  const auth = await verifyAdminAuth(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error || "Unauthorized." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { model, prompt, intention = "Testing AI response quality and latency" } = body;

    const startTime = Date.now();
    const draft = await generatePrayerDraft({
      intention,
      systemPrompt: prompt || undefined,
      model: model || "gemini-2.5-flash",
      length: "short",
    });
    const elapsedMs = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      draft,
      elapsedMs,
      model: model || "gemini-2.5-flash",
      provider: (model || "gemini-2.5-flash").toLowerCase().startsWith("gemini") ? "Google Gemini" : "OpenAI",
    });
  } catch (err) {
    console.error("Text Studio test drafting error:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Failed to run test drafting." },
      { status: 500 }
    );
  }
}
