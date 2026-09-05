import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { verifyAdminAuth } from "@/lib/authServer";
import { bunnyPublicUrl, uploadToBunny } from "@/lib/bunnyStorage";

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxBytes = 8 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const auth = await verifyAdminAuth(request);
  if (!auth.authorized) return NextResponse.json({ error: auth.error || "Unauthorized." }, { status: 401 });

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const folder = String(formData.get("folder") || "bible/covers");

    if (!(file instanceof File) || !allowedTypes.has(file.type) || file.size > maxBytes) {
      return NextResponse.json({ error: "Upload a valid JPEG, PNG, or WebP image under 8 MB." }, { status: 400 });
    }

    const id = crypto.randomUUID();
    const extension = file.name.split(".").pop()?.toLowerCase() || "webp";
    const storagePath = `${folder}/${id}.${extension}`;

    await uploadToBunny(storagePath, Buffer.from(await file.arrayBuffer()), file.type);
    const publicUrl = bunnyPublicUrl(storagePath);

    return NextResponse.json({ storagePath, publicUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
