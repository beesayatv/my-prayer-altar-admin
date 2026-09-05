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
    console.error("Missing Supabase credentials");
    process.exit(1);
  }

  console.log("Signing in with altaradmin2026@gmail.com...");
  const authClient = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data: authData, error: authErr } = await authClient.auth.signInWithPassword({
    email: "altaradmin2026@gmail.com",
    password: "AdminPassword123!",
  });

  if (authErr || !authData.session) {
    console.error("Sign-in failed:", authErr);
    process.exit(1);
  }

  const token = authData.session.access_token;
  console.log("Authenticated successfully. User ID:", authData.user.id);

  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const contentId = "486ce30e-ada8-41ab-ae39-de10a0b6087e";
  console.log(`\nFetching target prayer (${contentId})...`);

  // Fetch title and body from get_today_content RPC or table
  const { data: rows } = await supabase.rpc("get_today_content", { requested_language_code: "en" });
  const prayer = rows?.find((r: any) => r.content_id === contentId);

  if (!prayer) {
    console.error("Prayer not found!");
    process.exit(1);
  }

  console.log(`Target prayer: "${prayer.title}"`);

  // 1. Generate Gentle Narration (coral)
  console.log("\n1. Generating Gentle narration (coral)...");
  const gentleResult = await generateAndStoreProfileNarration({
    contentId: prayer.content_id,
    title: prayer.title,
    body: prayer.body,
    profile: "gentle"
  }, supabase);
  console.log("Gentle Result:", gentleResult);

  // 2. Generate Solemn Narration (ash)
  console.log("\n2. Generating Solemn narration (ash)...");
  const solemnResult = await generateAndStoreProfileNarration({
    contentId: prayer.content_id,
    title: prayer.title,
    body: prayer.body,
    profile: "solemn"
  }, supabase);
  console.log("Solemn Result:", solemnResult);
}

main().catch(err => {
  console.error("Script failed:", err);
  process.exit(1);
});
