"use client";

import { useEffect, useRef, useState } from "react";
import { Field } from "@/components/ContentEditor";
import { requireSupabase } from "@/lib/supabase";
import { MarkdownFormattingGuide } from "@/components/MarkdownFormattingGuide";

type BibleMetadata = Record<string, unknown>;
type Book = { book_slug: string; book_name: string };
type Chapter = { chapter: number };
type Verse = { verse: number };

type GeneratedDraft = {
  title: string;
  excerpt: string;
  body: string;
  metadata: BibleMetadata;
};

function text(metadata: BibleMetadata, key: string) {
  const value = metadata[key];
  return typeof value === "string" ? value : "";
}

const BIBLE_BOOKS: Book[] = [
  { book_slug: "genesis", book_name: "Genesis" },
  { book_slug: "exodus", book_name: "Exodus" },
  { book_slug: "leviticus", book_name: "Leviticus" },
  { book_slug: "numbers", book_name: "Numbers" },
  { book_slug: "deuteronomy", book_name: "Deuteronomy" },
  { book_slug: "joshua", book_name: "Joshua" },
  { book_slug: "judges", book_name: "Judges" },
  { book_slug: "ruth", book_name: "Ruth" },
  { book_slug: "1-samuel", book_name: "1 Samuel" },
  { book_slug: "2-samuel", book_name: "2 Samuel" },
  { book_slug: "1-kings", book_name: "1 Kings" },
  { book_slug: "2-kings", book_name: "2 Kings" },
  { book_slug: "1-chronicles", book_name: "1 Chronicles" },
  { book_slug: "2-chronicles", book_name: "2 Chronicles" },
  { book_slug: "ezra", book_name: "Ezra" },
  { book_slug: "nehemiah", book_name: "Nehemiah" },
  { book_slug: "tobit", book_name: "Tobit" },
  { book_slug: "judith", book_name: "Judith" },
  { book_slug: "esther-greek", book_name: "Esther (Greek)" },
  { book_slug: "1-maccabees", book_name: "1 Maccabees" },
  { book_slug: "2-maccabees", book_name: "2 Maccabees" },
  { book_slug: "job", book_name: "Job" },
  { book_slug: "psalms", book_name: "Psalms" },
  { book_slug: "proverbs", book_name: "Proverbs" },
  { book_slug: "ecclesiastes", book_name: "Ecclesiastes" },
  { book_slug: "song-of-solomon", book_name: "Song of Solomon" },
  { book_slug: "wisdom-of-solomon", book_name: "Wisdom of Solomon" },
  { book_slug: "sirach", book_name: "Sirach" },
  { book_slug: "isaiah", book_name: "Isaiah" },
  { book_slug: "jeremiah", book_name: "Jeremiah" },
  { book_slug: "lamentations", book_name: "Lamentations" },
  { book_slug: "baruch", book_name: "Baruch" },
  { book_slug: "ezekiel", book_name: "Ezekiel" },
  { book_slug: "daniel-greek", book_name: "Daniel (Greek)" },
  { book_slug: "hosea", book_name: "Hosea" },
  { book_slug: "joel", book_name: "Joel" },
  { book_slug: "amos", book_name: "Amos" },
  { book_slug: "obadiah", book_name: "Obadiah" },
  { book_slug: "jonah", book_name: "Jonah" },
  { book_slug: "micah", book_name: "Micah" },
  { book_slug: "nahum", book_name: "Nahum" },
  { book_slug: "habakkuk", book_name: "Habakkuk" },
  { book_slug: "zephaniah", book_name: "Zephaniah" },
  { book_slug: "haggai", book_name: "Haggai" },
  { book_slug: "zechariah", book_name: "Zechariah" },
  { book_slug: "malachi", book_name: "Malachi" },
  { book_slug: "matthew", book_name: "Matthew" },
  { book_slug: "mark", book_name: "Mark" },
  { book_slug: "luke", book_name: "Luke" },
  { book_slug: "john", book_name: "John" },
  { book_slug: "acts", book_name: "Acts" },
  { book_slug: "romans", book_name: "Romans" },
  { book_slug: "1-corinthians", book_name: "1 Corinthians" },
  { book_slug: "2-corinthians", book_name: "2 Corinthians" },
  { book_slug: "galatians", book_name: "Galatians" },
  { book_slug: "ephesians", book_name: "Ephesians" },
  { book_slug: "philippians", book_name: "Philippians" },
  { book_slug: "colossians", book_name: "Colossians" },
  { book_slug: "1-thessalonians", book_name: "1 Thessalonians" },
  { book_slug: "2-thessalonians", book_name: "2 Thessalonians" },
  { book_slug: "1-timothy", book_name: "1 Timothy" },
  { book_slug: "2-timothy", book_name: "2 Timothy" },
  { book_slug: "titus", book_name: "Titus" },
  { book_slug: "philemon", book_name: "Philemon" },
  { book_slug: "hebrews", book_name: "Hebrews" },
  { book_slug: "james", book_name: "James" },
  { book_slug: "1-peter", book_name: "1 Peter" },
  { book_slug: "2-peter", book_name: "2 Peter" },
  { book_slug: "1-john", book_name: "1 John" },
  { book_slug: "2-john", book_name: "2 John" },
  { book_slug: "3-john", book_name: "3 John" },
  { book_slug: "jude", book_name: "Jude" },
  { book_slug: "revelation", book_name: "Revelation" },
];

