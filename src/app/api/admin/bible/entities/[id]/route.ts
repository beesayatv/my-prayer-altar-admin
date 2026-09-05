import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminAuth } from "@/lib/authServer";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await verifyAdminAuth(request);
  if (!auth.authorized) return NextResponse.json({ error: auth.error || "Unauthorized." }, { status: 401 });

  const { id } = await context.params;

  try {
    const { data: entity, error } = await supabase
      .from("bible_entities")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw error;
    return NextResponse.json({ entity });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load entity.";
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
    const { entity_type, name, short_title, slug, summary, aliases, cover_media_path, attributes, body_blocks, status, access_level } = body;

    const { data, error } = await supabase
      .from("bible_entities")
      .update({
        entity_type,
        name: name?.trim(),
        short_title: short_title?.trim() || null,
        slug: slug?.trim()?.toLowerCase(),
        summary: summary?.trim(),
        aliases: aliases || [],
        cover_media_path: cover_media_path || null,
        attributes: attributes || {},
        body_blocks: body_blocks || [],
        status: status || "published",
        access_level: access_level || "free",
        updated_at: new Date().toISOString()
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ entity: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update entity.";
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
    const { error } = await supabase.from("bible_entities").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete entity.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
