import "dotenv/config";
import mongoose from "mongoose";
import ExpressionModel from "../models/Expression.js";
import ExerciseQuestionModel from "../models/ExerciseQuestion.js";
import LessonContentItemModel from "../models/LessonContentItem.js";
import LessonModel from "../models/Lesson.js";

// Soft-deletes the "sentence-like" expressions -- full sentences that were wrongly stored as
// expressions (see inspectExpressionRefs.ts). Soft delete is deliberate: the Expression
// unique index is (language, textNormalized, isDeleted), so flipping isDeleted frees the slot
// and is fully reversible, and findByIds/findByText already exclude soft-deleted rows, so the
// expressions vanish from lessons immediately. Dry-run by default.
//
//   Dry run (default):
//     node --enable-source-maps --import tsx src/scripts/deleteFakeExpressions.ts --date=2026-07-14
//   Execute (expressions only):
//     DELETE_FAKE_EXPR_CONFIRM=delete-fake-expressions node --enable-source-maps --import tsx \
//       src/scripts/deleteFakeExpressions.ts --date=2026-07-14 --execute
//   Also clean orphaned questions / content-items / lesson blocks that referenced them:
//     ... --execute --include-related
//   Scope options: --language=yoruba  --date=YYYY-MM-DD  --ids=<id>,<id>
//   --include-related soft-deletes the referencing questions, hard-deletes their
//   LessonContentItem rows, and pulls the matching blocks out of the lesson stages.

const CONFIRM_VALUE = "delete-fake-expressions";

function getArg(name: string) {
  const hit = process.argv.find((a) => a.startsWith(`${name}=`));
  return hit ? hit.slice(name.length + 1) : "";
}
function hasFlag(name: string) {
  return process.argv.includes(name);
}

