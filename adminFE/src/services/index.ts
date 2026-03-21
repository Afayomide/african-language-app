// Client-side API wrappers used by UI components.
// These call Next.js API routes under /api/*.
export {
  chapterService,
  lessonService,
  unitService,
  expressionService,
  wordService,
  sentenceService,
  imageService,
  proverbService,
  questionService,
  tutorService,
  userService,
  voiceArtistService,
  voiceAudioService
} from "./admin.service";
export { aiService } from "./ai.service";
export { authService } from "./auth";
