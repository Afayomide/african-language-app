import type { Response } from "express";
import mongoose from "mongoose";
import { CurriculumBuildAgentService } from "../../application/services/CurriculumBuildAgentService.js";
import { CurriculumArchitectService } from "../../application/services/CurriculumArchitectService.js";
import { CurriculumCriticService } from "../../application/services/CurriculumCriticService.js";
import { CurriculumLessonPlannerService } from "../../application/services/CurriculumLessonPlannerService.js";
import { CurriculumMemoryService } from "../../application/services/CurriculumMemoryService.js";
import { CurriculumRefinerService } from "../../application/services/CurriculumRefinerService.js";
import { CurriculumUnitPlannerService } from "../../application/services/CurriculumUnitPlannerService.js";
import { AdminUnitAiContentUseCases } from "../../application/use-cases/admin/lesson-ai/AdminUnitAiContentUseCases.js";
import type { Level, Language } from "../../domain/entities/Lesson.js";
import { MongooseLanguageRepository } from "../../infrastructure/db/mongoose/repositories/MongooseLanguageRepository.js";
import { MongooseChapterRepository } from "../../infrastructure/db/mongoose/repositories/MongooseChapterRepository.js";
import { MongooseUnitRepository } from "../../infrastructure/db/mongoose/repositories/MongooseUnitRepository.js";
import { MongooseLessonRepository } from "../../infrastructure/db/mongoose/repositories/MongooseLessonRepository.js";
import { MongooseLessonContentItemRepository } from "../../infrastructure/db/mongoose/repositories/MongooseLessonContentItemRepository.js";
import { MongooseWordRepository } from "../../infrastructure/db/mongoose/repositories/MongooseWordRepository.js";
import { MongooseExpressionRepository } from "../../infrastructure/db/mongoose/repositories/MongooseExpressionRepository.js";
import { MongooseSentenceRepository } from "../../infrastructure/db/mongoose/repositories/MongooseSentenceRepository.js";
import { MongooseProverbRepository } from "../../infrastructure/db/mongoose/repositories/MongooseProverbRepository.js";
import { MongooseQuestionRepository } from "../../infrastructure/db/mongoose/repositories/MongooseQuestionRepository.js";
import { MongooseUnitContentItemRepository } from "../../infrastructure/db/mongoose/repositories/MongooseUnitContentItemRepository.js";
import { MongooseCurriculumBuildArtifactRepository } from "../../infrastructure/db/mongoose/repositories/MongooseCurriculumBuildArtifactRepository.js";
import { MongooseCurriculumBuildJobRepository } from "../../infrastructure/db/mongoose/repositories/MongooseCurriculumBuildJobRepository.js";
import { isValidLevel } from "../../interfaces/http/validators/ai.validators.js";
import { getCefrBandForLevel } from "../../application/services/cefrMapping.js";
import { getLlmClient } from "../../services/llm/index.js";
import type { AuthRequest } from "../../utils/authMiddleware.js";

const chapters = new MongooseChapterRepository();
const units = new MongooseUnitRepository();
const lessons = new MongooseLessonRepository();
const lessonContentItems = new MongooseLessonContentItemRepository();
const words = new MongooseWordRepository();
const expressions = new MongooseExpressionRepository();
const sentences = new MongooseSentenceRepository();
const proverbs = new MongooseProverbRepository();
const languages = new MongooseLanguageRepository();
const jobs = new MongooseCurriculumBuildJobRepository();
const buildArtifacts = new MongooseCurriculumBuildArtifactRepository();
const curriculumMemory = new CurriculumMemoryService(
  chapters,
  units,
  lessons,
  lessonContentItems,
  words,
  expressions,
  sentences,
  proverbs
);
const architect = new CurriculumArchitectService(chapters, languages, curriculumMemory, getLlmClient());
const unitPlanner = new CurriculumUnitPlannerService(units, lessons, getLlmClient());
const lessonPlanner = new CurriculumLessonPlannerService(lessons, units, getLlmClient());
const unitContentGenerator = new AdminUnitAiContentUseCases(
  lessons,
  words,
  expressions,
  sentences,
  chapters,
  lessonContentItems,
  new MongooseUnitContentItemRepository(),
  proverbs,
  new MongooseQuestionRepository(),
  units,
  getLlmClient()
);
const critic = new CurriculumCriticService();
const refiner = new CurriculumRefinerService(chapters, units, lessons, architect, unitPlanner, lessonPlanner);
const buildAgent = new CurriculumBuildAgentService(
  jobs,
  buildArtifacts,
  architect,
  chapters,
  units,
  lessons,
  unitPlanner,
  lessonPlanner,
  unitContentGenerator,
  critic,
  refiner
);

