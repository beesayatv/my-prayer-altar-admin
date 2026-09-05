import { safeLogAdminAiUsage } from "./aiLogger";

export interface GenerateUpdateInput {
  url: string;
  textContent: string;
  length?: "short" | "standard" | "long";
}

export interface GeneratedUpdateResult {
  title: string;
  slug: string;
  excerpt: string;
  body: string;
}

export const UPDATE_SYSTEM_PROMPT = `
You are an editorial assistant for "My Prayer Altar", a Catholic devotional application.
Your mission is to extract and summarize news, events, or announcements into a draft "Update" based ONLY on the provided source text.

CRITICAL EDITORIAL STYLE RULES:
1. TONE: Professional, respectful, and suitable for a Catholic audience.
2. ACCURACY: Preserve factual accuracy. Do not invent information, dates, names, locations, quotations, or events. Base the draft ONLY on the retrieved source material.
3. UNKNOWN INFO: If critical information cannot be determined from the source, clearly indicate it or omit it rather than guessing.
4. NO EXTRA TEXT: Return ONLY a raw valid JSON object matching the requested schema. No markdown formatting outside the JSON, no code blocks, no conversational preamble.

SCHEMA REQUIREMENTS:
Return a JSON object with these exact string keys:
- "title": A clear, engaging headline for the update.
- "slug": A URL-friendly slug (lowercase, hyphenated, no special characters).
- "excerpt": A concise 1-2 sentence summary for a feed preview card.
- "body": The complete update text formatted into clean paragraphs.
`.trim();

export async function generateUpdateDraft(
  input: GenerateUpdateInput
): Promise<GeneratedUpdateResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY environment variable is missing on the server. Please set it in your server configuration."
    );
  }

  const targetLength =
    input.length === "short"
      ? "Short (~150 words)"
      : input.length === "long"
        ? "Long (~500 words)"
        : "Standard (~300 words)";

  const userPrompt = `
Compose a draft Update based ONLY on the following source text.

- Source URL: ${input.url}
- Target Length: ${targetLength}

SOURCE TEXT:
---
${input.textContent.slice(0, 30000)}
---

Ensure the response is ONLY valid JSON with keys: "title", "slug", "excerpt", "body".
`.trim();

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
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "update_schema",
            strict: true,
            schema: {
              type: "object",
              properties: {
                title: { type: "string" },
                slug: { type: "string" },
                excerpt: { type: "string" },
                body: { type: "string" }
              },
              required: ["title", "slug", "excerpt", "body"],
              additionalProperties: false
            }
          }
        },
        messages: [
          { role: "system", content: UPDATE_SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3, // Lower temperature for more factual extraction
      }),
    });
  } catch (err) {
    await safeLogAdminAiUsage({
      feature: "update_url_import",
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
      feature: "update_url_import",
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
      feature: "update_url_import",
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

  let parsed: Partial<GeneratedUpdateResult>;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    await safeLogAdminAiUsage({
      feature: "update_url_import",
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

  if (!parsed.title || !parsed.slug || !parsed.excerpt || !parsed.body) {
    await safeLogAdminAiUsage({
      feature: "update_url_import",
      model: usedModel,
      input_tokens: promptTokens,
      output_tokens: completionTokens,
      total_tokens: totalTokens,
      status: "failed",
      error_code: "missing_fields",
      request_id: requestId,
    });
    throw new Error("AI response was missing required fields.");
  }

  await safeLogAdminAiUsage({
    feature: "update_url_import",
    model: usedModel,
    input_tokens: promptTokens,
    output_tokens: completionTokens,
    total_tokens: totalTokens,
    status: "success",
    request_id: requestId,
  });

  return {
    title: parsed.title.trim(),
    slug: parsed.slug.trim(),
    excerpt: parsed.excerpt.trim(),
    body: parsed.body.trim(),
  };
}
