import { NextRequest, NextResponse } from "next/server";
import { getAdminServiceClient } from "@/lib/adminClient";
import { verifyAdminAuth } from "@/lib/authServer";

const bunnyStorageZone = process.env.BUNNY_STORAGE_ZONE || "";
const bunnyStoragePassword = process.env.BUNNY_STORAGE_PASSWORD || "";
const bunnyStorageEndpoint = (process.env.BUNNY_STORAGE_ENDPOINT || "https://storage.bunnycdn.com").replace(/\/$/, "");
const bunnyVideoCdnUrl = (process.env.BUNNY_VIDEO_CDN_URL || "").replace(/\/$/, "");

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 20;

function parsePageParam(value: string | null, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected server error";
}

function requireBunnyConfig() {
  if (!bunnyStorageZone || !bunnyStoragePassword || !bunnyStorageEndpoint || !bunnyVideoCdnUrl) {
    throw new Error("Bunny video storage is not configured.");
  }
}

function bunnyObjectUrl(storagePath: string) {
  return `${bunnyStorageEndpoint}/${bunnyStorageZone}/${storagePath.split("/").map(encodeURIComponent).join("/")}`;
}

async function uploadToBunny(storagePath: string, body: Buffer, contentType: string) {
  requireBunnyConfig();
  const response = await fetch(bunnyObjectUrl(storagePath), {
    method: "PUT",
    headers: { AccessKey: bunnyStoragePassword, "Content-Type": contentType },
    body: new Uint8Array(body),
  });
  if (!response.ok) throw new Error(`Bunny upload failed (${response.status}).`);
}

async function deleteFromBunny(storagePath: string) {
  requireBunnyConfig();
  const response = await fetch(bunnyObjectUrl(storagePath), {
    method: "DELETE",
    headers: { AccessKey: bunnyStoragePassword },
  });
  if (!response.ok && response.status !== 404) throw new Error(`Bunny deletion failed (${response.status}).`);
}

export async function GET(req: NextRequest) {
  try {
    const supabase = getAdminServiceClient();
    const { searchParams } = new URL(req.url);
    const limit = Math.min(parsePageParam(searchParams.get("limit"), DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
    const offset = parsePageParam(searchParams.get("offset"), 0);
    const { data: videoLoops, error } = await supabase
      .from("altar_video_loops")
      .select("*")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit);

    if (error) throw error;
    const items = videoLoops ?? [];
    return NextResponse.json({
      videoLoops: items.slice(0, limit),
      hasMore: items.length > limit,
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getAdminServiceClient();
    const auth = await verifyAdminAuth(req);
    if (!auth.authorized) return NextResponse.json({ error: auth.error || "Unauthorized." }, { status: 401 });
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const title = formData.get("title") as string;

    if (!file) {
      return NextResponse.json({ error: "No video file provided" }, { status: 400 });
    }

    if (!file.type.startsWith("video/")) {
      return NextResponse.json({ error: "Please upload a video file." }, { status: 400 });
    }

    // Bunny Storage object path and public Bunny CDN URL.
    const fileExt = file.name.split(".").pop();
    const fileName = `loop_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${fileExt}`;
    const storagePath = `loops/${fileName}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    await uploadToBunny(storagePath, buffer, file.type || "video/mp4");
    const publicUrl = `${bunnyVideoCdnUrl}/${storagePath}`;

    // Insert record into altar_video_loops table
    const { data: newRecord, error: dbError } = await supabase
      .from("altar_video_loops")
      .insert({
        title: title || file.name.replace(/\.[^/.]+$/, ""),
        description: "",
        storage_path: storagePath,
        public_url: publicUrl,
        is_active: true
      })
      .select()
      .single();

    if (dbError) {
      await deleteFromBunny(storagePath);
      throw dbError;
    }

    return NextResponse.json({ videoLoop: newRecord });
  } catch (err: unknown) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = getAdminServiceClient();
    const auth = await verifyAdminAuth(req);
    if (!auth.authorized) return NextResponse.json({ error: auth.error || "Unauthorized." }, { status: 401 });
    const body = await req.json();
    const { id, is_active } = body;

    if (!id || typeof is_active !== "boolean") {
      return NextResponse.json({ error: "Missing required fields (id, is_active)" }, { status: 400 });
    }

    const { data: updatedRecord, error } = await supabase
      .from("altar_video_loops")
      .update({ is_active })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ videoLoop: updatedRecord });
  } catch (err: unknown) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = getAdminServiceClient();
    const auth = await verifyAdminAuth(req);
    if (!auth.authorized) return NextResponse.json({ error: auth.error || "Unauthorized." }, { status: 401 });
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Missing id query parameter" }, { status: 400 });
    }

    // Delete the Bunny object only after confirming this row belongs to Bunny.
    const { data: record } = await supabase
      .from("altar_video_loops")
      .select("storage_path,public_url")
      .eq("id", id)
      .single();

    if (record?.storage_path && record.public_url?.startsWith(bunnyVideoCdnUrl)) {
      await deleteFromBunny(record.storage_path);
    }

    const { error: deleteError } = await supabase
      .from("altar_video_loops")
      .delete()
      .eq("id", id);

    if (deleteError) throw deleteError;

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
