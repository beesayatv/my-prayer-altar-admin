import { NextRequest, NextResponse } from "next/server";
import { getAdminServiceClient } from "@/lib/adminClient";
import { verifyAdminAuth } from "@/lib/authServer";

export async function POST(request: NextRequest) {
  const auth = await verifyAdminAuth(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error || "Unauthorized." }, { status: 401 });
  }

  const supabase = getAdminServiceClient();

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
