import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

type AiPlanAttemptLog = {
  attempt: number;
  status: "accepted" | "rejected";
  plan: unknown;
  validation?: {
    reasons: string[];
    details?: unknown;
  };
};

type AiPlanLogEntry = {
  loggedAt: string;
  flow: "generate" | "regenerate" | "unit-refactor" | "lesson-refactor";
  planType: "unit-plan" | "unit-refactor-plan";
  unitId?: string;
  lessonId?: string;
  unitTitle?: string;
  topic?: string;
  lessonCount: number;
  finalStatus: "accepted" | "failed";
  finalPlan: unknown | null;
  attempts: AiPlanAttemptLog[];
  error?: string;
};

type AiPlanLogFile = {
  updatedAt: string;
  entries: AiPlanLogEntry[];
};

const PLAN_LOG_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../plan.json"
);

let writeQueue: Promise<void> = Promise.resolve();

async function readPlanLogFile(): Promise<AiPlanLogFile> {
  try {
    const raw = await fs.readFile(PLAN_LOG_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<AiPlanLogFile>;
    return {
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : "",
      entries: Array.isArray(parsed.entries) ? parsed.entries : []
    };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") {
      return { updatedAt: "", entries: [] };
    }
    throw error;
  }
}

export async function appendAiPlanLog(entry: AiPlanLogEntry) {
  writeQueue = writeQueue.then(async () => {
    const current = await readPlanLogFile();
    const next: AiPlanLogFile = {
      updatedAt: new Date().toISOString(),
      entries: [...current.entries, entry]
    };
    await fs.writeFile(PLAN_LOG_PATH, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  });

  await writeQueue;
}
