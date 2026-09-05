import { NextRequest, NextResponse } from "next/server";
import { getAdminServiceClient } from "@/lib/adminClient";
import { bunnyPublicUrl, deleteFromBunny, uploadToBunny } from "@/lib/bunnyStorage";

const BUCKET = "today-media";

export async function GET() {
  try {
    const supabase = getAdminServiceClient();
    const { data, error } = await supabase
      .from("ambient_music_tracks")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ tracks: data || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getAdminServiceClient();
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const title = (formData.get("title") as string) || "Ambient Track";
    const description = (formData.get("description") as string) || "";

    if (!file) {
      return NextResponse.json({ error: "No audio file provided" }, { status: 400 });
    }

    const rawExt = file.name.split(".").pop()?.toLowerCase() || "mp3";
    const fileName = `ambient_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${rawExt}`;
    const storagePath = `audio/ambient/${fileName}`;

    let contentType = file.type || "audio/mpeg";
    if (rawExt === "m4a" || contentType === "audio/x-m4a") {
      contentType = "audio/mp4";
    }

    await uploadToBunny(storagePath, Buffer.from(await file.arrayBuffer()), contentType);
    const publicUrl = bunnyPublicUrl(storagePath);

    const { data: track, error: dbError } = await supabase
      .from("ambient_music_tracks")
      .insert({
        title,
        description,
        storage_path: storagePath,
        public_url: publicUrl,
        is_active: true
      })
      .select()
      .single();

    if (dbError) {
      await deleteFromBunny(storagePath);
      return NextResponse.json({ error: `Database error: ${dbError.message}` }, { status: 500 });
    }

    return NextResponse.json({ track });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = getAdminServiceClient();
    const body = await req.json();
    const { id, is_active } = body;

    if (!id) {
      return NextResponse.json({ error: "Missing track ID" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("ambient_music_tracks")
      .update({ is_active })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ track: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = getAdminServiceClient();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Missing track ID" }, { status: 400 });
    }

    const { data: track } = await supabase
      .from("ambient_music_tracks")
      .select("storage_path,public_url")
      .eq("id", id)
      .single();

    if (track?.storage_path) {
      if (track.public_url?.includes("b-cdn.net")) await deleteFromBunny(track.storage_path);
      else await supabase.storage.from(BUCKET).remove([track.storage_path]);
    }

    const { error } = await supabase
      .from("ambient_music_tracks")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
