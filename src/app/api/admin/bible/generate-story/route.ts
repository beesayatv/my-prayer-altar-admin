import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminAuth } from "@/lib/authServer";
import { safeLogAdminAiUsage } from "@/lib/ai/aiLogger";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export async function POST(request: NextRequest) {
  const auth = await verifyAdminAuth(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error || "Unauthorized." }, { status: 401 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY is not configured on the server." }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { topic, chapter_count = 5 } = body;

    if (!topic || typeof topic !== "string" || !topic.trim()) {
      return NextResponse.json({ error: "Story topic is required." }, { status: 400 });
    }

    // 1. Query existing canonical entities from Supabase to prevent duplicates
    const { data: existingEntities, error: entFetchErr } = await supabase
      .from("bible_entities")
      .select("id, slug, name, short_title, entity_type");

    if (entFetchErr) {
      console.error("Error fetching existing entities:", entFetchErr);
    }

    const entityBySlugOrIdMap: Record<string, { id: string; slug: string; name: string; entity_type: string }> = {};
    const entityCatalogLines: string[] = [];

    if (existingEntities) {
      for (const ent of existingEntities) {
        entityBySlugOrIdMap[ent.slug] = ent;
        entityBySlugOrIdMap[ent.id] = ent;
        entityBySlugOrIdMap[ent.name.toLowerCase()] = ent;
        if (ent.short_title) {
          entityBySlugOrIdMap[ent.short_title.toLowerCase()] = ent;
        }
        entityCatalogLines.push(
          `- [${ent.entity_type}] ${ent.name} (slug: "${ent.slug}")`
        );
      }
    }

    const existingEntitiesContext = entityCatalogLines.length > 0
      ? entityCatalogLines.join("\n")
      : "(No existing canonical entities found in database yet)";

    // 2. Build System Prompt for OpenAI
    const systemPrompt = `You are an expert Biblical Scholar, Historian, and Content Architect for the "My Bible" evergreen library app.
Your task is to generate a complete, rich, sequenced Story Journey with content blocks, scripture passages, visual prompts, and canonical entities.

---
IMPORTANT: EXISTING DATABASE CANONICAL ENTITIES
The database already contains the following canonical entities:
${existingEntitiesContext}

RULES FOR ENTITY DEDUPLICATION & LINKING:
1. ALWAYS use clean human-readable SLUGS in inline tags: [[entity:clean-slug:type|Display Name]].
   - Example for existing entity: [[entity:simon-peter:person|Peter]]
   - Example for new entity: [[entity:kingdom-of-god:concept|Kingdom of God]]
   - DO NOT write raw UUID strings in content text.
2. If an entity matches an existing entity from the catalog above:
   - Use its exact slug from the catalog.
   - DO NOT list it under "new_canonical_entities".
   - CRITICAL: Ensure the match is exact. For example, if the story features "Joseph (son of Jacob)" from the Old Testament, do NOT match it to "Joseph (slug: joseph-husband-of-mary)" from the catalog as they are completely different historical people. If a person shares a name but is a different individual, you MUST treat them as a new entity and define them under "new_canonical_entities".
3. For any entity that does NOT exist in the database catalog above:
   - You MUST define EVERY key character (person), place, major event, or theological concept featured in the story under "new_canonical_entities".
   - Do NOT be lazy or omit entities to keep the list short. For example, if generating a story about Joseph, since "Joseph (son of Jacob)", "Egypt", "Pharaoh", "Potiphar", and "Potiphar's Wife" are not in the catalog above, you MUST define all of them under "new_canonical_entities".
   - Use a unique clean slug in inline tags.
   - Output its full definition under "new_canonical_entities".

---
RULES FOR INLINE ENTITY TAGGING IN RICH TEXT:
1. You MUST embed inline entity links inside the text of every "rich_text" block using the format [[entity:slug:type|Display Name]].
2. Link every major character, key place, important event, or major theological concept mentioned.
3. Every chapter's "rich_text" block must have at least 2 to 4 inline entity links. Do not write plain text for entities when you can link them.

---
RULES FOR ENTITY CALLOUT BLOCKS:
1. You MUST include at least one discrete block of type "entity_callout" in every single chapter.
2. An "entity_callout" block is a spotlight highlight for a key entity in that chapter (e.g., a person, place, concept, or event).
3. For every "entity_callout" block:
   - Set "type" strictly to "entity_callout".
   - Set "entity_slug" to the slug of the entity being highlighted.
   - Set "entity_type" to the entity's type (e.g., "person", "place", "concept", "event").
   - Set "custom_headline" to a prominent spotlight headline (e.g., "Key Person: Simon Peter", "Sacred Location: Sea of Galilee", "Spiritual Concept: Leap of Faith").

---
RULES FOR VISUAL PROMPTS (IMAGE BLOCKS):
1. The "visual_prompt" inside "image" blocks MUST be a complete, copy-pasteable command/prompt that the administrator can copy and paste directly into ChatGPT (DALL-E 3) or Gemini to generate a high-quality illustration.
2. The prompt MUST include a specific command to generate a sequential image based on the story, enforcing style and character consistency.
3. It must specify:
   - The shared, consistent artistic style of the entire story sequence (MUST BE EXPLICITLY: "Classical Realist Biblical Narrative Art").
   - The aspect ratio (always "16:9 aspect ratio").
   - The specific characters, their features, clothing colors, and action for this particular chapter.
   - Explicit instructions to maintain consistency with other images in the sequence (e.g., "This is part of a sequential series. Maintain the same character designs, color grading, and classical realist style as the other illustrations in this series").
4. Example "visual_prompt": "Generate a 16:9 illustration in the style of Classical Realist Biblical Narrative Art. This is part of a sequential story series. Scene: Jesus and His disciples in a wooden boat on a stormy Sea of Galilee, waves crashing. Character consistency: Jesus has brown hair, a beard, and wears a simple white robe. Maintain the exact same character designs, color palette, and classical realist art style across this series."

---
RULES FOR SCRIPTURE BLOCKS:
1. For 'scripture' blocks, 'reference' MUST be the exact biblical citation (e.g., "Matthew 14:22-23"). DO NOT put the Bible translation name (like "NIV") in the 'reference' field.
2. The Bible translation name (e.g., "NIV") goes into the 'translation' field.
3. The 'text' field must contain the actual verses of the scripture passage.

---
OUTPUT FORMAT REQUIREMENTS:
Output ONLY valid JSON matching the exact schema provided in the structured output format.
In the 'story_metadata' section, you MUST generate an array of 2 to 4 short, descriptive 'tags' (e.g., ["Faith", "Miracles", "Courage"]) that categorize the story.
For 'new_canonical_entities', you MUST include accurate 'biblical_references' and 'theological_significance' to ensure high-quality ground-truth summaries.`;

    // 3. Call OpenAI Chat Completions REST API
    const openAiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o",
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "bible_story_schema",
            strict: true,
            schema: {
              type: "object",
              properties: {
                new_canonical_entities: {
                  type: "array",
                  description: "Define ALL entities used in this story that are not already in the catalog BEFORE writing the story.",
                  items: {
                    type: "object",
                    properties: {
                      type: { type: "string", enum: ["person", "place", "event", "scripture", "concept", "object", "explainer", "map", "timeline", "collection", "comparison"] },
                      name: { type: "string" },
                      short_title: { type: "string" },
                      slug: { type: "string" },
                      summary: { type: "string" },
                      aliases: { type: "string" },
                      biblical_references: { type: "string" },
                      theological_significance: { type: "string" }
                    },
                    required: ["type", "name", "short_title", "slug", "summary", "aliases", "biblical_references", "theological_significance"],
                    additionalProperties: false
                  }
                },
                story_metadata: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    subtitle: { type: "string" },
                    url_slug: { type: "string" },
                    summary: { type: "string" },
                    access_level: { type: "string" },
                    tags: {
                      type: "array",
                      items: { type: "string" },
                      description: "An array of 2-4 short, descriptive tags categorizing this story (e.g., 'Faith', 'Miracles', 'Courage')."
                    }
                  },
                  required: ["title", "subtitle", "url_slug", "summary", "access_level", "tags"],
                  additionalProperties: false
                },
                chapters: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      chapter_number: { type: "number" },
                      title: { type: "string" },
                      url_slug: { type: "string" },
                      summary: { type: "string" }
                    },
                    required: ["chapter_number", "title", "url_slug", "summary"],
                    additionalProperties: false
                  }
                },
                chapter_content_blocks: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      chapter_number: { type: "number" },
                      blocks: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            type: { type: "string", enum: ["rich_text", "image", "scripture", "entity_callout"] },
                            content: { type: "string", description: "For rich_text blocks, this is the text content where you MUST embed inline entity tags in the format [[entity:slug:type|Display Name]] (e.g. [[entity:joseph:person|Joseph]] or [[entity:egypt:place|Egypt]]) for every key character, place, event, or concept mentioned in the text. For other block types, use an empty string." },
                            media_path: { type: "string", description: "Use empty string if not applicable" },
                            visual_prompt: { type: "string", description: "Use empty string if not applicable" },
                            caption: { type: "string", description: "Use empty string if not applicable" },
                            reference: { type: "string", description: "The Bible passage reference (e.g., 'Matthew 14:22-23'). Do NOT put the translation name here. Use empty string if not applicable." },
                            text: { type: "string", description: "The actual scripture passage text. Use empty string if not applicable." },
                            translation: { type: "string", description: "The Bible translation used (e.g., 'NIV'). Use empty string if not applicable." },
                            entity_slug: { type: "string", description: "Use empty string if not applicable" },
                            entity_type: { type: "string", description: "Use empty string if not applicable" },
                            custom_headline: { type: "string", description: "Use empty string if not applicable" }
                          },
                          required: ["type", "content", "media_path", "visual_prompt", "caption", "reference", "text", "translation", "entity_slug", "entity_type", "custom_headline"],
                          additionalProperties: false
                        }
                      }
                    },
                    required: ["chapter_number", "blocks"],
                    additionalProperties: false
                  }
                }
              },
              required: ["new_canonical_entities", "story_metadata", "chapters", "chapter_content_blocks"],
              additionalProperties: false
            }
          }
        },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Generate a complete ${chapter_count}-chapter Story Journey about: "${topic.trim()}".

