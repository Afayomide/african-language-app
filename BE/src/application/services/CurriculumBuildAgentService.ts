import type { CurriculumBuildArtifactPhase, CurriculumBuildArtifactScope } from "../../domain/entities/CurriculumBuildArtifact.js";
import {
  createDefaultCurriculumBuildJobSteps,
  createEmptyCurriculumBuildJobArtifacts,
  type CurriculumBuildJobArtifacts,
  type CurriculumBuildJobEntity,
  type CurriculumBuildJobError,
  type CurriculumBuildJobStep,
  type CurriculumBuildStepKey
} from "../../domain/entities/CurriculumBuildJob.js";
import type { CurriculumBuildArtifactRepository } from "../../domain/repositories/CurriculumBuildArtifactRepository.js";
import type {
  CurriculumBuildJobListFilter,
  CurriculumBuildJobRepository
} from "../../domain/repositories/CurriculumBuildJobRepository.js";
import type { ChapterRepository } from "../../domain/repositories/ChapterRepository.js";
import type { LessonRepository } from "../../domain/repositories/LessonRepository.js";
import type { UnitRepository } from "../../domain/repositories/UnitRepository.js";
import type { LlmUnitPlanLesson } from "../../services/llm/types.js";
import {
  CurriculumArchitectService,
  type CurriculumArchitectPlanInput,
  type CurriculumArchitectPlanResult
} from "./CurriculumArchitectService.js";
import { CurriculumCriticService } from "./CurriculumCriticService.js";
import { CurriculumLessonPlannerService } from "./CurriculumLessonPlannerService.js";
import { CurriculumRefinerService } from "./CurriculumRefinerService.js";
import { CurriculumUnitPlannerService } from "./CurriculumUnitPlannerService.js";
import { getCefrBandForLevel } from "./cefrMapping.js";
import { buildPedagogicalStages } from "./defaultLessonStages.js";

export type StartCurriculumBuildJobInput = CurriculumArchitectPlanInput & {
  createdBy: string;
};

type CurriculumGeneratedLessonSummary = {
  lessonId: string;
  title: string;
};

type CurriculumUnitContentGenerationResult = {
  unitId: string;
  createdLessons: number;
  lessonGenerationErrors: Array<{ topic?: string; error: string }>;
  contentErrors: Array<{ lessonId?: string; title?: string; error: string }>;
  lessons: CurriculumGeneratedLessonSummary[];
};

type CurriculumUnitContentGenerator = {
  previewGeneratePlan(input: {
    unitId: string;
    language: CurriculumArchitectPlanInput["language"];
    level: CurriculumArchitectPlanInput["level"];
    createdBy: string;
    lessonCount: number;
    sentencesPerLesson: number;
    reviewContentPerLesson?: number;
    proverbsPerLesson: number;
    topics?: string[];
    extraInstructions?: string;
    lessonGenerationInstruction?: string;
    planLoggingFlow?: "generate" | "regenerate";
  }): Promise<{
    unitId: string;
    requestedLessons: number;
    actualLessonCount: number;
    coreLessons: LlmUnitPlanLesson[];
    lessonSequence: Array<LlmUnitPlanLesson & { lessonMode: "core" | "review"; sourceCoreLessonIndexes?: number[] }>;
  }>;
  regenerateFromApprovedPlan(input: {
    unitId: string;
    language: CurriculumArchitectPlanInput["language"];
    level: CurriculumArchitectPlanInput["level"];
    createdBy: string;
    lessonCount: number;
    sentencesPerLesson: number;
    reviewContentPerLesson?: number;
    proverbsPerLesson: number;
    topics?: string[];
    extraInstructions?: string;
    planLessons: LlmUnitPlanLesson[];
  }): Promise<CurriculumUnitContentGenerationResult>;
};

const DEFAULT_REQUESTED_UNITS_PER_CHAPTER = 5;
const DEFAULT_REQUESTED_LESSONS_PER_UNIT = 4;
const DEFAULT_SENTENCES_PER_LESSON = 2;
const DEFAULT_REVIEW_CONTENT_PER_LESSON = 1;
const DEFAULT_PROVERBS_PER_LESSON = 1;

function updateStepStatus(
  steps: CurriculumBuildJobStep[],
  key: CurriculumBuildStepKey,
  update: Partial<CurriculumBuildJobStep>
): CurriculumBuildJobStep[] {
  return steps.map((step) => {
    if (step.key !== key) return step;
    return {
      ...step,
      ...update
    };
  });
}

function appendJobError(errors: CurriculumBuildJobError[], next: Omit<CurriculumBuildJobError, "createdAt">): CurriculumBuildJobError[] {
  return [
    ...errors,
    {
      ...next,
      createdAt: new Date()
    }
  ];
}

export class CurriculumBuildAgentService {
  constructor(
    private readonly jobs: CurriculumBuildJobRepository,
    private readonly buildArtifacts: CurriculumBuildArtifactRepository,
    private readonly architect: CurriculumArchitectService,
    private readonly chapters: ChapterRepository,
    private readonly units: UnitRepository,
    private readonly lessons: LessonRepository,
    private readonly unitPlanner: CurriculumUnitPlannerService,
    private readonly lessonPlanner: CurriculumLessonPlannerService,
    private readonly unitContentGenerator: CurriculumUnitContentGenerator,
    private readonly critic: CurriculumCriticService,
    private readonly refiner: CurriculumRefinerService
  ) {}

