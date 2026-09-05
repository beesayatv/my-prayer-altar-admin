import { NextResponse } from "next/server";
export const dynamic = 'force-dynamic';
import { createClient } from "@supabase/supabase-js";
import { verifyAdminAuth } from "@/lib/authServer";
import { deleteFromBunny } from "@/lib/bunnyStorage";

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

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) {
      return NextResponse.json({ success: false, error: "Server configuration error." }, { status: 500 });
    }

    const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

    // 2. Fetch a batch of orphaned files from pending_audio_deletions (limit 100)
    const { data: orphanedFiles, error: fetchError } = await supabase
      .from("pending_audio_deletions")
      .select("id, storage_path")
      .limit(100);

    if (fetchError) {
      console.error("Failed to fetch pending audio deletions:", fetchError);
      return NextResponse.json({ success: false, error: "Database error fetching orphaned files." }, { status: 500 });
    }

    if (!orphanedFiles || orphanedFiles.length === 0) {
      return NextResponse.json({ success: true, count: 0, message: "No orphaned files to clean up." });
    }

    let deletedCount = 0;
    const failedPaths: string[] = [];
    const successfullyDeletedIds: string[] = [];

    // 3. Delete from Bunny CDN
    for (const file of orphanedFiles) {
      try {
        if (file.storage_path.startsWith("private-audio/") || file.storage_path.startsWith("audio/")) {
           await deleteFromBunny(file.storage_path);
        }
        successfullyDeletedIds.push(file.id);
        deletedCount++;
      } catch (error) {
        console.error(`Bunny cleanup failed for ${file.storage_path}:`, error);
        failedPaths.push(file.storage_path);
      }
    }

    // 4. Remove successfully deleted rows from the tracking table
    if (successfullyDeletedIds.length > 0) {
      const { error: deleteError } = await supabase
        .from("pending_audio_deletions")
        .delete()
        .in("id", successfullyDeletedIds);
        
      if (deleteError) {
        console.error("Failed to remove successfully deleted rows from tracking table:", deleteError);
      }
    }

    return NextResponse.json({
      success: true,
      count: deletedCount,
      failed: failedPaths.length,
      message: `Successfully deleted ${deletedCount} orphaned files.`,
    });
  } catch (err) {
    console.error("Audio cleanup exception:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Server error." },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const auth = await verifyAdminAuth(request);
    if (!auth.authorized || !auth.userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) return NextResponse.json({ success: false, error: "Configuration error" }, { status: 500 });

    const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

    const { data, count, error } = await supabase
      .from("pending_audio_deletions")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw error;

    return NextResponse.json({ success: true, count: count || 0, files: data || [] });
  } catch (err) {
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}
