import { asc, eq } from "drizzle-orm";
import { db } from "../client.js";
import {
  curriculumBuildArtifacts,
  type CurriculumBuildArtifactRow,
  type NewCurriculumBuildArtifactRow
} from "../schema.js";
import type {
  CurriculumBuildArtifactCriticReport,
  CurriculumBuildArtifactEntity,
  CurriculumBuildArtifactPhase,
  CurriculumBuildArtifactRefinerReport
} from "../../../../domain/entities/CurriculumBuildArtifact.js";
import type {
  CurriculumBuildArtifactCreateInput,
  CurriculumBuildArtifactRepository
} from "../../../../domain/repositories/CurriculumBuildArtifactRepository.js";

function toCritic(report: any): CurriculumBuildArtifactCriticReport | null {
  if (!report) return null;
  return {
    ok: Boolean(report.ok),
    summary: String(report.summary || ""),
    issues: (report.issues || []).map(String),
    issueDetails: Array.isArray(report.issueDetails) ? report.issueDetails : []
  };
}

function toRefiner(report: any): CurriculumBuildArtifactRefinerReport | null {
  if (!report) return null;
  return {
    fixed: Boolean(report.fixed),
    summary: String(report.summary || ""),
    fixesApplied: (report.fixesApplied || []).map(String),
    unresolvedIssues: (report.unresolvedIssues || []).map(String)
  };
}

function toEntity(row: CurriculumBuildArtifactRow): CurriculumBuildArtifactEntity {
  return {
    id: row.id,
    _id: row.id,
    jobId: String(row.jobId),
    stepKey: row.stepKey,
    phaseKey: row.phaseKey as CurriculumBuildArtifactPhase,
    scopeType: row.scopeType,
    scopeId: row.scopeId ?? null,
    scopeTitle: row.scopeTitle ?? null,
    attempt: Number(row.attempt || 1),
    status: row.status,
    summary: String(row.summary || ""),
    input: row.input ?? null,
    output: row.output ?? null,
    critic: toCritic(row.critic),
    refiner: toRefiner(row.refiner),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

export class DrizzleCurriculumBuildArtifactRepository implements CurriculumBuildArtifactRepository {
  async create(input: CurriculumBuildArtifactCreateInput): Promise<CurriculumBuildArtifactEntity> {
    const [row] = await db
      .insert(curriculumBuildArtifacts)
      .values({
        jobId: input.jobId,
        stepKey: input.stepKey,
        phaseKey: input.phaseKey,
        scopeType: input.scopeType,
        scopeId: input.scopeId || null,
        scopeTitle: input.scopeTitle || null,
        attempt: input.attempt,
        status: input.status,
        summary: input.summary ?? "",
        input: input.input || null,
        output: input.output || null,
        critic: (input.critic || null) as NewCurriculumBuildArtifactRow["critic"],
        refiner: (input.refiner || null) as NewCurriculumBuildArtifactRow["refiner"]
      })
      .returning();
    return toEntity(row);
  }

  async listByJobId(jobId: string): Promise<CurriculumBuildArtifactEntity[]> {
    const rows = await db
      .select()
      .from(curriculumBuildArtifacts)
      .where(eq(curriculumBuildArtifacts.jobId, jobId))
      .orderBy(asc(curriculumBuildArtifacts.createdAt));
    return rows.map(toEntity);
  }
}
