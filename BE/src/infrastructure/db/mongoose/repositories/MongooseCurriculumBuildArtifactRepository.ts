import type {
  CurriculumBuildArtifactCriticReport,
  CurriculumBuildArtifactEntity,
  CurriculumBuildArtifactRefinerReport
} from "../../../../domain/entities/CurriculumBuildArtifact.js";
import type {
  CurriculumBuildArtifactCreateInput,
  CurriculumBuildArtifactRepository
} from "../../../../domain/repositories/CurriculumBuildArtifactRepository.js";
import CurriculumBuildArtifactModel from "../../../../models/CurriculumBuildArtifact.js";

function toCritic(report?: {
  ok?: boolean | null;
  summary?: string | null;
  issues?: string[] | null;
  issueDetails?: Record<string, unknown>[] | null;
} | null): CurriculumBuildArtifactCriticReport | null {
  if (!report) return null;
  return {
    ok: Boolean(report.ok),
    summary: String(report.summary || ""),
    issues: (report.issues || []).map(String),
    issueDetails: Array.isArray(report.issueDetails) ? report.issueDetails : []
  };
}

function toRefiner(report?: {
  fixed?: boolean | null;
  summary?: string | null;
  fixesApplied?: string[] | null;
  unresolvedIssues?: string[] | null;
} | null): CurriculumBuildArtifactRefinerReport | null {
  if (!report) return null;
  return {
    fixed: Boolean(report.fixed),
    summary: String(report.summary || ""),
    fixesApplied: (report.fixesApplied || []).map(String),
    unresolvedIssues: (report.unresolvedIssues || []).map(String)
  };
}

function toEntity(doc: any): CurriculumBuildArtifactEntity {
  return {
    id: String(doc._id),
    _id: String(doc._id),
    jobId: String(doc.jobId),
    stepKey: doc.stepKey,
    phaseKey: doc.phaseKey,
    scopeType: doc.scopeType,
    scopeId: doc.scopeId ? String(doc.scopeId) : null,
    scopeTitle: doc.scopeTitle ? String(doc.scopeTitle) : null,
    attempt: Number(doc.attempt || 1),
    status: doc.status,
    summary: String(doc.summary || ""),
    input: doc.input || null,
    output: doc.output || null,
    critic: toCritic(doc.critic),
    refiner: toRefiner(doc.refiner),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  };
}

export class MongooseCurriculumBuildArtifactRepository implements CurriculumBuildArtifactRepository {
  async create(input: CurriculumBuildArtifactCreateInput): Promise<CurriculumBuildArtifactEntity> {
    const created = await CurriculumBuildArtifactModel.create({
      ...input,
      scopeId: input.scopeId || null,
      scopeTitle: input.scopeTitle || null,
      input: input.input || null,
      output: input.output || null,
      critic: input.critic || null,
      refiner: input.refiner || null
    });
    return toEntity(created);
  }

  async listByJobId(jobId: string): Promise<CurriculumBuildArtifactEntity[]> {
    const docs = await CurriculumBuildArtifactModel.find({ jobId }).sort({ createdAt: 1 }).lean();
    return docs.map(toEntity);
  }
}
