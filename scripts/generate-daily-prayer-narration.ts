import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { generateAndStoreProfileNarration } from "../src/lib/ai/narrationGenerator";

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, "utf-8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
        const [key, ...vals] = trimmed.split("=");
        process.env[key.trim()] = vals.join("=").trim();
      }
    }
  }
}

async function main() {
  loadEnvLocal();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !anonKey) {
    console.error("Missing Supabase credentials in .env.local");
    process.exit(1);
  }

  const supabase = createClient(url, anonKey);

  console.log("Fetching published content via get_today_content RPC...");
  const { data: rows, error } = await supabase.rpc("get_today_content", {
    requested_language_code: "en",
  });

  if (error || !rows || rows.length === 0) {
    console.error("No content found or RPC error:", error);
    process.exit(1);
  }

  const dailyPrayers = rows.filter((r: any) => r.type === "daily_prayer");
  console.log(`Found ${dailyPrayers.length} published Daily Prayer(s).`);

  for (const prayer of dailyPrayers) {
    console.log(`\nProcessing prayer: "${prayer.title}" (${prayer.content_id})`);

    // 1. Generate Gentle Profile
    console.log("Generating Gentle narration (coral)...");
    const gentleResult = await generateAndStoreProfileNarration({
      contentId: prayer.content_id,
      title: prayer.title,
      body: prayer.body || prayer.excerpt || "",
      profile: "gentle",
    }, supabase);
    console.log("Gentle result:", gentleResult);

    // 2. Generate Solemn Profile
    console.log("Generating Solemn narration (ash)...");
    const solemnResult = await generateAndStoreProfileNarration({
      contentId: prayer.content_id,
      title: prayer.title,
      body: prayer.body || prayer.excerpt || "",
      profile: "solemn",
    }, supabase);
    console.log("Solemn result:", solemnResult);
  }

  console.log("\nDaily prayer narration generation script complete!");
}

main().catch(err => {
  console.error("Script failed:", err);
  process.exit(1);
});