MANDATORY BLOCK REQUIREMENTS — every single chapter MUST contain ALL of the following block types in this order:
1. An "image" block with a detailed visual_prompt.
2. At least one "rich_text" block with a minimum of 3 inline [[entity:slug:type|Label]] links.
3. At least one "scripture" block with a real biblical citation in "reference" and the actual verse text in "text".
4. At least one "entity_callout" block spotlighting a key person, place, or concept from that chapter.

Do NOT skip scripture or entity_callout blocks. A chapter missing any of these 4 block types is INVALID.` }
        ],
        temperature: 0.7
      })
    });

    const openAiRequestId = openAiRes.headers.get("x-request-id") || null;
    if (!openAiRes.ok) {
      const errJson = await openAiRes.json().catch(() => ({}));
      const errMessage = errJson.error?.message || "OpenAI API request failed.";
      await safeLogAdminAiUsage({
        feature: "bible_story_generation",
        model: "gpt-4o",
        status: "failed",
        error_code: `openai_http_${openAiRes.status}`,
        request_id: openAiRequestId
      });
      throw new Error(errMessage);
    }

    const openAiJson = await openAiRes.json();
    if (openAiJson.error) {
      await safeLogAdminAiUsage({
        feature: "bible_story_generation",
        model: "gpt-4o",
        status: "failed",
        error_code: openAiJson.error.code || "openai_error",
        request_id: openAiRequestId
      });
      throw new Error(openAiJson.error.message || "OpenAI API request failed.");
    }

    await safeLogAdminAiUsage({
      feature: "bible_story_generation",
      model: openAiJson.model || "gpt-4o",
      input_tokens: openAiJson.usage?.prompt_tokens ?? null,
      output_tokens: openAiJson.usage?.completion_tokens ?? null,
      total_tokens: openAiJson.usage?.total_tokens ?? null,
      status: "success",
      request_id: openAiRequestId,
    });

    const rawResponse = openAiJson.choices?.[0]?.message?.content;
    if (!rawResponse) throw new Error("OpenAI returned an empty response.");

    const generated = JSON.parse(rawResponse);
    const { story_metadata, chapters, chapter_content_blocks, new_canonical_entities } = generated;

    if (!story_metadata || !story_metadata.title || !Array.isArray(chapters)) {
      throw new Error("OpenAI response structure was incomplete.");
    }

    let createdEntitiesCount = 0;
    const slugToUuidMap: Record<string, string> = {};

    // 4. Process and Upsert NEW Canonical Entities
    if (Array.isArray(new_canonical_entities)) {
      for (const ent of new_canonical_entities) {
        if (!ent.slug || !ent.name || !ent.type) continue;

        const cleanSlug = ent.slug.trim().toLowerCase();
        const aliases = typeof ent.aliases === "string"
          ? ent.aliases.split(",").map((a: string) => a.trim()).filter(Boolean)
          : Array.isArray(ent.aliases) ? ent.aliases : [];

        // Check if entity exists by slug
        const { data: existing } = await supabase
          .from("bible_entities")
          .select("id")
          .eq("slug", cleanSlug)
          .maybeSingle();

        if (existing) {
          slugToUuidMap[cleanSlug] = existing.id;
        } else {
          const { data: newEnt, error: entErr } = await supabase
            .from("bible_entities")
            .insert({
              entity_type: ent.type.trim().toLowerCase(),
              slug: cleanSlug,
              name: ent.name.trim(),
              short_title: ent.short_title?.trim() || null,
              summary: ent.summary?.trim() || "",
              aliases,
              status: "ready",
              access_level: ent.access_level || "free"
            })
            .select("id")
            .single();

          if (!entErr && newEnt) {
            slugToUuidMap[cleanSlug] = newEnt.id;
            createdEntitiesCount++;
          }
        }
      }
    }

    // 5. Upsert Story Journey
    const storySlug = (story_metadata.url_slug || story_metadata.slug || story_metadata.title)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    const { data: existingStory } = await supabase
      .from("bible_stories")
      .select("id")
      .eq("slug", storySlug)
      .maybeSingle();

    let storyId: string;

    if (existingStory) {
      storyId = existingStory.id;
      await supabase
        .from("bible_stories")
        .update({
          title: story_metadata.title.trim(),
          subtitle: story_metadata.subtitle?.trim() || null,
          summary: story_metadata.summary?.trim() || "",
          access_level: ["free","premium"].includes(story_metadata.access_level) ? story_metadata.access_level : "free",
          status: "draft",
          tags: Array.isArray(story_metadata.tags) ? story_metadata.tags : [],
          updated_at: new Date().toISOString()
        })
        .eq("id", storyId);
    } else {
      const { data: newStory, error: storyInsErr } = await supabase
        .from("bible_stories")
        .insert({
          title: story_metadata.title.trim(),
          subtitle: story_metadata.subtitle?.trim() || null,
          slug: storySlug,
          summary: story_metadata.summary?.trim() || "",
          access_level: ["free","premium"].includes(story_metadata.access_level) ? story_metadata.access_level : "free",
          status: "draft",
          tags: Array.isArray(story_metadata.tags) ? story_metadata.tags : []
        })
        .select("id")
        .single();

      if (storyInsErr) throw storyInsErr;
      storyId = newStory.id;
    }

    // 6. Process Chapters and Content Blocks
    const blockMapByChapterNum: Record<number, any[]> = {};
    if (Array.isArray(chapter_content_blocks)) {
      for (const item of chapter_content_blocks) {
        if (item.chapter_number && Array.isArray(item.blocks)) {
          blockMapByChapterNum[item.chapter_number] = item.blocks;
        }
      }
    }
    
    // 6a. Pre-process hallucinated entities
    // Sometimes the AI uses an inline tag [[entity:slug:type|Label]] but forgets to list it in new_canonical_entities.
    const hallucinatedEntities: Record<string, { label: string; type: string }> = {};

    for (const ch of chapters) {
      const chNum = Number(ch.chapter_number);
      const rawBlocks = blockMapByChapterNum[chNum] || ch.content_blocks || ch.blocks || [];
      for (const blk of rawBlocks) {
        if (blk.type === "rich_text" && blk.content) {
          const matches = blk.content.matchAll(/\[\[entity:([^:]+):([a-z_]+)\|([^\]]+)\]\]/g);
          for (const match of matches) {
            const slug = match[1];
            const type = match[2];
            const label = match[3];
            
            if (!entityBySlugOrIdMap[slug] && !entityBySlugOrIdMap[slug.toLowerCase()] && !entityBySlugOrIdMap[label.toLowerCase()] && !slugToUuidMap[slug]) {
              hallucinatedEntities[slug] = { label, type };
            }
          }
        }
        if (blk.type === "entity_callout") {
          const targetKey = blk.entity_id || blk.entity_slug || blk.slug || "";
          if (targetKey && !entityBySlugOrIdMap[targetKey] && !entityBySlugOrIdMap[targetKey.toLowerCase()] && !slugToUuidMap[targetKey]) {
            hallucinatedEntities[targetKey] = { label: targetKey.replace(/-/g, ' '), type: "concept" };
          }
        }
      }
    }

    const hallucinatedSlugs = Object.keys(hallucinatedEntities);
    if (hallucinatedSlugs.length > 0) {
      // Execute Secondary Entity Enrichment Pass
      const stubEnrichmentPrompt = `You are a biblical scholar. Provide a highly accurate, brief summary (1-2 sentences) and aliases for the following entities, strictly using biblical/historical facts. 
