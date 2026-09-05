import { safeLogAdminAiUsage } from "./aiLogger";

export interface GeneratePrayerInput {
  intention: string;
  context?: string;
  language?: "en" | "ceb" | "fil";
  length?: "short" | "standard" | "long";
  inspiration?: string;
  recentTopics?: string[];
  systemPrompt?: string;
}

export interface GeneratedPrayerResult {
  title: string;
  intention: string;
  excerpt: string;
  body: string;
}

export const DEFAULT_EDITORIAL_PROMPT = `
You are an editorial assistant for "My Prayer Altar", a Catholic devotional application.
Your mission is to compose written prayers for daily reflection.

CRITICAL EDITORIAL STYLE RULES:
1. TONE: Deeply reverent, humble, compassionate, hopeful, and authentically Catholic in spirit.
2. DOCTRINE: Doctrinally careful. Avoid claiming absolute certainty about God's secret will or promising guaranteed temporal miracles.
3. AUTHENTICITY: Do NOT invent quotations, make up fake saint quotes, or construct false scripture references.
4. QUALITY: The prose should be dignified, beautifully structured, and suitable for public devotional publication.
5. ENDING: End the final sentence smoothly with ", Amen." (e.g. "...through Christ our Lord, Amen.").
6. NO EXTRA TEXT: Return ONLY a raw valid JSON object matching the requested schema. No markdown formatting outside the JSON, no code blocks, no conversational preamble.

SCHEMA REQUIREMENTS:
Return a JSON object with these exact string keys:
- "title": A clear, inspiring prayer title (e.g. "A Prayer for Peace in Times of Anxiety").
- "intention": A refined 3-6 word intention summary.
- "excerpt": A concise 1-2 sentence summary for a feed preview card.
- "body": The complete written prayer text formatted into clean paragraphs, ending with ", Amen.".
`.trim();

export async function generatePrayerDraft(
  input: GeneratePrayerInput
): Promise<GeneratedPrayerResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY environment variable is missing on the server. Please set it in your server configuration."
    );
  }

  const langName =
    input.language === "ceb"
      ? "Cebuano"
      : input.language === "fil"
        ? "Filipino (Tagalog)"
        : "English";

  const targetLength =
    input.length === "short"
      ? "Short (~100 words)"
      : input.length === "long"
        ? "Long (~350 words)"
        : "Standard (~200 words)";

  const userPrompt = `
Compose a Daily Prayer draft based on the following specifications:

- Primary Intention: ${input.intention.trim()}
- Language: ${langName}
- Target Length: ${targetLength}
${input.context?.trim() ? `- Additional Context/Situation: ${input.context.trim()}` : ""}
${input.inspiration?.trim() ? `- Inspiration (Scripture/Saint/Theme): ${input.inspiration.trim()}` : ""}
${input.recentTopics && input.recentTopics.length > 0 ? `- AVOID REPEATING recent topics/titles: ${input.recentTopics.join("; ")}` : ""}

Ensure the response is ONLY valid JSON with keys: "title", "intention", "excerpt", "body".
`.trim();

  const systemInstruction = input.systemPrompt?.trim() || DEFAULT_EDITORIAL_PROMPT;
  const configuredModel = "gpt-4o-mini";
  let response: Response;

  try {
    response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: configuredModel,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemInstruction },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
      }),
    });
  } catch (err) {
    await safeLogAdminAiUsage({
      feature: "daily_prayer",
      model: configuredModel,
      status: "failed",
      error_code: "network_error",
    });
    throw err;
  }

  const requestId = response.headers.get("x-request-id") || null;

  if (!response.ok) {
    const errText = await response.text();
    await safeLogAdminAiUsage({
      feature: "daily_prayer",
      model: configuredModel,
      status: "failed",
      error_code: `openai_http_${response.status}`,
      request_id: requestId,
    });
    throw new Error(`OpenAI API error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const usedModel = data.model || configuredModel;
  const promptTokens = data.usage?.prompt_tokens ?? null;
  const completionTokens = data.usage?.completion_tokens ?? null;
  const totalTokens = data.usage?.total_tokens ?? null;

  const rawContent = data.choices?.[0]?.message?.content;
  if (!rawContent) {
    await safeLogAdminAiUsage({
      feature: "daily_prayer",
      model: usedModel,
      input_tokens: promptTokens,
      output_tokens: completionTokens,
      total_tokens: totalTokens,
      status: "failed",
      error_code: "empty_content",
      request_id: requestId,
    });
    throw new Error("No content returned from OpenAI service.");
  }

  let parsed: Partial<GeneratedPrayerResult>;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    await safeLogAdminAiUsage({
      feature: "daily_prayer",
      model: usedModel,
      input_tokens: promptTokens,
      output_tokens: completionTokens,
      total_tokens: totalTokens,
      status: "failed",
      error_code: "invalid_json",
      request_id: requestId,
    });
    throw new Error("Failed to parse AI response as valid JSON.");
  }

  if (!parsed.title || !parsed.body) {
    await safeLogAdminAiUsage({
      feature: "daily_prayer",
      model: usedModel,
      input_tokens: promptTokens,
      output_tokens: completionTokens,
      total_tokens: totalTokens,
      status: "failed",
      error_code: "missing_fields",
      request_id: requestId,
    });
    throw new Error("AI response was missing required 'title' or 'body' fields.");
  }

  await safeLogAdminAiUsage({
    feature: "daily_prayer",
    model: usedModel,
    input_tokens: promptTokens,
    output_tokens: completionTokens,
    total_tokens: totalTokens,
    status: "success",
    request_id: requestId,
  });

  return {
    title: parsed.title.trim(),
    intention: (parsed.intention || input.intention).trim(),
    excerpt: (parsed.excerpt || "").trim(),
    body: parsed.body.trim(),
  };
}
