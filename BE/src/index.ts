import "dotenv/config";
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import healthRouter from "./routes/health.js";
import adminAuthRouter from "./routes/admin/auth.routes.js";
import adminChapterRouter from "./routes/admin/chapter.routes.js";
import adminLessonRouter from "./routes/admin/lesson.routes.js";
import adminUnitRouter from "./routes/admin/unit.routes.js";
import adminExpressionRouter from "./routes/admin/expression.routes.js";
import adminWordRouter from "./routes/admin/word.routes.js";
import adminSentenceRouter from "./routes/admin/sentence.routes.js";
import adminImageRouter from "./routes/admin/image.routes.js";
import adminProverbRouter from "./routes/admin/proverb.routes.js";
import adminQuestionRouter from "./routes/admin/question.routes.js";
import adminTutorRouter from "./routes/admin/tutor.routes.js";
import adminUserRouter from "./routes/admin/user.routes.js";
import adminVoiceArtistRouter from "./routes/admin/voiceArtist.routes.js";
import adminVoiceAudioReviewRouter from "./routes/admin/voiceAudioReview.routes.js";
import adminLessonAiRouter from "./routes/admin/lessonAi.routes.js";
import aiExpressionRouter from "./routes/ai/expression.routes.js";
import aiLessonRouter from "./routes/ai/lesson.routes.js";
import learnerAuthRouter from "./routes/learner/auth.routes.js";
import learnerDashboardRouter from "./routes/learner/dashboard.routes.js";
import learnerLessonRouter from "./routes/learner/lesson.routes.js";
import learnerPronunciationRouter from "./routes/learner/pronunciation.routes.js";
import tutorAuthRouter from "./routes/tutor/auth.routes.js";
import tutorChapterRouter from "./routes/tutor/chapter.routes.js";
import tutorLessonRouter from "./routes/tutor/lesson.routes.js";
import tutorUnitRouter from "./routes/tutor/unit.routes.js";
import tutorExpressionRouter from "./routes/tutor/expression.routes.js";
import tutorWordRouter from "./routes/tutor/word.routes.js";
import tutorSentenceRouter from "./routes/tutor/sentence.routes.js";
import tutorImageRouter from "./routes/tutor/image.routes.js";
import tutorProverbRouter from "./routes/tutor/proverb.routes.js";
import tutorAiRouter from "./routes/tutor/ai.routes.js";
import tutorQuestionRouter from "./routes/tutor/question.routes.js";
import tutorVoiceAudioRouter from "./routes/tutor/voiceAudio.routes.js";
import voiceAuthRouter from "./routes/voice/auth.routes.js";
import voiceContentRouter from "./routes/voice/content.routes.js";

const app = express();
const requestBodyLimit = process.env.REQUEST_BODY_LIMIT || "16mb";

app.use(cors());
app.use(express.json({ limit: requestBodyLimit }));
app.use(express.urlencoded({ extended: true, limit: requestBodyLimit }));
app.use((req, res, next) => {
  const shouldLog = process.env.REQUEST_LOGS === "1" || process.env.NODE_ENV !== "production";
  if (!shouldLog) return next();

  const start = Date.now();
  res.on("finish", () => {
    const durationMs = Date.now() - start;
    // Keep logs focused on errors and slower requests.
    if (res.statusCode >= 400 || durationMs >= 300) {
      console.log(
        `[REQ] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${durationMs}ms)`
      );
    }
  });
  return next();
});

app.use("/health", healthRouter);
app.use("/api/admin/auth", adminAuthRouter);
app.use("/api/admin/chapters", adminChapterRouter);
app.use("/api/admin/units", adminUnitRouter);
app.use("/api/admin/lessons", adminLessonRouter);
app.use("/api/admin/expressions", adminExpressionRouter);
app.use("/api/admin/words", adminWordRouter);
app.use("/api/admin/sentences", adminSentenceRouter);
app.use("/api/admin/images", adminImageRouter);
app.use("/api/admin/proverbs", adminProverbRouter);
app.use("/api/admin/questions", adminQuestionRouter);
app.use("/api/admin/tutors", adminTutorRouter);
app.use("/api/admin/users", adminUserRouter);
app.use("/api/admin/voice-artists", adminVoiceArtistRouter);
app.use("/api/admin/voice-audio", adminVoiceAudioReviewRouter);
app.use("/api/admin/ai", adminLessonAiRouter);
app.use("/api/ai", aiExpressionRouter);
app.use("/api/ai", aiLessonRouter);
app.use("/api/learner/auth", learnerAuthRouter);
app.use("/api/learner/dashboard", learnerDashboardRouter);
app.use("/api/learner/lessons", learnerLessonRouter);
app.use("/api/learner/pronunciation", learnerPronunciationRouter);
app.use("/api/tutor/auth", tutorAuthRouter);
app.use("/api/tutor/chapters", tutorChapterRouter);
app.use("/api/tutor/units", tutorUnitRouter);
app.use("/api/tutor/lessons", tutorLessonRouter);
app.use("/api/tutor/expressions", tutorExpressionRouter);
app.use("/api/tutor/words", tutorWordRouter);
app.use("/api/tutor/sentences", tutorSentenceRouter);
app.use("/api/tutor/images", tutorImageRouter);
app.use("/api/tutor/proverbs", tutorProverbRouter);
app.use("/api/tutor/questions", tutorQuestionRouter);
app.use("/api/tutor/ai", tutorAiRouter);
app.use("/api/tutor/voice-audio", tutorVoiceAudioRouter);
app.use("/api/voice/auth", voiceAuthRouter);
app.use("/api/voice/content", voiceContentRouter);

app.get("/", (req, res) => {
  res.status(200).json({ name: "language-app-be" });
});

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (
    typeof err === "object" &&
    err !== null &&
    "type" in err &&
    (err as { type?: string }).type === "entity.too.large"
  ) {
    return res.status(413).json({ error: "request_entity_too_large" });
  }
  console.error("Unhandled error", err);
  res.status(500).json({ error: "internal_server_error" });
});

const port = Number(process.env.PORT) || 4000;
const mongoUri = process.env.MONGODB_URI || "";

async function start() {
  if (!mongoUri) {
    console.error("Missing MONGODB_URI");
    process.exit(1);
  }

  try {
    await mongoose.connect(mongoUri);
    console.log("Connected to MongoDB");
  } catch (error) {
    console.error("Failed to connect to MongoDB", error);
    process.exit(1);
  }

  app.listen(port, () => {
    console.log(`API listening on http://localhost:${port}`);
  });
}

start();
