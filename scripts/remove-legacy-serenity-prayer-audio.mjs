import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
  const [key, ...values] = trimmed.split("=");
  process.env[key.trim()] = values.join("=").trim();
}

const required = (name) => {
  if (!process.env[name]) throw new Error(`${name} is missing.`);
  return process.env[name];
};

const contentId = "cc43b6e1-988a-4fd6-92fb-2aaf5c1c37ce";
const filename = "b3ab6758d05660c9-solemn-alloy-spd0p85-1786573096276.mp3";
const bunnyPath = `audio/daily-prayers/legacy/${contentId}/${filename}`;
const supabasePath = `audio/daily-prayers/${contentId}/${filename}`;
const endpoint = (process.env.BUNNY_STORAGE_ENDPOINT || "https://storage.bunnycdn.com").replace(/\/$/, "");

const bunnyDelete = await fetch(`${endpoint}/${required("BUNNY_STORAGE_ZONE")}/${bunnyPath.split("/").map(encodeURIComponent).join("/")}`, {
  method: "DELETE",
  headers: { AccessKey: required("BUNNY_STORAGE_PASSWORD") },
});
if (!bunnyDelete.ok && bunnyDelete.status !== 404) throw new Error(`Bunny deletion failed (${bunnyDelete.status}).`);

const supabase = createClient(required("NEXT_PUBLIC_SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
const { error: supabaseError } = await supabase.storage.from("today-media").remove([supabasePath]);
if (supabaseError) throw supabaseError;

console.log("Removed the legacy Bunny narration and unused Supabase duplicate for the Serenity prayer.");