Entities:
${hallucinatedSlugs.map(slug => `- Slug: ${slug}, Label: ${hallucinatedEntities[slug].label}`).join("\n")}`;

      let enrichedStubs: Record<string, any> = {};
      try {
        const enrichRes = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "entity_enrichment",
                strict: true,
                schema: {
                  type: "object",
                  properties: {
                    entities: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          slug: { type: "string" },
                          summary: { type: "string" },
                          aliases: { type: "string", description: "Comma-separated" }
                        },
                        required: ["slug", "summary", "aliases"],
                        additionalProperties: false
                      }
                    }
                  },
                  required: ["entities"],
                  additionalProperties: false
                }
              }
            },
            messages: [{ role: "user", content: stubEnrichmentPrompt }],
            temperature: 0.2
          })
        });
        const enrichRequestId = enrichRes.headers.get("x-request-id") || null;
        if (!enrichRes.ok) {
          await safeLogAdminAiUsage({
            feature: "bible_story_enrichment",
            model: "gpt-4o-mini",
            status: "failed",
            error_code: `openai_http_${enrichRes.status}`,
            request_id: enrichRequestId
          });
          throw new Error("OpenAI enrichment request failed");
        }

        const enrichJson = await enrichRes.json();
        if (enrichJson.error) {
          await safeLogAdminAiUsage({
            feature: "bible_story_enrichment",
            model: "gpt-4o-mini",
            status: "failed",
            error_code: enrichJson.error.code || "openai_error",
            request_id: enrichRequestId
          });
          throw new Error(enrichJson.error.message || "OpenAI enrichment request failed");
        }

        await safeLogAdminAiUsage({
          feature: "bible_story_enrichment",
          model: enrichJson.model || "gpt-4o-mini",
          input_tokens: enrichJson.usage?.prompt_tokens ?? null,
          output_tokens: enrichJson.usage?.completion_tokens ?? null,
          total_tokens: enrichJson.usage?.total_tokens ?? null,
          status: "success",
          request_id: enrichRequestId,
        });

        const enrichRaw = enrichJson.choices?.[0]?.message?.content;
        if (enrichRaw) {
          const parsed = JSON.parse(enrichRaw);
          for (const ent of parsed.entities) {
            enrichedStubs[ent.slug] = ent;
          }
        }
      } catch (e) {
        console.error("Enrichment pass failed:", e);
      }

      const stubsToInsert = hallucinatedSlugs.map(slug => {
        const enriched = enrichedStubs[slug];
        return {
          name: hallucinatedEntities[slug].label,
          entity_type: hallucinatedEntities[slug].type,
          slug: slug,
          summary: enriched?.summary || `Auto-generated stub for ${hallucinatedEntities[slug].label}`,
          aliases: enriched?.aliases ? enriched.aliases.split(',').map((a:string)=>a.trim()).filter(Boolean) : [],
          status: "ready"
        };
      });

      const { data: stubInserts, error: stubInsErr } = await supabase
        .from("bible_entities")
        .insert(stubsToInsert)
        .select("id, slug");

      if (!stubInsErr && stubInserts) {
        stubInserts.forEach((row: any) => {
          slugToUuidMap[row.slug] = row.id;
        });
      }
    }

    let processedChaptersCount = 0;

    for (const ch of chapters) {
      const chNum = Number(ch.chapter_number);
      const chSlug = (ch.url_slug || ch.slug || ch.title)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

      const rawBlocks = blockMapByChapterNum[chNum] || ch.content_blocks || ch.blocks || [];

      // Format blocks and resolve entity slug tokens to real UUIDs
      const formattedBlocks = rawBlocks.map((blk: any) => {
        const blockId = blk.id || `blk_${Math.random().toString(36).substring(2, 9)}`;

        if (blk.type === "rich_text" && blk.content) {
          const updatedContent = blk.content.replace(
            /\[\[entity:([^:]+):([a-z_]+)\|([^\]]+)\]\]/g,
            (_match: string, slugOrUuid: string, typeStr: string, labelStr: string) => {
              const matchedEntity = entityBySlugOrIdMap[slugOrUuid]
                || entityBySlugOrIdMap[slugOrUuid.toLowerCase()]
                || entityBySlugOrIdMap[labelStr.toLowerCase()];
              const realUuid = matchedEntity ? matchedEntity.id : (slugToUuidMap[slugOrUuid] || slugOrUuid);
              return `[[entity:${realUuid}:${typeStr}|${labelStr}]]`;
            }
          );
          return { id: blockId, type: "rich_text", content: updatedContent };
        }

        if (blk.type === "entity_callout") {
          const targetKey = blk.entity_id || blk.entity_slug || blk.slug || "";
          const matchedEntity = entityBySlugOrIdMap[targetKey]
            || entityBySlugOrIdMap[targetKey.toLowerCase()];
          const realUuid = matchedEntity ? matchedEntity.id : (slugToUuidMap[targetKey] || targetKey || null);
          return {
            id: blockId,
            type: "entity_callout",
            entity_id: realUuid,
            entity_type: blk.entity_type || "person",
            custom_headline: blk.custom_headline || blk.headline
          };
        }

        if (blk.type === "scripture") {
          const targetKey = blk.entity_id || blk.entity_slug || blk.slug || "";
          const matchedEntity = entityBySlugOrIdMap[targetKey]
            || entityBySlugOrIdMap[targetKey.toLowerCase()];
          const realUuid = matchedEntity ? matchedEntity.id : (slugToUuidMap[targetKey] || targetKey || null);
          return {
            id: blockId,
            type: "scripture",
            reference: blk.reference,
            text: blk.text,
            entity_id: realUuid
          };
        }

        if (blk.type === "image") {
          return {
            id: blockId,
            type: "image",
            media_path: blk.media_path || "",
            caption: blk.caption || "",
            visual_prompt: blk.visual_prompt || ""
          };
        }

        return { id: blockId, ...blk };
      });

      // Upsert chapter
      const { data: existingCh } = await supabase
        .from("bible_chapters")
        .select("id")
        .eq("story_id", storyId)
        .eq("chapter_number", chNum)
        .maybeSingle();

      if (existingCh) {
        await supabase
          .from("bible_chapters")
          .update({
            title: ch.title.trim(),
            slug: chSlug,
            summary: ch.summary?.trim() || null,
            content_blocks: formattedBlocks,
            updated_at: new Date().toISOString()
          })
          .eq("id", existingCh.id);
      } else {
        await supabase
          .from("bible_chapters")
          .insert({
            story_id: storyId,
            chapter_number: chNum,
            title: ch.title.trim(),
            slug: chSlug,
            summary: ch.summary?.trim() || null,
            content_blocks: formattedBlocks
          });
      }
      processedChaptersCount++;
    }

    return NextResponse.json({
      success: true,
      storyId,
      storySlug,
      storyTitle: story_metadata.title,
      createdEntitiesCount,
      processedChaptersCount
    });
  } catch (error) {
    // Log the full error for debugging
    console.error('Error in generate-story API:', error);
    const message =
      error instanceof Error
        ? error.message
        : (error && typeof error === 'object' && 'message' in error
            ? (error as any).message
            : JSON.stringify(error));
    return NextResponse.json({ error: message || 'OpenAI story generation failed.' }, { status: 500 });
  }

}
