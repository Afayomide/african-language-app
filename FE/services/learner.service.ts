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
    if (response.data?.token) {
      localStorage.setItem("learnerToken", response.data.token);
      localStorage.setItem("learnerUser", JSON.stringify(response.data.user));
    }
    return response.data;
  },

  async login(email: string, password: string) {
    const response = await api.post(feLearnerRoutes.login(), { email, password });
    if (response.data?.token) {
      localStorage.setItem("learnerToken", response.data.token);
      localStorage.setItem("learnerUser", JSON.stringify(response.data.user));
    }
    return response.data;
  },

  logout() {
    localStorage.removeItem("learnerToken");
    localStorage.removeItem("learnerUser");
    window.location.href = "/auth/login";
  }
};

export const learnerDashboardService = {
  async getOverview() {
    const response = await api.get(feLearnerRoutes.dashboardOverview());
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

  async getLessonPhrases(lessonId: string) {
    const response = await api.get(feLearnerRoutes.lessonPhrases(lessonId));
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

  async completeStep(lessonId: string, stepKey: string, score?: number) {
    const response = await api.put(feLearnerRoutes.completeStep(lessonId, stepKey), { score });
    return response.data;
  },

  async completeLesson(lessonId: string, payload?: { xpEarned?: number; minutesSpent?: number }) {
    const response = await api.post(feLearnerRoutes.completeLesson(lessonId), payload || {});
    return response.data;
  }
};