  async startJob(input: StartCurriculumBuildJobInput): Promise<CurriculumBuildJobEntity> {
    const created = await this.jobs.create({
      language: input.language,
      languageId: input.languageId,
      level: input.level,
      requestedChapterCount: input.requestedChapterCount,
      topic: input.topic,
      extraInstructions: input.extraInstructions,
      cefrTarget: input.cefrTarget || getCefrBandForLevel(input.level),
      status: "queued",
      currentStepKey: "architect",
      steps: createDefaultCurriculumBuildJobSteps(),
      artifacts: createEmptyCurriculumBuildJobArtifacts(),
      errors: [],
      createdBy: input.createdBy,
      startedAt: null,
      finishedAt: null
    });

    return this.runJob(created.id);
  }

  async getJob(jobId: string): Promise<CurriculumBuildJobEntity | null> {
    return this.jobs.findById(jobId);
  }

  async listArtifacts(jobId: string) {
    return this.buildArtifacts.listByJobId(jobId);
  }

  async listJobs(filter: CurriculumBuildJobListFilter = {}): Promise<CurriculumBuildJobEntity[]> {
    return this.jobs.list(filter);
  }

  async resumeJob(jobId: string): Promise<CurriculumBuildJobEntity> {
    const existing = await this.jobs.findById(jobId);
    if (!existing) throw new Error("Curriculum build job not found.");
    if (["completed", "cancelled"].includes(existing.status)) {
      return existing;
    }
    return this.runJob(jobId);
  }

  async runJob(jobId: string): Promise<CurriculumBuildJobEntity> {
    const job = await this.jobs.findById(jobId);
    if (!job) throw new Error("Curriculum build job not found.");

    if (job.status === "completed" || job.status === "cancelled") {
      return job;
    }

    if (job.currentStepKey === "architect" || job.status === "queued") {
      return this.runArchitectStep(job);
    }

    if (job.currentStepKey === "generator" || job.status === "planned") {
      return this.runChapterCreationStep(job);
    }

    if (job.currentStepKey === "critic") {
      return this.runCriticStep(job);
    }

    if (job.currentStepKey === "refiner") {
      return this.runRefinerStep(job);
    }

    return job;
  }

  private getStepAttempts(job: CurriculumBuildJobEntity, key: CurriculumBuildStepKey) {
    return Math.max(1, job.steps.find((step) => step.key === key)?.attempts || 1);
  }

  private async recordArtifact(input: {
    job: CurriculumBuildJobEntity;
    stepKey: CurriculumBuildStepKey;
    phaseKey: CurriculumBuildArtifactPhase;
    scopeType: CurriculumBuildArtifactScope;
    scopeId?: string | null;
    scopeTitle?: string | null;
    status: "draft" | "accepted" | "rejected" | "applied" | "failed";
    summary: string;
    input?: Record<string, unknown> | null;
    output?: Record<string, unknown> | null;
    critic?: {
      ok: boolean;
      summary: string;
      issues: string[];
      issueDetails?: Record<string, unknown>[];
    } | null;
    refiner?: {
      fixed: boolean;
      summary: string;
      fixesApplied: string[];
      unresolvedIssues: string[];
    } | null;
  }) {
    await this.buildArtifacts.create({
      jobId: input.job.id,
      stepKey: input.stepKey,
      phaseKey: input.phaseKey,
      scopeType: input.scopeType,
      scopeId: input.scopeId || null,
      scopeTitle: input.scopeTitle || null,
      attempt: this.getStepAttempts(input.job, input.stepKey),
      status: input.status,
      summary: input.summary,
      input: input.input || null,
      output: input.output || null,
      critic: input.critic || null,
      refiner: input.refiner || null
    });
  }

  private async buildPersistedArtifactReview(jobId: string) {
    const latestByScope = new Map<string, Awaited<ReturnType<CurriculumBuildArtifactRepository["listByJobId"]>>[number]>();
    for (const artifact of await this.buildArtifacts.listByJobId(jobId)) {
      if (artifact.phaseKey === "final_review") continue;
      const key = `${artifact.phaseKey}:${artifact.scopeType}:${artifact.scopeId || "job"}`;
      const existing = latestByScope.get(key);
      if (!existing || existing.createdAt.getTime() <= artifact.createdAt.getTime()) {
        latestByScope.set(key, artifact);
      }
    }

    const failures = Array.from(latestByScope.values()).filter(
      (artifact) => artifact.status === "rejected" || artifact.status === "failed"
    );

    return {
      artifacts: Array.from(latestByScope.values()),
      issues: failures.map(
        (artifact) =>
          `${artifact.phaseKey} failed for ${artifact.scopeTitle || artifact.scopeId || "job"}: ${artifact.summary || "Unknown failure."}`
      )
    };
  }

  private mergeCriticIssues(summary: string, issues: string[], extraIssues: string[]) {
    const mergedIssues = Array.from(new Set([...issues, ...extraIssues].filter(Boolean)));
    const ok = mergedIssues.length === 0;
    return {
      ok,
      issues: mergedIssues,
      summary: ok ? summary : `${summary} ${extraIssues.length > 0 ? `Persisted artifact review found ${extraIssues.length} unresolved issue(s).` : ""}`.trim()
    };
  }

