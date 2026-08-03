import type { Request, Response } from "express";
import { DrizzleLanguageRepository } from "../infrastructure/db/drizzle/repositories/DrizzleLanguageRepository.js";

const languages = new DrizzleLanguageRepository();

function serializeLanguage(language: Awaited<ReturnType<DrizzleLanguageRepository["listActive"]>>[number]) {
  return {
    id: language.id,
    code: language.code,
    name: language.name,
    nativeName: language.nativeName,
    status: language.status,
    orderIndex: language.orderIndex,
    locale: language.locale,
    region: language.region,
    branding: language.branding,
    speechConfig: language.speechConfig,
    learningConfig: language.learningConfig
  };
}

export async function listLanguages(_req: Request, res: Response) {
  try {
    const result = await languages.listActive();

    return res.status(200).json({
      total: result.length,
      languages: result.map(serializeLanguage)
    });
  } catch (error) {
    console.error("Language list error", error);
    return res.status(500).json({ error: "Failed to list languages." });
  }
}
