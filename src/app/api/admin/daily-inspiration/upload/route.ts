import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminAuth } from "@/lib/authServer";
import { bunnyPublicUrl, deleteFromBunny, uploadToBunny } from "@/lib/bunnyStorage";

const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const allowedVideoTypes = new Set(["video/mp4"]);
const maxBytes = 20 * 1024 * 1024; // 20 MB raw

export async function POST(request: NextRequest) {
  const auth = await verifyAdminAuth(request);
  if (!auth.authorized)
    return NextResponse.json({ success: false, error: "A valid administrator session is required." }, { status: 401 });

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const contentId = String(formData.get("contentId") || "");
    const aspectRatio = String(formData.get("aspectRatio") || "4:5");

    if (!(file instanceof File))
      return NextResponse.json({ success: false, error: "No file received." }, { status: 400 });
    if (!contentId)
      return NextResponse.json({ success: false, error: "contentId is required." }, { status: 400 });
    const isVideo = allowedVideoTypes.has(file.type);
    const isImage = allowedImageTypes.has(file.type);
    console.log(`[DailyInspiration/upload] file.type="${file.type}" size=${file.size} isVideo=${isVideo} isImage=${isImage}`);
    if (!isImage && !isVideo)
      return NextResponse.json({ success: false, error: `Unsupported file type: "${file.type}". Only JPEG, PNG, WebP, GIF images or MP4 videos are accepted.` }, { status: 400 });
    if (file.size > maxBytes)
      return NextResponse.json({ success: false, error: "File must be smaller than 20 MB." }, { status: 400 });

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("Server media configuration unavailable.");

    const supabase = createClient(url, key, { auth: { persistSession: false } });
    const mediaId = crypto.randomUUID();

    let uploadBuffer: Buffer;
    let mimeType: string;
    let fileExtension: string;

    // Manual uploads are already composed for their selected aspect ratio.
    // Store the original asset unchanged; native image processors such as
    // sharp are not available in the Cloudflare Worker runtime. AI-generated
    // cards use their own rendering route and retain their aspect-ratio flow.
    uploadBuffer = Buffer.from(await file.arrayBuffer());
    mimeType = file.type;
    fileExtension = isVideo ? "mp4" : file.type.split("/")[1] || "webp";

    const storagePath = `content-images/${contentId}/${mediaId}.${fileExtension}`;

    await uploadToBunny(storagePath, uploadBuffer, mimeType);

    const { error: mediaError } = await supabase.from("content_media").insert({
      id: mediaId,
      content_id: contentId,
      storage_path: storagePath,
      public_url: bunnyPublicUrl(storagePath),
      media_type: isVideo ? "video" : "image",
      role: "thumbnail",
      alt_text: "Daily Inspiration card",
      credit: "Uploaded media",
      sort_order: 0,
    });
    if (mediaError) {
      await deleteFromBunny(storagePath);
      throw new Error(`media_insert failed: ${mediaError.message} (code: ${mediaError.code})`);
    }

    const { data: current, error: loadError } = await supabase
      .from("content_items")
      .select("metadata, cover_media_id")
      .eq("id", contentId)
      .single();
    if (loadError) throw loadError;

    // Clean up old cover media if it exists
    const oldMediaId = current.cover_media_id;
    if (oldMediaId) {
      const { data: oldMedia } = await supabase
        .from("content_media")
        .select("storage_path")
        .eq("id", oldMediaId)
        .maybeSingle();
      
      if (oldMedia?.storage_path) {
        // Delete old file from storage
        try {
          await deleteFromBunny(oldMedia.storage_path);
        } catch (err) {
          console.error("Failed to delete old image from storage:", err);
        }
      }
      // Delete old database media record
      await supabase.from("content_media").delete().eq("id", oldMediaId);
    }

    const { error: updateError } = await supabase
      .from("content_items")
      .update({
        cover_media_id: mediaId,
        metadata: {
          ...(current.metadata || {}),
          quote_type: isVideo ? "uploaded_video_card" : "uploaded_card",
          card_generation_method: "manual_upload",
          card_media_type: isVideo ? "video" : "image",
          card_aspect_ratio: aspectRatio,
          rendered_media_id: mediaId,
          rendered_at: new Date().toISOString(),
        },
      })
      .eq("id", contentId);
    if (updateError) throw updateError;

    return NextResponse.json({ success: true, mediaId, storagePath, publicUrl: bunnyPublicUrl(storagePath) });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("Daily Inspiration media upload failed:", msg);
    return NextResponse.json({ success: false, error: `Upload failed: ${msg}` }, { status: 500 });
  }
}
