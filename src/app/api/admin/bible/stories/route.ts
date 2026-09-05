import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminAuth } from "@/lib/authServer";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

export async function GET(request: NextRequest) {
  const auth = await verifyAdminAuth(request);
  if (!auth.authorized) return NextResponse.json({ error: auth.error || "Unauthorized." }, { status: 401 });

  try {
    const { data, error } = await supabase
      .from("bible_stories")
      .select("id, category_id, slug, title, subtitle, summary, cover_media_path, status, access_level, sort_order, created_at, updated_at")
      .order("sort_order", { ascending: true });

    if (error) throw error;
    return NextResponse.json({ stories: data || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load stories.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await verifyAdminAuth(request);
  if (!auth.authorized) return NextResponse.json({ error: auth.error || "Unauthorized." }, { status: 401 });

  try {
    const body = await request.json();
    const { title, slug, summary, subtitle, cover_media_path, access_level, status } = body;

    if (!title || !slug || !summary) {
      return NextResponse.json({ error: "Title, slug, and summary are required." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("bible_stories")
      .insert({
        title: title.trim(),
        slug: slug.trim().toLowerCase(),
        summary: summary.trim(),
        subtitle: subtitle?.trim() || null,
        cover_media_path: cover_media_path || null,
        access_level: access_level || "free",
        status: status || "draft"
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ story: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create story.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
