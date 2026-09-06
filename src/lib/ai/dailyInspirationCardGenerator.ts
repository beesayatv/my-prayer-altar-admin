import "server-only";
import { safeLogAdminAiUsage } from "./aiLogger";
import { runtimeEnv } from "@/lib/runtimeEnv";

export async function generateDailyInspirationCard(input: {
  instruction: string;
  visualDirection?: string;
  model?: string;
  aspectRatio?: string;
  footerText?: string;
  borderStyle?: string;
}) {
  const apiKey = runtimeEnv("OPENAI_API_KEY");
  if (!apiKey) throw new Error("Image generation is not configured.");

  const model = input.model || "gpt-image-2";
  const aspectRatio = input.aspectRatio || "4:5";

  let apiSize = "1024x1536";
  let cardType = "vertical devotional social card";
  let cropInstructions = "Compose the complete image for a 4:5 canvas. Keep every word comfortably inside that canvas with generous margins.";

  if (aspectRatio === "16:9") {
    apiSize = "1536x1024";
    cardType = "horizontal landscape devotional card";
    cropInstructions = "Compose the complete image for a 16:9 canvas. Keep every word comfortably inside that canvas with generous margins.";
  } else if (aspectRatio === "9:16") {
    apiSize = "1024x1536";
    cardType = "vertical story/portrait devotional card";
    cropInstructions = "Compose the complete image for a 9:16 canvas. Keep every word comfortably inside that canvas with generous margins.";
  }

  const instruction = input.instruction.trim();
  const footer = input.footerText?.trim() ?? "MY PRAYER ALTAR";

  const borderInstruction = (() => {
    switch (input.borderStyle) {
      case "thin": return "Add a clean, thin solid border (2–3px) in a neutral or complementary colour around the full edge of the card.";
      case "decorative": return "Add an ornate decorative border — thin gold or aged-parchment filigree, with delicate corner flourishes — that frames the card elegantly without overwhelming the content.";
      case "glow": return "Add a soft glowing inner-edge border — a subtle luminous halo in warm gold or white that blends into the background — giving the card a radiant, sacred quality.";
      case "none": return "Do not add any border, frame, or edge decoration to the card.";
      default: return null; // no explicit instruction — let the model decide
    }
  })();

  const prompt = [
    `Create one finished ${cardType} for My Prayer Altar.`,
    cropInstructions,
    "Use a refined, reverent Catholic-inspired visual style. Treat the user's instruction as the primary creative direction.",
    "If the user's instruction includes text in quotation marks, reproduce the quoted text verbatim as the main message: do not correct, shorten, paraphrase, translate, add quotation marks, or add other message text.",
    "If no exact quoted text is supplied, compose one short, memorable original Christian reflection for the image.",
    "Do not attribute the reflection to Scripture, a saint, or any person. Do not invent a Scripture reference.",
    footer
      ? `The only additional text permitted is the small footer at the bottom of the card: ${footer}.`
      : "Do not add any footer, watermark, attribution, or branding text to the card.",
    "Do not add a title, a DAILY INSPIRATION heading, a Scripture reference, a watermark, UI, or logo.",
    borderInstruction,
    input.visualDirection?.trim() ? `Visual direction: ${input.visualDirection.trim().slice(0, 600)}.` : "Visual direction: quiet, warm, contemplative, editorial, and elegant.",
    `Card instruction:\n${instruction}`,
  ].filter(Boolean).join("\n\n");

  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, prompt, size: apiSize, quality: "medium", output_format: "webp", output_compression: 92, n: 1 }),
  });
  const requestId = response.headers.get("x-request-id") || null;
  if (!response.ok) {
    await safeLogAdminAiUsage({ feature: "daily_inspiration_card", model, status: "failed", error_code: `openai_http_${response.status}`, request_id: requestId });
    throw new Error("The image service could not create this card.");
  }

  const data = await response.json() as { data?: Array<{ b64_json?: string }> };
  const encoded = data.data?.[0]?.b64_json;
  if (!encoded) throw new Error("The image service returned no card image.");
  await safeLogAdminAiUsage({ feature: "daily_inspiration_card", model, status: "success", request_id: requestId });
  // Keep the WebP data returned by GPT Image unchanged: sharp is a native Node module
  // and cannot run in the Cloudflare Worker runtime. The requested image size and
  // prompt above preserve the selected card composition without server-side crop.
  return { buffer: Buffer.from(encoded, "base64"), mimeType: "image/webp", fileExtension: "webp" };
}
