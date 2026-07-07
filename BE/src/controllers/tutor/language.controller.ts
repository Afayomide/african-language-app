import type { Response } from "express";
import type { AuthRequest } from "../../utils/authMiddleware.js";
import { MongooseLanguageRepository } from "../../infrastructure/db/mongoose/repositories/MongooseLanguageRepository.js";
import { MongooseTutorProfileRepository } from "../../infrastructure/db/mongoose/repositories/MongooseTutorProfileRepository.js";

const languages = new MongooseLanguageRepository();
const tutorProfiles = new MongooseTutorProfileRepository();

export async function listTutorLanguages(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const tutor = await tutorProfiles.findByUserId(req.user.id);
  if (!tutor || !tutor.isActive) {
    return res.status(403).json({ error: "Tutor account is pending activation." });
  }

  try {
    const result = (await languages.list()).filter((language) => language.status !== "archived");

    return res.status(200).json({
      total: result.length,
      languages: result.map((language) => ({
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
      }))
    });
  } catch (error) {
    console.error("Tutor language list error", error);
    return res.status(500).json({ error: "Failed to list tutor languages." });
  }
}
