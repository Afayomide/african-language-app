import "dotenv/config";
import { inArray } from "drizzle-orm";
import { db, pool } from "../infrastructure/db/drizzle/client.js";
import { expressionComponents, expressions, sentenceComponents, sentences } from "../infrastructure/db/drizzle/schema.js";
import { DrizzleExpressionRepository } from "../infrastructure/db/drizzle/repositories/DrizzleExpressionRepository.js";
import { DrizzleSentenceRepository } from "../infrastructure/db/drizzle/repositories/DrizzleSentenceRepository.js";
import { genObjectId } from "../infrastructure/db/drizzle/ids.js";

const exprRepo = new DrizzleExpressionRepository();
const sentRepo = new DrizzleSentenceRepository();
const exprIds: string[] = [];
const sentIds: string[] = [];

function check(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail === undefined ? "" : ` -> ${JSON.stringify(detail)}`}`);
  if (!ok) process.exitCode = 1;
}

const WORD_A = genObjectId();
const WORD_B = genObjectId();
const EXPR_REF = genObjectId();

async function main() {
  /* ---------------- Expression ---------------- */
  const expr = await exprRepo.create({
    language: "yoruba",
    text: "  Ẹ Káàárọ̀  ",
    textNormalized: "ignored",
    translations: [" good morning ", "good morning"],
    pronunciation: "eh kaa-a-ro",
    explanation: "morning greeting",
    examples: [],
    difficulty: 1,
    aiMeta: { generatedByAI: false, model: "", reviewedByAdmin: false },
    audio: { provider: "", model: "", voice: "", locale: "", format: "", url: "", s3Key: "" },
    register: "formal",
    components: [
      { type: "word", refId: WORD_B, orderIndex: 1, textSnapshot: "káàárọ̀" },
      { type: "word", refId: WORD_A, orderIndex: 0, textSnapshot: "ẹ" }
    ],
    status: "draft"
  });
  exprIds.push(expr.id);

  check("expr: normalizes text", expr.text === "Ẹ Káàárọ̀" && expr.textNormalized === "ẹ káàárọ̀", expr.textNormalized);
  check("expr: dedupes translations", expr.translations.length === 1, expr.translations);
  check("expr: keeps register", expr.register === "formal");
  check("expr: components sorted by orderIndex",
    expr.components.map((c) => c.refId).join("|") === `${WORD_A}|${WORD_B}`,
    expr.components.map((c) => [c.orderIndex, c.textSnapshot]));
  check("expr: component textSnapshot round-trips", expr.components[0].textSnapshot === "ẹ");

  const exprFound = await exprRepo.findById(expr.id);
  check("expr: findById hydrates components", exprFound?.components.length === 2);

  /* ---------------- Sentence ---------------- */
  const sent = await sentRepo.create({
    language: "yoruba",
    text: "Mo fẹ́ ra omi",
    textNormalized: "ignored",
    translations: ["I want to buy water"],
    pronunciation: "",
    explanation: "",
    examples: [],
    difficulty: 2,
    aiMeta: { generatedByAI: true, model: "smoke", reviewedByAdmin: false },
    audio: { provider: "", model: "", voice: "", locale: "", format: "", url: "", s3Key: "" },
    literalTranslation: "I want buy water",
    usageNotes: "casual",
    components: [
      { type: "word", refId: WORD_A, orderIndex: 0, textSnapshot: "mo" },
      { type: "expression", refId: EXPR_REF, orderIndex: 1, textSnapshot: "fẹ́ ra" }
    ],
    meaningSegments: [
      { text: "I want", sourceWordIndexes: [0, 1], sourceComponentIndexes: [0] },
      { text: "dropped - no source indexes", sourceWordIndexes: [], sourceComponentIndexes: [] }
    ],
    status: "draft"
  });
  sentIds.push(sent.id);

  check("sent: keeps literalTranslation/usageNotes",
    sent.literalTranslation === "I want buy water" && sent.usageNotes === "casual");
  check("sent: mixed component types round-trip",
    sent.components.map((c) => c.type).join("|") === "word|expression",
    sent.components.map((c) => c.type));
  check("sent: meaningSegments filter drops empty-source rows",
    sent.meaningSegments?.length === 1, sent.meaningSegments?.length);
  check("sent: meaningSegments keep index arrays",
    sent.meaningSegments?.[0].sourceWordIndexes.join(",") === "0,1");

  /* ---------------- per-table isolation ---------------- */
  check("expression reads only its own components",
    (await exprRepo.findById(expr.id))!.components.length === 2);
  check("sentence reads only its own components",
    (await sentRepo.findById(sent.id))!.components.length === 2);

  const exprComps = await db.select().from(expressionComponents)
    .where(inArray(expressionComponents.expressionId, [expr.id]));
  const sentComps = await db.select().from(sentenceComponents)
    .where(inArray(sentenceComponents.sentenceId, [sent.id]));
  check("components split across their own tables", exprComps.length === 2 && sentComps.length === 2,
    [exprComps.length, sentComps.length]);

  /* ---------------- component replacement ---------------- */
  const exprUpdated = await exprRepo.updateById(expr.id, {
    components: [{ type: "word", refId: WORD_A, orderIndex: 0, textSnapshot: "only" }]
  });
  check("expr: update replaces components", exprUpdated?.components.length === 1, exprUpdated?.components.length);
  check("expr: update did NOT touch sentence components",
    (await sentRepo.findById(sent.id))!.components.length === 2);

  const leftover = await db.select().from(expressionComponents)
    .where(inArray(expressionComponents.expressionId, [expr.id]));
  check("expr: no orphan component rows after replace", leftover.length === 1, leftover.length);

  const cleared = await exprRepo.updateById(expr.id, { components: [] });
  check("expr: empty components array clears them", cleared?.components.length === 0);

  /* ---------------- shared content-base behaviour ---------------- */
  const renamed = await sentRepo.updateById(sent.id, { text: "  Mo Fẹ́ Ra Otí  " });
  check("sent: update recomputes textNormalized", renamed?.textNormalized === "mo fẹ́ ra otí", renamed?.textNormalized);

  const byText = await sentRepo.findByText("yoruba", " MO FẸ́ RA OTÍ ");
  check("sent: findByText case/space insensitive", byText?.id === sent.id);

  check("expr: findByText works", (await exprRepo.findByText("yoruba", "ẹ káàárọ̀"))?.id === expr.id);
  check("expr: list filters by language", (await exprRepo.list({ language: "yoruba", ids: [expr.id] })).length === 1);
  check("expr: list rejects wrong language", (await exprRepo.list({ language: "igbo", ids: [expr.id] })).length === 0);

  const softDeleted = await sentRepo.softDeleteById(sent.id);
  check("sent: softDelete sets deletedAt", !!softDeleted?.deletedAt);
  check("sent: findById hides soft-deleted", (await sentRepo.findById(sent.id)) === null);
  check("sent: listDeleted surfaces it", (await sentRepo.listDeleted({ ids: [sent.id] })).length === 1);
  check("sent: soft-deleted still keeps components",
    (await sentRepo.listDeleted({ ids: [sent.id] }))[0].components.length === 2);

  const restored = await sentRepo.restoreById(sent.id);
  check("sent: restore clears deletedAt", restored?.deletedAt === null);
  check("sent: restore keeps components", restored?.components.length === 2);

  // cleanup — and prove the new FK cascade removes components automatically
  const beforeDelete = (await db.select().from(sentenceComponents)
    .where(inArray(sentenceComponents.sentenceId, sentIds))).length;
  check("sentence has components before hard delete", beforeDelete === 2, beforeDelete);

  await db.delete(expressions).where(inArray(expressions.id, exprIds));
  await db.delete(sentences).where(inArray(sentences.id, sentIds));

  const orphanSent = await db.select().from(sentenceComponents)
    .where(inArray(sentenceComponents.sentenceId, sentIds));
  const orphanExpr = await db.select().from(expressionComponents)
    .where(inArray(expressionComponents.expressionId, exprIds));
  check("FK CASCADE removed sentence components on hard delete", orphanSent.length === 0, orphanSent.length);
  check("FK CASCADE removed expression components on hard delete", orphanExpr.length === 0, orphanExpr.length);
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
