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

  console.log("Testing common admin sign-in credentials...");
  const testEmails = ["admin@myprayeraltar.com", "admin@example.com", "user@myprayeraltar.com"];

  for (const email of testEmails) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: "password123",
    });
    console.log(`SignIn [${email}]:`, { user: data?.user?.id, error: error?.message });
  }
}

main().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