  private async updateLessonPlanFromContentGeneration(input: {
    unitId: string;
    chapterId: string;
    chapterTitle: string;
    unitTitle: string;
    acceptedLessonPlan: Array<{ title: string; description: string; orderIndex: number }>;
    generatedLessons: CurriculumGeneratedLessonSummary[];
    existingLessonPlan: CurriculumBuildJobArtifacts["lessonPlan"];
  }): Promise<CurriculumBuildJobArtifacts["lessonPlan"]> {
    const generatedByTitle = new Map(
      input.generatedLessons.map((lesson) => [lesson.title.trim().toLowerCase(), lesson] as const)
    );
    const nextLessonPlan = input.existingLessonPlan.filter((item) => item.unitId !== input.unitId);
    for (const item of input.acceptedLessonPlan) {
      const generated = generatedByTitle.get(item.title.trim().toLowerCase());
      nextLessonPlan.push({
        chapterId: input.chapterId,
        chapterTitle: input.chapterTitle,
        unitId: input.unitId,
        unitTitle: input.unitTitle,
        title: item.title,
        description: item.description,
        orderIndex: item.orderIndex,
        status: "created",
        lessonId: generated?.lessonId || null
      });
    }
    return nextLessonPlan;
  }

  private async runArchitectStep(job: CurriculumBuildJobEntity): Promise<CurriculumBuildJobEntity> {
    const now = new Date();
    const runningSteps = updateStepStatus(job.steps, "architect", {
      status: "running",
      attempts: (job.steps.find((step) => step.key === "architect")?.attempts || 0) + 1,
      startedAt: job.startedAt || now,
      completedAt: null,
      message: "Planning next chapters from approved curriculum memory."
    });

    const markedRunning =
      (await this.jobs.updateById(job.id, {
        status: "running",
        currentStepKey: "architect",
        startedAt: job.startedAt || now,
        steps: runningSteps
      })) || job;

    try {
      const plan = await this.architect.planNextChapters({
        language: markedRunning.language,
        languageId: markedRunning.languageId,
        level: markedRunning.level,
        requestedChapterCount: markedRunning.requestedChapterCount,
        topic: markedRunning.topic,
        extraInstructions: markedRunning.extraInstructions,
        cefrTarget: markedRunning.cefrTarget
      });

      await this.recordArtifact({
        job: markedRunning,
        stepKey: "architect",
        phaseKey: "architect_plan",
        scopeType: "job",
        status: "draft",
        summary: `Architect produced ${plan.chapters.length} chapter plan item(s).`,
        input: {
          requestedChapterCount: markedRunning.requestedChapterCount,
          topic: markedRunning.topic,
          cefrTarget: markedRunning.cefrTarget
        },
        output: {
          chapterPlan: plan.chapters,
          memorySummary: plan.memory.summary,
          notes: plan.notes
        }
      });

      const initialCritic = this.critic.reviewChapterPlan({
        requestedChapterCount: markedRunning.requestedChapterCount,
        chapterPlan: plan.chapters
      });

      let chapterPlan = plan.chapters;
      let checkpointSummary = initialCritic.summary;
      let checkpointCritic = initialCritic;
      let checkpointRefiner:
        | {
            fixed: boolean;
            summary: string;
            fixesApplied: string[];
            unresolvedIssues: string[];
          }
        | null = null;

      if (!initialCritic.ok) {
        const refinement = await this.refiner.refineChapterPlan({
          job: markedRunning,
          chapterPlan: plan.chapters,
          critic: initialCritic
        });
        checkpointRefiner = {
          fixed: refinement.fixed,
          summary: refinement.summary,
          fixesApplied: refinement.fixesApplied,
          unresolvedIssues: refinement.unresolvedIssues
        };
        chapterPlan = refinement.chapterPlan;
        checkpointCritic = this.critic.reviewChapterPlan({
          requestedChapterCount: markedRunning.requestedChapterCount,
          chapterPlan
        });
        checkpointSummary = refinement.summary;
      }

      await this.recordArtifact({
        job: markedRunning,
        stepKey: "architect",
        phaseKey: "architect_checkpoint",
        scopeType: "job",
        status: checkpointCritic.ok ? "accepted" : "rejected",
        summary: checkpointCritic.ok ? checkpointSummary : checkpointCritic.summary,
        output: {
          chapterPlan
        },
        critic: {
          ok: checkpointCritic.ok,
          summary: checkpointCritic.summary,
          issues: checkpointCritic.issues,
          issueDetails: checkpointCritic.issueDetails as unknown as Record<string, unknown>[]
        },
        refiner: checkpointRefiner
      });

      if (!checkpointCritic.ok) {
        throw new Error(`Architect checkpoint failed: ${checkpointCritic.summary}`);
      }

      const plannedJob = await this.applyArchitectSuccess(markedRunning, {
        ...plan,
        chapters: chapterPlan
      });
      return this.runChapterCreationStep(plannedJob);
    } catch (error) {
      return this.applyArchitectFailure(markedRunning, error);
    }
  }