// Same discriminator as the generation guard (isSentenceLikeExpressionText).
function splitTokens(value: string) {
  return String(value || "")
    .split(/\s+/)
    .map((t) => t.trim().replace(/^[.,!?;:"'()\[\]{}]+|[.,!?;:"'()\[\]{}]+$/g, ""))
    .filter(Boolean);
}
const MAX_FIXED_EXPRESSION_WORDS = 4;
function isSentenceLike(value: string): boolean {
  const raw = String(value || "").trim();
  if (!raw) return false;
  if (/\.\s*$/.test(raw)) return true;
  const tokens = splitTokens(raw);
  if (tokens.length > MAX_FIXED_EXPRESSION_WORDS) return true;
  if (raw.includes(",") && tokens.length >= 4) return true;
  return false;
}

function localDayWindow(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return { start: new Date(y, m - 1, d, 0, 0, 0, 0), end: new Date(y, m - 1, d + 1, 0, 0, 0, 0) };
}

async function main() {
  const uri = process.env.MONGODB_URI || "";
  if (!uri) throw new Error("Missing MONGODB_URI");

  const execute = hasFlag("--execute");
  const dryRun = !execute;
  const includeRelated = hasFlag("--include-related");
  const language = getArg("--language").trim().toLowerCase();
  const date = getArg("--date").trim();
  const idsArg = getArg("--ids").trim();

  if (execute && process.env.DELETE_FAKE_EXPR_CONFIRM !== CONFIRM_VALUE) {
    throw new Error(`Refusing to execute. Set DELETE_FAKE_EXPR_CONFIRM=${CONFIRM_VALUE} and pass --execute.`);
  }

  await mongoose.connect(uri);

  const exprFilter: Record<string, unknown> = { isDeleted: { $ne: true } };
  if (language) exprFilter.language = language;
  if (date) {
    const { start, end } = localDayWindow(date);
    exprFilter.createdAt = { $gte: start, $lt: end };
  }
  if (idsArg) exprFilter._id = { $in: idsArg.split(",").map((s) => s.trim()).filter(Boolean) };

  const candidates = await ExpressionModel.find(exprFilter).select("_id text createdAt").lean();
  // --ids means "delete exactly these"; otherwise apply the sentence-like heuristic.
  const targets = idsArg ? candidates : candidates.filter((e) => isSentenceLike(String(e.text)));

  if (targets.length === 0) {
    console.log("[DELETE_FAKE_EXPR] No matching sentence-like expressions for the given filters.");
    return;
  }

  const ids = targets.map((e) => String(e._id));
  const idObjects = ids.map((id) => new mongoose.Types.ObjectId(id));

  // Count related records so the dry run shows the full blast radius.
  const relatedQuestionFilter = {
    isDeleted: { $ne: true },
    $or: [
      { sourceType: "expression", sourceId: { $in: idObjects } },
      { "relatedSourceRefs.id": { $in: idObjects } },
      { "interactionData.matchingPairs.contentId": { $in: idObjects } }
    ]
  };
  const [questionCount, contentItemCount, lessonWithBlockCount] = await Promise.all([
    ExerciseQuestionModel.countDocuments(relatedQuestionFilter),
    LessonContentItemModel.countDocuments({ contentType: "expression", contentId: { $in: idObjects } }),
    LessonModel.countDocuments({ "stages.blocks.refId": { $in: idObjects }, "stages.blocks.contentType": "expression" })
  ]);

  console.log(`\n[DELETE_FAKE_EXPR] ${dryRun ? "DRY RUN" : "EXECUTE"}${includeRelated ? " (with related)" : ""}`);
  console.log(`[DELETE_FAKE_EXPR] Expressions to soft-delete: ${ids.length}`);
  for (const t of targets) console.log(`   - "${t.text}"`);
  console.log(
    `[DELETE_FAKE_EXPR] Related that reference them: ` +
      `${questionCount} question(s), ${contentItemCount} lessonContentItem row(s), ${lessonWithBlockCount} lesson(s) with matching blocks.`
  );
  if (!includeRelated) {
    console.log("[DELETE_FAKE_EXPR] Related records are LEFT AS-IS (pass --include-related to clean them too).");
  }

  if (dryRun) {
    console.log(
      `\n[DELETE_FAKE_EXPR] Dry run only. To execute:\n` +
        `   DELETE_FAKE_EXPR_CONFIRM=${CONFIRM_VALUE} node --enable-source-maps --import tsx ` +
        `src/scripts/deleteFakeExpressions.ts${date ? ` --date=${date}` : ""}${language ? ` --language=${language}` : ""} ` +
        `--execute${includeRelated ? " --include-related" : ""}\n`
    );
    return;
  }

  const now = new Date();
  const exprResult = await ExpressionModel.updateMany(
    { _id: { $in: idObjects } },
    { $set: { isDeleted: true, deletedAt: now } }
  );
  console.log(`[DELETE_FAKE_EXPR] Soft-deleted expressions: ${exprResult.modifiedCount}`);

  if (includeRelated) {
    const q = await ExerciseQuestionModel.updateMany(relatedQuestionFilter, {
      $set: { isDeleted: true, deletedAt: now }
    });
    const ci = await LessonContentItemModel.deleteMany({ contentType: "expression", contentId: { $in: idObjects } });
    // Pull the matching blocks out of every stage's blocks array in one pass.
    const blocks = await LessonModel.updateMany(
      { "stages.blocks.refId": { $in: idObjects } },
      { $pull: { "stages.$[].blocks": { contentType: "expression", refId: { $in: idObjects } } } }
    );
    console.log(
      `[DELETE_FAKE_EXPR] Related cleaned: soft-deleted ${q.modifiedCount} question(s), ` +
        `hard-deleted ${ci.deletedCount || 0} content-item row(s), pulled blocks from ${blocks.modifiedCount} lesson(s).`
    );
  }

  console.log("\n[DELETE_FAKE_EXPR] Done. You can now regenerate the affected lessons.\n");
}

main()
  .catch((error) => {
    console.error("[DELETE_FAKE_EXPR] failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
