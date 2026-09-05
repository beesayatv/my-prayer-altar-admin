import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminAuth } from "@/lib/authServer";
import { deleteFromBunny } from "@/lib/bunnyStorage";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await verifyAdminAuth(request);
  if (!auth.authorized) return NextResponse.json({ error: auth.error || "Unauthorized." }, { status: 401 });

  const { id } = await context.params;

  try {
    const { data: story, error: storyError } = await supabase
      .from("bible_stories")
      .select("*")
      .eq("id", id)
      .single();

    if (storyError) throw storyError;

    const { data: chapters, error: chaptersError } = await supabase
      .from("bible_chapters")
      .select("*")
      .eq("story_id", id)
      .order("chapter_number", { ascending: true });

    if (chaptersError) throw chaptersError;

    return NextResponse.json({ story, chapters: chapters || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load story detail.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await verifyAdminAuth(request);
  if (!auth.authorized) return NextResponse.json({ error: auth.error || "Unauthorized." }, { status: 401 });

  const { id } = await context.params;

  try {
    const body = await request.json();
    const { title, slug, summary, subtitle, cover_media_path, access_level, status, tags } = body;

    // Fetch existing story to clean up replaced cover image on Bunny CDN
    const { data: oldStory } = await supabase.from("bible_stories").select("cover_media_path").eq("id", id).maybeSingle();
    const oldCoverPath = oldStory?.cover_media_path;
    const newCoverPath = cover_media_path || null;

    if (oldCoverPath && oldCoverPath !== newCoverPath) {
      try {
        await deleteFromBunny(oldCoverPath);
      } catch (err) {
        console.warn(`Failed to delete replaced Bunny cover media at ${oldCoverPath}:`, err);
      }
    }

    const { data, error } = await supabase
      .from("bible_stories")
      .update({
        title: title?.trim(),
        slug: slug?.trim()?.toLowerCase(),
        summary: summary?.trim(),
        subtitle: subtitle?.trim() || null,
        cover_media_path: newCoverPath,
        access_level: access_level || "free",
        status: status || "draft",
        tags: Array.isArray(tags) ? tags : [],
        updated_at: new Date().toISOString()
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ story: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update story.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await verifyAdminAuth(request);
  if (!auth.authorized) return NextResponse.json({ error: auth.error || "Unauthorized." }, { status: 401 });

  const { id } = await context.params;

  try {
    // 1. Fetch story cover & chapter block media paths before deletion
    const { data: story } = await supabase.from("bible_stories").select("cover_media_path").eq("id", id).maybeSingle();
    const { data: chapters } = await supabase.from("bible_chapters").select("content_blocks").eq("story_id", id);

    const pathsToDelete = new Set<string>();
    if (story?.cover_media_path) pathsToDelete.add(story.cover_media_path);

    if (chapters) {
      for (const ch of chapters) {
        const blocks = ch.content_blocks as Array<{ type: string; media_path?: string }>;
        if (Array.isArray(blocks)) {
          for (const blk of blocks) {
            if (blk.media_path) pathsToDelete.add(blk.media_path);
          }
        }
      }
    }

    // 2. Clean up media files on Bunny CDN
    for (const path of pathsToDelete) {
      try {
        await deleteFromBunny(path);
      } catch (err) {
        console.warn(`Failed to delete Bunny media at ${path}:`, err);
      }
    }

    // 3. Delete story record (cascades to chapters)
    const { error } = await supabase.from("bible_stories").delete().eq("id", id);
    if (error) throw error;

    return NextResponse.json({ success: true, deletedMediaCount: pathsToDelete.size });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete story.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
