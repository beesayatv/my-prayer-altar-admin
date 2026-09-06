import { runtimeEnv } from "@/lib/runtimeEnv";

type BunnyConfig = {
  storageZone: string;
  storagePassword: string;
  storageEndpoint: string;
  cdnUrl: string;
};

function getConfig(): BunnyConfig {
  const storageZone = runtimeEnv("BUNNY_STORAGE_ZONE") || "";
  const storagePassword = runtimeEnv("BUNNY_STORAGE_PASSWORD") || "";
  const storageEndpoint = (runtimeEnv("BUNNY_STORAGE_ENDPOINT") || "https://storage.bunnycdn.com").replace(/\/$/, "");
  const cdnUrl = (runtimeEnv("BUNNY_VIDEO_CDN_URL") || "").replace(/\/$/, "");
  if (!storageZone || !storagePassword || !cdnUrl) throw new Error("Bunny Storage is not configured.");
  return { storageZone, storagePassword, storageEndpoint, cdnUrl };
}

function objectUrl(storagePath: string, config: BunnyConfig) {
  return `${config.storageEndpoint}/${config.storageZone}/${storagePath.split("/").map(encodeURIComponent).join("/")}`;
}

export function bunnyPublicUrl(storagePath: string) {
  return `${getConfig().cdnUrl}/${storagePath}`;
}

export function isBunnyPublicUrl(publicUrl: string | null | undefined) {
  const cdnUrl = (runtimeEnv("BUNNY_VIDEO_CDN_URL") || "").replace(/\/$/, "");
  return Boolean(publicUrl && cdnUrl && publicUrl.startsWith(`${cdnUrl}/`));
}

export async function uploadToBunny(storagePath: string, body: Buffer, contentType: string) {
  const config = getConfig();
  const response = await fetch(objectUrl(storagePath, config), {
    method: "PUT",
    headers: { AccessKey: config.storagePassword, "Content-Type": contentType },
    body: new Uint8Array(body),
  });
  if (!response.ok) throw new Error(`Bunny upload failed (${response.status}).`);
}

export async function deleteFromBunny(storagePath: string) {
  const config = getConfig();
  const response = await fetch(objectUrl(storagePath, config), { method: "DELETE", headers: { AccessKey: config.storagePassword } });
  if (!response.ok && response.status !== 404) throw new Error(`Bunny deletion failed (${response.status}).`);
}
