const storageZone = process.env.BUNNY_STORAGE_ZONE || "";
const storagePassword = process.env.BUNNY_STORAGE_PASSWORD || "";
const storageEndpoint = (process.env.BUNNY_STORAGE_ENDPOINT || "https://storage.bunnycdn.com").replace(/\/$/, "");
const cdnUrl = (process.env.BUNNY_VIDEO_CDN_URL || "").replace(/\/$/, "");

function requireConfig() {
  if (!storageZone || !storagePassword || !cdnUrl) throw new Error("Bunny Storage is not configured.");
}

function objectUrl(storagePath: string) {
  return `${storageEndpoint}/${storageZone}/${storagePath.split("/").map(encodeURIComponent).join("/")}`;
}

export function bunnyPublicUrl(storagePath: string) {
  requireConfig();
  return `${cdnUrl}/${storagePath}`;
}

export function isBunnyPublicUrl(publicUrl: string | null | undefined) {
  return Boolean(publicUrl && cdnUrl && publicUrl.startsWith(`${cdnUrl}/`));
}

export async function uploadToBunny(storagePath: string, body: Buffer, contentType: string) {
  requireConfig();
  const response = await fetch(objectUrl(storagePath), {
    method: "PUT",
    headers: { AccessKey: storagePassword, "Content-Type": contentType },
    body: new Uint8Array(body),
  });
  if (!response.ok) throw new Error(`Bunny upload failed (${response.status}).`);
}

export async function deleteFromBunny(storagePath: string) {
  requireConfig();
  const response = await fetch(objectUrl(storagePath), { method: "DELETE", headers: { AccessKey: storagePassword } });
  if (!response.ok && response.status !== 404) throw new Error(`Bunny deletion failed (${response.status}).`);
}
