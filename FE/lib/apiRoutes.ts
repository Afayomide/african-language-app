function normalizeBackendBase(raw?: string) {
  const base = (raw || "http://localhost:5000").replace(/\/+$/, "");
  return base.endsWith("/api") ? base.slice(0, -4) : base;
}

const BE_API_URL = normalizeBackendBase(process.env.BE_API_URL);

export const beLearnerRoutes = {
  signup: () => `${BE_API_URL}/api/learner/auth/signup`,
  login: () => `${BE_API_URL}/api/learner/auth/login`,
  dashboardOverview: () => `${BE_API_URL}/api/learner/dashboard/overview`,
  updateDailyGoal: () => `${BE_API_URL}/api/learner/dashboard/daily-goal`,
  updateLanguage: () => `${BE_API_URL}/api/learner/dashboard/language`,
  markSession: () => `${BE_API_URL}/api/learner/dashboard/session`,
  nextLesson: () => `${BE_API_URL}/api/learner/lessons/next`,
  lessonFlow: (id: string) => `${BE_API_URL}/api/learner/lessons/${id}/flow`,
  lessonOverview: (id: string) => `${BE_API_URL}/api/learner/lessons/${id}/overview`,
  lessonSteps: (id: string) => `${BE_API_URL}/api/learner/lessons/${id}/steps`,
  lessonPhrases: (id: string) => `${BE_API_URL}/api/learner/lessons/${id}/phrases`,
  lessonReviewExercises: (id: string) => `${BE_API_URL}/api/learner/lessons/${id}/review-exercises`,
  lessonQuestions: (id: string, type: string) =>
    `${BE_API_URL}/api/learner/lessons/${id}/questions?type=${encodeURIComponent(type)}`,
  completeStep: (id: string, stepKey: string) => `${BE_API_URL}/api/learner/lessons/${id}/steps/${stepKey}/complete`,
  completeLesson: (id: string) => `${BE_API_URL}/api/learner/lessons/${id}/complete`
};

export const feLearnerRoutes = {
  signup: () => "/api/learner/auth/signup",
  login: () => "/api/learner/auth/login",
  dashboardOverview: () => "/api/learner/dashboard",
  updateDailyGoal: () => "/api/learner/dashboard/daily-goal",
  updateLanguage: () => "/api/learner/dashboard/language",
  markSession: () => "/api/learner/dashboard/session",
  nextLesson: () => "/api/learner/lessons/next",
  lessonFlow: (id: string) => `/api/learner/lessons/${id}/flow`,
  lessonOverview: (id: string) => `/api/learner/lessons/${id}/overview`,
  lessonSteps: (id: string) => `/api/learner/lessons/${id}/steps`,
  lessonPhrases: (id: string) => `/api/learner/lessons/${id}/phrases`,
  lessonReviewExercises: (id: string) => `/api/learner/lessons/${id}/review-exercises`,
  lessonQuestions: (id: string, type: string) =>
    `/api/learner/lessons/${id}/questions?type=${encodeURIComponent(type)}`,
  completeStep: (id: string, stepKey: string) => `/api/learner/lessons/${id}/steps/${stepKey}/complete`,
  completeLesson: (id: string) => `/api/learner/lessons/${id}/complete`
};
