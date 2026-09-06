import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminAuth } from "@/lib/authServer";
import { generateDailyInspirationCard } from "@/lib/ai/dailyInspirationCardGenerator";
import { bunnyPublicUrl, deleteFromBunny, uploadToBunny } from "@/lib/bunnyStorage";

export async function POST(request: Request) {
  const auth = await verifyAdminAuth(request);
  if (!auth.authorized) return NextResponse.json({ success: false, error: "A valid administrator session is required." }, { status: 401 });
  try {
    const body = await request.json() as {
      contentId?: unknown;
      inspirationPrompt?: unknown;
      visualDirection?: unknown;
      model?: unknown;
      aspectRatio?: unknown;
      footerText?: unknown;
      borderStyle?: unknown;
    };
    const contentId = typeof body.contentId === "string" ? body.contentId : "";
    const inspirationPrompt = typeof body.inspirationPrompt === "string" ? body.inspirationPrompt.trim().slice(0, 800) : "";
    const visualDirection = typeof body.visualDirection === "string" ? body.visualDirection.trim().slice(0, 600) : "";
    const model = typeof body.model === "string" ? body.model : "gpt-image-2";
    const aspectRatio = typeof body.aspectRatio === "string" ? body.aspectRatio : "4:5";
    const footerText = typeof body.footerText === "string" ? body.footerText.trim().slice(0, 60) : "MY PRAYER ALTAR";
    const borderStyle = typeof body.borderStyle === "string" ? body.borderStyle : undefined;

    if (!contentId || !inspirationPrompt) return NextResponse.json({ success: false, error: "Enter a card instruction before generating." }, { status: 400 });
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("Server media configuration unavailable.");
    const image = await generateDailyInspirationCard({ instruction: inspirationPrompt, visualDirection, model, aspectRatio, footerText, borderStyle });
    const supabase = createClient(url, key, { auth: { persistSession: false } });
    const mediaId = crypto.randomUUID();
    const storagePath = `content-images/${contentId}/${mediaId}.${image.fileExtension}`;
    await uploadToBunny(storagePath, image.buffer, image.mimeType);
    const { error: mediaError } = await supabase.from("content_media").insert({ id: mediaId, content_id: contentId, storage_path: storagePath, public_url: bunnyPublicUrl(storagePath), media_type: "image", role: "thumbnail", alt_text: "OpenAI generated Daily Inspiration card", credit: "OpenAI generated devotional card", sort_order: 0 });
    if (mediaError) { await deleteFromBunny(storagePath); throw new Error("The generated image record could not be saved."); }
    const { data: current, error: loadError } = await supabase.from("content_items").select("metadata").eq("id", contentId).single();
    if (loadError) throw loadError;
    const { error: updateError } = await supabase.from("content_items").update({ body: inspirationPrompt, excerpt: inspirationPrompt.slice(0, 150) + (inspirationPrompt.length > 150 ? "…" : ""), cover_media_id: mediaId, metadata: { ...(current.metadata || {}), quote_type: "openai_generated_card", template_id: "openai_image_v1", card_generation_method: "openai_image", card_model: model, card_aspect_ratio: aspectRatio, visual_direction: visualDirection || null, rendered_media_id: mediaId, rendered_at: new Date().toISOString() } }).eq("id", contentId);
    if (updateError) throw updateError;
    return NextResponse.json({ success: true, mediaId, storagePath, publicUrl: bunnyPublicUrl(storagePath) });
  } catch (error) {
    console.error("Daily Inspiration image generation failed:", error);
    return NextResponse.json({ success: false, error: "The devotional card could not be created. Please try again." }, { status: 500 });
  }
}
