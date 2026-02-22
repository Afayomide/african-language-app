const BE_API_URL = process.env.BE_API_URL || process.env.NEXT_PUBLIC_BE_API_URL || "http://localhost:5000";

function buildBePath(path: string) {
  const base = BE_API_URL.replace(/\/+$/, "");
  if (base.endsWith("/api")) {
    return `${base}${path}`;
  }
  return `${base}/api${path}`;
}

export const beTutorRoutes = {
  signup: () => buildBePath("/tutor/auth/signup"),
  login: () => buildBePath("/tutor/auth/login"),
  me: () => buildBePath("/tutor/auth/me"),
  lessons: () => buildBePath("/tutor/lessons"),
  reorderLessons: () => buildBePath("/tutor/lessons/reorder"),
  lesson: (id: string) => buildBePath(`/tutor/lessons/${id}`),
  phrases: () => buildBePath("/tutor/phrases"),
  questions: () => buildBePath("/tutor/questions"),
  question: (id: string) => buildBePath(`/tutor/questions/${id}`),
  finishLesson: (id: string) => buildBePath(`/tutor/lessons/${id}/finish`),
  finishPhrase: (id: string) => buildBePath(`/tutor/phrases/${id}/finish`),
  finishQuestion: (id: string) => buildBePath(`/tutor/questions/${id}/finish`),
  bulkPhraseAudio: (lessonId: string) => buildBePath(`/tutor/phrases/bulk/${lessonId}/generate-audio`),
  phrase: (id: string) => buildBePath(`/tutor/phrases/${id}`),
  generatePhraseAudio: (id: string) => buildBePath(`/tutor/phrases/${id}/generate-audio`),
  voiceAudioSubmissions: () => buildBePath("/tutor/voice-audio/submissions"),
  acceptVoiceAudioSubmission: (id: string) => buildBePath(`/tutor/voice-audio/submissions/${id}/accept`),
  rejectVoiceAudioSubmission: (id: string) => buildBePath(`/tutor/voice-audio/submissions/${id}/reject`)
};

export const beTutorAiRoutes = {
  suggestLesson: () => buildBePath("/tutor/ai/lessons/suggest"),
  generatePhrases: () => buildBePath("/tutor/ai/phrases/generate"),
  enhancePhrase: (id: string) => buildBePath(`/tutor/ai/phrases/${id}/enhance`)
};

export const feTutorRoutes = {
  signup: () => "/api/tutor/auth/signup",
  login: () => "/api/tutor/auth",
  me: () => "/api/tutor/auth/me",
  lessons: () => "/api/tutor/lessons",
  reorderLessons: () => "/api/tutor/lessons/reorder",
  lesson: (id: string) => `/api/tutor/lessons/${id}`,
  phrases: () => "/api/tutor/phrases",
  questions: () => "/api/tutor/questions",
  question: (id: string) => `/api/tutor/questions/${id}`,
  finishLesson: (id: string) => `/api/tutor/lessons/${id}/finish`,
  finishPhrase: (id: string) => `/api/tutor/phrases/${id}/finish`,
  finishQuestion: (id: string) => `/api/tutor/questions/${id}/finish`,
  bulkPhraseAudio: (lessonId: string) => `/api/tutor/phrases/bulk/${lessonId}/generate-audio`,
  phrase: (id: string) => `/api/tutor/phrases/${id}`,
  generatePhraseAudio: (id: string) => `/api/tutor/phrases/${id}/generate-audio`,
  voiceAudioSubmissions: () => "/api/tutor/voice-audio/submissions",
  acceptVoiceAudioSubmission: (id: string) => `/api/tutor/voice-audio/submissions/${id}/accept`,
  rejectVoiceAudioSubmission: (id: string) => `/api/tutor/voice-audio/submissions/${id}/reject`
};

export const feTutorAiRoutes = {
  suggestLesson: () => "/api/tutor/ai/lessons/suggest",
  generatePhrases: () => "/api/tutor/ai/phrases/generate",
  enhancePhrase: (id: string) => `/api/tutor/ai/phrases/${id}/enhance`
};
