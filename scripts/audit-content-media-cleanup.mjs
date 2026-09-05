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

const supabase = createClient(required("NEXT_PUBLIC_SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
const storageEndpoint = (process.env.BUNNY_STORAGE_ENDPOINT || "https://storage.bunnycdn.com").replace(/\/$/, "");
const storageZone = required("BUNNY_STORAGE_ZONE");
const bunnyKey = required("BUNNY_STORAGE_PASSWORD");

async function bunnyFiles(folder) {
  const response = await fetch(`${storageEndpoint}/${storageZone}/${folder}/`, { headers: { AccessKey: bunnyKey } });
  if (!response.ok) throw new Error(`Could not list Bunny folder ${folder} (${response.status}).`);
  const entries = await response.json();
  const files = [];
  for (const entry of entries) {
    const child = `${folder}/${entry.ObjectName}`.replace(/^\//, "");
    if (entry.IsDirectory) files.push(...await bunnyFiles(child));
    else files.push(child);
  }
  return files;
}

function narrationPaths(items) {
  const paths = new Set();
  for (const item of items) {
    if (item.type !== "daily_prayer") continue;
    const profiles = item.metadata?.audio?.profiles;
    if (!profiles || typeof profiles !== "object") continue;
    for (const profile of Object.values(profiles)) {
      if (profile?.storage_path?.startsWith(`audio/daily-prayers/${item.id}/`)) paths.add(profile.storage_path);
    }
  }
  return paths;
}

async function supabaseFiles(folder) {
  const { data, error } = await supabase.storage.from("today-media").list(folder, { limit: 1000 });
  if (error) throw error;
  const files = [];
  for (const entry of data || []) {
    const child = `${folder}/${entry.name}`;
    if (entry.id) files.push(child);
    else files.push(...await supabaseFiles(child));
  }
  return files;
}

const [{ data: items, error: itemsError }, { data: media, error: mediaError }] = await Promise.all([
  supabase.from("content_items").select("id,type,metadata"),
  supabase.from("content_media").select("storage_path,public_url"),
]);
if (itemsError) throw itemsError;
if (mediaError) throw mediaError;

const referencedBunny = new Set((media || []).filter((row) => row.public_url).map((row) => row.storage_path));
const referencedAudio = narrationPaths(items || []);
for (const path of referencedAudio) referencedBunny.add(path);

const bunnyCandidates = [
  ...(await bunnyFiles("content-images")),
  ...(await bunnyFiles("audio/daily-prayers")),
];
const orphanBunny = bunnyCandidates.filter((path) => !referencedBunny.has(path));

const supabaseAudio = await supabaseFiles("audio/daily-prayers");
const unreferencedSupabaseAudio = supabaseAudio.filter((path) => !referencedAudio.has(path));
const orphanIds = [...new Set([...orphanBunny, ...unreferencedSupabaseAudio].map((path) => path.split("/").filter(Boolean).find((segment) => /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(segment))).filter(Boolean))];
const { data: orphanContent, error: orphanContentError } = orphanIds.length
  ? await supabase.from("content_items").select("id,content_status,metadata").in("id", orphanIds)
  : { data: [], error: null };
if (orphanContentError) throw orphanContentError;
const remainingContentIds = new Set((orphanContent || []).map((item) => item.id));
const idFromPath = (path) => path.split("/").find((segment) => /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(segment));
const confirmedOrphanBunny = orphanBunny.filter((path) => !remainingContentIds.has(idFromPath(path)));
const confirmedOrphanSupabase = unreferencedSupabaseAudio.filter((path) => !remainingContentIds.has(idFromPath(path)));

if (process.argv.includes("--delete-confirmed")) {
  for (const filePath of confirmedOrphanBunny) {
    const response = await fetch(`${storageEndpoint}/${storageZone}/${filePath.split("/").map(encodeURIComponent).join("/")}`, {
      method: "DELETE",
      headers: { AccessKey: bunnyKey },
    });
    if (!response.ok && response.status !== 404) throw new Error(`Could not delete Bunny file ${filePath} (${response.status}).`);
  }
  if (confirmedOrphanSupabase.length > 0) {
    const { error: removeError } = await supabase.storage.from("today-media").remove(confirmedOrphanSupabase);
    if (removeError) throw removeError;
  }
}

console.log(JSON.stringify({
  referencedBunnyFiles: referencedBunny.size,
  bunnyFilesChecked: bunnyCandidates.length,
  unreferencedBunnyFiles: orphanBunny,
  supabaseDailyPrayerAudioFiles: supabaseAudio,
  unreferencedSupabaseDailyPrayerAudioFiles: unreferencedSupabaseAudio,
  confirmedOrphanBunnyFiles: confirmedOrphanBunny,
  confirmedOrphanSupabaseAudioFiles: confirmedOrphanSupabase,
  orphanContentRecordsStillPresent: (orphanContent || []).map((item) => ({
    id: item.id,
    content_status: item.content_status,
    publish_at: item.metadata?.publish_at || null,
    expire_at: item.metadata?.expire_at || null,
  })),
}, null, 2));
