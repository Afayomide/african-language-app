// Client-side API wrappers used by UI components.
// These call Next.js API routes under /api/*.
export {
  lessonService,
  phraseService,
  questionService,
  tutorService,
  voiceArtistService,
  voiceAudioService
} from "./admin.service";
export { aiService } from "./ai.service";
export { authService } from "./auth";
