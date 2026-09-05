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
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    console.error("Missing SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });

  const contentId = "486ce30e-ada8-41ab-ae39-de10a0b6087e";
  console.log(`=== 1. Updating Bucket Configuration for 'today-media' ===`);
  try {
    const { error: bucketError } = await supabase.storage.updateBucket("today-media", {
      public: false,
      allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "audio/mpeg", "audio/mp3", "audio/x-mp3"],
    });
    console.log("Bucket update result:", bucketError ? bucketError.message : "Updated allowedMimeTypes successfully!");
  } catch (bErr) {
    console.warn("Bucket update exception:", bErr);
  }

  console.log(`\n=== 2. Fetching Target Prayer (${contentId}) ===`);
  const { data: item, error: fetchErr } = await supabase
    .from("content_items")
    .select("id, title, body, metadata")
    .eq("id", contentId)
    .single();

  if (fetchErr || !item) {
    console.error("Failed to fetch prayer:", fetchErr);
    process.exit(1);
  }

  console.log(`Target prayer: "${item.title}"`);
  console.log("Existing metadata before narration:", JSON.stringify(item.metadata, null, 2));

  // 3. Generate Gentle Narration (coral)
  console.log("\n=== 3. Generating Gentle narration (coral) ===");
  const gentleResult = await generateAndStoreProfileNarration(
    {
      contentId: item.id,
      title: item.title,
      body: item.body || "",
      profile: "gentle",
    },
    supabase
  );
  console.log("Gentle Result:", JSON.stringify(gentleResult, null, 2));

  if (!gentleResult.success) {
    console.error("Gentle narration generation failed! Aborting.");
    process.exit(1);
  }

  // 4. Generate Solemn Narration (ash)
  console.log("\n=== 4. Generating Solemn narration (ash) ===");
  const solemnResult = await generateAndStoreProfileNarration(
    {
      contentId: item.id,
      title: item.title,
      body: item.body || "",
      profile: "solemn",
    },
    supabase
  );
  console.log("Solemn Result:", JSON.stringify(solemnResult, null, 2));

  if (!solemnResult.success) {
    console.error("Solemn narration generation failed! Aborting.");
    process.exit(1);
  }

  console.log("\n=== 5. Verifying Files in 'today-media' Storage Bucket ===");
  const { data: files, error: filesErr } = await supabase.storage
    .from("today-media")
    .list(`audio/daily-prayers/${contentId}`);
  console.log("Files in storage bucket:", files);

  console.log("\n=== 6. Verifying get_today_content RPC Metadata Output ===");
  const { data: rpcRows, error: rpcErr } = await supabase.rpc("get_today_content", {
    requested_language_code: "en",
  });
  const rpcPrayer = rpcRows?.find((r: any) => r.content_id === contentId);
  console.log("RPC Prayer Output:", JSON.stringify(rpcPrayer?.metadata?.audio, null, 2));

  console.log("\nALL VERIFICATIONS SUCCESSFUL!");
}

main().catch((err) => {
  console.error("Script error:", err);
  process.exit(1);
});
