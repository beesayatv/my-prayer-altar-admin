import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminAuth } from "@/lib/authServer";

const RETENTION_DAYS = 90;

export async function POST(request: Request) {
  const auth = await verifyAdminAuth(request);
  if (!auth.authorized) return NextResponse.json({ success: false, error: auth.error || "Unauthorized." }, { status: 401 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || (!serviceKey && !publishableKey)) return NextResponse.json({ success: false, error: "Server configuration missing." }, { status: 500 });
  const client = serviceKey
    ? createClient(url, serviceKey, { auth: { persistSession: false } })
    : createClient(url, publishableKey!, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${auth.token}` } } });
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await client.from("ai_usage_logs").delete().lt("created_at", cutoff).select("id");
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, deletedCount: data?.length ?? 0, retentionDays: RETENTION_DAYS });
}
