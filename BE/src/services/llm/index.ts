import type { GenerateSentencesInput, LlmClient } from "./types.js";
import { createGeminiClient } from "./geminiClient.js";
import { createOllamaClient } from "./ollamaClient.js";

let client: LlmClient | null = null;

function buildProvider(name: string, options?: { model?: string; asReviewer?: boolean }): LlmClient {
  switch (name) {
    case "ollama":
      return createOllamaClient(options);
    case "gemini":
    case "":
      return createGeminiClient(options);
    default:
      console.warn(`[LLM] Unknown provider "${name}", falling back to gemini`);
      return createGeminiClient(options);
  }
}

function createLlmClient(): LlmClient {
  const provider = (process.env.LLM_PROVIDER || "gemini").trim().toLowerCase();
  const base = buildProvider(provider);

  // Optional per-task override. Sentence decomposition (splitting components, per-word
  // translations, meaning-segment alignment) is the hardest LLM task here and benefits from
  // a stronger model, so it can be routed away from the bulk-task model.
  //
  // Two independent knobs:
  //   LLM_SENTENCES_PROVIDER  - different provider, e.g. gemini while the rest runs ollama
  //   OLLAMA_SENTENCES_MODEL  - different ollama model, e.g. qwen2.5:14b while the rest
  //                             runs a smaller one. Previously impossible: the provider
  //                             check below only fired when the provider name differed, and
  //                             every ollama client shared one module-level OLLAMA_MODEL.
  const sentencesProvider = (process.env.LLM_SENTENCES_PROVIDER || provider).trim().toLowerCase();
  const sentencesModel = (process.env.OLLAMA_SENTENCES_MODEL || "").trim();
  const providerDiffers = sentencesProvider !== provider;
  const modelDiffers = sentencesProvider === "ollama" && Boolean(sentencesModel);

  let client = base;
  if (providerDiffers || modelDiffers) {
    const sentencesClient = buildProvider(sentencesProvider, modelDiffers ? { model: sentencesModel } : undefined);
    console.info("[LLM] Routing generateSentences to a dedicated client", {
      baseProvider: provider,
      baseModel: base.modelName,
      sentencesProvider,
      sentencesModel: sentencesClient.modelName
    });
    client = {
      ...base,
      generateSentences: (input: GenerateSentencesInput) => sentencesClient.generateSentences(input),
      // Proverbs ride the sentence model too. They are the same job as sentence generation --
      // free-form target-language prose that has to mean what its translation claims -- and
      // the bulk-task model was inventing them (a "proverb" glossed as "give me three pieces
      // of cloth" whose text said nothing of the sort).
      generateProverbs: (input: Parameters<LlmClient["generateProverbs"]>[0]) =>
        sentencesClient.generateProverbs(input)
    };
  }

  // Optional second-opinion reviewer. Off unless LLM_REVIEW_MODEL is set, so nothing changes
  // for existing setups. The reviewer must not be the model that writes the sentences: a
  // model cannot catch its own systematic bias (gemma4:12b rates its own toneless "Elo" as
  // correct 5/5), so an identical model is refused rather than silently rubber-stamping.
  const reviewModel = (process.env.LLM_REVIEW_MODEL || "").trim();
  if (reviewModel) {
    const generatorModel = client.generateSentences === base.generateSentences ? base.modelName : sentencesModel || base.modelName;
    if (reviewModel === generatorModel) {
      console.warn("[LLM] LLM_REVIEW_MODEL equals the sentence generation model; review disabled", {
        reviewModel
      });
    } else {
      const reviewer = buildProvider(
        (process.env.LLM_REVIEW_PROVIDER || "ollama").trim().toLowerCase(),
        { model: reviewModel, asReviewer: true }
      );
      if (typeof reviewer.reviewTonation === "function") {
        console.info("[LLM] Tone review enabled", {
          generatorModel,
          reviewModel: reviewer.modelName
        });
        client = { ...client, reviewTonation: reviewer.reviewTonation.bind(reviewer) };
      } else {
        console.warn("[LLM] Review provider does not support reviewTonation; review disabled");
      }
    }
  }

  return client;
}

export function getLlmClient(): LlmClient {
  if (!client) {
    client = createLlmClient();
  }
  return client;
}
