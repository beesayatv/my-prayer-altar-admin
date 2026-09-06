import { NextResponse } from "next/server";
import { verifyAdminAuth } from "@/lib/authServer";
import {
  callGeminiFlashTTS,
  callOpenAISpeechAPI,
  DEFAULT_GEMINI_TTS_MODEL,
  DEFAULT_TTS_MODEL,
} from "@/lib/ai/narrationGenerator";

export const maxDuration = 45;

export async function POST(request: Request) {
  try {
    const auth = await verifyAdminAuth(request);
    if (!auth.authorized) {
      return NextResponse.json(
        { success: false, error: "Unauthorized access. Valid admin session required." },
        { status: 401 }
      );
    }

    const body = await request.json();
    const {
      provider = "google",
      voice = "Sulafat",
      text = "Heavenly Father, we humbly present our day to You. Grant us Your peace, illuminate our path, and strengthen our faith. Amen.",
      instructions = "Read slowly, warmly, and prayerfully. Use a calm devotional tone.",
      speed = 1.0,
    } = body as {
      provider?: "google" | "openai";
      voice?: string;
      text?: string;
      instructions?: string;
      speed?: number;
    };

    let audioBuffer: Buffer;
    let contentType = "audio/wav";

    if (provider === "google") {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return NextResponse.json(
          { success: false, error: "GEMINI_API_KEY environment variable is not configured." },
          { status: 400 }
        );
      }

      audioBuffer = await callGeminiFlashTTS(
        apiKey,
        {
          model: DEFAULT_GEMINI_TTS_MODEL,
          voice,
          input: text,
          instructions,
          format: "mp3",
        },
        "voice_preview"
      );
      contentType = "audio/mpeg";
    } else {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        return NextResponse.json(
          { success: false, error: "OPENAI_API_KEY environment variable is not configured." },
          { status: 400 }
        );
      }

      audioBuffer = await callOpenAISpeechAPI(
        apiKey,
        {
          model: DEFAULT_TTS_MODEL,
          voice,
          input: text,
          instructions,
          speed: Number(speed) || 1.0,
          response_format: "mp3",
        },
        "voice_preview"
      );
      contentType = "audio/mpeg";
    }

    const base64Audio = audioBuffer.toString("base64");
    const dataUrl = `data:${contentType};base64,${base64Audio}`;

    return NextResponse.json({
      success: true,
      audioUrl: dataUrl,
      provider,
      voice,
    });
  } catch (err) {
    console.error("Voice Preview API Error:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Voice preview synthesis failed." },
      { status: 500 }
    );
  }
}
