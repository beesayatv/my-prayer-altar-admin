import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) throw new Error(".env.local was not found.");
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...values] = trimmed.split("=");
    process.env[key.trim()] = values.join("=").trim();
  }
}

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is missing from .env.local.`);
  return value;
}

function bunnyObjectUrl(storagePath) {
  const endpoint = (process.env.BUNNY_STORAGE_ENDPOINT || "https://storage.bunnycdn.com").replace(/\/$/, "");
  return `${endpoint}/${required("BUNNY_STORAGE_ZONE")}/${storagePath.split("/").map(encodeURIComponent).join("/")}`;
}

function bunnyPublicUrl(storagePath) {
  return `${required("BUNNY_VIDEO_CDN_URL").replace(/\/$/, "")}/${storagePath}`;
}

function legacyProfiles(metadata) {
  const profiles = metadata?.audio?.profiles;
  if (!profiles || typeof profiles !== "object") return [];
  return Object.entries(profiles).filter(([, profile]) => {
    const item = profile;
    return item && typeof item === "object"
      && typeof item.storage_path === "string"
      && item.storage_path.startsWith("audio/daily-prayers/")
      && !item.public_url;
  });
}

async function main() {
  loadEnvLocal();
  const supabase = createClient(required("NEXT_PUBLIC_SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
  const bunnyPassword = required("BUNNY_STORAGE_PASSWORD");

  const { data: items, error } = await supabase
    .from("content_items")
    .select("id,title,metadata")
    .eq("type", "daily_prayer");
  if (error) throw error;

  const candidates = (items || []).filter((item) => legacyProfiles(item.metadata).length > 0);
  console.log(`Found ${candidates.length} Daily Prayer item(s) with legacy Supabase narration.`);

  let migratedProfiles = 0;
  for (const item of candidates) {
    const profiles = legacyProfiles(item.metadata);
    const updatedMetadata = structuredClone(item.metadata || {});
    console.log(`Migrating ${profiles.length} narration profile(s) for: ${item.title || item.id} (${item.id})`);

    for (const [profileName, profile] of profiles) {
      const storagePath = profile.storage_path;
      const { data: audio, error: downloadError } = await supabase.storage.from("today-media").download(storagePath);
      if (downloadError || !audio) throw new Error(`Could not download ${storagePath}: ${downloadError?.message || "no file returned"}`);

      const upload = await fetch(bunnyObjectUrl(storagePath), {
        method: "PUT",
        headers: { AccessKey: bunnyPassword, "Content-Type": "audio/mpeg" },
        body: new Uint8Array(await audio.arrayBuffer()),
      });
      if (!upload.ok) throw new Error(`Bunny upload failed for ${storagePath} (${upload.status}).`);

      const publicUrl = bunnyPublicUrl(storagePath);
      const verify = await fetch(publicUrl, { method: "HEAD" });
      if (!verify.ok) throw new Error(`Bunny verification failed for ${storagePath} (${verify.status}).`);

      updatedMetadata.audio.profiles[profileName] = { ...profile, public_url: publicUrl };
      migratedProfiles += 1;
    }

    const { error: updateError } = await supabase
      .from("content_items")
      .update({ metadata: updatedMetadata })
      .eq("id", item.id);
    if (updateError) throw updateError;
  }

  console.log(`Migration complete: ${migratedProfiles} narration profile(s) now use Bunny.`);
  console.log("The original Supabase files were intentionally kept as a rollback backup.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
