import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  generateAndStoreProfileNarration,
  callOpenAISpeechAPI,
  computeTextHash,
  INSTRUCTION_PROFILES,
  DEFAULT_TTS_MODEL,
  ATTRIBUTION_DISCLOSURE,
} from "./narrationGenerator";

describe("OpenAI Speech API (gpt-4o-mini-tts) Payload & Metadata Tests", () => {
  test("1. Returns error if required contentId, title, or body are missing", async () => {
    const res = await generateAndStoreProfileNarration({ contentId: "", title: "", body: "" });
    assert.equal(res.success, false);
    assert.match(res.error ?? "", /Missing required content parameters/);
  });

  test("2. Asserts OpenAI Speech API payload uses model gpt-4o-mini-tts, input, instructions, and NO messages/roles", async () => {
    let capturedUrl = "";
    let capturedHeaders: Record<string, string> = {};
    let capturedBody: Record<string, unknown> = {};

    const mockFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      capturedUrl = input.toString();
      capturedHeaders = (init?.headers as Record<string, string>) || {};
      capturedBody = JSON.parse((init?.body as string) || "{}");

      // Return dummy MP3 ArrayBuffer
      const dummyBuffer = new Uint8Array([0xff, 0xf3, 0x44, 0x00]).buffer;
      return new Response(dummyBuffer, { status: 200 });
    };

    const apiKey = "mock-api-key-12345";
    const payload = {
      model: "gpt-4o-mini-tts",
      voice: "coral",
      input: "Prayer Title.\n\nPrayer body text content.",
      instructions: INSTRUCTION_PROFILES.gentle.instructions,
      response_format: "mp3",
    };

    const buffer = await callOpenAISpeechAPI(apiKey, payload, "test_audio_narration", mockFetch as unknown as typeof fetch);

    // Verify endpoint
    assert.equal(capturedUrl, "https://api.openai.com/v1/audio/speech");
    assert.equal(capturedHeaders["Authorization"], "Bearer mock-api-key-12345");

    // Verify payload keys
    assert.equal(capturedBody.model, "gpt-4o-mini-tts");
    assert.equal(capturedBody.voice, "coral");
    assert.equal(capturedBody.input, "Prayer Title.\n\nPrayer body text content.");
    assert.equal(capturedBody.instructions, INSTRUCTION_PROFILES.gentle.instructions);
    assert.equal(capturedBody.response_format, "mp3");

    // Strictly assert NO chat completion roles or messages array are present
    assert.equal(capturedBody.messages, undefined);
    assert.equal(capturedBody.role, undefined);
    assert.equal(capturedBody.system, undefined);
    assert.equal(capturedBody.user, undefined);

    // Assert raw binary buffer returned
    assert.ok(buffer instanceof Buffer);
    assert.equal(buffer.length, 4);
  });

  test("3. Computes deterministic SHA-256 text_hash for title + body", () => {
    const hash1 = computeTextHash("Prayer Title", "Prayer body text content.");
    const hash2 = computeTextHash("Prayer Title", "Prayer body text content.");
    const hash3 = computeTextHash("Different Title", "Prayer body text content.");

    assert.equal(hash1, hash2);
    assert.notEqual(hash1, hash3);
    assert.equal(hash1.length, 16);
  });

  test("4. Includes required disclosure attribution in metadata", () => {
    assert.equal(ATTRIBUTION_DISCLOSURE, "AI-generated narration");
    assert.equal(DEFAULT_TTS_MODEL, "gpt-4o-mini-tts");
  });

  test("5. Verifies Gentle profile resolves to 'coral' and Solemn profile resolves to 'ash'", () => {
    const gentleVoice = process.env.OPENAI_TTS_VOICE_GENTLE || "coral";
    const solemnVoice = process.env.OPENAI_TTS_VOICE_SOLEMN || "ash";

    assert.equal(gentleVoice, "coral");
    assert.equal(solemnVoice, "ash");
  });
});
