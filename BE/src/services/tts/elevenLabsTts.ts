const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || "";
const ELEVENLABS_MODEL_ID = process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2";
const ELEVENLABS_OUTPUT_FORMAT = process.env.ELEVENLABS_OUTPUT_FORMAT || "mp3_44100_128";

function getExtensionFromOutputFormat(outputFormat: string) {
  if (outputFormat.startsWith("mp3")) return "mp3";
  if (outputFormat.startsWith("pcm")) return "wav";
  if (outputFormat.startsWith("ulaw")) return "wav";
  return "mp3";
}

export async function synthesizeSpeech(input: {
  text: string;
  voiceId: string;
  modelId?: string;
  outputFormat?: string;
}) {
  if (!ELEVENLABS_API_KEY) {
    console.error("Missing ELEVENLABS_API_KEY");
    throw new Error("Missing ELEVENLABS_API_KEY");
  }

  if (!input.voiceId) {
    throw new Error("Missing ElevenLabs voiceId");
  }

  const modelId = input.modelId ?? ELEVENLABS_MODEL_ID;
  const outputFormat = input.outputFormat ?? ELEVENLABS_OUTPUT_FORMAT;

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(input.voiceId)}?output_format=${encodeURIComponent(outputFormat)}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
        Accept: "audio/mpeg"
      },
      body: JSON.stringify({
        text: input.text,
        model_id: modelId,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75
        }
      })
    }
  );

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`ElevenLabs TTS failed (${response.status}): ${details}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    model: modelId,
    voice: input.voiceId,
    format: getExtensionFromOutputFormat(outputFormat)
  };
}