  private async runChapterCreationStep(job: CurriculumBuildJobEntity): Promise<CurriculumBuildJobEntity> {
    const runningSteps = updateStepStatus(job.steps, "generator", {
      status: "running",
      attempts: (job.steps.find((step) => step.key === "generator")?.attempts || 0) + 1,
      startedAt: new Date(),
      completedAt: null,
      message: "Creating draft chapter shells from the approved chapter plan."
    });

    const markedRunning =
      (await this.jobs.updateById(job.id, {
        status: "running",
        currentStepKey: "generator",
        steps: runningSteps
      })) || job;

    try {
      const existingChapters = await this.chapters.listByLanguage(markedRunning.language, markedRunning.languageId || undefined);
      const scopedExisting = existingChapters.filter((chapter) => chapter.level === markedRunning.level);
      const byNormalizedTitle = new Map(scopedExisting.map((chapter) => [chapter.title.trim().toLowerCase(), chapter]));

      const chapterPlan = [];
      for (const item of markedRunning.artifacts.chapterPlan) {
        const normalizedTitle = item.title.trim().toLowerCase();
        const existing = (item.chapterId ? scopedExisting.find((chapter) => chapter.id === item.chapterId) : null) || byNormalizedTitle.get(normalizedTitle);
        if (existing) {
          chapterPlan.push({
            ...item,
            chapterId: existing.id,
            orderIndex: existing.orderIndex,
            status: "created" as const
          });
          continue;
        }

        const created = await this.chapters.create({
          title: item.title,
          description: item.description,
          language: markedRunning.language,
          level: markedRunning.level,
          orderIndex: item.orderIndex,
          status: "draft",
          createdBy: markedRunning.createdBy
        });
        byNormalizedTitle.set(normalizedTitle, created);
        chapterPlan.push({
          ...item,
          chapterId: created.id,
          orderIndex: created.orderIndex,
          status: "created" as const
        });
      }

      await this.recordArtifact({
        job: markedRunning,
        stepKey: "generator",
        phaseKey: "chapter_shells",
        scopeType: "job",
        status: "applied",
        summary: `Created or resolved ${chapterPlan.length} chapter shell(s).`,
        output: {
          chapterPlan
        }
      });

      const chapterIds = chapterPlan.map((item) => item.chapterId).filter(Boolean) as string[];
      const unitPlan: CurriculumBuildJobArtifacts["unitPlan"] = [];
      const lessonPlan: CurriculumBuildJobArtifacts["lessonPlan"] = [];
      for (const chapterId of chapterIds) {
        const chapter = await this.chapters.findById(chapterId);
        if (!chapter) continue;

        const plannedUnits = await this.unitPlanner.planUnitsForChapter({
          chapter,
          languageId: markedRunning.languageId,
          requestedUnitCount: DEFAULT_REQUESTED_UNITS_PER_CHAPTER,
          topic: markedRunning.topic,
          extraInstructions: markedRunning.extraInstructions,
          cefrTarget: markedRunning.cefrTarget,
          priorUnitTitles: markedRunning.artifacts.priorUnitTitles,
          memorySummary: markedRunning.artifacts.memorySummary
        });

        await this.recordArtifact({
          job: markedRunning,
          stepKey: "generator",
          phaseKey: "unit_plan",
          scopeType: "chapter",
          scopeId: chapter.id,
          scopeTitle: chapter.title,
          status: "draft",
          summary: `Planned ${plannedUnits.length} unit(s) for chapter "${chapter.title}".`,
          output: {
            unitPlan: plannedUnits
          }
        });

        const initialUnitCritic = this.critic.reviewUnitPlan({
          chapterId: chapter.id,
          chapterTitle: chapter.title,
          unitPlan: plannedUnits,
          requestedUnitCount: DEFAULT_REQUESTED_UNITS_PER_CHAPTER
        });
        let acceptedUnitPlan = plannedUnits;
        let unitCheckpointCritic = initialUnitCritic;
        let unitCheckpointRefiner:
          | {
              fixed: boolean;
              summary: string;
              fixesApplied: string[];
              unresolvedIssues: string[];
            }
          | null = null;

        if (!initialUnitCritic.ok) {
          const refinement = await this.refiner.refineUnitPlan({
            job: markedRunning,
            chapter,
            unitPlan: plannedUnits,
            critic: initialUnitCritic
          });
          unitCheckpointRefiner = {
            fixed: refinement.fixed,
            summary: refinement.summary,
            fixesApplied: refinement.fixesApplied,
            unresolvedIssues: refinement.unresolvedIssues
          };
          acceptedUnitPlan = refinement.unitPlan;
          unitCheckpointCritic = this.critic.reviewUnitPlan({
            chapterId: chapter.id,
            chapterTitle: chapter.title,
            unitPlan: acceptedUnitPlan,
            requestedUnitCount: DEFAULT_REQUESTED_UNITS_PER_CHAPTER
          });
        }

        await this.recordArtifact({
          job: markedRunning,
          stepKey: "generator",
          phaseKey: "unit_checkpoint",
          scopeType: "chapter",
          scopeId: chapter.id,
          scopeTitle: chapter.title,
          status: unitCheckpointCritic.ok ? "accepted" : "rejected",
          summary: unitCheckpointCritic.ok
            ? `Unit-plan checkpoint passed for chapter "${chapter.title}".`
            : unitCheckpointCritic.summary,
          output: {
            unitPlan: acceptedUnitPlan
          },
          critic: {
            ok: unitCheckpointCritic.ok,
            summary: unitCheckpointCritic.summary,
            issues: unitCheckpointCritic.issues,
            issueDetails: unitCheckpointCritic.issueDetails as unknown as Record<string, unknown>[]
          },
          refiner: unitCheckpointRefiner
        });

        if (!unitCheckpointCritic.ok) {
          throw new Error(`Unit-plan checkpoint failed for chapter "${chapter.title}": ${unitCheckpointCritic.summary}`);
        }

        const existingUnits = await this.units.listByChapterId(chapter.id);
        const byUnitTitle = new Map(existingUnits.map((unit) => [unit.title.trim().toLowerCase(), unit]));
        const createdUnitsForChapter = [];
        for (const item of acceptedUnitPlan) {
          const normalizedTitle = item.title.trim().toLowerCase();
          const existingUnit = byUnitTitle.get(normalizedTitle);
          if (existingUnit) {
            const resolved = {
              ...item,
              unitId: existingUnit.id,
              orderIndex: existingUnit.orderIndex,
              status: "created" as const
            };
            unitPlan.push(resolved);
            createdUnitsForChapter.push(resolved);
            continue;
          }

          const createdUnit = await this.units.create({
            chapterId: chapter.id,
            title: item.title,
            description: item.description,
            language: markedRunning.language,
            level: markedRunning.level,
            orderIndex: item.orderIndex,
            status: "draft",
            createdBy: markedRunning.createdBy
          });
          byUnitTitle.set(normalizedTitle, createdUnit);
          const resolved = {
            ...item,
            unitId: createdUnit.id,
            orderIndex: createdUnit.orderIndex,
            status: "created" as const
          };
          unitPlan.push(resolved);
          createdUnitsForChapter.push(resolved);
        }

        await this.recordArtifact({
          job: markedRunning,
          stepKey: "generator",
          phaseKey: "unit_shells",
          scopeType: "chapter",
          scopeId: chapter.id,
          scopeTitle: chapter.title,
          status: "applied",
          summary: `Created or resolved ${createdUnitsForChapter.length} unit shell(s) for chapter "${chapter.title}".`,
          output: {
            unitPlan: createdUnitsForChapter
          }
        });
      }

      const createdUnitIds = unitPlan.map((item) => item.unitId).filter(Boolean) as string[];
      for (const unitId of createdUnitIds) {
        const unit = await this.units.findById(unitId);
        if (!unit || !unit.chapterId) continue;
        const chapter = await this.chapters.findById(unit.chapterId);
        if (!chapter) continue;

        const previewPlan = await this.unitContentGenerator.previewGeneratePlan({
          unitId: unit.id,
          language: markedRunning.language,
          level: markedRunning.level,
          createdBy: markedRunning.createdBy,
          lessonCount: DEFAULT_REQUESTED_LESSONS_PER_UNIT,
          sentencesPerLesson: DEFAULT_SENTENCES_PER_LESSON,
          reviewContentPerLesson: DEFAULT_REVIEW_CONTENT_PER_LESSON,
          proverbsPerLesson: DEFAULT_PROVERBS_PER_LESSON,
          topics: markedRunning.topic ? [markedRunning.topic] : [],
          extraInstructions: markedRunning.extraInstructions || undefined,
          lessonGenerationInstruction: markedRunning.extraInstructions || undefined,
          planLoggingFlow: "generate"
        });
        const plannedLessons: CurriculumBuildJobArtifacts["lessonPlan"] = previewPlan.lessonSequence.map((lesson, index) => ({
          chapterId: chapter.id,
          chapterTitle: chapter.title,
          unitId: unit.id,
          unitTitle: unit.title,
          title: lesson.title,
          description: lesson.description || "",
          orderIndex: index,
          status: "planned",
          lessonId: null
        }));
        const expectedLessonSequenceCount = previewPlan.actualLessonCount || previewPlan.lessonSequence.length;

        await this.recordArtifact({
          job: markedRunning,
          stepKey: "generator",
          phaseKey: "lesson_plan",
          scopeType: "unit",
          scopeId: unit.id,
          scopeTitle: unit.title,
          status: "draft",
          summary: `Planned ${plannedLessons.length} lesson(s) for unit "${unit.title}".`,
          output: {
            lessonPlan: plannedLessons
          }
        });

        const initialLessonCritic = this.critic.reviewLessonPlan({
          chapterId: chapter.id,
          chapterTitle: chapter.title,
          unitId: unit.id,
          unitTitle: unit.title,
          lessonPlan: plannedLessons,
          requestedLessonCount: expectedLessonSequenceCount
        });
        let acceptedLessonPlan = plannedLessons;
        let lessonCheckpointCritic = initialLessonCritic;
        let lessonCheckpointRefiner:
          | {
              fixed: boolean;
              summary: string;
              fixesApplied: string[];
              unresolvedIssues: string[];
            }
          | null = null;

        if (!initialLessonCritic.ok) {
          const refinement = await this.refiner.refineLessonPlan({
            job: markedRunning,
            chapter,
            unit,
            lessonPlan: plannedLessons,
            critic: initialLessonCritic
          });
          lessonCheckpointRefiner = {
            fixed: refinement.fixed,
            summary: refinement.summary,
            fixesApplied: refinement.fixesApplied,
            unresolvedIssues: refinement.unresolvedIssues
          };
          acceptedLessonPlan = refinement.lessonPlan;
          lessonCheckpointCritic = this.critic.reviewLessonPlan({
            chapterId: chapter.id,
            chapterTitle: chapter.title,
            unitId: unit.id,
            unitTitle: unit.title,
            lessonPlan: acceptedLessonPlan,
            requestedLessonCount: expectedLessonSequenceCount
          });
        }

        await this.recordArtifact({
          job: markedRunning,
          stepKey: "generator",
          phaseKey: "lesson_checkpoint",
          scopeType: "unit",
          scopeId: unit.id,
          scopeTitle: unit.title,
          status: lessonCheckpointCritic.ok ? "accepted" : "rejected",
          summary: lessonCheckpointCritic.ok
            ? `Lesson-plan checkpoint passed for unit "${unit.title}".`
            : lessonCheckpointCritic.summary,
          output: {
            lessonPlan: acceptedLessonPlan
          },
          critic: {
            ok: lessonCheckpointCritic.ok,
            summary: lessonCheckpointCritic.summary,
            issues: lessonCheckpointCritic.issues,
            issueDetails: lessonCheckpointCritic.issueDetails as unknown as Record<string, unknown>[]
          },
          refiner: lessonCheckpointRefiner
        });

        if (!lessonCheckpointCritic.ok) {
          throw new Error(`Lesson-plan checkpoint failed for unit "${unit.title}": ${lessonCheckpointCritic.summary}`);
        }

        const existingLessons = await this.lessons.listByUnitId(unit.id);
        const byLessonTitle = new Map(existingLessons.map((lesson) => [lesson.title.trim().toLowerCase(), lesson]));
        const createdLessonsForUnit = [];
        for (const item of acceptedLessonPlan) {
          const normalizedTitle = item.title.trim().toLowerCase();
          const existingLesson = byLessonTitle.get(normalizedTitle);
          if (existingLesson) {
            const resolved = {
              ...item,
              lessonId: existingLesson.id,
              orderIndex: existingLesson.orderIndex,
              status: "created" as const
            };
            lessonPlan.push(resolved);
            createdLessonsForUnit.push(resolved);
            continue;
          }

          const createdLesson = await this.lessons.create({
            title: item.title,
            unitId: unit.id,
            language: markedRunning.language,
            level: markedRunning.level,
            orderIndex: item.orderIndex,
            description: item.description,
            topics: markedRunning.topic ? [markedRunning.topic] : [],
            proverbs: [],
            stages: buildPedagogicalStages((index) => `stage-${index + 1}`),
            status: "draft",
            createdBy: markedRunning.createdBy
          });
          byLessonTitle.set(normalizedTitle, createdLesson);
          const resolved = {
            ...item,
            lessonId: createdLesson.id,
            orderIndex: createdLesson.orderIndex,
            status: "created" as const
          };
          lessonPlan.push(resolved);
          createdLessonsForUnit.push(resolved);
        }

        await this.recordArtifact({
          job: markedRunning,
          stepKey: "generator",
          phaseKey: "lesson_shells",
          scopeType: "unit",
          scopeId: unit.id,
          scopeTitle: unit.title,
          status: "applied",
          summary: `Created or resolved ${createdLessonsForUnit.length} lesson shell(s) for unit "${unit.title}".`,
          output: {
            lessonPlan: createdLessonsForUnit
          }
        });

        const contentPlanLessons = previewPlan.coreLessons;

        await this.recordArtifact({
          job: markedRunning,
          stepKey: "generator",
          phaseKey: "content_plan",
          scopeType: "unit",
          scopeId: unit.id,
          scopeTitle: unit.title,
          status: "draft",
          summary: `Prepared ${contentPlanLessons.length} content-plan lesson(s) for unit "${unit.title}".`,
          output: {
            planLessons: contentPlanLessons
          }
        });

        const contentGeneration = await this.unitContentGenerator.regenerateFromApprovedPlan({
          unitId: unit.id,
          language: markedRunning.language,
          level: markedRunning.level,
          createdBy: markedRunning.createdBy,
          lessonCount: previewPlan.coreLessons.length,
          sentencesPerLesson: DEFAULT_SENTENCES_PER_LESSON,
          reviewContentPerLesson: DEFAULT_REVIEW_CONTENT_PER_LESSON,
          proverbsPerLesson: DEFAULT_PROVERBS_PER_LESSON,
          topics: markedRunning.topic ? [markedRunning.topic] : [],
          extraInstructions: markedRunning.extraInstructions || undefined,
          planLessons: previewPlan.coreLessons
        });

        await this.recordArtifact({
          job: markedRunning,
          stepKey: "generator",
          phaseKey: "content_generation",
          scopeType: "unit",
          scopeId: unit.id,
          scopeTitle: unit.title,
          status:
            contentGeneration.lessonGenerationErrors.length > 0 || contentGeneration.contentErrors.length > 0
              ? "failed"
              : "applied",
          summary: `Generated content for unit "${unit.title}" with ${contentGeneration.createdLessons} lesson(s).`,
          output: {
            result: contentGeneration
          }
        });

        const contentCheckpointIssues = [
          ...contentGeneration.lessonGenerationErrors.map((item) => item.error),
          ...contentGeneration.contentErrors.map((item) => item.error)
        ];
        const contentCheckpointOk = contentCheckpointIssues.length === 0 && contentGeneration.createdLessons > 0;

        await this.recordArtifact({
          job: markedRunning,
          stepKey: "generator",
          phaseKey: "content_checkpoint",
          scopeType: "unit",
          scopeId: unit.id,
          scopeTitle: unit.title,
          status: contentCheckpointOk ? "accepted" : "rejected",
          summary: contentCheckpointOk
            ? `Content-generation checkpoint passed for unit "${unit.title}".`
            : `Content-generation checkpoint failed for unit "${unit.title}".`,
          critic: {
            ok: contentCheckpointOk,
            summary: contentCheckpointOk
              ? `Content-generation checkpoint passed for unit "${unit.title}".`
              : `Content-generation checkpoint failed for unit "${unit.title}".`,
            issues: contentCheckpointIssues
          },
          output: {
            result: contentGeneration
          }
        });

        if (!contentCheckpointOk) {
          throw new Error(`Content-generation checkpoint failed for unit "${unit.title}".`);
        }

        lessonPlan.splice(
          0,
          lessonPlan.length,
          ...(await this.updateLessonPlanFromContentGeneration({
            unitId: unit.id,
            chapterId: chapter.id,
            chapterTitle: chapter.title,
            unitTitle: unit.title,
            acceptedLessonPlan,
            generatedLessons: contentGeneration.lessons,
            existingLessonPlan: lessonPlan
          }))
        );
      }

      const completedSteps = updateStepStatus(markedRunning.steps, "generator", {
        status: "completed",
        completedAt: new Date(),
        message: `Created or resolved ${chapterPlan.length} chapter shells, ${unitPlan.length} unit shells, and ${lessonPlan.length} lesson shells.`
      });

      const updated = await this.jobs.updateById(markedRunning.id, {
        status: "running",
        currentStepKey: "critic",
        steps: completedSteps,
        artifacts: {
          ...markedRunning.artifacts,
          chapterPlan,
          unitPlan,
          lessonPlan
        },
        finishedAt: null
      });

      if (!updated) throw new Error("Curriculum build job could not be updated after chapter shell creation.");
      return this.runCriticStep(updated);
    } catch (error) {
      const failedSteps = updateStepStatus(markedRunning.steps, "generator", {
        status: "failed",
        completedAt: new Date(),
        message: error instanceof Error ? error.message : "Chapter shell creation failed."
      });

      const updated = await this.jobs.updateById(markedRunning.id, {
        status: "failed",
        currentStepKey: "generator",
        steps: failedSteps,
        errors: appendJobError(markedRunning.errors, {
          stepKey: "generator",
          message: error instanceof Error ? error.message : "Chapter shell creation failed.",
          details: error instanceof Error ? { name: error.name } : null
        }),
        finishedAt: new Date()
      });

      if (!updated) throw new Error("Curriculum build job could not be updated after chapter shell failure.");
      return updated;
    }
  }

