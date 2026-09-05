import { createClient } from "@supabase/supabase-js";

const MODEL_PRICING: Record<string, { inputPer1M: number; outputPer1M: number }> = {
  "gpt-4o-mini": { inputPer1M: 0.15, outputPer1M: 0.60 },
  "gpt-4o": { inputPer1M: 2.50, outputPer1M: 10.00 },
  "tts-1": { inputPer1M: 15.00, outputPer1M: 0 }, // $15 per 1M characters
  "tts-1-hd": { inputPer1M: 30.00, outputPer1M: 0 }, // $30 per 1M characters
};

export function calculateEstimatedCostUsd(
  model: string,
  inputTokensOrChars?: number | null,
  outputTokens?: number | null
): number | null {
  if (model.startsWith("gpt-image-")) {
    if (model === "gpt-image-2") return 0.08;
    if (model === "gpt-image-1.5") return 0.04;
    if (model === "gpt-image-1-mini") return 0.02;
    return 0.04;
  }

  if (inputTokensOrChars == null) return null;
  const pricing = MODEL_PRICING[model] || MODEL_PRICING["gpt-4o-mini"];
  const inputCost = (inputTokensOrChars / 1_000_000) * pricing.inputPer1M;
  const outputCost = outputTokens != null ? (outputTokens / 1_000_000) * pricing.outputPer1M : 0;
  return Number((inputCost + outputCost).toFixed(8));
}

export async function safeLogAdminAiUsage(logData: {
  installation_id?: string | null;
  feature: string; // e.g. 'daily_prayer' | 'audio_narration'
  provider?: string;
  model: string;
  input_tokens?: number | null; // or char count for TTS
  output_tokens?: number | null;
  total_tokens?: number | null;
  status: "success" | "failed";
  error_code?: string | null;
  request_id?: string | null;
}) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) return;

    const supabase = createClient(url, key);
    const estimatedCostUsd = logData.status === "success"
      ? calculateEstimatedCostUsd(logData.model, logData.input_tokens, logData.output_tokens)
      : 0;

    const { error } = await supabase.from("ai_usage_logs").insert([
      {
        installation_id: logData.installation_id || null,
        feature: logData.feature,
        provider: logData.provider || "openai",
        model: logData.model,
        input_tokens: logData.input_tokens ?? null,
        output_tokens: logData.output_tokens ?? null,
        total_tokens: logData.total_tokens ?? null,
        estimated_cost_usd: estimatedCostUsd,
        status: logData.status,
        error_code: logData.error_code || null,
        request_id: logData.request_id || null,
      },
    ]);

    if (error) {
      console.error("Failed to insert admin AI usage log:", error.message);
    }
  } catch (err) {
    console.error("Exception in safeLogAdminAiUsage:", err);
  }
}
