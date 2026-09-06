import { safeLogAdminAiUsage } from "./aiLogger";
import { runtimeEnv } from "@/lib/runtimeEnv";

export interface GeneratePrayerInput {
  intention: string;
  context?: string;
  language?: "en" | "ceb" | "fil";
  length?: "short" | "standard" | "long";
  inspiration?: string;
  recentTopics?: string[];
  systemPrompt?: string;
  model?: string;
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
  const configuredModel = input.model?.trim() || "gemini-2.5-flash";
  const isGemini = configuredModel.toLowerCase().startsWith("gemini");

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

  let rawContent: string | undefined;
  let promptTokens: number | null = null;
  let completionTokens: number | null = null;
  let totalTokens: number | null = null;
  let requestId: string | null = null;
  let providerName = isGemini ? "google" : "openai";

  if (isGemini) {
    const geminiApiKey = runtimeEnv("GEMINI_API_KEY");
    if (!geminiApiKey) {
      throw new Error(
        "GEMINI_API_KEY environment variable is missing on the server. Please set it in your server configuration."
      );
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${configuredModel}:generateContent?key=${geminiApiKey}`;

    const bodyPayload = {
      systemInstruction: {
        parts: [{ text: systemInstruction }],
      },
      contents: [
        {
          role: "user",
          parts: [{ text: userPrompt }],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.7,
      },
    };

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(bodyPayload),
      });
    } catch (err) {
      await safeLogAdminAiUsage({
        feature: "daily_prayer",
        provider: "google",
        model: configuredModel,
        status: "failed",
        error_code: "network_error",
      });
      throw err;
    }

    if (!response.ok) {
      const errText = await response.text();
      await safeLogAdminAiUsage({
        feature: "daily_prayer",
        provider: "google",
        model: configuredModel,
        status: "failed",
        error_code: `gemini_http_${response.status}`,
      });
      throw new Error(`Google Gemini API error (${response.status}): ${errText}`);
    }

    const geminiData = await response.json();
    promptTokens = geminiData.usageMetadata?.promptTokenCount ?? null;
    completionTokens = geminiData.usageMetadata?.candidatesTokenCount ?? null;
    totalTokens = geminiData.usageMetadata?.totalTokenCount ?? null;

    rawContent = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
  } else {
    // OpenAI routing
    const openAiApiKey = runtimeEnv("OPENAI_API_KEY");
    if (!openAiApiKey) {
      throw new Error(
        "OPENAI_API_KEY environment variable is missing on the server. Please set it in your server configuration."
      );
    }

    let response: Response;
    try {
      response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openAiApiKey}`,
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
        provider: "openai",
        model: configuredModel,
        status: "failed",
        error_code: "network_error",
      });
      throw err;
    }

    requestId = response.headers.get("x-request-id") || null;

    if (!response.ok) {
      const errText = await response.text();
      await safeLogAdminAiUsage({
        feature: "daily_prayer",
        provider: "openai",
        model: configuredModel,
        status: "failed",
        error_code: `openai_http_${response.status}`,
        request_id: requestId,
      });
      throw new Error(`OpenAI API error (${response.status}): ${errText}`);
    }

    const openAiData = await response.json();
    promptTokens = openAiData.usage?.prompt_tokens ?? null;
    completionTokens = openAiData.usage?.completion_tokens ?? null;
    totalTokens = openAiData.usage?.total_tokens ?? null;

    rawContent = openAiData.choices?.[0]?.message?.content;
  }

  if (!rawContent) {
    await safeLogAdminAiUsage({
      feature: "daily_prayer",
      provider: providerName,
      model: configuredModel,
      input_tokens: promptTokens,
      output_tokens: completionTokens,
      total_tokens: totalTokens,
      status: "failed",
      error_code: "empty_content",
      request_id: requestId,
    });
    throw new Error(`No content returned from ${providerName === "google" ? "Google Gemini" : "OpenAI"} service.`);
  }

  let parsed: Partial<GeneratedPrayerResult>;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    await safeLogAdminAiUsage({
      feature: "daily_prayer",
      provider: providerName,
      model: configuredModel,
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
      provider: providerName,
      model: configuredModel,
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
    provider: providerName,
    model: configuredModel,
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
