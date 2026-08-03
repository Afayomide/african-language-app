import "dotenv/config";
import { eq, inArray } from "drizzle-orm";
import { db, pool } from "../infrastructure/db/drizzle/client.js";
import {
  curriculumBuildArtifacts, curriculumBuildJobs, expressionImageLinks,
  imageAssets, tutorProfiles, voiceArtistProfiles, voiceAudioSubmissions
} from "../infrastructure/db/drizzle/schema.js";
import { DrizzleImageAssetRepository } from "../infrastructure/db/drizzle/repositories/DrizzleImageAssetRepository.js";
import { DrizzleExpressionImageLinkRepository } from "../infrastructure/db/drizzle/repositories/DrizzleExpressionImageLinkRepository.js";
import { DrizzleTutorProfileRepository } from "../infrastructure/db/drizzle/repositories/DrizzleTutorProfileRepository.js";
import { DrizzleVoiceArtistProfileRepository } from "../infrastructure/db/drizzle/repositories/DrizzleVoiceArtistProfileRepository.js";
import { DrizzleVoiceAudioSubmissionRepository } from "../infrastructure/db/drizzle/repositories/DrizzleVoiceAudioSubmissionRepository.js";
import { DrizzleCurriculumBuildJobRepository } from "../infrastructure/db/drizzle/repositories/DrizzleCurriculumBuildJobRepository.js";
import { DrizzleCurriculumBuildArtifactRepository } from "../infrastructure/db/drizzle/repositories/DrizzleCurriculumBuildArtifactRepository.js";
import { genObjectId } from "../infrastructure/db/drizzle/ids.js";

const imgRepo = new DrizzleImageAssetRepository();
const linkRepo = new DrizzleExpressionImageLinkRepository();
const tutorRepo = new DrizzleTutorProfileRepository();
const vaRepo = new DrizzleVoiceArtistProfileRepository();
const subRepo = new DrizzleVoiceAudioSubmissionRepository();
const jobRepo = new DrizzleCurriculumBuildJobRepository();
const artifactRepo = new DrizzleCurriculumBuildArtifactRepository();

const USER = genObjectId();
const EXPR = genObjectId();
const created = { images: [] as string[], jobs: [] as string[] };

