import type { LessonEntity } from "../../../../domain/entities/Lesson.js";
import type { PhraseEntity } from "../../../../domain/entities/Phrase.js";
import type { QuestionEntity } from "../../../../domain/entities/Question.js";
import type { LessonRepository } from "../../../../domain/repositories/LessonRepository.js";
import type { PhraseRepository } from "../../../../domain/repositories/PhraseRepository.js";
import type { QuestionRepository } from "../../../../domain/repositories/QuestionRepository.js";
import type { LearnerProfileRepository } from "../../../../domain/repositories/LearnerProfileRepository.js";
import type {
  LessonProgressEntity,
  LessonStepProgressEntity
} from "../../../../domain/entities/LessonProgress.js";
import type { LessonProgressRepository } from "../../../../domain/repositories/LessonProgressRepository.js";

export const LESSON_STEPS = [
  { key: "vocabulary", title: "Vocabulary", description: "Learn essential words", route: "/exercise?type=vocabulary" },
  { key: "practice", title: "Practice", description: "Fill in the blanks", route: "/exercise?type=practice" },
  { key: "listening", title: "Listening", description: "Hear native speakers", route: "/listening-exercise" },
  { key: "review", title: "Review", description: "Test your knowledge", route: "/sentence-builder" }
] as const;

function toStepProgress(progress: LessonStepProgressEntity[]) {
  const byKey = new Map(progress.map((item) => [item.stepKey, item]));
  return LESSON_STEPS.map((step, idx) => {
    const saved = byKey.get(step.key);
    return {
      id: idx + 1,
      key: step.key,
      title: step.title,
      description: step.description,
      status: (saved?.status || (idx === 3 ? "locked" : "available")) as "locked" | "available" | "completed",
      route: step.route
    };
  });
}

function buildReviewFallback(question: {
  phrase?: { text: string; translation: string };
  reviewData?: QuestionEntity["reviewData"];
}) {
  const sentence = String(question.reviewData?.sentence || question.phrase?.text || "").trim();
  const meaning = String(question.reviewData?.meaning || question.phrase?.translation || "").trim();
  const existingWords = Array.isArray(question.reviewData?.words)
    ? question.reviewData?.words?.map((w) => String(w).trim()).filter(Boolean)
    : [];
  const words = existingWords && existingWords.length > 1 ? existingWords : sentence.split(" ").filter(Boolean);
  const providedOrder = Array.isArray(question.reviewData?.correctOrder)
    ? question.reviewData?.correctOrder
    : [];
  const validProvidedOrder =
    providedOrder.length === words.length &&
    providedOrder.every((idx) => Number.isInteger(idx) && idx >= 0 && idx < words.length) &&
    new Set(providedOrder).size === providedOrder.length;
  const correctOrder = validProvidedOrder ? providedOrder : words.map((_, idx) => idx);
  return { sentence, words, correctOrder, meaning };
}

export class LearnerLessonUseCases {
  constructor(
    private readonly lessons: LessonRepository,
    private readonly phrases: PhraseRepository,
    private readonly questions: QuestionRepository,
    private readonly progress: LessonProgressRepository,
    private readonly learnerProfiles: LearnerProfileRepository
  ) {}

  private async ensureProgress(userId: string, lesson: LessonEntity): Promise<LessonProgressEntity> {
    const existing = await this.progress.findByUserAndLessonId(userId, lesson.id);
    if (existing) return existing;

    return this.progress.create({
      userId,
      lessonId: lesson.id,
      status: "not_started",
      progressPercent: 0,
      stepProgress: LESSON_STEPS.map((step, idx) => ({
        stepKey: step.key,
        status: idx === 3 ? "locked" : "available",
        score: 0
      }))
    });
  }

