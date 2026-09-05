import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminAuth } from "@/lib/authServer";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

export async function GET(request: NextRequest) {
  const auth = await verifyAdminAuth(request);
  if (!auth.authorized) return NextResponse.json({ error: auth.error || "Unauthorized." }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search");
  const type = searchParams.get("type");

  try {
    let query = supabase
      .from("bible_entities")
      .select("id, entity_type, slug, name, short_title, summary, aliases, cover_media_path, status, access_level")
      .order("name", { ascending: true });

    if (type && type !== "all") {
      query = query.eq("entity_type", type);
    }

    if (search) {
      query = query.or(`name.ilike.%${search}%,summary.ilike.%${search}%`);
    }

    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ entities: data || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load entities.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await verifyAdminAuth(request);
  if (!auth.authorized) return NextResponse.json({ error: auth.error || "Unauthorized." }, { status: 401 });

  try {
    const body = await request.json();
    const { entity_type, name, short_title, slug, summary, aliases, cover_media_path, attributes, status, access_level } = body;

    if (!entity_type || !name || !slug || !summary) {
      return NextResponse.json({ error: "Entity type, name, slug, and summary are required." }, { status: 400 });
    }

    // Check duplicate by name or slug
    const { data: existing } = await supabase
      .from("bible_entities")
      .select("id, name, slug")
      .or(`slug.eq.${slug.trim().toLowerCase()},name.ilike.${name.trim()}`)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: `An entity with slug '${existing.slug}' or name '${existing.name}' already exists.` }, { status: 409 });
    }

    const { data, error } = await supabase
      .from("bible_entities")
      .insert({
        entity_type,
        name: name.trim(),
        short_title: short_title?.trim() || null,
        slug: slug.trim().toLowerCase(),
        summary: summary.trim(),
        aliases: aliases || [],
        cover_media_path: cover_media_path || null,
        attributes: attributes || {},
        status: status || "published",
        access_level: access_level || "free"
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ entity: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create entity.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
