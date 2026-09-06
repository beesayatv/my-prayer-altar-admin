import "server-only";
import { safeLogAdminAiUsage } from "./aiLogger";
import { runtimeEnv } from "@/lib/runtimeEnv";

export type DailyInspirationDraft = {
  title: string;
  quote_text: string;
  excerpt: string;
  focus_phrase: string;
  structure: "setup_payoff" | "rhythmic_lines" | "declaration" | "reflection";
};

const DEFAULT_PROMPT = `You write original, concise Christian reflections for My Prayer Altar.
Write with a quiet, intimate, contemplative Catholic/Christian voice. Be emotionally meaningful, natural, and suitable for sharing.
Never present the writing as Scripture, a saint quotation, or a quotation by anyone. Do not invent attribution. Avoid prosperity-gospel promises, preaching, generic motivational cliches, and claims that God will guarantee a material outcome.
Return only valid JSON with string keys title, quote_text, excerpt, focus_phrase, and structure.
focus_phrase must be an exact short phrase from quote_text. structure must be one of setup_payoff, rhythmic_lines, declaration, or reflection.`;

export async function generateDailyInspirationDraft(input: {
  theme?: string;
  targetWords: number;
  systemPrompt?: string;
  model?: string;
}): Promise<DailyInspirationDraft> {
  const apiKey = runtimeEnv("OPENAI_API_KEY");
  if (!apiKey) throw new Error("AI generation is not configured.");

  const model = input.model || "gpt-4o-mini";
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      temperature: 0.7,
      messages: [
        { role: "system", content: input.systemPrompt?.trim() || DEFAULT_PROMPT },
        {
          role: "user",
          content: `Create one Original Reflection of about ${input.targetWords} words.${input.theme?.trim() ? ` Theme: ${input.theme.trim()}.` : ""} The excerpt must be a concise preview of the reflection.`,
        },
      ],
    }),
  });

  const requestId = response.headers.get("x-request-id") || null;
  if (!response.ok) {
    await safeLogAdminAiUsage({ feature: "daily_inspiration", model, status: "failed", error_code: `openai_http_${response.status}`, request_id: requestId });
    throw new Error("The reflection could not be generated. Please try again.");
  }

  const data = await response.json();
  const raw = data.choices?.[0]?.message?.content;
  if (!raw) throw new Error("The AI service returned an empty reflection.");
  let parsed: Partial<DailyInspirationDraft>;
  try { parsed = JSON.parse(raw); } catch { throw new Error("The AI service returned an invalid reflection."); }
  if (!parsed.quote_text?.trim()) throw new Error("The AI service returned an incomplete reflection.");

  const quote = parsed.quote_text.trim();
  const wordCount = quote.split(/\s+/).length;
  if (wordCount < 8 || wordCount > Math.max(70, input.targetWords * 2)) {
    throw new Error("The generated reflection did not meet the requested length. Please regenerate it.");
  }

  await safeLogAdminAiUsage({
    feature: "daily_inspiration", model: data.model || model,
    input_tokens: data.usage?.prompt_tokens ?? null,
    output_tokens: data.usage?.completion_tokens ?? null,
    total_tokens: data.usage?.total_tokens ?? null,
    status: "success", request_id: requestId,
  });

  return {
    title: parsed.title?.trim() || "Daily Inspiration",
    quote_text: quote,
    focus_phrase: quote.includes(parsed.focus_phrase?.trim() || "") ? parsed.focus_phrase?.trim() || "" : "",
    structure: ["setup_payoff", "rhythmic_lines", "declaration", "reflection"].includes(parsed.structure || "") ? parsed.structure as DailyInspirationDraft["structure"] : "reflection",
    excerpt: parsed.excerpt?.trim() || quote.slice(0, 150) + (quote.length > 150 ? "…" : ""),
  };
}
