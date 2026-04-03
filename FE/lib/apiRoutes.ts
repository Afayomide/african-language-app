function normalizeBackendBase(raw?: string) {
  const base = (raw || "http://localhost:5000").replace(/\/+$/, "");
  return base.endsWith("/api") ? base.slice(0, -4) : base;
}

const BE_API_URL = normalizeBackendBase(process.env.BE_API_URL);

export const beLearnerRoutes = {
  signup: () => `${BE_API_URL}/api/learner/auth/signup`,
  login: () => `${BE_API_URL}/api/learner/auth/login`,
  me: () => `${BE_API_URL}/api/learner/auth/me`,
  updateProfile: () => `${BE_API_URL}/api/learner/auth/profile`,
  changePassword: () => `${BE_API_URL}/api/learner/auth/password`,
  dashboardOverview: (language?: string) =>
    `${BE_API_URL}/api/learner/dashboard/overview${language ? `?language=${encodeURIComponent(language)}` : ""}`,
  updateDailyGoal: () => `${BE_API_URL}/api/learner/dashboard/daily-goal`,
  updateLanguage: () => `${BE_API_URL}/api/learner/dashboard/language`,
  markSession: () => `${BE_API_URL}/api/learner/dashboard/session`,
  nextLesson: () => `${BE_API_URL}/api/learner/lessons/next`,
  lessonFlow: (id: string) => `${BE_API_URL}/api/learner/lessons/${id}/flow`,
  lessonOverview: (id: string) => `${BE_API_URL}/api/learner/lessons/${id}/overview`,
  lessonSteps: (id: string) => `${BE_API_URL}/api/learner/lessons/${id}/steps`,
  lessonExpressions: (id: string) => `${BE_API_URL}/api/learner/lessons/${id}/expressions`,
  lessonReviewExercises: (id: string) => `${BE_API_URL}/api/learner/lessons/${id}/review-exercises`,
  adaptiveReviewSuggestion: (id: string) => `${BE_API_URL}/api/learner/lessons/${id}/adaptive-review`,
  adaptiveReviewFlow: (id: string) => `${BE_API_URL}/api/learner/lessons/${id}/adaptive-review/flow`,
  lessonQuestions: (id: string, type: string) =>
    `${BE_API_URL}/api/learner/lessons/${id}/questions?type=${encodeURIComponent(type)}`,
  comparePronunciation: (contentType: "word" | "expression" | "sentence", id: string) =>
    `${BE_API_URL}/api/learner/pronunciation/${contentType}/${id}/compare`,
  completeStep: (id: string, stepKey: string) => `${BE_API_URL}/api/learner/lessons/${id}/steps/${stepKey}/complete`,
  completeStage: (id: string, stageIndex: number) => `${BE_API_URL}/api/learner/lessons/${id}/stages/${stageIndex}/complete`,
  completeLesson: (id: string) => `${BE_API_URL}/api/learner/lessons/${id}/complete`
};

export const feLearnerRoutes = {
  signup: () => "/api/learner/auth/signup",
  login: () => "/api/learner/auth/login",
  logout: () => "/api/learner/auth/logout",
  me: () => "/api/learner/auth/me",
  updateProfile: () => "/api/learner/auth/profile",
  changePassword: () => "/api/learner/auth/password",
  dashboardOverview: (language?: string) =>
    `/api/learner/dashboard${language ? `?language=${encodeURIComponent(language)}` : ""}`,
  updateDailyGoal: () => "/api/learner/dashboard/daily-goal",
  updateLanguage: () => "/api/learner/dashboard/language",
  markSession: () => "/api/learner/dashboard/session",
  nextLesson: () => "/api/learner/lessons/next",
  lessonFlow: (id: string) => `/api/learner/lessons/${id}/flow`,
  lessonOverview: (id: string) => `/api/learner/lessons/${id}/overview`,
  lessonSteps: (id: string) => `/api/learner/lessons/${id}/steps`,
  lessonExpressions: (id: string) => `/api/learner/lessons/${id}/expressions`,
  lessonReviewExercises: (id: string) => `/api/learner/lessons/${id}/review-exercises`,
  adaptiveReviewSuggestion: (id: string) => `/api/learner/lessons/${id}/adaptive-review`,
  adaptiveReviewFlow: (id: string) => `/api/learner/lessons/${id}/adaptive-review/flow`,
  lessonQuestions: (id: string, type: string) =>
    `/api/learner/lessons/${id}/questions?type=${encodeURIComponent(type)}`,
  comparePronunciation: (contentType: "word" | "expression" | "sentence", id: string) =>
    `/api/learner/pronunciation/${contentType}/${id}/compare`,
  completeStep: (id: string, stepKey: string) => `/api/learner/lessons/${id}/steps/${stepKey}/complete`,
  completeStage: (id: string, stageIndex: number) => `/api/learner/lessons/${id}/stages/${stageIndex}/complete`,
  completeLesson: (id: string) => `/api/learner/lessons/${id}/complete`
};