  private async runCriticStep(job: CurriculumBuildJobEntity): Promise<CurriculumBuildJobEntity> {
    const runningSteps = updateStepStatus(job.steps, "critic", {
      status: "running",
      attempts: (job.steps.find((step) => step.key === "critic")?.attempts || 0) + 1,
      startedAt: new Date(),
      completedAt: null,
      message: "Reviewing generated chapter, unit, and lesson shells."
    });

    const markedRunning =
      (await this.jobs.updateById(job.id, {
        status: "running",
        currentStepKey: "critic",
        steps: runningSteps
      })) || job;

    const result = this.critic.review(markedRunning);
    const persistedArtifactReview = await this.buildPersistedArtifactReview(markedRunning.id);
    const mergedCritic = this.mergeCriticIssues(result.summary, result.issues, persistedArtifactReview.issues);
    await this.recordArtifact({
      job: markedRunning,
      stepKey: "critic",
      phaseKey: "final_review",
      scopeType: "job",
      status: mergedCritic.ok ? "accepted" : "rejected",
      summary: mergedCritic.summary,
      critic: {
        ok: mergedCritic.ok,
        summary: mergedCritic.summary,
        issues: mergedCritic.issues,
        issueDetails: result.issueDetails as unknown as Record<string, unknown>[]
      },
      output: {
        chapterPlan: markedRunning.artifacts.chapterPlan,
        unitPlan: markedRunning.artifacts.unitPlan,
        lessonPlan: markedRunning.artifacts.lessonPlan,
        artifactCount: persistedArtifactReview.artifacts.length
      }
    });
    const completedSteps = updateStepStatus(markedRunning.steps, "critic", {
      status: mergedCritic.ok ? "completed" : "failed",
      completedAt: new Date(),
      message: mergedCritic.summary
    });

    const updated = await this.jobs.updateById(markedRunning.id, {
      status: "running",
      currentStepKey: "refiner",
      steps: completedSteps,
      artifacts: {
        ...markedRunning.artifacts,
        criticSummary: mergedCritic.summary,
        criticIssues: mergedCritic.issues
      },
      errors: mergedCritic.ok
        ? markedRunning.errors
        : appendJobError(markedRunning.errors, {
            stepKey: "critic",
            message: mergedCritic.summary,
            details: { issues: mergedCritic.issues }
          }),
      finishedAt: null
    });

    if (!updated) throw new Error("Curriculum build job could not be updated after critic review.");
    return this.runRefinerStep(updated);
  }

