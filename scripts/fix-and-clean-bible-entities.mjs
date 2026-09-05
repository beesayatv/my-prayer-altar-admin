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

const newEntitiesToInsert = [
  {
    name: "Kingdom of God",
    short_title: "Kingdom of God",
    slug: "kingdom-of-god",
    entity_type: "concept",
    summary: "The reign and rule of God proclaimed by Jesus Christ, bringing salvation, spiritual rebirth, peace, and eternal life.",
    status: "published",
    access_level: "free"
  },
  {
    name: "Simon Peter",
    short_title: "Peter",
    slug: "simon-peter",
    entity_type: "person",
    summary: "One of the Twelve Apostles of Jesus Christ, a fisherman called from the Sea of Galilee who became a key pillar of the early Christian church.",
    status: "published",
    access_level: "free"
  },
  {
    name: "James, Son of Zebedee",
    short_title: "James",
    slug: "james-son-of-zebedee",
    entity_type: "person",
    summary: "One of the Twelve Apostles of Jesus, brother of John, a fisherman called by Jesus by the Sea of Galilee.",
    status: "published",
    access_level: "free"
  },
  {
    name: "John the Apostle",
    short_title: "John",
    slug: "john-the-apostle",
    entity_type: "person",
    summary: "One of the Twelve Apostles of Jesus, known as the beloved disciple, author of the Gospel of John and Revelation.",
    status: "published",
    access_level: "free"
  },
  {
    name: "Joseph",
    short_title: "Joseph",
    slug: "joseph-husband-of-mary",
    entity_type: "person",
    summary: "The earthly father of Jesus Christ and husband of Mary, a righteous carpenter from Nazareth of the lineage of David.",
    status: "published",
    access_level: "free"
  },
  {
    name: "Judas Iscariot",
    short_title: "Judas",
    slug: "judas-iscariot",
    entity_type: "person",
    summary: "One of the Twelve Apostles who betrayed Jesus to the chief priests for thirty pieces of silver.",
    status: "published",
    access_level: "free"
  }
];

async function runFix() {
  console.log("=== 1. ENSURING CANONICAL ENTITIES EXIST ===");
  for (const ent of newEntitiesToInsert) {
    const { data: existing } = await supabase
      .from('bible_entities')
      .select('id, slug, name')
      .eq('slug', ent.slug)
      .single();

    if (!existing) {
      const { data: inserted, error } = await supabase
        .from('bible_entities')
        .insert(ent)
        .select()
        .single();

      if (error) {
        console.error(`Failed to insert entity ${ent.slug}:`, error);
      } else {
        console.log(`Created entity: "${inserted.name}" (${inserted.slug}, ID: ${inserted.id})`);
      }
    } else {
      console.log(`Entity already exists: "${existing.name}" (${existing.slug}, ID: ${existing.id})`);
    }
  }

  // Load all entities into a lookup map by slug & ID
  const { data: allEntities } = await supabase.from('bible_entities').select('*');
  const entityBySlug = new Map();
  allEntities.forEach(e => entityBySlug.set(e.slug, e));

  console.log("\n=== 2. FIXING CHAPTER CONTENT BLOCKS ===");
  const { data: chapters } = await supabase.from('bible_chapters').select('*');

  for (const chap of chapters) {
    console.log(`\nProcessing Chapter ${chap.chapter_number}: "${chap.title}" (${chap.slug})...`);
    let blocks = chap.content_blocks || [];
    let updated = false;

    blocks = blocks.map(b => {
      if (b.type === 'rich_text' && b.content) {
        let content = b.content;

        // Replace incorrect entity tags with correct UUIDs
        const replacements = [
          { pattern: /\[\[entity:[^:|]+\:concept\|Kingdom of God\]\]/g, targetSlug: 'kingdom-of-god', type: 'concept', label: 'Kingdom of God' },
          { pattern: /\[\[entity:[^:|]+\:person\|Peter\]\]/g, targetSlug: 'simon-peter', type: 'person', label: 'Peter' },
          { pattern: /\[\[entity:[^:|]+\:person\|James\]\]/g, targetSlug: 'james-son-of-zebedee', type: 'person', label: 'James' },
          { pattern: /\[\[entity:[^:|]+\:person\|John\]\]/g, targetSlug: 'john-the-apostle', type: 'person', label: 'John' },
          { pattern: /\[\[entity:[^:|]+\:explainer\|Parable of the Good Samaritan\]\]/g, targetSlug: 'parable-of-good-samaritan', type: 'explainer', label: 'Parable of the Good Samaritan' },
          { pattern: /\[\[entity:[^:|]+\:concept\|five thousand\]\]/g, targetSlug: 'feeding-of-5000', type: 'event', label: 'five thousand' },
          { pattern: /\[\[entity:[^:|]+\:person\|Joseph\]\]/g, targetSlug: 'joseph-husband-of-mary', type: 'person', label: 'Joseph' },
          { pattern: /\[\[entity:[^:|]+\:person\|Judas\]\]/g, targetSlug: 'judas-iscariot', type: 'person', label: 'Judas' }
        ];

        replacements.forEach(r => {
          const target = entityBySlug.get(r.targetSlug);
          if (target) {
            const newToken = `[[entity:${target.id}:${r.type}|${r.label}]]`;
            if (content.match(r.pattern)) {
              content = content.replace(r.pattern, newToken);
              updated = true;
            }
          }
        });

        return { ...b, content };
      }

      if (b.type === 'entity_callout') {
        let targetSlug = null;
        if (b.custom_headline?.includes("John the Baptist")) targetSlug = "john-the-baptist";
        else if (b.custom_headline?.includes("Good Samaritan")) targetSlug = "parable-of-good-samaritan";
        else if (b.custom_headline?.includes("Feeding of the Five Thousand")) targetSlug = "feeding-of-5000";
        else if (b.custom_headline?.includes("Mary")) targetSlug = "mary-mother-of-jesus";
        else if (b.custom_headline?.includes("Resurrection")) targetSlug = "jesus-resurrection";

        if (targetSlug) {
          const target = entityBySlug.get(targetSlug);
          if (target && b.entity_id !== target.id) {
            updated = true;
            return { ...b, entity_id: target.id, entity_type: target.entity_type };
          }
        }
      }

      return b;
    });

    if (updated) {
      console.log(`Updating chapter ${chap.chapter_number} content_blocks in Supabase...`);
      const { error: updateErr } = await supabase
        .from('bible_chapters')
        .update({ content_blocks: blocks })
        .eq('id', chap.id);

      if (updateErr) {
        console.error(`Error updating chapter ${chap.id}:`, updateErr);
      } else {
        console.log(`Chapter ${chap.chapter_number} successfully updated!`);
      }
    } else {
      console.log(`No changes needed for Chapter ${chap.chapter_number}.`);
    }
  }
}

runFix();
