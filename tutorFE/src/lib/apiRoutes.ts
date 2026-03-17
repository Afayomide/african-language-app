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
  units: () => buildBePath("/tutor/units"),
  reorderUnits: () => buildBePath("/tutor/units/reorder"),
  unit: (id: string) => buildBePath(`/tutor/units/${id}`),
  unitDeletedEntries: (id: string) => buildBePath(`/tutor/units/${id}/deleted-entries`),
  restoreDeletedUnitLesson: (id: string, lessonId: string) => buildBePath(`/tutor/units/${id}/deleted-lessons/${lessonId}/restore`),
  restoreDeletedUnitPhrase: (id: string, phraseId: string) => buildBePath(`/tutor/units/${id}/deleted-phrases/${phraseId}/restore`),
  finishUnit: (id: string) => buildBePath(`/tutor/units/${id}/finish`),
  lessons: () => buildBePath("/tutor/lessons"),
  bulkDeleteLessons: () => buildBePath("/tutor/lessons/bulk-delete"),
  reorderLessons: () => buildBePath("/tutor/lessons/reorder"),
  lesson: (id: string) => buildBePath(`/tutor/lessons/${id}`),
  auditLesson: (id: string) => buildBePath(`/tutor/lessons/${id}/audit`),
  phrases: () => buildBePath("/tutor/phrases"),
  proverbs: () => buildBePath("/tutor/proverbs"),
  bulkDeletePhrases: () => buildBePath("/tutor/phrases/bulk-delete"),
  questions: () => buildBePath("/tutor/questions"),
  question: (id: string) => buildBePath(`/tutor/questions/${id}`),
  finishLesson: (id: string) => buildBePath(`/tutor/lessons/${id}/finish`),
  finishPhrase: (id: string) => buildBePath(`/tutor/phrases/${id}/finish`),
  finishQuestion: (id: string) => buildBePath(`/tutor/questions/${id}/finish`),
  bulkPhraseAudio: (lessonId: string) => buildBePath(`/tutor/phrases/bulk/${lessonId}/generate-audio`),
  phrase: (id: string) => buildBePath(`/tutor/phrases/${id}`),
  phraseImages: (id: string) => buildBePath(`/tutor/phrases/${id}/images`),
  phraseImageLink: (id: string, linkId: string) => buildBePath(`/tutor/phrases/${id}/images/${linkId}`),
  images: () => buildBePath("/tutor/images"),
  image: (id: string) => buildBePath(`/tutor/images/${id}`),
  proverb: (id: string) => buildBePath(`/tutor/proverbs/${id}`),
  finishProverb: (id: string) => buildBePath(`/tutor/proverbs/${id}/finish`),
  generatePhraseAudio: (id: string) => buildBePath(`/tutor/phrases/${id}/generate-audio`),
  voiceAudioSubmissions: () => buildBePath("/tutor/voice-audio/submissions"),
  acceptVoiceAudioSubmission: (id: string) => buildBePath(`/tutor/voice-audio/submissions/${id}/accept`),
  rejectVoiceAudioSubmission: (id: string) => buildBePath(`/tutor/voice-audio/submissions/${id}/reject`)
};

export const beTutorAiRoutes = {
  suggestLesson: () => buildBePath("/tutor/ai/lessons/suggest"),
  refactorLessonContent: (lessonId: string) => buildBePath(`/tutor/ai/lessons/${lessonId}/refactor`),
  generateUnitContent: (unitId: string) => buildBePath(`/tutor/ai/units/${unitId}/generate-content`),
  reviseUnitContent: (unitId: string) => buildBePath(`/tutor/ai/units/${unitId}/revise`),
  generatePhrases: () => buildBePath("/tutor/ai/phrases/generate"),
  enhancePhrase: (id: string) => buildBePath(`/tutor/ai/phrases/${id}/enhance`),
  generateProverbs: () => buildBePath("/tutor/ai/proverbs/generate")
};

export const feTutorRoutes = {
  signup: () => "/api/tutor/auth/signup",
  login: () => "/api/tutor/auth",
  me: () => "/api/tutor/auth/me",
  units: () => "/api/tutor/units",
  reorderUnits: () => "/api/tutor/units/reorder",
  unit: (id: string) => `/api/tutor/units/${id}`,
  unitDeletedEntries: (id: string) => `/api/tutor/units/${id}/deleted-entries`,
  restoreDeletedUnitLesson: (id: string, lessonId: string) => `/api/tutor/units/${id}/deleted-lessons/${lessonId}/restore`,
  restoreDeletedUnitPhrase: (id: string, phraseId: string) => `/api/tutor/units/${id}/deleted-phrases/${phraseId}/restore`,
  finishUnit: (id: string) => `/api/tutor/units/${id}/finish`,
  lessons: () => "/api/tutor/lessons",
  bulkDeleteLessons: () => "/api/tutor/lessons/bulk-delete",
  reorderLessons: () => "/api/tutor/lessons/reorder",
  lesson: (id: string) => `/api/tutor/lessons/${id}`,
  auditLesson: (id: string) => `/api/tutor/lessons/${id}/audit`,
  phrases: () => "/api/tutor/phrases",
  proverbs: () => "/api/tutor/proverbs",
  bulkDeletePhrases: () => "/api/tutor/phrases/bulk-delete",
  questions: () => "/api/tutor/questions",
  question: (id: string) => `/api/tutor/questions/${id}`,
  finishLesson: (id: string) => `/api/tutor/lessons/${id}/finish`,
  finishPhrase: (id: string) => `/api/tutor/phrases/${id}/finish`,
  finishQuestion: (id: string) => `/api/tutor/questions/${id}/finish`,
  bulkPhraseAudio: (lessonId: string) => `/api/tutor/phrases/bulk/${lessonId}/generate-audio`,
  phrase: (id: string) => `/api/tutor/phrases/${id}`,
  phraseImages: (id: string) => `/api/tutor/phrases/${id}/images`,
  phraseImageLink: (id: string, linkId: string) => `/api/tutor/phrases/${id}/images/${linkId}`,
  images: () => "/api/tutor/images",
  image: (id: string) => `/api/tutor/images/${id}`,
  proverb: (id: string) => `/api/tutor/proverbs/${id}`,
  finishProverb: (id: string) => `/api/tutor/proverbs/${id}/finish`,
  generatePhraseAudio: (id: string) => `/api/tutor/phrases/${id}/generate-audio`,
  voiceAudioSubmissions: () => "/api/tutor/voice-audio/submissions",
  acceptVoiceAudioSubmission: (id: string) => `/api/tutor/voice-audio/submissions/${id}/accept`,
  rejectVoiceAudioSubmission: (id: string) => `/api/tutor/voice-audio/submissions/${id}/reject`
};

export const feTutorAiRoutes = {
  suggestLesson: () => "/api/tutor/ai/lessons/suggest",
  refactorLessonContent: (lessonId: string) => `/api/tutor/ai/lessons/${lessonId}/refactor`,
  generateUnitContent: (unitId: string) => `/api/tutor/ai/units/${unitId}/generate-content`,
  reviseUnitContent: (unitId: string) => `/api/tutor/ai/units/${unitId}/revise`,
  generatePhrases: () => "/api/tutor/ai/phrases/generate",
  enhancePhrase: (id: string) => `/api/tutor/ai/phrases/${id}/enhance`,
  generateProverbs: () => "/api/tutor/ai/proverbs/generate"
};
