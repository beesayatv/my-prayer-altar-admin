import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminAuth } from "@/lib/authServer";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

export async function POST(request: NextRequest) {
  const auth = await verifyAdminAuth(request);
  if (!auth.authorized) return NextResponse.json({ error: auth.error || "Unauthorized." }, { status: 401 });

  try {
    // 1. Fetch all entities
    const { data: allEntities, error: entErr } = await supabase
      .from("bible_entities")
      .select("id, body_blocks");
    
    if (entErr) throw entErr;
    if (!allEntities || allEntities.length === 0) {
      return NextResponse.json({ deletedCount: 0 });
    }

    const allEntityIds = new Set<string>(allEntities.map(e => e.id));

    // 2. Fetch all chapters
    const { data: allChapters, error: chErr } = await supabase
      .from("bible_chapters")
      .select("content_blocks");
    
    if (chErr) throw chErr;

    // 3. Extract active UUIDs
    const activeUuids = new Set<string>();

    const extractFromBlocks = (blocks: any[]) => {
      if (!Array.isArray(blocks)) return;
      for (const blk of blocks) {
        if (!blk) continue;

        if (blk.type === "rich_text" && blk.content) {
          const matches = blk.content.matchAll(/\[\[entity:([a-fA-F0-9\-]+):/g);
          for (const match of matches) {
            activeUuids.add(match[1]);
          }
        } else if (blk.type === "entity_callout" || blk.type === "scripture") {
          if (blk.entity_id) {
            activeUuids.add(blk.entity_id);
          }
        }
      }
    };

    // Scan chapter blocks
    if (allChapters) {
      for (const ch of allChapters) {
        extractFromBlocks(ch.content_blocks);
      }
    }

    // Scan entity body blocks (entities linking to other entities)
    for (const ent of allEntities) {
      extractFromBlocks(ent.body_blocks);
    }

    // 4. Identify orphans
    const orphans: string[] = [];
    for (const id of allEntityIds) {
      if (!activeUuids.has(id)) {
        orphans.push(id);
      }
    }

    if (orphans.length === 0) {
      return NextResponse.json({ deletedCount: 0 });
    }

    // 5. Bulk Delete
    const { error: delErr } = await supabase
      .from("bible_entities")
      .delete()
      .in("id", orphans);

    if (delErr) throw delErr;

    return NextResponse.json({ deletedCount: orphans.length, deletedIds: orphans });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to cleanup entities.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
