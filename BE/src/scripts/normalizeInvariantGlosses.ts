/**
 * Collapse the glosses of an INVARIANT particle onto one wording.
 *
 * Per-occurrence glosses are supposed to differ between sentences -- `ni` is "is" in one and
 * "(focus marker)" in another, and that difference is real. This script is for the opposite
 * case: a word whose form and function never change, where the variation came from English
 * rather than from Yoruba.
 *
 * `ń` marks imperfective aspect and does not agree with its subject. The gloss pass phrased
 * it five ways -- "(-ing)", "is (-ing)", "am (-ing)", "are (-ing)", "is" -- because the
 * English translations say "am"/"is"/"are" depending on who is acting. A learner tapping `ń`
 * across lessons would infer it inflects. It does not. The "is/am/are" belongs to the subject
 * or the copula, and the two glossed bare "is" drop the aspect entirely, which is the same
 * error as the word-row default "are" this whole pass replaced.
 *
 * Only words listed in TARGETS are touched, and only glosses already in `from` -- so an
 * unrelated gloss, or one edited by hand afterwards, is left alone.
 *
 *   npx tsx src/scripts/normalizeInvariantGlosses.ts           # dry run
 *   npx tsx src/scripts/normalizeInvariantGlosses.ts --apply
 */
import "dotenv/config";
import { Client } from "pg";

const APPLY = process.argv.includes("--apply");

type Target = { word: string; to: string; from: string[]; why: string };

const TARGETS: Target[] = [
  {
    word: "ń",
    to: "(-ing)",
    from: ["(-ing)", "is (-ing)", "am (-ing)", "are (-ing)", "is"],
    why: "imperfective marker; invariant, so the English subject agreement does not belong to it"
  },
  // `ni` is not one word being described inconsistently -- the literature treats the copula
  // and the focus marker as homonyms in complementary distribution. The three jobs below stay
  // separate; only the wordings WITHIN each job collapse. Every gloss the pass produced is
  // listed, so nothing is left unclassified and nothing is guessed at.
  {
    word: "ni",
    to: "is/are",
    from: ["is", "It is", "it is", "He is", "She is", "are", "is it", "Is she", "are the one", "are you"],
    why: "copula; invariant in Yoruba, so is/He is/She is/are was English agreement leaking in"
  },
  {
    word: "ni",
    to: "(focus marker)",
    from: ["(focus marker)", "(focus)"],
    why: "focus marker: fronts the questioned or emphasised constituent"
  },
  {
    word: "ni",
    to: "(object marker)",
    from: ["(object marker)", "(particle)"],
    why: "marks the recipient in a give-type clause; `(particle)` named the form, not the job"
  },
  {
    word: "Ẹ",
    to: "you (respectful)",
    from: [
      "you", "you (honorific)", "you (polite)", "you (respectful)",
      "you (hon.)", "you (respect)", "you (pl.)"
    ],
    why: "one form covering plural and singular-respectful; the seven labels were one meaning"
  }
];

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  console.log(APPLY ? "=== APPLYING ===\n" : "=== DRY RUN (pass --apply to write) ===\n");
  let totalChanged = 0;

  for (const target of TARGETS) {
    console.log(`${target.word}  ->  "${target.to}"`);
    console.log(`   ${target.why}\n`);

    const rows = (await c.query(
      `SELECT sc.id, sc.gloss, s.text, s.translations[1] AS meaning
       FROM sentence_components sc
       JOIN sentences s ON s.id = sc.sentence_id AND s.is_deleted = false
       WHERE sc.text_snapshot = $1 AND sc.gloss = ANY($2)
       ORDER BY sc.gloss`,
      [target.word, target.from]
    )).rows as any[];

    const changing = rows.filter((r) => r.gloss !== target.to);
    const byGloss = new Map<string, number>();
    changing.forEach((r) => byGloss.set(r.gloss, (byGloss.get(r.gloss) || 0) + 1));

    console.log(`   unchanged (already "${target.to}") : ${rows.length - changing.length}`);
    console.log(`   changing                          : ${changing.length}`);
    for (const [gloss, count] of byGloss) console.log(`      "${gloss}" x${count}`);
    console.log();
    changing.forEach((r) =>
      console.log(`      "${r.text}"  (${r.meaning})\n           "${r.gloss}" -> "${target.to}"`));
    console.log();

    totalChanged += changing.length;
    if (!APPLY || !changing.length) continue;

    await c.query(
      `UPDATE sentence_components SET gloss = $1 WHERE id = ANY($2)`,
      [target.to, changing.map((r) => r.id)]
    );
  }

  console.log("=".repeat(60));
  console.log(`glosses ${APPLY ? "updated" : "to update"}: ${totalChanged}`);
  if (!APPLY) console.log("\n(nothing written)");
  await c.end();
}

main().catch((error) => { console.error(error); process.exit(1); });