  private async runRefinerStep(job: CurriculumBuildJobEntity): Promise<CurriculumBuildJobEntity> {
    const runningSteps = updateStepStatus(job.steps, "refiner", {
      status: "running",
      attempts: (job.steps.find((step) => step.key === "refiner")?.attempts || 0) + 1,
      startedAt: new Date(),
      completedAt: null,
      message: "Applying bounded refinement after critic review."
    });

    const markedRunning =
      (await this.jobs.updateById(job.id, {
        status: "running",
        currentStepKey: "refiner",
        steps: runningSteps
      })) || job;

    const structuralCritic = this.critic.review(markedRunning);
    const persistedArtifactReview = await this.buildPersistedArtifactReview(markedRunning.id);
    const criticInput = {
      ...structuralCritic,
      ...this.mergeCriticIssues(structuralCritic.summary, structuralCritic.issues, persistedArtifactReview.issues),
      issueDetails: structuralCritic.issueDetails
    };
    const result = await this.refiner.refine({
      job: markedRunning,
      critic: criticInput
    });

    const mergedArtifacts = {
      ...markedRunning.artifacts,
      ...(result.artifacts || {}),
      refinerSummary: result.summary
    };
    const postRefineJob: CurriculumBuildJobEntity = {
      ...markedRunning,
      artifacts: mergedArtifacts
    };
    const postRefineStructuralCritic = this.critic.review(postRefineJob);
    const postRefinePersistedArtifactReview = await this.buildPersistedArtifactReview(markedRunning.id);
    const postRefineCritic = {
      ...postRefineStructuralCritic,
      ...this.mergeCriticIssues(
        postRefineStructuralCritic.summary,
        postRefineStructuralCritic.issues,
        postRefinePersistedArtifactReview.issues
      ),
      issueDetails: postRefineStructuralCritic.issueDetails
    };

    const completedSteps = updateStepStatus(markedRunning.steps, "refiner", {
      status: postRefineCritic.ok ? (result.fixed ? "completed" : "skipped") : "failed",
      completedAt: new Date(),
      message: result.summary
    });

    const updated = await this.jobs.updateById(markedRunning.id, {
      status: postRefineCritic.ok ? "completed" : "failed",
      currentStepKey: "refiner",
      steps: completedSteps,
      artifacts: {
        ...mergedArtifacts,
        criticSummary: postRefineCritic.summary,
        criticIssues: postRefineCritic.issues,
        refinerSummary: result.summary
      },
      errors: postRefineCritic.ok
        ? markedRunning.errors
        : appendJobError(markedRunning.errors, {
            stepKey: "refiner",
            message: result.summary,
            details: {
              unresolvedIssues: result.unresolvedIssues,
              fixesApplied: result.fixesApplied,
              postCriticIssues: postRefineCritic.issues
            }
          }),
      finishedAt: new Date()
    });

    await this.recordArtifact({
      job: updated || markedRunning,
      stepKey: "refiner",
      phaseKey: "final_review",
      scopeType: "job",
      status: postRefineCritic.ok ? "applied" : "failed",
      summary: result.summary,
      critic: {
        ok: postRefineCritic.ok,
        summary: postRefineCritic.summary,
        issues: postRefineCritic.issues,
        issueDetails: postRefineCritic.issueDetails as unknown as Record<string, unknown>[]
      },
      refiner: {
        fixed: result.fixed,
        summary: result.summary,
        fixesApplied: result.fixesApplied,
        unresolvedIssues: result.unresolvedIssues
      },
      output: {
        chapterPlan: mergedArtifacts.chapterPlan,
        unitPlan: mergedArtifacts.unitPlan,
        lessonPlan: mergedArtifacts.lessonPlan,
        artifactCount: postRefinePersistedArtifactReview.artifacts.length
      }
    });

    if (!updated) throw new Error("Curriculum build job could not be updated after refiner step.");
    return updated;
  }

