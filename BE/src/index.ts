import "dotenv/config";
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import healthRouter from "./routes/health.js";
import adminAuthRouter from "./routes/admin/auth.routes.js";
import adminLessonRouter from "./routes/admin/lesson.routes.js";
import adminPhraseRouter from "./routes/admin/phrase.routes.js";
import adminQuestionRouter from "./routes/admin/question.routes.js";
import adminTutorRouter from "./routes/admin/tutor.routes.js";
import adminLessonAiRouter from "./routes/admin/lessonAi.routes.js";
import aiPhraseRouter from "./routes/ai/phrase.routes.js";
import aiLessonRouter from "./routes/ai/lesson.routes.js";
import learnerAuthRouter from "./routes/learner/auth.routes.js";
import learnerDashboardRouter from "./routes/learner/dashboard.routes.js";
import learnerLessonRouter from "./routes/learner/lesson.routes.js";
import tutorAuthRouter from "./routes/tutor/auth.routes.js";
import tutorLessonRouter from "./routes/tutor/lesson.routes.js";
import tutorPhraseRouter from "./routes/tutor/phrase.routes.js";
import tutorAiRouter from "./routes/tutor/ai.routes.js";
import tutorQuestionRouter from "./routes/tutor/question.routes.js";

const app = express();

app.use(cors());
app.use(express.json());
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
app.use("/api/admin/lessons", adminLessonRouter);
app.use("/api/admin/phrases", adminPhraseRouter);
app.use("/api/admin/questions", adminQuestionRouter);
app.use("/api/admin/tutors", adminTutorRouter);
app.use("/api/admin/ai", adminLessonAiRouter);
app.use("/api/ai", aiPhraseRouter);
app.use("/api/ai", aiLessonRouter);
app.use("/api/learner/auth", learnerAuthRouter);
app.use("/api/learner/dashboard", learnerDashboardRouter);
app.use("/api/learner/lessons", learnerLessonRouter);
app.use("/api/tutor/auth", tutorAuthRouter);
app.use("/api/tutor/lessons", tutorLessonRouter);
app.use("/api/tutor/phrases", tutorPhraseRouter);
app.use("/api/tutor/questions", tutorQuestionRouter);
app.use("/api/tutor/ai", tutorAiRouter);

app.get("/", (req, res) => {
  res.status(200).json({ name: "language-app-be" });
});

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
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
