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
const { data: item, error } = await supabase.from("content_items").select("metadata").eq("id", id).single();
if (error) throw error;
const url = item.metadata?.audio?.profiles?.solemn?.public_url;
const response = await fetch(url, { method: "HEAD", cache: "no-store" });
console.log(JSON.stringify({ metadataStillPointsTo: url, cdnStatus: response.status, cdnCacheStatus: response.headers.get("cdn-cache"), cacheControl: response.headers.get("cache-control") }, null, 2));
