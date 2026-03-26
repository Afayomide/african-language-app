import api from "@/lib/api";
import { feLearnerRoutes } from "@/lib/apiRoutes";

export const learnerAuthService = {
  async signup(data: {
    name: string;
    email: string;
    password: string;
    language?: "yoruba" | "igbo" | "hausa";
    dailyGoalMinutes?: number;
  }) {
    const response = await api.post(feLearnerRoutes.signup(), data);
    return response.data;
  },

  async login(email: string, password: string) {
    const response = await api.post(feLearnerRoutes.login(), { email, password });
    return response.data;
  },

  async me() {
    const response = await api.get(feLearnerRoutes.me());
    return response.data;
  },

  async updateProfile(data: {
    displayName?: string;
    proficientLanguage?: string;
    countryOfOrigin?: string;
    currentLanguage?: "yoruba" | "igbo" | "hausa";
    dailyGoalMinutes?: number;
  }) {
    const response = await api.put(feLearnerRoutes.updateProfile(), data);
    return response.data;
  },

  async logout() {
    await api.post(feLearnerRoutes.logout(), {});
  }
};

export const learnerDashboardService = {
  async getOverview(language?: "yoruba" | "igbo" | "hausa") {
    const response = await api.get(feLearnerRoutes.dashboardOverview(language));
    return response.data;
  },

  async updateDailyGoal(minutes: number) {
    const response = await api.put(feLearnerRoutes.updateDailyGoal(), { minutes });
    return response.data;
  },

  async updateLanguage(language: "yoruba" | "igbo" | "hausa") {
    const response = await api.put(feLearnerRoutes.updateLanguage(), { language });
    return response.data;
  },

  async markSession(minutes: number) {
    const response = await api.post(feLearnerRoutes.markSession(), { minutes });
    return response.data;
  }
};

export const learnerLessonService = {
  async getNextLesson() {
    const response = await api.get(feLearnerRoutes.nextLesson());
    return response.data;
  },

  async getLessonOverview(lessonId: string) {
    const response = await api.get(feLearnerRoutes.lessonOverview(lessonId));
    return response.data;
  },

  async getLessonFlow(lessonId: string) {
    const response = await api.get(feLearnerRoutes.lessonFlow(lessonId));
    return response.data;
  },

  async getLessonSteps(lessonId: string) {
    const response = await api.get(feLearnerRoutes.lessonSteps(lessonId));
    return response.data;
  },

  async getLessonExpressions(lessonId: string) {
    const response = await api.get(feLearnerRoutes.lessonExpressions(lessonId));
    return response.data;
  },

  async getLessonReviewExercises(lessonId: string) {
    const response = await api.get(feLearnerRoutes.lessonReviewExercises(lessonId));
    return response.data;
  },

  async getLessonQuestions(lessonId: string, type: string) {
    const response = await api.get(feLearnerRoutes.lessonQuestions(lessonId, type));
    return response.data;
  },

  async comparePronunciation(
    contentType: "word" | "expression" | "sentence",
    contentId: string,
    payload: {
      audioUpload?: {
        base64?: string;
        mimeType?: string;
        analysis?: Record<string, unknown>;
      };
      audioAnalysis?: Record<string, unknown>;
    }
  ) {
    const response = await api.post(feLearnerRoutes.comparePronunciation(contentType, contentId), payload);
    return response.data;
  },

  async completeStep(lessonId: string, stepKey: string, score?: number) {
    const response = await api.put(feLearnerRoutes.completeStep(lessonId, stepKey), { score });
    return response.data;
  },

  async completeStage(
    lessonId: string,
    stageIndex: number,
    payload?: {
      xpEarned?: number;
      minutesSpent?: number;
      questionResults?: Array<{
        questionId?: string;
        sourceType?: "word" | "expression" | "sentence";
        sourceId?: string;
        questionType?: string;
        questionSubtype?: string;
        attempts?: number;
        incorrectAttempts?: number;
        correct?: boolean;
      }>;
    }
  ) {
    const response = await api.post(feLearnerRoutes.completeStage(lessonId, stageIndex), payload || {});
    return response.data;
  },

  async getAdaptiveReviewSuggestion(lessonId: string) {
    const response = await api.get(feLearnerRoutes.adaptiveReviewSuggestion(lessonId));
    return response.data;
  },

  async getAdaptiveReviewFlow(lessonId: string) {
    const response = await api.get(feLearnerRoutes.adaptiveReviewFlow(lessonId));
    return response.data;
  },

  async completeLesson(lessonId: string, payload?: { xpEarned?: number; minutesSpent?: number }) {
    const response = await api.post(feLearnerRoutes.completeLesson(lessonId), payload || {});
    return response.data;
  }
};
