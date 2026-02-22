const BE_API_URL = process.env.BE_API_URL

export const beAiRoutes = {
  generatePhrases: () => `${BE_API_URL}/ai/phrases/generate`,
  enhancePhrase: (id: string) => `${BE_API_URL}/ai/phrases/${id}/enhance`,
  suggestLesson: () => `${BE_API_URL}/ai/lessons/suggest`,
};

export const beAdminRoutes = {
  login: () => `${BE_API_URL}/admin/auth/login`,
  lessons: () => `${BE_API_URL}/admin/lessons`,
  reorderLessons: () => `${BE_API_URL}/admin/lessons/reorder`,
  lesson: (id: string) => `${BE_API_URL}/admin/lessons/${id}`,
  publishLesson: (id: string) => `${BE_API_URL}/admin/lessons/${id}/publish`,
  phrases: () => `${BE_API_URL}/admin/phrases`,
  bulkPhraseAudio: (lessonId: string) => `${BE_API_URL}/admin/phrases/bulk/${lessonId}/generate-audio`,
  phrase: (id: string) => `${BE_API_URL}/admin/phrases/${id}`,
  generatePhraseAudio: (id: string) => `${BE_API_URL}/admin/phrases/${id}/generate-audio`,
  publishPhrase: (id: string) => `${BE_API_URL}/admin/phrases/${id}/publish`,
  questions: () => `${BE_API_URL}/admin/questions`,
  question: (id: string) => `${BE_API_URL}/admin/questions/${id}`,
  publishQuestion: (id: string) => `${BE_API_URL}/admin/questions/${id}/publish`,
  tutors: () => `${BE_API_URL}/admin/tutors`,
  activateTutor: (id: string) => `${BE_API_URL}/admin/tutors/${id}/activate`,
  deactivateTutor: (id: string) => `${BE_API_URL}/admin/tutors/${id}/deactivate`,
  deleteTutor: (id: string) => `${BE_API_URL}/admin/tutors/${id}`,
  voiceArtists: () => `${BE_API_URL}/admin/voice-artists`,
  activateVoiceArtist: (id: string) => `${BE_API_URL}/admin/voice-artists/${id}/activate`,
  deactivateVoiceArtist: (id: string) => `${BE_API_URL}/admin/voice-artists/${id}/deactivate`,
  deleteVoiceArtist: (id: string) => `${BE_API_URL}/admin/voice-artists/${id}`,
  voiceAudioSubmissions: () => `${BE_API_URL}/admin/voice-audio/submissions`,
  acceptVoiceAudioSubmission: (id: string) => `${BE_API_URL}/admin/voice-audio/submissions/${id}/accept`,
  rejectVoiceAudioSubmission: (id: string) => `${BE_API_URL}/admin/voice-audio/submissions/${id}/reject`,
  generateBulkLessons: () => `${BE_API_URL}/admin/ai/lessons/generate-bulk`,
};

export const feAiRoutes = {
  generatePhrases: () => "/api/ai/phrases/generate",
  enhancePhrase: (id: string) => `/api/ai/phrases/${id}/enhance`,
  suggestLesson: () => "/api/ai/lessons/suggest",
};

export const feAdminRoutes = {
  login: () => "/api/admin/auth",
  lessons: () => "/api/admin/lessons",
  reorderLessons: () => "/api/admin/lessons/reorder",
  lesson: (id: string) => `/api/admin/lessons/${id}`,
  publishLesson: (id: string) => `/api/admin/lessons/${id}/publish`,
  phrases: () => "/api/admin/phrases",
  bulkPhraseAudio: (lessonId: string) => `/api/admin/phrases/bulk/${lessonId}/generate-audio`,
  phrase: (id: string) => `/api/admin/phrases/${id}`,
  generatePhraseAudio: (id: string) => `/api/admin/phrases/${id}/generate-audio`,
  publishPhrase: (id: string) => `/api/admin/phrases/${id}/publish`,
  questions: () => "/api/admin/questions",
  question: (id: string) => `/api/admin/questions/${id}`,
  publishQuestion: (id: string) => `/api/admin/questions/${id}/publish`,
  tutors: () => "/api/admin/tutors",
  activateTutor: (id: string) => `/api/admin/tutors/${id}/activate`,
  deactivateTutor: (id: string) => `/api/admin/tutors/${id}/deactivate`,
  deleteTutor: (id: string) => `/api/admin/tutors/${id}`,
  voiceArtists: () => "/api/admin/voice-artists",
  activateVoiceArtist: (id: string) => `/api/admin/voice-artists/${id}/activate`,
  deactivateVoiceArtist: (id: string) => `/api/admin/voice-artists/${id}/deactivate`,
  deleteVoiceArtist: (id: string) => `/api/admin/voice-artists/${id}`,
  voiceAudioSubmissions: () => "/api/admin/voice-audio/submissions",
  acceptVoiceAudioSubmission: (id: string) => `/api/admin/voice-audio/submissions/${id}/accept`,
  rejectVoiceAudioSubmission: (id: string) => `/api/admin/voice-audio/submissions/${id}/reject`,
  generateBulkLessons: () => "/api/admin/ai/lessons/generate-bulk",
};