export function BibleReadingFields({
  metadata,
  initialExcerpt,
  initialBody,
  onApplyGenerated,
}: {
  metadata: BibleMetadata;
  initialExcerpt?: string;
  initialBody?: string;
  onApplyGenerated: (draft: GeneratedDraft) => void;
}) {
  const [mode, setMode] = useState<"choose_for_me" | "theme" | "specific">("choose_for_me");
  const [theme, setTheme] = useState(text(metadata, "theme"));
  const [books, setBooks] = useState<Book[]>(BIBLE_BOOKS);
  const [chapters, setChapters] = useState<number[]>([]);
  const [verses, setVerses] = useState<number[]>([]);
  const [bookSlug, setBookSlug] = useState("");
  const [chapter, setChapter] = useState("");
  const [startVerse, setStartVerse] = useState("");
  const [endVerse, setEndVerse] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState("");
  const [scriptureReference, setScriptureReference] = useState(text(metadata, "scripture_reference"));
  const [scriptureText, setScriptureText] = useState(text(metadata, "scripture_text"));
  const [scriptureVersesJson, setScriptureVersesJson] = useState(text(metadata, "scripture_verses_json"));
  const [excerpt, setExcerpt] = useState(initialExcerpt ?? "");
  const [introduction, setIntroduction] = useState(text(metadata, "introduction"));
  const [reflection, setReflection] = useState(initialBody ?? text(metadata, "reflection"));
  const [reflectionHighlight, setReflectionHighlight] = useState(text(metadata, "reflection_highlight"));
  const [reflectionQuestion, setReflectionQuestion] = useState(text(metadata, "reflection_question"));
  const [closingPrayer, setClosingPrayer] = useState(text(metadata, "closing_prayer"));
  const reflectionTextareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!bookSlug) { setChapters([]); return; }
    let active = true;
    void requireSupabase().rpc("get_bible_chapters", { requested_book_slug: bookSlug }).then(({ data, error }) => {
      if (active && !error) setChapters(((data ?? []) as Chapter[]).map((item) => item.chapter));
    });
    return () => { active = false; };
  }, [bookSlug]);

  useEffect(() => {
    const selectedChapter = Number(chapter);
    if (!bookSlug || !selectedChapter) { setVerses([]); return; }
    let active = true;
    void requireSupabase().rpc("get_bible_verses_for_chapter", {
      requested_book_slug: bookSlug,
      requested_chapter: selectedChapter,
    }).then(({ data, error }) => {
      if (active && !error) setVerses(((data ?? []) as Verse[]).map((item) => item.verse));
    });
    return () => { active = false; };
  }, [bookSlug, chapter]);

  async function generate() {
    setGenerationError("");
    if (mode === "theme" && !theme.trim()) { setGenerationError("Enter a theme before generating."); return; }
    if (mode === "specific" && (!bookSlug || !chapter || !startVerse || !endVerse)) { setGenerationError("Choose a book, chapter, and verse range."); return; }
    setIsGenerating(true);
    try {
      const client = requireSupabase();
      let { data: { session } } = await client.auth.getSession();
      if (!session || (session.expires_at ?? 0) * 1000 <= Date.now() + 60_000) {
        const refreshed = await client.auth.refreshSession();
        session = refreshed.data.session;
      }
      if (!session?.access_token) throw new Error("Your Studio session has expired. Please sign in again.");

      const { data, error } = await client.functions.invoke("generate-bible-reading", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: mode === "specific"
          ? { mode, book_slug: bookSlug, chapter: Number(chapter), start_verse: Number(startVerse), end_verse: Number(endVerse) }
          : mode === "theme" ? { mode, theme: theme.trim() } : { mode },
      });
      const payload = data as { draft?: GeneratedDraft; error?: string } | null;
      if (error || !payload?.draft) throw new Error(payload?.error || "Generation failed.");
      const draft = payload.draft;
      const nextMetadata = draft.metadata;
      try {
        const rawJson = text(nextMetadata, "scripture_verses_json");
        if (rawJson) {
          const versesList = JSON.parse(rawJson) as Array<{ verse: number; text: string }>;
          if (versesList.length > 5) {
            const cappedVerses = versesList.slice(0, 5);
            nextMetadata.scripture_verses_json = JSON.stringify(cappedVerses);
            nextMetadata.scripture_text = cappedVerses.map(v => v.text).join(" ");
            const refFull = text(nextMetadata, "scripture_reference");
            const colonIdx = refFull.indexOf(":");
            if (colonIdx > 0) {
              const bookAndChap = refFull.substring(0, colonIdx);
              const startV = cappedVerses[0].verse;
              const endV = cappedVerses[cappedVerses.length - 1].verse;
              nextMetadata.scripture_reference = `${bookAndChap}:${startV}–${endV}`;
            }
          }
        }
      } catch (_) {}
      setScriptureReference(text(nextMetadata, "scripture_reference"));
      setScriptureText(text(nextMetadata, "scripture_text"));
      setScriptureVersesJson(text(nextMetadata, "scripture_verses_json"));
      setExcerpt(draft.excerpt);
      setIntroduction(text(nextMetadata, "introduction"));
      setReflection(draft.body);
      setReflectionHighlight(text(nextMetadata, "reflection_highlight"));
      setReflectionQuestion(text(nextMetadata, "reflection_question"));
      setClosingPrayer(text(nextMetadata, "closing_prayer"));
      setTheme(text(nextMetadata, "theme"));
      onApplyGenerated(draft);
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : "Could not generate Scripture & Reflection.");
    } finally {
      setIsGenerating(false);
    }
  }

  const hasReading = scriptureReference.length > 0 && scriptureText.length > 0;

  return <>
    <section className="card">
      <div className="flex flex-col gap-1 border-b border-line pb-3 mb-5">
        <p className="eyebrow">Passage selection</p>
        <h3 className="card-title">Begin with Scripture</h3>
        <p className="text-sm text-muted">The Bible library supplies the Scripture source. AI writes only the devotional reflection around it. <span className="inline-block font-semibold text-amber-800 dark:text-amber-300 mt-1">💡 Maximum of 5 verses per passage is recommended for optimal daily reading and social sharing.</span></p>
      </div>
      <div className="flex flex-col gap-3">
        <label className="flex items-start gap-3 cursor-pointer"><input type="radio" checked={mode === "choose_for_me"} onChange={() => setMode("choose_for_me")} /><span><strong>Choose for me</strong><small className="block text-muted">Select the least recently used passage from the curated library.</small></span></label>
        <label className="flex items-start gap-3 cursor-pointer"><input type="radio" checked={mode === "theme"} onChange={() => setMode("theme")} /><span><strong>Choose a theme</strong><small className="block text-muted">Choose a theme and My Prayer Altar will match it with a suitable passage from the curated Scripture library. Scripture text comes from the WEBC Bible database.</small></span></label>
        {mode === "theme" && <Field label="Theme"><div className="grid gap-2"><input className="input" value={theme} onChange={(event) => setTheme(event.target.value)} placeholder="e.g. Peace during anxiety" /><small className="text-muted">Try peace, anxiety, forgiveness, grief, hope, strength, trust, or guidance. You may combine two or three related words.</small></div></Field>}
        <label className="flex items-start gap-3 cursor-pointer"><input type="radio" checked={mode === "specific"} onChange={() => setMode("specific")} /><span><strong>Choose a specific passage</strong><small className="block text-muted">Select a single-chapter verse range from the Bible library.</small></span></label>
        {mode === "specific" && <div className="form-grid pt-2">
          <div className="form-columns"><Field label="Book"><select className="select" value={bookSlug} onChange={(event) => { setBookSlug(event.target.value); setChapter(""); setStartVerse(""); setEndVerse(""); }}><option value="">Select a book</option>{books.map((book) => <option key={book.book_slug} value={book.book_slug}>{book.book_name}</option>)}</select></Field><Field label="Chapter"><select className="select" value={chapter} disabled={!bookSlug} onChange={(event) => { setChapter(event.target.value); setStartVerse(""); setEndVerse(""); }}><option value="">Select a chapter</option>{chapters.map((value) => <option key={value} value={value}>{value}</option>)}</select></Field></div>
          <div className="form-columns"><Field label="Starting verse"><select className="select" value={startVerse} disabled={!chapter} onChange={(event) => { setStartVerse(event.target.value); if (Number(endVerse) < Number(event.target.value)) setEndVerse(event.target.value); }}><option value="">Select</option>{verses.map((value) => <option key={value} value={value}>{value}</option>)}</select></Field><Field label="Ending verse"><select className="select" value={endVerse} disabled={!chapter} onChange={(event) => setEndVerse(event.target.value)}><option value="">Select</option>{verses.filter((value) => value >= Number(startVerse || 0)).map((value) => <option key={value} value={value}>{value}</option>)}</select></Field></div>
        </div>}
      </div>
      {generationError && <p className="alert error mt-5" role="alert">{generationError}</p>}
      <button className="button mt-5" type="button" disabled={isGenerating} onClick={() => void generate()}>{isGenerating ? "Generating…" : hasReading ? "Change passage and regenerate" : "Generate Scripture & Reflection"}</button>
    </section>

    {hasReading && <>
      <section className="card bible-source-card">
        <details>
          <summary className="cursor-pointer font-medium text-ink">View Scripture source <span className="text-muted">(WEBC)</span></summary>
          <div className="mt-4">
            <p className="eyebrow">Scripture source</p>
            <h3 className="card-title">{scriptureReference}</h3>
            <Field label="Scripture text" help="This is source material from the Bible library and cannot be edited here. Change the passage above to regenerate."><textarea className="textarea min-h-40" name="scripture_text" value={scriptureText} readOnly /></Field>
          </div>
        </details>
        <input type="hidden" name="scripture_reference" value={scriptureReference} />
        <input type="hidden" name="scripture_verses_json" value={scriptureVersesJson} />
      </section>

      <section className="card">
        <p className="eyebrow">Devotional review</p>
        <h3 className="card-title">Edit the reflection</h3>
        <div className="form-grid">
          <Field label="Excerpt"><textarea className="textarea" name="excerpt" value={excerpt} onChange={(event) => setExcerpt(event.target.value)} /></Field>
          <Field label="Introduction"><textarea className="textarea" name="introduction" value={introduction} onChange={(event) => setIntroduction(event.target.value)} /></Field>
          <Field label="Reflection">
            <textarea
              ref={reflectionTextareaRef}
              className="textarea min-h-56"
              name="body"
              value={reflection}
              onChange={(event) => setReflection(event.target.value)}
            />
            <MarkdownFormattingGuide
              textareaRef={reflectionTextareaRef}
              value={reflection}
              onChange={(val) => setReflection(val)}
            />
          </Field>
          <Field label="Reflection question"><textarea className="textarea" name="reflection_question" value={reflectionQuestion} onChange={(event) => setReflectionQuestion(event.target.value)} /></Field>
          <Field label="Closing prayer"><textarea className="textarea" name="closing_prayer" value={closingPrayer} onChange={(event) => setClosingPrayer(event.target.value)} /></Field>
          <Field label="Theme"><input className="input" name="theme" value={theme} onChange={(event) => setTheme(event.target.value)} /></Field>
        </div>
        <input type="hidden" name="reflection_highlight" value={reflectionHighlight} />
      </section>
    </>}
  </>;
}

