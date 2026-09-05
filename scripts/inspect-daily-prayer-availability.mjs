import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
  const [key, ...values] = trimmed.split("=");
  process.env[key.trim()] = values.join("=").trim();
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const id = "cc43b6e1-988a-4fd6-92fb-2aaf5c1c37ce";
const [{ data: item, error: itemError }, { data: placements, error: placementsError }, { data: today, error: todayError }] = await Promise.all([
  supabase.from("content_items").select("id,title,content_status,metadata").eq("id", id).maybeSingle(),
  supabase.from("today_placements").select("id,starts_at,ends_at,section").eq("content_id", id),
  supabase.rpc("get_today_content", { requested_language_code: "en" }),
]);
if (itemError || placementsError || todayError) throw itemError || placementsError || todayError;
console.log(JSON.stringify({ item, placements, appearsInToday: (today || []).some((row) => row.content_id === id) }, null, 2));
