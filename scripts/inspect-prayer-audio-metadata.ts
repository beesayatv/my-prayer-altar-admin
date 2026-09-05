import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

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
    console.error("Missing Supabase credentials");
    process.exit(1);
  }

  const supabase = createClient(url, anonKey);

  console.log("=== 1. RPC get_today_content Output ===");
  const { data: rpcRows, error: rpcError } = await supabase.rpc("get_today_content", {
    requested_language_code: "en",
  });

  if (rpcError) {
    console.error("RPC error:", rpcError);
  } else {
    const target = rpcRows.find((r: any) => r.content_id === "486ce30e-ada8-41ab-ae39-de10a0b6087e");
    console.log("Target prayer RPC row:", JSON.stringify(target, null, 2));
  }

  console.log("\n=== 2. Checking Storage Bucket Files in 'today-media' ===");
  const { data: files, error: filesError } = await supabase.storage
    .from("today-media")
    .list("audio/daily-prayers/486ce30e-ada8-41ab-ae39-de10a0b6087e");

  console.log("Storage files result:", { files, error: filesError });
}

main().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
