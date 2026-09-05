import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminAuth } from "@/lib/authServer";

export async function POST(request: Request) {
  try {
    // 1. Verify Active Admin Session
    const auth = await verifyAdminAuth(request);
    if (!auth.authorized || !auth.userId) {
      return NextResponse.json(
        { success: false, error: auth.error || "Unauthorized. Active admin session required." },
        { status: 401 }
      );
    }

    // 2. Parse payload
    const body = await request.json();
    const { ids } = body as { ids?: string[] };

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { success: false, error: "No feedback IDs provided for deletion." },
        { status: 400 }
      );
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

    const supabase = serviceKey
      ? createClient(url, serviceKey, { auth: { persistSession: false } })
      : createClient(url, anonKey, {
          auth: { persistSession: false },
          global: { headers: auth.token ? { Authorization: `Bearer ${auth.token}` } : {} },
        });

    // 3. Delete from alpha_feedback
    const { data: deletedRows, error: deleteError } = await supabase
      .from("alpha_feedback")
      .delete()
      .in("id", ids)
      .select("id");

    if (deleteError) {
      console.error("Bulk delete feedback error:", deleteError);
      return NextResponse.json(
        { success: false, error: `Database deletion failed: ${deleteError.message}` },
        { status: 500 }
      );
    }

    const deletedCount = deletedRows?.length ?? 0;

    return NextResponse.json({
      success: true,
      count: deletedCount,
      message: `${deletedCount} feedback entr(ies) permanently deleted.`,
    });
  } catch (err) {
    console.error("Bulk delete feedback exception:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Server error." },
      { status: 500 }
    );
  }
}
