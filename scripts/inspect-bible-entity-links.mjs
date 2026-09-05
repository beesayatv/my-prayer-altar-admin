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

async function inspectAll() {
  const { data: entities } = await supabase.from('bible_entities').select('*');
  console.log("=== ALL BIBLE ENTITIES ===");
  entities.forEach(e => {
    console.log(`[${e.entity_type.toUpperCase()}] name: "${e.name}" | slug: "${e.slug}" | id: ${e.id}`);
  });

  const { data: stories } = await supabase.from('bible_stories').select('*');
  console.log("\n=== ALL STORIES ===");
  stories.forEach(s => {
    console.log(`Story: "${s.title}" | slug: "${s.slug}" | id: ${s.id} | status: ${s.status}`);
  });

  const { data: chapters } = await supabase.from('bible_chapters').select('*');
  console.log("\n=== ALL CHAPTERS CONTENT BLOCKS ===");
  for (const c of chapters) {
    console.log(`\n--- Chapter: "${c.title}" (slug: ${c.slug}, id: ${c.id}) ---`);
    console.log(JSON.stringify(c.content_blocks, null, 2));
  }
}

inspectAll();