  private async applyArchitectSuccess(
    job: CurriculumBuildJobEntity,
    plan: CurriculumArchitectPlanResult
  ): Promise<CurriculumBuildJobEntity> {
    const now = new Date();
    const completedSteps = updateStepStatus(job.steps, "architect", {
      status: "completed",
      completedAt: now,
      message: `Planned ${plan.chapters.length} chapters.`
    });

    const updated = await this.jobs.updateById(job.id, {
      languageId: plan.languageId,
      status: "planned",
      currentStepKey: "generator",
      steps: completedSteps,
      artifacts: {
        ...job.artifacts,
        memorySummary: plan.memory.summary,
        priorChapterTitles: plan.memory.chapterTitles,
        priorUnitTitles: plan.memory.unitTitles,
        chapterPlan: plan.chapters,
        architectNotes: plan.notes
      },
      errors: job.errors,
      finishedAt: null
    });

    if (!updated) throw new Error("Curriculum build job could not be updated after architect success.");
    return updated;
  }

  private async applyArchitectFailure(job: CurriculumBuildJobEntity, error: unknown): Promise<CurriculumBuildJobEntity> {
    const now = new Date();
    const failedSteps = updateStepStatus(job.steps, "architect", {
      status: "failed",
      completedAt: now,
      message: error instanceof Error ? error.message : "Curriculum architect failed."
    });

    const updated = await this.jobs.updateById(job.id, {
      status: "failed",
      currentStepKey: "architect",
      steps: failedSteps,
      errors: appendJobError(job.errors, {
        stepKey: "architect",
        message: error instanceof Error ? error.message : "Curriculum architect failed.",
        details: error instanceof Error ? { name: error.name } : null
      }),
      finishedAt: now
    });

    if (!updated) throw new Error("Curriculum build job could not be updated after architect failure.");
    return updated;
  }
}
