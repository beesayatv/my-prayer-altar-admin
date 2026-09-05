import { NextRequest, NextResponse } from "next/server";
import { getAdminServiceClient } from "@/lib/adminClient";
import { verifyAdminAuth } from "@/lib/authServer";

async function deleteBunnyFile(storagePath: string) {
  if (!storagePath) return;
  const storageZone = process.env.BUNNY_STORAGE_ZONE || "my-prayer-altar-videos-sg";
  const storagePassword = process.env.BUNNY_STORAGE_PASSWORD || "356c9606-0fa1-4e1d-9b13c5c2f5da-8353-44ad";
  const endpoint = process.env.BUNNY_STORAGE_ENDPOINT || "https://sg.storage.bunnycdn.com";

  const cleanPath = storagePath.replace(/^\//, "");
  const deleteUrl = `${endpoint}/${storageZone}/${cleanPath}`;

  try {
    await fetch(deleteUrl, {
      method: "DELETE",
      headers: { AccessKey: storagePassword }
    });
  } catch (err) {
    console.error("Failed to delete Bunny file:", storagePath, err);
  }
}

export async function POST(request: NextRequest) {
  const auth = await verifyAdminAuth(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error || "Unauthorized." }, { status: 401 });
  }

  const supabase = getAdminServiceClient();
  try {
    const body = await request.json();
    const { ids } = body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "No story IDs provided." }, { status: 400 });
    }

    // 1. Fetch stories cover paths
    const { data: stories } = await supabase
      .from("bible_stories")
      .select("id, cover_media_path")
      .in("id", ids);

    // 2. Fetch chapters content_blocks media paths
    const { data: chapters } = await supabase
      .from("bible_chapters")
      .select("id, content_blocks")
      .in("story_id", ids);

    // 3. Clean up CDN files
    if (stories) {
      for (const s of stories) {
        if (s.cover_media_path) await deleteBunnyFile(s.cover_media_path);
      }
    }

    if (chapters) {
      for (const ch of chapters) {
        if (Array.isArray(ch.content_blocks)) {
          for (const blk of ch.content_blocks) {
            if (blk.type === "image" && blk.media_path) {
              await deleteBunnyFile(blk.media_path);
            }
          }
        }
      }
    }

    // 4. Delete stories from Supabase (cascades to chapters)
    const { error: delErr } = await supabase
      .from("bible_stories")
      .delete()
      .in("id", ids);

    if (delErr) throw delErr;

    return NextResponse.json({ success: true, count: ids.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bulk delete failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