  async getNextLesson(userId: string) {
    const profile = await this.learnerProfiles.findByUserId(userId);
    if (!profile) return "profile_not_found" as const;

    const lessons = await this.lessons.list({
      status: "published",
      language: profile.currentLanguage
    });

    const progresses = await this.progress.listByUserAndLessonIds(
      userId,
      lessons.map((lesson) => lesson.id)
    );
    const completed = new Set(progresses.filter((p) => p.status === "completed").map((p) => p.lessonId));

    const next = lessons.find((lesson) => !completed.has(lesson.id)) || lessons[0];
    return next || null;
  }

  async getLessonOverview(userId: string, lessonId: string) {
    const lesson = await this.lessons.findById(lessonId);
    if (!lesson || lesson.status !== "published") return null;

    const progress = await this.ensureProgress(userId, lesson);
    const steps = toStepProgress(progress.stepProgress);

    const profile = await this.learnerProfiles.findByUserId(userId);
    const language = profile?.currentLanguage || lesson.language;
    const allLanguageLessons = await this.lessons.list({ status: "published", language });
    const futureLessons = allLanguageLessons
      .filter((item) => item.orderIndex > (lesson.orderIndex ?? 0))
      .slice(0, 3);

    return {
      lesson,
      progress,
      steps,
      comingNext: futureLessons.map((item) => ({ id: item.id, title: item.title }))
    };
  }

  async getLessonSteps(userId: string, lessonId: string) {
    const lesson = await this.lessons.findById(lessonId);
    if (!lesson || lesson.status !== "published") return null;

    const progress = await this.ensureProgress(userId, lesson);
    return { steps: toStepProgress(progress.stepProgress), progressPercent: progress.progressPercent };
  }

  async completeStep(input: { userId: string; lessonId: string; stepKey: string; score?: number }) {
    const lesson = await this.lessons.findById(input.lessonId);
    if (!lesson || lesson.status !== "published") return "lesson_not_found" as const;

    if (!LESSON_STEPS.some((step) => step.key === input.stepKey)) {
      return "invalid_step_key" as const;
    }

    const progress = await this.ensureProgress(input.userId, lesson);
    const stepProgress = [...progress.stepProgress];
    const idx = stepProgress.findIndex((item) => item.stepKey === input.stepKey);
    if (idx === -1) return "step_not_found" as const;

    stepProgress[idx] = {
      ...stepProgress[idx],
      status: "completed",
      score: Number(input.score) || stepProgress[idx].score || 0,
      completedAt: new Date()
    };

    if (idx + 1 < stepProgress.length && stepProgress[idx + 1].status === "locked") {
      stepProgress[idx + 1] = { ...stepProgress[idx + 1], status: "available" };
    }

    const completedCount = stepProgress.filter((item) => item.status === "completed").length;
    const progressPercent = Math.round((completedCount / LESSON_STEPS.length) * 100);
    const status = progressPercent >= 100 ? "completed" : "in_progress";

    const updated = await this.progress.updateById(progress.id, {
      stepProgress,
      progressPercent,
      status,
      startedAt: progress.startedAt || new Date(),
      completedAt: status === "completed" ? progress.completedAt || new Date() : progress.completedAt
    });

    if (!updated) return "lesson_not_found" as const;

    return {
      progressPercent: updated.progressPercent,
      status: updated.status,
      steps: toStepProgress(updated.stepProgress)
    };
  }

