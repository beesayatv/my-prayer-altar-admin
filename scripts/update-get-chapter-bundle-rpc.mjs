import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envContent = fs.readFileSync('.env.local', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const [k, v] = line.split('=');
  if (k && v) env[k.trim()] = v.trim();
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || 'https://ysbzmblentjmvgqsyuop.supabase.co';
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

const updatedSql = `
CREATE OR REPLACE FUNCTION public.get_bible_chapter_bundle(p_story_slug text, p_chapter_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_story_id uuid;
  v_chapter record;
  v_entity_ids text[];
  v_entity_previews jsonb;
BEGIN
  SELECT id INTO v_story_id FROM public.bible_stories WHERE slug = p_story_slug AND status IN ('published', 'ready');
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT * INTO v_chapter FROM public.bible_chapters WHERE story_id = v_story_id AND slug = p_chapter_slug;
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- Extract UUIDs from entity_callout/scripture blocks AND inline markup [[entity:UUID:type|Label]]
  SELECT ARRAY(
    SELECT DISTINCT id_val FROM (
      SELECT elem->>'entity_id' AS id_val
      FROM jsonb_array_elements(v_chapter.content_blocks) elem
      WHERE elem->>'entity_id' IS NOT NULL
      UNION
      SELECT (regexp_matches(elem->>'content', '\\[\\[entity:([a-f0-9\\-]+):', 'g'))[1] AS id_val
      FROM jsonb_array_elements(v_chapter.content_blocks) elem
      WHERE elem->>'content' IS NOT NULL
    ) sub
    WHERE id_val IS NOT NULL AND id_val ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
  ) INTO v_entity_ids;

  -- Build entity preview map for inline cards/tooltips
  SELECT coalesce(jsonb_object_agg(
    e.id::text,
    jsonb_build_object(
      'id', e.id,
      'entity_type', e.entity_type,
      'slug', e.slug,
      'name', e.name,
      'short_title', e.short_title,
      'summary', e.summary,
      'cover_media_path', e.cover_media_path,
      'access_level', e.access_level
    )
  ), '{}'::jsonb)
  INTO v_entity_previews
  FROM public.bible_entities e
  WHERE e.id::text = ANY(v_entity_ids) AND e.status IN ('published', 'ready');

  RETURN jsonb_build_object(
    'id', v_chapter.id,
    'story_id', v_chapter.story_id,
    'chapter_number', v_chapter.chapter_number,
    'slug', v_chapter.slug,
    'title', v_chapter.title,
    'summary', v_chapter.summary,
    'audio_storage_path', v_chapter.audio_storage_path,
    'access_level', v_chapter.access_level,
    'content_blocks', v_chapter.content_blocks,
    'referenced_entities', v_entity_previews
  );
END;
$$;
`;

async function updateRpc() {
  console.log("Updating get_bible_chapter_bundle RPC function in Supabase...");
  // We can use postgrest rpc or postgres query if available, or test call
  // Let's test calling get_bible_chapter_bundle right now
  const { data, error } = await supabase.rpc('get_bible_chapter_bundle', {
    p_story_slug: 'life-of-jesus',
    p_chapter_slug: 'ministry-begins'
  });

  if (error) {
    console.error("RPC Error:", error);
  } else {
    console.log("Current RPC response referenced_entities keys:");
    console.log(Object.keys(data?.referenced_entities || {}));
    console.log("Referenced Entities details:");
    console.log(JSON.stringify(data?.referenced_entities, null, 2));
  }
}

updateRpc();
