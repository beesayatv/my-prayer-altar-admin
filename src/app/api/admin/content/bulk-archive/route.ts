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
        { success: false, error: "No content IDs provided for archiving." },
        { status: 400 }
      );
    }

    // Batch limit check
    if (ids.length > 100) {
      return NextResponse.json(
        { success: false, error: "Bulk action batch size cannot exceed 100 items per request." },
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

    // 3. Update content_status = 'archived'
    const { data, error } = await supabase
      .from("content_items")
      .update({ content_status: "archived" })
      .in("id", ids)
      .select("id");

    if (error) {
      console.error("Bulk archive error:", error);
      return NextResponse.json(
        { success: false, error: `Database update failed: ${error.message}` },
        { status: 500 }
      );
    }

    const archivedCount = data?.length ?? 0;

    return NextResponse.json({
      success: true,
      count: archivedCount,
      message: `${archivedCount} item(s) archived successfully.`,
    });
  } catch (err) {
    console.error("Bulk archive exception:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Server error." },
      { status: 500 }
    );
  }
}