  async completeLesson(input: {
    userId: string;
    lessonId: string;
    xpEarned?: number;
    minutesSpent?: number;
  }) {
    const lesson = await this.lessons.findById(input.lessonId);
    if (!lesson || lesson.status !== "published") return "lesson_not_found" as const;

    const progress = await this.ensureProgress(input.userId, lesson);
    const wasCompleted = progress.status === "completed";

    const stepProgress = progress.stepProgress.map((step) => ({ ...step, status: "completed" as const }));
    const xpEarned = Math.max(progress.xpEarned, Number(input.xpEarned) || 50);

    const updatedProgress = await this.progress.updateById(progress.id, {
      stepProgress,
      status: "completed",
      progressPercent: 100,
      xpEarned,
      startedAt: progress.startedAt || new Date(),
      completedAt: new Date()
    });

    if (!updatedProgress) return "lesson_not_found" as const;

    const profile = await this.learnerProfiles.findByUserId(input.userId);
    if (profile && !wasCompleted) {
      const now = new Date();
      const todayKey = now.toISOString().slice(0, 10);
      const weekly = [...(profile.weeklyActivity || [])];
      const idx = weekly.findIndex((item) => new Date(item.date).toISOString().slice(0, 10) === todayKey);
      const minutes = Number(input.minutesSpent) || 10;
      if (idx >= 0) {
        weekly[idx] = { ...weekly[idx], minutes: weekly[idx].minutes + minutes };
      } else {
        weekly.push({ date: now, minutes });
      }

      const achievements = [...profile.achievements];
      if (!achievements.includes("First Step")) {
        achievements.push("First Step");
      }

      await this.learnerProfiles.updateByUserId(input.userId, {
        totalXp: profile.totalXp + updatedProgress.xpEarned,
        completedLessonsCount: profile.completedLessonsCount + 1,
        weeklyActivity: weekly,
        lastActiveDate: now,
        achievements
      });
    }

    return {
      lessonId: lesson.id,
      xpEarned: updatedProgress.xpEarned,
      progressPercent: updatedProgress.progressPercent,
      status: updatedProgress.status
    };
  }

  async getLessonPhrases(lessonId: string): Promise<PhraseEntity[] | null> {
    const lesson = await this.lessons.findById(lessonId);
    if (!lesson || lesson.status !== "published") return null;

    const phrases = await this.phrases.list({ lessonId, status: "published" });
    return phrases.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async getLessonQuestions(lessonId: string, type: QuestionEntity["type"]) {
    const lesson = await this.lessons.findById(lessonId);
    if (!lesson || lesson.status !== "published") return null;

    const questions = await this.questions.list({ lessonId, type, status: "published" });
    const phrases = await this.phrases.findByIds(questions.map((q) => q.phraseId));
    const phraseById = new Map(phrases.map((p) => [p.id, p]));

    const mapped = questions
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((q) => {
        const phrase = phraseById.get(q.phraseId);
        if (!phrase) return null;

        return {
          id: q.id,
          phrase: {
            _id: phrase.id,
            text: phrase.text,
            translation: phrase.translation,
            pronunciation: phrase.pronunciation,
            explanation: phrase.explanation,
            audio: phrase.audio
          },
          prompt: String(q.promptTemplate || "").replace("{phrase}", String(phrase.text || "")),
          options: q.options,
          correctIndex: q.correctIndex,
          explanation: q.explanation,
          type: q.type
        };
      })
      .filter(Boolean);

    return mapped;
  }

  async getLessonReviewExercises(lessonId: string) {
    const lesson = await this.lessons.findById(lessonId);
    if (!lesson || lesson.status !== "published") return null;

    const questions = await this.questions.list({ lessonId, type: "review", status: "published" });
    const phrases = await this.phrases.findByIds(questions.map((q) => q.phraseId));
    const phraseById = new Map(phrases.map((p) => [p.id, p]));

    return questions
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((q) => {
        const phrase = phraseById.get(q.phraseId);
        if (!phrase) return null;

        const review = buildReviewFallback({
          phrase: { text: phrase.text, translation: phrase.translation },
          reviewData: q.reviewData
        });

        return {
          id: q.id,
          prompt: String(q.promptTemplate || "").replace("{phrase}", String(phrase.text || "")),
          sentence: review.sentence,
          words: review.words,
          correctOrder: review.correctOrder,
          meaning: review.meaning,
          phrase: {
            _id: phrase.id,
            text: phrase.text,
            translation: phrase.translation,
            pronunciation: phrase.pronunciation,
            explanation: phrase.explanation,
            audio: phrase.audio
          }
        };
      })
      .filter(Boolean);
  }
}
