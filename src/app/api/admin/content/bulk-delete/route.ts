import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminAuth } from "@/lib/authServer";
import { deleteFromBunny, isBunnyPublicUrl } from "@/lib/bunnyStorage";

type ContentSnapshot = { id: string; type: string; metadata: unknown };

function dailyPrayerNarrationPaths(items: ContentSnapshot[]) {
  const paths = new Set<string>();
  for (const item of items) {
    if (item.type !== "daily_prayer" || !item.metadata || typeof item.metadata !== "object") continue;
    const audio = (item.metadata as Record<string, unknown>).audio;
    if (!audio || typeof audio !== "object") continue;
    const profiles = (audio as Record<string, unknown>).profiles;
    if (!profiles || typeof profiles !== "object") continue;
    const expectedPrefix = `audio/daily-prayers/${item.id}/`;
    for (const profile of Object.values(profiles as Record<string, unknown>)) {
      if (!profile || typeof profile !== "object") continue;
      const storagePath = (profile as Record<string, unknown>).storage_path;
      if (typeof storagePath === "string" && storagePath.startsWith(expectedPrefix)) paths.add(storagePath);
    }
  }
  return [...paths];
}

export async function POST(request: Request) {
  try {
    // 1. Verify Active Admin Session
    const auth = await verifyAdminAuth(request);
    if (!auth.authorized || !auth.userId) {
      return NextResponse.json(
        { success: false, error: auth.error || "Unauthorized. Active admin session required." },
        { status: 401 }
      );
    }

    // 2. Parse payload
    const body = await request.json();
    const { ids } = body as { ids?: string[] };

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { success: false, error: "No content IDs provided for deletion." },
        { status: 400 }
      );
    }

    if (ids.length > 100) {
      return NextResponse.json(
        { success: false, error: "Bulk action batch size cannot exceed 100 items per request." },
        { status: 400 }
      );
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

    const supabase = serviceKey
      ? createClient(url, serviceKey, { auth: { persistSession: false } })
      : createClient(url, anonKey, {
          auth: { persistSession: false },
          global: { headers: auth.token ? { Authorization: `Bearer ${auth.token}` } : {} },
        });

    // 3. Snapshot only content-owned media before the database cascade removes its rows.
    // Daily Prayer pool visuals are stored separately and are never included here.
    const { data: targetItems, error: targetItemsError } = await supabase
      .from("content_items")
      .select("id,type,metadata")
      .in("id", ids);
    if (targetItemsError) throw targetItemsError;

    const narrationPaths = dailyPrayerNarrationPaths((targetItems || []) as ContentSnapshot[]);
    const { data: registeredAudio, error: registeredAudioError } = await supabase
      .from("daily_prayer_audio_assets")
      .select("content_id,storage_path,provider")
      .in("content_id", ids)
      .is("deleted_at", null);
    if (registeredAudioError) throw registeredAudioError;
    const { data: targetMedia, error: targetMediaError } = await supabase
      .from("content_media")
      .select("storage_path, public_url, content_id")
      .in("content_id", ids);
    if (targetMediaError) throw targetMediaError;

    const targetStoragePaths = (targetMedia || [])
      .map((m) => m.storage_path)
      .filter(Boolean);
    const bunnyPaths = (targetMedia || []).filter((m) => isBunnyPublicUrl(m.public_url)).map((m) => m.storage_path).filter(Boolean);

    // Shared Media Protection: Query content_media for items NOT in the deletion list
    let unreferencedStoragePaths: string[] = [];

    if (targetStoragePaths.length > 0) {
      const { data: otherMedia } = await supabase
        .from("content_media")
        .select("storage_path")
        .not("content_id", "in", `(${ids.join(",")})`)
        .in("storage_path", targetStoragePaths);

      const sharedPaths = new Set((otherMedia || []).map((m) => m.storage_path));
      unreferencedStoragePaths = targetStoragePaths.filter((path) => !sharedPaths.has(path));
    }

    // 4. Delete content_items (PostgreSQL CASCADE deletes placements, media, categories, tags)
    const { data: deletedRows, error: deleteError } = await supabase
      .from("content_items")
      .delete()
      .in("id", ids)
      .select("id");

    if (deleteError) {
      console.error("Bulk delete error:", deleteError);
      return NextResponse.json(
        { success: false, error: `Database deletion failed: ${deleteError.message}` },
        { status: 500 }
      );
    }

    const deletedCount = deletedRows?.length ?? 0;

    // 5. Cleanup content-owned media. Daily Prayer narration may have a Bunny
    // file and a legacy Supabase backup; pool visuals are never in either list.
    let storageCleanedCount = 0;
    const storageErrors: string[] = [];

    const bunnySet = new Set(bunnyPaths);
    const registeredPaths = new Set((registeredAudio || []).map((asset) => asset.storage_path));
    const registeredBunnyAudio = (registeredAudio || []).filter((asset) => asset.provider === "bunny").map((asset) => asset.storage_path);
    const registeredSupabaseAudio = (registeredAudio || []).filter((asset) => asset.provider === "supabase").map((asset) => asset.storage_path);
    // The metadata fallback covers a Daily Prayer created before its registry
    // row was available; all newly generated audio is registered above.
    const unregisteredNarrationPaths = narrationPaths.filter((path) => !registeredPaths.has(path));
    const bunnyToDelete = [...new Set([
      ...unreferencedStoragePaths.filter((path) => bunnySet.has(path)),
      ...registeredBunnyAudio,
      ...unregisteredNarrationPaths,
    ])];
    const supabaseToDelete = [...new Set([
      ...unreferencedStoragePaths.filter((path) => !bunnySet.has(path)),
      ...registeredSupabaseAudio,
    ])];

    for (const path of bunnyToDelete) {
      try {
        await deleteFromBunny(path);
        storageCleanedCount += 1;
      } catch (error) {
        storageErrors.push(`Bunny cleanup failed for ${path}: ${error instanceof Error ? error.message : "unknown error"}`);
      }
    }

    if (supabaseToDelete.length > 0) {
      const { data: removeData, error: storageErr } = await supabase.storage.from("today-media").remove(supabaseToDelete);
      if (storageErr) {
        console.error("Storage cleanup error:", storageErr);
        storageErrors.push(`Supabase storage cleanup failed: ${storageErr.message}`);
      } else {
        storageCleanedCount += removeData?.length ?? supabaseToDelete.length;
      }
    }

    return NextResponse.json({
      success: true,
      count: deletedCount,
      storageCleanedCount,
      storageErrors,
      message: `${deletedCount} item(s) permanently deleted.`,
    });
  } catch (err) {
    console.error("Bulk delete exception:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Server error." },
      { status: 500 }
    );
  }
}
