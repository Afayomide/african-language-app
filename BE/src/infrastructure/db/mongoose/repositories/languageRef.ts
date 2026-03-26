import LanguageModel from "../../../../models/Language.js";
import type { Language } from "../../../../domain/entities/Lesson.js";

export async function findLanguageIdByCode(code: Language): Promise<string | null> {
  const language = await LanguageModel.findOne({ code }).select("_id").lean();
  return language?._id ? String(language._id) : null;
}

export async function buildScopedLanguageQuery(input: {
  language?: Language;
  languageId?: string | null;
}): Promise<Record<string, unknown>> {
  if (input.languageId) {
    return {
      $or: [
        { languageId: input.languageId },
        ...(input.language ? [{ language: input.language }] : [])
      ]
    };
  }

  if (input.language) {
    return buildLanguageQuery(input.language);
  }

  return {};
}

export async function buildLanguageQuery(code: Language): Promise<Record<string, unknown>> {
  const languageId = await findLanguageIdByCode(code);
  if (!languageId) {
    return { language: code };
  }

  return {
    $or: [
      { languageId },
      { language: code }
    ]
  };
}
