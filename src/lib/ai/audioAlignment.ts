export type SentenceCue = { sentence_index: number; start_ms: number; end_ms: number };

export async function alignNarrationAudio(audio: Buffer, sentences: string[]): Promise<SentenceCue[]> {
  const endpoint = process.env.AUDIO_ALIGNMENT_SERVICE_URL;
  const token = process.env.AUDIO_ALIGNMENT_SERVICE_TOKEN;
  if (!endpoint || !token) return [];
  const form = new FormData();
  form.append("audio", new Blob([Uint8Array.from(audio)], { type: "audio/mpeg" }), "narration.mp3");
  form.append("sentences", JSON.stringify(sentences));
  const response = await fetch(endpoint, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
  if (!response.ok) return [];
  const payload = await response.json() as { cues?: SentenceCue[] };
  const cues = payload.cues ?? [];
  return cues.length === sentences.length && cues.every((cue, index) => cue.sentence_index === index && cue.start_ms >= 0 && cue.end_ms > cue.start_ms) ? cues : [];
}
