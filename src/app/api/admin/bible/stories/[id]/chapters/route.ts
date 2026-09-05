import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminAuth } from "@/lib/authServer";
import { deleteFromBunny } from "@/lib/bunnyStorage";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await verifyAdminAuth(request);
  if (!auth.authorized) return NextResponse.json({ error: auth.error || "Unauthorized." }, { status: 401 });

  const { id: story_id } = await context.params;

  try {
    const body = await request.json();
    const { title, slug, chapter_number, summary, content_blocks, access_level } = body;

    if (!title || !slug || !chapter_number) {
      return NextResponse.json({ error: "Title, slug, and chapter number are required." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("bible_chapters")
      .insert({
        story_id,
        chapter_number: Number(chapter_number),
        title: title.trim(),
        slug: slug.trim().toLowerCase(),
        summary: summary?.trim() || null,
        access_level: access_level || "free",
        content_blocks: content_blocks || []
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ chapter: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create chapter.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await verifyAdminAuth(request);
  if (!auth.authorized) return NextResponse.json({ error: auth.error || "Unauthorized." }, { status: 401 });

  try {
    const body = await request.json();
    const { chapter_id, title, slug, chapter_number, summary, content_blocks, access_level } = body;

    if (!chapter_id) {
      return NextResponse.json({ error: "Chapter ID is required for update." }, { status: 400 });
    }

    // Clean up replaced or removed media blocks on Bunny CDN
    const { data: oldChapter } = await supabase.from("bible_chapters").select("content_blocks").eq("id", chapter_id).maybeSingle();
    if (oldChapter?.content_blocks && Array.isArray(oldChapter.content_blocks)) {
      const newMediaPaths = new Set(
        (Array.isArray(content_blocks) ? content_blocks : [])
          .map((b: { media_path?: string }) => b.media_path)
          .filter(Boolean)
      );

      for (const oldBlock of oldChapter.content_blocks as Array<{ media_path?: string }>) {
        if (oldBlock.media_path && !newMediaPaths.has(oldBlock.media_path)) {
          try {
            await deleteFromBunny(oldBlock.media_path);
          } catch (err) {
            console.warn(`Failed to delete removed block media at ${oldBlock.media_path}:`, err);
          }
        }
      }
    }

    const { data, error } = await supabase
      .from("bible_chapters")
      .update({
        chapter_number: Number(chapter_number),
        title: title?.trim(),
        slug: slug?.trim()?.toLowerCase(),
        summary: summary?.trim() || null,
        access_level: access_level || "free",
        content_blocks: content_blocks || [],
        updated_at: new Date().toISOString()
      })
      .eq("id", chapter_id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ chapter: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update chapter.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