function check(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail === undefined ? "" : ` -> ${JSON.stringify(detail)}`}`);
  if (!ok) process.exitCode = 1;
}

async function main() {
  /* ---------------- ImageAsset ---------------- */
  const img = await imgRepo.create({
    url: "https://x/i.png", mimeType: "image/png", altText: "  a cup  ",
    description: "  desc  ", tags: [" fruit ", "fruit", "  ", "food"], width: 100, height: 50, uploadedBy: USER
  });
  created.images.push(img.id);
  check("img: create works", img.url === "https://x/i.png");
  check("img: altText/description trimmed", img.altText === "a cup" && img.description === "desc");
  check("img: tags trimmed + deduped", img.tags.join(",") === "fruit,food", img.tags);
  check("img: width/height persist", img.width === 100 && img.height === 50);
  check("img: default status draft", img.status === "draft");
  check("img: findById works", (await imgRepo.findById(img.id))?.id === img.id);
  check("img: list filters by status", (await imgRepo.list({ status: "draft" })).length === 1);
  check("img: list filters by uploadedBy", (await imgRepo.list({ uploadedBy: USER })).length === 1);

  const imgUpdated = await imgRepo.updateById(img.id, { status: "approved", tags: ["  x  ", "x"] });
  check("img: update status", imgUpdated?.status === "approved");
  check("img: update re-normalizes tags", imgUpdated?.tags.join(",") === "x", imgUpdated?.tags);

  const img2 = await imgRepo.create({ url: "https://x/2.png", mimeType: "image/png", altText: "b", uploadedBy: USER });
  created.images.push(img2.id);
  check("img: findByIds returns both", (await imgRepo.findByIds([img.id, img2.id])).length === 2);

  /* ---------------- ExpressionImageLink (null-index primary logic) --------- */
  const linkA = await linkRepo.create({ expressionId: EXPR, imageAssetId: img.id, isPrimary: true, createdBy: USER });
  check("link: create works", linkA.expressionId === EXPR);
  check("link: translationIndex defaults to null", linkA.translationIndex === null, linkA.translationIndex);
  check("link: isPrimary set", linkA.isPrimary === true);

  // second primary on the SAME (expression, null index) must demote the first
  const linkB = await linkRepo.create({ expressionId: EXPR, imageAssetId: img2.id, isPrimary: true, createdBy: USER });
  check("link: new primary created", linkB.isPrimary === true);
  check("link: previous primary demoted (IS NULL matching works)",
    (await linkRepo.findById(linkA.id))?.isPrimary === false, (await linkRepo.findById(linkA.id))?.isPrimary);

  // a link on a DIFFERENT translationIndex must NOT be demoted
  const linkC = await linkRepo.create({ expressionId: EXPR, imageAssetId: img.id, translationIndex: 1, isPrimary: true, createdBy: USER });
  check("link: translationIndex=1 link created", linkC.translationIndex === 1);
  await linkRepo.create({ expressionId: EXPR, imageAssetId: img2.id, translationIndex: 2, isPrimary: true, createdBy: USER });
  check("link: index-1 primary untouched by index-2 primary",
    (await linkRepo.findById(linkC.id))?.isPrimary === true);
  check("link: null-index primary still linkB", (await linkRepo.findById(linkB.id))?.isPrimary === true);

  // creating a duplicate (expression, asset, index) reuses the existing row
  const reused = await linkRepo.create({ expressionId: EXPR, imageAssetId: img2.id, isPrimary: false, notes: "n", createdBy: USER });
  check("link: duplicate reuses existing row", reused.id === linkB.id, reused.id);
  check("link: duplicate applied notes", reused.notes === "n");
  check("link: listByExpressionId returns all 4", (await linkRepo.listByExpressionId(EXPR)).length === 4);
  check("link: findActiveByExpressionAndAsset with null index",
    (await linkRepo.findActiveByExpressionAndAsset(EXPR, img.id, null))?.id === linkA.id);
  check("link: findActive with index 1", (await linkRepo.findActiveByExpressionAndAsset(EXPR, img.id, 1))?.id === linkC.id);

  await linkRepo.softDeleteByImageAssetId(img2.id, new Date());
  check("link: softDeleteByImageAssetId removes those links",
    (await linkRepo.listByExpressionId(EXPR)).length === 2);

  /* ---------------- TutorProfile ---------------- */
  const tutor = await tutorRepo.create({ userId: USER, language: "yoruba", displayName: "T", isActive: false });
  check("tutor: create works", tutor.displayName === "T" && tutor.isActive === false);
  check("tutor: findByUserId", (await tutorRepo.findByUserId(USER))?.id === tutor.id);
  check("tutor: updateActiveById", (await tutorRepo.updateActiveById(tutor.id, true))?.isActive === true);
  check("tutor: list filters by isActive", (await tutorRepo.list({ isActive: true })).length === 1);
  check("tutor: list isActive=false excludes", (await tutorRepo.list({ isActive: false })).length === 0);
  check("tutor: updateByUserId nulls language",
    (await tutorRepo.updateByUserId(USER, { language: null }))?.language === null);
  check("tutor: deleteById returns deleted row", (await tutorRepo.deleteById(tutor.id))?.id === tutor.id);
  check("tutor: gone after delete", (await tutorRepo.findByUserId(USER)) === null);

  /* ---------------- VoiceArtistProfile + Submission ---------------- */
  const artist = await vaRepo.create({ userId: USER, language: "yoruba", displayName: "V", isActive: true });
  check("artist: create works", artist.language === "yoruba");
  check("artist: findByUserId", (await vaRepo.findByUserId(USER))?.id === artist.id);

  const sub = await subRepo.create({
    contentType: "word", contentId: genObjectId(), voiceArtistUserId: USER,
    voiceArtistProfileId: artist.id, language: "yoruba",
    audio: { provider: "manual_upload", model: "", voice: "", locale: "yo-NG", format: "mp3",
      url: "https://a/x.mp3", s3Key: "k", workflowStatus: "submitted", reviewStatus: "pending" }
  });
  check("sub: create works", sub.status === "pending");
  check("sub: audio jsonb round-trips", sub.audio.url === "https://a/x.mp3" && sub.audio.s3Key === "k");
  check("sub: audio workflowStatus preserved", sub.audio.workflowStatus === "submitted");
  check("sub: list filters by status", (await subRepo.list({ status: "pending" })).length === 1);
  check("sub: list filters by artist", (await subRepo.list({ voiceArtistUserId: USER })).length === 1);

  const reviewedAt = new Date("2026-07-05T12:00:00.000Z");
  const reviewed = await subRepo.updateReview(sub.id, { status: "rejected", reviewedBy: USER, reviewedAt, rejectionReason: "noisy" });
  check("sub: review sets status/reason", reviewed?.status === "rejected" && reviewed.rejectionReason === "noisy");
  check("sub: reviewedAt persists", reviewed?.reviewedAt?.toISOString() === reviewedAt.toISOString());
  check("artist: deleteById works", (await vaRepo.deleteById(artist.id))?.id === artist.id);

  /* ---------------- CurriculumBuildJob (+ nested jsonb Dates) ------------- */
  const stepStart = new Date("2026-07-03T08:00:00.000Z");
  const job = await jobRepo.create({
    language: "yoruba", level: "beginner", requestedChapterCount: 3, topic: "market",
    createdBy: USER,
    steps: [{ key: "architect", status: "running", attempts: 1, message: "go", startedAt: stepStart, completedAt: null }],
    artifacts: { memorySummary: "mem", priorChapterTitles: ["c1"], chapterPlan: [
      { title: "Ch1", description: "d", orderIndex: 0, status: "planned", chapterId: null }] },
    errors: [{ stepKey: "architect", message: "boom", details: { a: 1 }, createdAt: stepStart }]
  });
  created.jobs.push(job.id);
  check("job: create works", job.requestedChapterCount === 3 && job.topic === "market");
  check("job: default status queued", job.status === "queued");
  check("job: languageId auto-resolved is null (no language row)", job.languageId === null);
  check("job: steps jsonb persists", job.steps[0].key === "architect" && job.steps[0].attempts === 1);
  check("job: step startedAt returns a Date (not ISO string)", job.steps[0].startedAt instanceof Date,
    typeof job.steps[0].startedAt);
  check("job: step startedAt value preserved", job.steps[0].startedAt?.toISOString() === stepStart.toISOString());
  check("job: artifacts jsonb persists", job.artifacts.memorySummary === "mem" && job.artifacts.chapterPlan.length === 1);
  check("job: errors jsonb persists", job.errors[0].message === "boom");
  check("job: error createdAt is a Date", job.errors[0].createdAt instanceof Date);
  check("job: error details preserved", (job.errors[0].details as any)?.a === 1);

  const rereadJob = await jobRepo.findById(job.id);
  check("job: dates survive a fresh DB read", rereadJob?.steps[0].startedAt instanceof Date);

  const finished = new Date("2026-07-04T00:00:00.000Z");
  const updatedJob = await jobRepo.updateById(job.id, { status: "completed", finishedAt: finished, currentStepKey: "refiner" });
  check("job: update status/step", updatedJob?.status === "completed" && updatedJob.currentStepKey === "refiner");
  check("job: finishedAt (real timestamptz column) persists",
    updatedJob?.finishedAt?.toISOString() === finished.toISOString());
  check("job: list filters by createdBy", (await jobRepo.list({ createdBy: USER })).length === 1);
  check("job: list filters by status", (await jobRepo.list({ status: "queued" })).length === 0);
  check("job: list respects limit", (await jobRepo.list({ limit: 1 })).length === 1);

  /* ---------------- CurriculumBuildArtifact ---------------- */
  const artifact = await artifactRepo.create({
    jobId: job.id, stepKey: "critic", phaseKey: "unit_plan", scopeType: "unit",
    scopeId: genObjectId(), scopeTitle: "Unit 1", attempt: 2, status: "accepted", summary: "ok",
    input: { a: 1 }, output: { b: [1, 2] },
    critic: { ok: false, summary: "issues", issues: ["i1"], issueDetails: [{ x: 1 }] },
    refiner: { fixed: true, summary: "fixed", fixesApplied: ["f1"], unresolvedIssues: [] }
  });
  check("artifact: create works", artifact.attempt === 2 && artifact.status === "accepted");
  check("artifact: input/output Mixed jsonb round-trips",
    (artifact.input as any)?.a === 1 && (artifact.output as any)?.b?.length === 2);
  check("artifact: critic report round-trips", artifact.critic?.ok === false && artifact.critic.issues[0] === "i1");
  check("artifact: critic issueDetails preserved", (artifact.critic?.issueDetails as any)?.[0]?.x === 1);
  check("artifact: refiner report round-trips", artifact.refiner?.fixed === true);
  check("artifact: listByJobId finds it", (await artifactRepo.listByJobId(job.id)).length === 1);

  // cleanup
  await db.delete(curriculumBuildArtifacts).where(inArray(curriculumBuildArtifacts.jobId, created.jobs));
  await db.delete(curriculumBuildJobs).where(inArray(curriculumBuildJobs.id, created.jobs));
  await db.delete(voiceAudioSubmissions).where(eq(voiceAudioSubmissions.voiceArtistUserId, USER));
  await db.delete(voiceArtistProfiles).where(eq(voiceArtistProfiles.userId, USER));
  await db.delete(tutorProfiles).where(eq(tutorProfiles.userId, USER));
  await db.delete(expressionImageLinks).where(eq(expressionImageLinks.expressionId, EXPR));
  await db.delete(imageAssets).where(inArray(imageAssets.id, created.images));
  console.log("\ncleanup done");
}

main()
  .catch((error) => {
    console.error("SMOKE TEST ERROR", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