function isValidLanguage(value: string): value is Language {
  return ["yoruba", "igbo", "hausa"].includes(value);
}

function parseRequestedChapterCount(value: unknown) {
  const parsed = Number(value ?? 1);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 30) return null;
  return parsed;
}

export async function startCurriculumBuildJob(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "Unauthorized." });

  const { language, level, requestedChapterCount, topic, extraInstructions } = req.body ?? {};
  if (!language || !isValidLanguage(String(language))) {
    return res.status(400).json({ error: "Language is invalid." });
  }
  if (!level || !isValidLevel(String(level))) {
    return res.status(400).json({ error: "Level is invalid." });
  }
  const count = parseRequestedChapterCount(requestedChapterCount);
  if (!count) {
    return res.status(400).json({ error: "Requested chapter count must be between 1 and 30." });
  }
  if (topic !== undefined && typeof topic !== "string") {
    return res.status(400).json({ error: "Topic is invalid." });
  }
  if (extraInstructions !== undefined && typeof extraInstructions !== "string") {
    return res.status(400).json({ error: "Extra instructions are invalid." });
  }
  try {
    const resolvedLevel = String(level) as Level;
    const job = await buildAgent.startJob({
      language: String(language) as Language,
      level: resolvedLevel,
      requestedChapterCount: count,
      topic: typeof topic === "string" ? topic.trim() : undefined,
      extraInstructions: typeof extraInstructions === "string" ? extraInstructions.trim() : undefined,
      cefrTarget: getCefrBandForLevel(resolvedLevel),
      createdBy: req.user.id
    });
    return res.status(201).json({ job });
  } catch (error) {
    console.error("Admin curriculum agent start error", error);
    return res.status(500).json({ error: "Failed to start curriculum build job." });
  }
}

export async function listCurriculumBuildJobs(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "Unauthorized." });

  const language = req.query.language ? String(req.query.language) : undefined;
  const level = req.query.level ? String(req.query.level) : undefined;
  const status = req.query.status ? String(req.query.status) : undefined;
  const limit = req.query.limit ? Number(req.query.limit) : undefined;

  if (language && !isValidLanguage(language)) {
    return res.status(400).json({ error: "Language is invalid." });
  }
  if (level && !isValidLevel(level)) {
    return res.status(400).json({ error: "Level is invalid." });
  }
  if (status && !["queued", "running", "planned", "completed", "failed", "cancelled"].includes(status)) {
    return res.status(400).json({ error: "Status is invalid." });
  }
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 100)) {
    return res.status(400).json({ error: "Limit is invalid." });
  }

  const result = await buildAgent.listJobs({
    createdBy: req.user.id,
    language: language as Language | undefined,
    level: level as Level | undefined,
    status: status as any,
    limit
  });
  return res.status(200).json({ total: result.length, jobs: result });
}

export async function getCurriculumBuildJob(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "Unauthorized." });
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "Job id is invalid." });
  }

  const job = await buildAgent.getJob(id);
  if (!job) return res.status(404).json({ error: "Curriculum build job not found." });
  if (job.createdBy !== req.user.id) {
    return res.status(403).json({ error: "Forbidden." });
  }
  return res.status(200).json({ job });
}

export async function listCurriculumBuildArtifacts(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "Unauthorized." });
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "Job id is invalid." });
  }

  const job = await buildAgent.getJob(id);
  if (!job) return res.status(404).json({ error: "Curriculum build job not found." });
  if (job.createdBy !== req.user.id) {
    return res.status(403).json({ error: "Forbidden." });
  }

  const artifacts = await buildAgent.listArtifacts(id);
  return res.status(200).json({ total: artifacts.length, artifacts });
}

export async function resumeCurriculumBuildJob(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "Unauthorized." });
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "Job id is invalid." });
  }

  const existing = await buildAgent.getJob(id);
  if (!existing) return res.status(404).json({ error: "Curriculum build job not found." });
  if (existing.createdBy !== req.user.id) {
    return res.status(403).json({ error: "Forbidden." });
  }

  try {
    const job = await buildAgent.resumeJob(id);
    return res.status(200).json({ job });
  } catch (error) {
    console.error("Admin curriculum agent resume error", error);
    return res.status(500).json({ error: "Failed to resume curriculum build job." });
  }
}
