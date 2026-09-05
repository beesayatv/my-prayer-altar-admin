import fs from "node:fs";
import path from "node:path";

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, "utf8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const [key, ...vals] = trimmed.split("=");
        if (key && vals.length > 0) {
          process.env[key.trim()] = vals.join("=").trim();
        }
      }
    }
  }
}

loadEnvLocal();

const SAMPLE_TEXT = `A Prayer for Grace and Peace. Heavenly Father, we humbly present our day to You. Grant us Your peace, illuminate our path, and strengthen our faith in all circumstances. Guide our words and actions so that we may bring glory to Your holy name. Amen.`;

const EVAL_VOICES = ["alloy", "ash", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer"];

const STYLES = [
  {
    profile: "gentle",
    instructions: "Read slowly, warmly, and prayerfully. Use a calm devotional tone, natural pauses between sentences, restrained emotion, and clear pronunciation. Do not sound theatrical or like an advertisement.",
  },
  {
    profile: "solemn",
    instructions: "Read in a reverent, measured, solemn tone. Use natural pauses and quiet conviction. Keep the delivery peaceful and restrained rather than dramatic, authoritative, or theatrical.",
  },
];

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("OPENAI_API_KEY missing in .env.local");
    process.exit(1);
  }

  const model = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";
  const currentDir = path.join(process.cwd(), "public", "samples", "audio", "current-model");

  if (!fs.existsSync(currentDir)) fs.mkdirSync(currentDir, { recursive: true });

  console.log(`Generating Current OpenAI Speech Model (${model}) Evaluation Samples...\n`);

  for (const voice of EVAL_VOICES) {
    for (const style of STYLES) {
      console.log(`Generating [${model}] voice: '${voice}' | profile: '${style.profile}'...`);
      
      const response = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          voice,
          input: SAMPLE_TEXT,
          instructions: style.instructions,
          response_format: "mp3",
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error(`Failed to generate sample for '${voice}' (${style.profile}):`, errText);
        continue;
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      const fileName = `sample-${voice}-${style.profile}.mp3`;
      const filePath = path.join(currentDir, fileName);
      fs.writeFileSync(filePath, buffer);
      console.log(`  Saved: public/samples/audio/current-model/${fileName} (${buffer.length} bytes)`);
    }
  }

  console.log("\nAll gpt-4o-mini-tts voice samples generated successfully!");
}

main().catch((err) => {
  console.error("Voice generation error:", err);
  process.exit(1);
});
