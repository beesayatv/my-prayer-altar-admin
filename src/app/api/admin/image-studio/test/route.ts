import { NextResponse } from "next/server";
import { verifyAdminAuth } from "@/lib/authServer";
import { generateDailyInspirationCard } from "@/lib/ai/dailyInspirationCardGenerator";

export async function POST(request: Request) {
  const auth = await verifyAdminAuth(request);
  if (!auth.authorized) {
    return NextResponse.json({ success: false, error: "A valid administrator session is required." }, { status: 401 });
  }

  try {
    const body = await request.json() as {
      instruction?: unknown;
      visualDirection?: unknown;
      model?: unknown;
      aspectRatio?: unknown;
      footerText?: unknown;
      borderStyle?: unknown;
    };

    const instruction = typeof body.instruction === "string" ? body.instruction.trim().slice(0, 800) : "";
    const visualDirection = typeof body.visualDirection === "string" ? body.visualDirection.trim().slice(0, 600) : "";
    const model = typeof body.model === "string" ? body.model : "gpt-image-2";
    const aspectRatio = typeof body.aspectRatio === "string" ? body.aspectRatio : "4:5";
    const footerText = typeof body.footerText === "string" ? body.footerText.trim().slice(0, 60) : "MY PRAYER ALTAR";
    const borderStyle = typeof body.borderStyle === "string" ? body.borderStyle : "none";

    if (!instruction) {
      return NextResponse.json({ success: false, error: "Please enter a card instruction or reflection prompt." }, { status: 400 });
    }

    const startTime = Date.now();
    const imageBuffer = await generateDailyInspirationCard({
      instruction,
      visualDirection,
      model,
      aspectRatio,
      footerText,
      borderStyle,
    });
    const elapsedMs = Date.now() - startTime;

    const base64Data = imageBuffer.toString("base64");
    const dataUrl = `data:image/webp;base64,${base64Data}`;

    return NextResponse.json({
      success: true,
      dataUrl,
      elapsedMs,
      model,
      aspectRatio,
      sizeBytes: imageBuffer.length,
    });
  } catch (error) {
    console.error("Test card generation failed:", error);
    const message = error instanceof Error ? error.message : "The image service could not create this card.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
