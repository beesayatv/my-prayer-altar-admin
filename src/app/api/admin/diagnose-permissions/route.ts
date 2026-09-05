import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    return NextResponse.json({ success: false, error: "Missing Supabase URL or key configuration." }, { status: 500 });
  }

  let host = "unknown";
  try { host = new URL(url).hostname; } catch {}

  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return NextResponse.json({ success: false, error: "Missing Bearer Authorization header." }, { status: 401 });
  }

  const token = authHeader.substring(7).trim();
  if (!token) {
    return NextResponse.json({ success: false, error: "Empty token provided." }, { status: 401 });
  }

  try {
    // 1. Authenticated Auth Client
    const authClient = createClient(url, key, { auth: { persistSession: false } });
    const { data: userData, error: userError } = await authClient.auth.getUser(token);

    if (userError || !userData.user) {
      return NextResponse.json({
        success: false,
        host,
        userVerified: false,
        userError: userError?.message || "No user found for token.",
      }, { status: 401 });
    }

    const userId = userData.user.id;
    const userEmail = userData.user.email;

    // 2. Client configured with user's JWT Bearer token to test PostgREST RLS
    const userDbClient = createClient(url, key, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    // Test query on admin_users
    const { data: adminRow, error: adminErr } = await userDbClient
      .from("admin_users")
      .select("user_id, is_active")
      .eq("user_id", userId)
      .maybeSingle();

    // Test query on automation_configs
    const { data: configRow, error: configErr } = await userDbClient
      .from("automation_configs")
      .select("*")
      .eq("content_type", "daily_prayer")
      .maybeSingle();

    const diagnosticReport = {
      success: true,
      host,
      userVerified: true,
      userId,
      userEmail,
      adminCheck: {
        rowFound: Boolean(adminRow),
        isActive: adminRow?.is_active ?? false,
        error: adminErr ? { code: adminErr.code, message: adminErr.message, details: adminErr.details, hint: adminErr.hint } : null,
      },
      automationConfigQuery: {
        rowFound: Boolean(configRow),
        dataPreview: configRow ? {
          content_type: configRow.content_type,
          is_enabled: configRow.is_enabled,
          operating_mode: configRow.operating_mode,
          queue_length_days: configRow.queue_length_days,
          time_zone: configRow.time_zone,
        } : null,
        error: configErr ? { code: configErr.code, message: configErr.message, details: configErr.details, hint: configErr.hint } : null,
      },
    };

    console.log("[DIAGNOSTIC API REPORT]", JSON.stringify(diagnosticReport, null, 2));
    return NextResponse.json(diagnosticReport);
  } catch (err) {
    console.error("[DIAGNOSTIC API EXCEPTION]", err);
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : "Server error." }, { status: 500 });
  }
}
