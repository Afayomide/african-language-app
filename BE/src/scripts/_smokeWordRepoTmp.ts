import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, pool } from "../infrastructure/db/drizzle/client.js";
import { words } from "../infrastructure/db/drizzle/schema.js";
import { DrizzleWordRepository } from "../infrastructure/db/drizzle/repositories/DrizzleWordRepository.js";

const repo = new DrizzleWordRepository();
const TEXT = "  Omi Tútù  ";
const RENAMED = "  Omi Gbóná  ";

function check(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail === undefined ? "" : ` -> ${JSON.stringify(detail)}`}`);
  if (!ok) process.exitCode = 1;
}

async function main() {
  // clean any leftovers from a previous run
  await db.delete(words).where(eq(words.textNormalized, "omi tútù"));
  await db.delete(words).where(eq(words.textNormalized, "omi gbóná"));

  const created = await repo.create({
    language: "yoruba",
    text: TEXT,
    textNormalized: "ignored-should-be-recomputed",
    translations: [" cold water ", "cold water", "  ", "chilled water"],
    pronunciation: "oh-mee too-too",
    explanation: "cold water",
    examples: [{ original: "Mo fẹ́ omi tútù", translation: "I want cold water" }],
    difficulty: 2,
    aiMeta: { generatedByAI: true, model: "smoke-test", reviewedByAdmin: false },
    audio: { provider: "", model: "", voice: "", locale: "", format: "", url: "", s3Key: "" },
    status: "draft",
    lemma: "omi",
    partOfSpeech: "noun",
    image: null
  });

  check("create returns 24-char hex id", /^[a-f\d]{24}$/i.test(created.id), created.id);
  check("create trims text", created.text === "Omi Tútù", created.text);
  check("create recomputes textNormalized", created.textNormalized === "omi tútù", created.textNormalized);
  check("create dedupes/trims translations", created.translations.length === 2, created.translations);
  check("create maps audio defaults", created.audio.workflowStatus === "missing", created.audio.workflowStatus);
  check("create returns image null when absent", created.image === null, created.image);
  check("create sets kind", created.kind === "word");

  const byId = await repo.findById(created.id);
  check("findById finds it", byId?.id === created.id);

  const byText = await repo.findByText("yoruba", "  OMI TÚTÙ ");
  check("findByText is case/space insensitive", byText?.id === created.id);

  const byIds = await repo.findByIds([created.id, "ffffffffffffffffffffffff"]);
  check("findByIds returns only existing", byIds.length === 1 && byIds[0].id === created.id);

  const listed = await repo.list({ language: "yoruba", ids: [created.id] });
  check("list finds it with language filter", listed.length === 1, listed.length);

  const listedByStatus = await repo.list({ language: "yoruba", status: "published", ids: [created.id] });
  check("list respects status filter", listedByStatus.length === 0, listedByStatus.length);

  // the deliberate fix: changing text must recompute text_normalized
  const updated = await repo.updateById(created.id, { text: RENAMED, difficulty: 4 });
  check("update trims text", updated?.text === "Omi Gbóná", updated?.text);
  check("update RECOMPUTES textNormalized", updated?.textNormalized === "omi gbóná", updated?.textNormalized);
  check("update applies other fields", updated?.difficulty === 4, updated?.difficulty);
  check("update bumps updatedAt", !!updated && updated.updatedAt >= created.updatedAt);

  const softDeleted = await repo.softDeleteById(created.id);
  check("softDelete returns row", softDeleted?.id === created.id);
  check("softDelete sets deletedAt", !!softDeleted?.deletedAt);
  check("findById hides soft-deleted", (await repo.findById(created.id)) === null);
  check("list hides soft-deleted", (await repo.list({ ids: [created.id] })).length === 0);

  const deletedList = await repo.listDeleted({ ids: [created.id] });
  check("listDeleted surfaces it", deletedList.length === 1, deletedList.length);

  // partial unique index must allow reusing the text while the old row is soft-deleted
  const reuse = await repo.create({
    language: "yoruba",
    text: RENAMED,
    textNormalized: "",
    translations: ["hot water"],
    pronunciation: "",
    explanation: "",
    examples: [],
    difficulty: 1,
    aiMeta: { generatedByAI: false, model: "", reviewedByAdmin: false },
    audio: { provider: "", model: "", voice: "", locale: "", format: "", url: "", s3Key: "" },
    status: "draft",
    lemma: "",
    partOfSpeech: "",
    image: null
  });
  check("partial unique lets soft-deleted text be reused", reuse.id !== created.id);

  // ...but a second ACTIVE row with the same text must be rejected
  let rejected = false;
  try {
    await repo.create({
      language: "yoruba",
      text: RENAMED,
      textNormalized: "",
      translations: ["dupe"],
      pronunciation: "",
      explanation: "",
      examples: [],
      difficulty: 1,
      aiMeta: { generatedByAI: false, model: "", reviewedByAdmin: false },
      audio: { provider: "", model: "", voice: "", locale: "", format: "", url: "", s3Key: "" },
      status: "draft",
      lemma: "",
      partOfSpeech: "",
      image: null
    });
  } catch {
    rejected = true;
  }
  check("partial unique rejects duplicate ACTIVE text", rejected);

  // restoring while another ACTIVE row holds the same text must fail (two active
  // rows would violate the partial unique index) — same semantics Mongo had.
  let restoreBlocked = false;
  try {
    await repo.restoreById(created.id);
  } catch {
    restoreBlocked = true;
  }
  check("restore blocked while text slot is taken by an active row", restoreBlocked);

  // free the slot, then restore should succeed
  await db.delete(words).where(eq(words.id, reuse.id));

  const restored = await repo.restoreById(created.id);
  check("restore returns row once slot is free", restored?.id === created.id);
  check("restore clears deletedAt", restored?.deletedAt === null, restored?.deletedAt);
  check("restore makes it visible again", (await repo.findById(created.id))?.id === created.id);

  // cleanup
  await db.delete(words).where(eq(words.id, created.id));
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
