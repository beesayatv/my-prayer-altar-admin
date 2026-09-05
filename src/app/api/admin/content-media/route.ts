import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAdminServiceClient } from "@/lib/adminClient";
import { verifyAdminAuth } from "@/lib/authServer";
import { bunnyPublicUrl, deleteFromBunny, uploadToBunny } from "@/lib/bunnyStorage";

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxBytes = 5 * 1024 * 1024;
const errorMessage = (error: unknown) => error instanceof Error ? error.message : "Unexpected server error";

export async function POST(request: NextRequest) {
  const auth = await verifyAdminAuth(request);
  if (!auth.authorized) return NextResponse.json({ error: auth.error || "Unauthorized." }, { status: 401 });
  const supabase = getAdminServiceClient();
  try {
    const formData = await request.formData(); const file = formData.get("file"); const contentId = String(formData.get("contentId") || ""); const role = String(formData.get("role") || "gallery");
    if (!(file instanceof File) || !contentId || !allowedTypes.has(file.type) || file.size > maxBytes) return NextResponse.json({ error: "Upload a JPEG, PNG, or WebP image smaller than 5 MB." }, { status: 400 });
    if (role !== "thumbnail" && role !== "gallery") return NextResponse.json({ error: "Invalid media role." }, { status: 400 });
    const { data: content, error: contentError } = await supabase.from("content_items").select("type").eq("id", contentId).maybeSingle();
    if (contentError) throw contentError;
    if (!content) return NextResponse.json({ error: "Content item not found." }, { status: 404 });
    if (content.type === "daily_prayer") return NextResponse.json({ error: "Daily Prayer covers come from the shared visual pool and cannot be uploaded individually." }, { status: 400 });
    if (content.type === "bible_reading") return NextResponse.json({ error: "Scripture & Reflection covers come from the shared visual pool and cannot be uploaded individually." }, { status: 400 });

    const id = crypto.randomUUID(); const extension = file.name.split(".").pop()?.toLowerCase() || "jpg"; const storagePath = `content-images/${contentId}/${id}.${extension}`;
    await uploadToBunny(storagePath, Buffer.from(await file.arrayBuffer()), file.type);
    const { data, error } = await supabase.from("content_media").insert({ id, content_id: contentId, storage_path: storagePath, public_url: bunnyPublicUrl(storagePath), media_type: "image", role, alt_text: String(formData.get("altText") || file.name), credit: String(formData.get("credit") || "") || null, caption: String(formData.get("caption") || "") || null, sort_order: Number(formData.get("sortOrder") || 0) }).select().single();
    if (error) { await deleteFromBunny(storagePath); throw error; }
    return NextResponse.json({ media: data });
  } catch (error) { return NextResponse.json({ error: errorMessage(error) }, { status: 500 }); }
}

export async function DELETE(request: NextRequest) {
  const auth = await verifyAdminAuth(request);
  if (!auth.authorized) return NextResponse.json({ error: auth.error || "Unauthorized." }, { status: 401 });
  const supabase = getAdminServiceClient();
  try {
    const { id } = await request.json() as { id?: string }; if (!id) return NextResponse.json({ error: "Missing media id." }, { status: 400 });
    const { data: media, error: loadError } = await supabase.from("content_media").select("id,storage_path,public_url").eq("id", id).single(); if (loadError) throw loadError;
    if (media.public_url?.includes("b-cdn.net") && media.storage_path) await deleteFromBunny(media.storage_path); else if (media.storage_path) await supabase.storage.from("today-media").remove([media.storage_path]);
    const { error } = await supabase.from("content_media").delete().eq("id", id); if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) { return NextResponse.json({ error: errorMessage(error) }, { status: 500 }); }
}
