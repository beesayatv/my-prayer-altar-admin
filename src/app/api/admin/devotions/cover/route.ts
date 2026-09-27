import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAdminServiceClient } from "@/lib/adminClient";
import { verifyAdminAuth } from "@/lib/authServer";
import { bunnyPublicUrl, deleteFromBunny, uploadToBunny } from "@/lib/bunnyStorage";
const extensions: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const errorMessage = (error: unknown) => error instanceof Error ? error.message : "Unexpected server error";
export async function POST(request: NextRequest) {
  const auth = await verifyAdminAuth(request); if (!auth.authorized) return NextResponse.json({ error: auth.error || "Unauthorized." }, { status: 401 });
  try {
    const body = await request.formData(); const file = body.get("file"); const devotionId = String(body.get("devotionId") || "");
    if (!(file instanceof File) || !devotionId || !extensions[file.type] || file.size > 5 * 1024 * 1024) return NextResponse.json({ error: "Upload a JPEG, PNG or WebP image smaller than 5 MB." }, { status: 400 });
    const db = getAdminServiceClient(); const { data: existing, error: loadError } = await db.from("devotions").select("cover_image_path").eq("id", devotionId).maybeSingle(); if (loadError) throw loadError; if (!existing) return NextResponse.json({ error: "Devotion not found." }, { status: 404 });
    const storagePath = `devotions/${devotionId}/${crypto.randomUUID()}.${extensions[file.type]}`; await uploadToBunny(storagePath, Buffer.from(await file.arrayBuffer()), file.type);
    const { error: updateError } = await db.from("devotions").update({ cover_image_path: storagePath }).eq("id", devotionId); if (updateError) { await deleteFromBunny(storagePath); throw updateError; }
    const oldPath = existing.cover_image_path as string | null; if (oldPath?.startsWith(`devotions/${devotionId}/`) && oldPath !== storagePath) { try { await deleteFromBunny(oldPath); } catch (cleanupError) { console.error("Devotion cover cleanup failed", { devotionId, error: errorMessage(cleanupError) }); } }
    return NextResponse.json({ storagePath, publicUrl: bunnyPublicUrl(storagePath) });
  } catch (error) { console.error("Devotion cover upload failed", { error: errorMessage(error) }); return NextResponse.json({ error: errorMessage(error) }, { status: 500 }); }
}

export async function DELETE(request: NextRequest) {
  const auth = await verifyAdminAuth(request); if (!auth.authorized) return NextResponse.json({ error: auth.error || "Unauthorized." }, { status: 401 });
  try {
    const { devotionId } = await request.json() as { devotionId?: string }; if (!devotionId) return NextResponse.json({ error: "Missing devotion id." }, { status: 400 });
    const db = getAdminServiceClient(); const { data: existing, error: loadError } = await db.from("devotions").select("cover_image_path").eq("id", devotionId).maybeSingle(); if (loadError) throw loadError; if (!existing) return NextResponse.json({ error: "Devotion not found." }, { status: 404 });
    const oldPath = existing.cover_image_path as string | null; if (!oldPath?.startsWith(`devotions/${devotionId}/`)) return NextResponse.json({ error: "Only devotion-owned uploads can be removed. Shared Studio media remains protected." }, { status: 400 });
    const { error: updateError } = await db.from("devotions").update({ cover_image_path: null }).eq("id", devotionId); if (updateError) throw updateError;
    try { await deleteFromBunny(oldPath); } catch (cleanupError) { console.error("Devotion cover deletion left an unreferenced object", { devotionId, error: errorMessage(cleanupError) }); return NextResponse.json({ success: true, warning: "The cover was unassigned, but CDN cleanup requires attention." }); }
    return NextResponse.json({ success: true });
  } catch (error) { console.error("Devotion cover removal failed", { error: errorMessage(error) }); return NextResponse.json({ error: errorMessage(error) }, { status: 500 }); }
}
