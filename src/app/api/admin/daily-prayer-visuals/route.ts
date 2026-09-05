import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminAuth } from "@/lib/authServer";
import { bunnyPublicUrl, deleteFromBunny, uploadToBunny } from "@/lib/bunnyStorage";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ysbzmblentjmvgqsyuop.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 20;

function parsePageParam(value: string | null, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected server error";
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const contentId = searchParams.get("contentId");
    if (contentId) {
      const auth = await verifyAdminAuth(req);
      if (!auth.authorized) return NextResponse.json({ error: auth.error || "Unauthorized." }, { status: 401 });

      const { data: assignment, error: assignmentError } = await supabase
        .from("daily_prayer_visual_assignments")
        .select("asset_id")
        .eq("content_id", contentId)
        .maybeSingle();
      if (assignmentError) throw assignmentError;
      if (!assignment?.asset_id) return NextResponse.json({ assignedVisual: null });

      const { data: assignedVisual, error: assetError } = await supabase
        .from("daily_prayer_visual_assets")
        .select("id,title,storage_path,public_url,alt_text,is_active")
        .eq("id", assignment.asset_id)
        .maybeSingle();
      if (assetError) throw assetError;
      if (!assignedVisual) return NextResponse.json({ assignedVisual: null });

      return NextResponse.json({
        assignedVisual: { ...assignedVisual, preview_url: assignedVisual.public_url },
      });
    }

    const limit = Math.min(parsePageParam(searchParams.get("limit"), DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
    const offset = parsePageParam(searchParams.get("offset"), 0);
    const { data: visualAssets, error } = await supabase
      .from("daily_prayer_visual_assets")
      .select("*")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit);

    if (error) throw error;
    const items = visualAssets ?? [];
    return NextResponse.json({
      visualAssets: items.slice(0, limit),
      hasMore: items.length > limit,
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyAdminAuth(req);
    if (!auth.authorized) return NextResponse.json({ error: auth.error || "Unauthorized." }, { status: 401 });
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const title = formData.get("title") as string;
    const altText = formData.get("alt_text") as string;

    if (!file) {
      return NextResponse.json({ error: "No image file provided" }, { status: 400 });
    }

    if (file.type?.startsWith("video/") || file.name.toLowerCase().endsWith(".mp4")) {
      return NextResponse.json({ error: "Daily Prayer visuals only support image files (JPEG, PNG, WebP). Video loops are reserved for My Altar." }, { status: 400 });
    }

    const fileExt = file.name.split(".").pop();
    const fileName = `daily_visual_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${fileExt}`;
    const storagePath = `daily-prayer-images/${fileName}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    await uploadToBunny(storagePath, buffer, file.type || "image/jpeg");
    const publicUrl = bunnyPublicUrl(storagePath);

    // Insert into daily_prayer_visual_assets
    const { data: newRecord, error: dbError } = await supabase
      .from("daily_prayer_visual_assets")
      .insert({
        title: title || file.name.replace(/\.[^/.]+$/, ""),
        storage_path: storagePath,
        public_url: publicUrl,
        alt_text: altText || title || "Daily prayer visual background",
        is_active: true
      })
      .select()
      .single();

    if (dbError) {
      await deleteFromBunny(storagePath);
      throw dbError;
    }

    return NextResponse.json({ visualAsset: newRecord });
  } catch (err: unknown) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await verifyAdminAuth(req);
    if (!auth.authorized) return NextResponse.json({ error: auth.error || "Unauthorized." }, { status: 401 });
    const body = await req.json();
    const { id, is_active } = body;

    if (!id || typeof is_active !== "boolean") {
      return NextResponse.json({ error: "Missing required fields (id, is_active)" }, { status: 400 });
    }

    const { data: updatedRecord, error } = await supabase
      .from("daily_prayer_visual_assets")
      .update({ is_active })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ visualAsset: updatedRecord });
  } catch (err: unknown) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = await verifyAdminAuth(req);
    if (!auth.authorized) return NextResponse.json({ error: auth.error || "Unauthorized." }, { status: 401 });
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Missing id query parameter" }, { status: 400 });
    }

    const { data: record } = await supabase
      .from("daily_prayer_visual_assets")
      .select("storage_path")
      .eq("id", id)
      .single();

    if (record?.storage_path) {
      if (record.storage_path.startsWith("daily-prayer-images/")) {
        await deleteFromBunny(record.storage_path);
      } else {
        await supabase.storage.from("today-media").remove([record.storage_path]);
      }
    }

    const { error: deleteError } = await supabase
      .from("daily_prayer_visual_assets")
      .delete()
      .eq("id", id);

    if (deleteError) throw deleteError;

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
