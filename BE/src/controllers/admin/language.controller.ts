import type { Request, Response } from "express";
import { LANGUAGE_STATUS_VALUES } from "../../domain/entities/Language.js";
import type { LanguageEntity } from "../../domain/entities/Language.js";
import type { LanguageUpdateInput } from "../../domain/repositories/LanguageRepository.js";
import { DrizzleLanguageRepository } from "../../infrastructure/db/drizzle/repositories/DrizzleLanguageRepository.js";

const languages = new DrizzleLanguageRepository();

function isLanguageStatus(value: string): value is (typeof LANGUAGE_STATUS_VALUES)[number] {
  return LANGUAGE_STATUS_VALUES.includes(value as (typeof LANGUAGE_STATUS_VALUES)[number]);
}

function serializeLanguage(language: LanguageEntity) {
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
    learningConfig: language.learningConfig,
    createdAt: language.createdAt,
    updatedAt: language.updatedAt
  };
}

export async function listLanguagesAdmin(req: Request, res: Response) {
  const status = req.query.status ? String(req.query.status).trim().toLowerCase() : "all";

  if (status !== "all" && !isLanguageStatus(status)) {
    return res.status(400).json({ error: "Language status is invalid." });
  }

  try {
    const result = status === "all" ? await languages.list() : await languages.list({ status });
    return res.status(200).json({
      total: result.length,
      languages: result.map(serializeLanguage)
    });
  } catch (error) {
    console.error("Admin language list error", error);
    return res.status(500).json({ error: "Failed to list languages." });
  }
}

export async function updateLanguageAdmin(req: Request, res: Response) {
  const id = String(req.params.id || "").trim();
  if (!id) {
    return res.status(400).json({ error: "Language id is required." });
  }

  try {
    const existing = await languages.findById(id);
    if (!existing) {
      return res.status(404).json({ error: "Language not found." });
    }

    const update: LanguageUpdateInput = {};

    if (typeof req.body?.name === "string") {
      const name = req.body.name.trim();
      if (!name) return res.status(400).json({ error: "Language name is required." });
      update.name = name;
    }

    if (typeof req.body?.nativeName === "string") {
      const nativeName = req.body.nativeName.trim();
      if (!nativeName) return res.status(400).json({ error: "Language native name is required." });
      update.nativeName = nativeName;
    }

    if (req.body?.status !== undefined) {
      const status = String(req.body.status).trim().toLowerCase();
      if (!isLanguageStatus(status)) {
        return res.status(400).json({ error: "Language status is invalid." });
      }
      update.status = status;
    }

    if (req.body?.orderIndex !== undefined) {
      const orderIndex = Number(req.body.orderIndex);
      if (!Number.isFinite(orderIndex)) {
        return res.status(400).json({ error: "Language order index is invalid." });
      }
      update.orderIndex = Math.trunc(orderIndex);
    }

    if (typeof req.body?.locale === "string") {
      update.locale = req.body.locale.trim();
    }

    if (typeof req.body?.region === "string") {
      update.region = req.body.region.trim();
    }

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ error: "No valid language fields were provided." });
    }

    const updated = await languages.updateById(id, update);
    if (!updated) {
      return res.status(404).json({ error: "Language not found." });
    }

    return res.status(200).json({ language: serializeLanguage(updated) });
  } catch (error) {
    console.error("Admin language update error", error);
    return res.status(500).json({ error: "Failed to update language." });
  }
}
