import { NextResponse } from "next/server";
import { getAdminServiceClient } from "@/lib/adminClient";
import { verifyAdminAuth } from "@/lib/authServer";

const normalizeSlug = (value: unknown) => String(value || "")
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "");

export async function GET(request: Request) {
  const auth = await verifyAdminAuth(request);
  if (!auth.authorized) return NextResponse.json({ error: auth.error || "Unauthorized." }, { status: 401 });

  const { data, error } = await getAdminServiceClient()
    .from("bible_story_tags")
    .select("id, slug, display_name, sort_order, is_active")
    .order("sort_order", { ascending: true })
    .order("display_name", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tags: data || [] });
}

export async function POST(request: Request) {
  const auth = await verifyAdminAuth(request);
  if (!auth.authorized) return NextResponse.json({ error: auth.error || "Unauthorized." }, { status: 401 });

  const body = await request.json();
  const slug = normalizeSlug(body.slug || body.display_name);
  const displayName = String(body.display_name || "").trim();
  if (!slug || !displayName) return NextResponse.json({ error: "Name and valid slug are required." }, { status: 400 });

  const { data, error } = await getAdminServiceClient()
    .from("bible_story_tags")
    .insert({ slug, display_name: displayName, sort_order: Number(body.sort_order) || 0, is_active: body.is_active !== false })
    .select("id, slug, display_name, sort_order, is_active")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ tag: data });
}

export async function PUT(request: Request) {
  const auth = await verifyAdminAuth(request);
  if (!auth.authorized) return NextResponse.json({ error: auth.error || "Unauthorized." }, { status: 401 });

  const body = await request.json();
  const id = String(body.id || "");
  const slug = normalizeSlug(body.slug);
  const displayName = String(body.display_name || "").trim();
  if (!id || !slug || !displayName) return NextResponse.json({ error: "Tag ID, name, and valid slug are required." }, { status: 400 });

  const supabase = getAdminServiceClient();
  const { data: oldTag } = await supabase.from("bible_story_tags").select("slug").eq("id", id).maybeSingle();
  const { data, error } = await supabase
    .from("bible_story_tags")
    .update({ slug, display_name: displayName, sort_order: Number(body.sort_order) || 0, is_active: Boolean(body.is_active), updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id, slug, display_name, sort_order, is_active")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (oldTag?.slug && oldTag.slug !== slug) {
    const { data: stories } = await supabase.from("bible_stories").select("id, tags").contains("tags", [oldTag.slug]);
    for (const story of stories || []) {
      const tags = Array.from(new Set((story.tags || []).map((tag: string) => tag === oldTag.slug ? slug : tag)));
      await supabase.from("bible_stories").update({ tags }).eq("id", story.id);
    }
  }

  return NextResponse.json({ tag: data });
}
