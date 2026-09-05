import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminAuth } from "@/lib/authServer";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export async function POST(request: NextRequest) {
  const auth = await verifyAdminAuth(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error || "Unauthorized." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { ids } = body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "No story IDs provided." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("bible_stories")
      .update({ status: "archived", updated_at: new Date().toISOString() })
      .in("id", ids)
      .select("id");

    if (error) throw error;

    return NextResponse.json({ success: true, count: data?.length || 0 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bulk archive failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
