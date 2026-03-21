import type { Language, Level, LessonEntity, LessonStage, Status } from "../../../../domain/entities/Lesson.js";
import type { ContentType } from "../../../../domain/entities/Content.js";
import { ContentLookupService } from "../../../services/ContentLookupService.js";
import type { LessonRepository } from "../../../../domain/repositories/LessonRepository.js";
import type { ExpressionRepository } from "../../../../domain/repositories/ExpressionRepository.js";
import type { LessonContentItemRepository } from "../../../../domain/repositories/LessonContentItemRepository.js";
import type { ProverbRepository } from "../../../../domain/repositories/ProverbRepository.js";
import type { QuestionRepository } from "../../../../domain/repositories/QuestionRepository.js";
import type { SentenceRepository } from "../../../../domain/repositories/SentenceRepository.js";
import type { WordRepository } from "../../../../domain/repositories/WordRepository.js";

export class AdminLessonUseCases {
  private readonly contentLookup: ContentLookupService;

  constructor(
    private readonly lessons: LessonRepository,
    private readonly lessonContentItems: LessonContentItemRepository,
    private readonly words: WordRepository,
    private readonly expressions: ExpressionRepository,
    private readonly sentences: SentenceRepository,
    private readonly proverbs: ProverbRepository,
    private readonly questions: QuestionRepository
  ) {
    this.contentLookup = new ContentLookupService(words, expressions, sentences);
  }

  private listContentRefs(lesson: LessonEntity) {
    return Array.from(
      new Map(
        (lesson.stages || [])
          .flatMap((stage) => stage.blocks || [])
          .flatMap((block) => {
            if (block.type !== "content" || !block.refId) return [];
            return [[`${block.contentType}:${block.refId}`, { type: block.contentType as ContentType, id: block.refId as string }] as const];
          })
      ).values()
    );
  }

  private hasAcceptedHumanAudio(audio: { referenceType?: string; reviewStatus?: string; url?: string } | undefined) {
    return Boolean(audio?.url && audio.referenceType === "human_reference" && audio.reviewStatus === "accepted");
  }

  async create(input: {
    title: string;
    unitId: string;
    language: Language;
    level: Level;
    description?: string;
    topics?: string[];
    proverbs?: Array<{ text: string; translation: string; contextNote: string }>;
    stages?: LessonStage[];
    createdBy: string;
  }) {
    const lastOrderIndex = await this.lessons.findLastOrderIndex(input.unitId);
    const orderIndex = (lastOrderIndex ?? -1) + 1;

    return this.lessons.create({
      title: input.title,
      unitId: input.unitId,
      language: input.language,
      level: input.level,
      orderIndex,
      description: input.description?.trim() || "",
      topics: Array.isArray(input.topics) ? input.topics : [],
      proverbs: Array.isArray(input.proverbs) ? input.proverbs : [],
      stages: Array.isArray(input.stages) ? input.stages : [],
      status: "draft",
      createdBy: input.createdBy
    });
  }

  async list(filter: { language?: Language; status?: Status }) {
    return this.lessons.list(filter);
  }

  async getById(id: string) {
    return this.lessons.findById(id);
  }

  async update(
    id: string,
    update: Partial<{
      title: string;
      description: string;
      unitId: string;
      language: Language;
      level: Level;
      orderIndex: number;
      topics: string[];
      proverbs: Array<{ text: string; translation: string; contextNote: string }>;
      stages: LessonStage[];
    }>
  ) {
    const current = await this.lessons.findById(id);
    if (!current) return null;

    const payload = { ...update };
    if (payload.unitId && payload.unitId !== current.unitId && payload.orderIndex === undefined) {
      const lastOrderIndex = await this.lessons.findLastOrderIndex(payload.unitId);
      payload.orderIndex = (lastOrderIndex ?? -1) + 1;
    }

    return this.lessons.updateById(id, payload);
  }

  async delete(id: string) {
    const lesson = await this.lessons.softDeleteById(id);
    if (!lesson) return null;

    const now = new Date();
    await this.lessonContentItems.deleteByLessonId(lesson.id);
    await this.proverbs.softDeleteByLessonId(lesson.id, now);
    await this.questions.softDeleteByLessonId(lesson.id, now);
    await this.lessons.compactOrderIndexesByUnit(lesson.unitId);

    return lesson;
  }

  async bulkDelete(ids: string[]) {
    const deleted: LessonEntity[] = [];
    for (const id of ids) {
      const lesson = await this.delete(id);
      if (lesson) deleted.push(lesson);
    }
    return deleted;
  }

  async publish(id: string) {
    const lesson = await this.getById(id);
    if (!lesson) return null;
    for (const stage of lesson?.stages || []) {
      for (const block of stage.blocks || []) {
        if (block.type === "content" && block.refId) {
          const content = await this.contentLookup.findByRef(block.contentType, block.refId);
          if (content?.status !== "published") {
            return "content_not_published" as const;
          }
          if (!this.hasAcceptedHumanAudio(content.audio)) {
            return "audio_not_covered" as const;
          }
        }
        if (block.type === "proverb" && block.refId) {
          const proverb = await this.proverbs.findById(block.refId);
          if (proverb?.status !== "published") {
            return "proverbs_not_published" as const;
          }
        }
        if (block.type === "question" && block.refId) {
          const question = await this.questions.findById(block.refId);
          if (question?.status !== "published") {
            return "questions_not_published" as const;
          }
        }
      }
    }
    const published = await this.lessons.publishById(id, new Date());
    return published;
  }

  async requestAudio(id: string) {
    const lesson = await this.getById(id);
    if (!lesson) return null;

    const refs = this.listContentRefs(lesson);
    for (const ref of refs) {
      const content = await this.contentLookup.findByRef(ref.type, ref.id);
      if (!content || this.hasAcceptedHumanAudio(content.audio)) continue;
      await this.contentLookup.updateAudioByRef(ref.type, ref.id, {
        ...content.audio,
        workflowStatus: "requested",
        reviewStatus: content.audio?.reviewStatus === "accepted" ? "accepted" : "unreviewed",
        referenceType: content.audio?.referenceType || "none"
      });
    }

    return this.getById(id);
  }

  async reorder(unitId: string, lessonIds: string[]): Promise<LessonEntity[] | null> {
    const scoped = await this.lessons.findByIdsAndUnit(lessonIds, unitId);
    if (scoped.length !== lessonIds.length) return null;

    await this.lessons.reorderByIds(lessonIds);
    return this.lessons.listByUnitId(unitId);
  }
}
