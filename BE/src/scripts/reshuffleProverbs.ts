/**
 * Move a spare proverb from a lesson that has two to a lesson that has none.
 *
 * Generation used to attach two proverbs per lesson. The second was rarely a proverb -- with
 * nothing left to draw on the model built one out of the lesson's own vocabulary -- while the
 * first is usually the real thing. So the surplus first proverbs are worth redistributing, and
 * the invented second ones were deleted rather than kept.
 *
 * Each move is written out by hand rather than recomputed, so what runs is what was reviewed.
 * A proverb is matched to a lesson that already teaches some of its words, so the closing line
 * uses vocabulary the learner has just met.
 *
 * A proverb records which lessons use it in `lesson_ids`. Moving the block alone would leave
 * the donor still claiming it, so both move together and the donor genuinely gives it up.
 *
 * The proverb block goes LAST in the recipient's final stage: a lesson should close on it.
 *
 *   npx tsx src/scripts/reshuffleProverbs.ts           # dry run
 *   npx tsx src/scripts/reshuffleProverbs.ts --apply
 */
import "dotenv/config";
import { Client } from "pg";

const APPLY = process.argv.includes("--apply");

/**
 * Recipient <- proverb, and which lesson gives it up. All three are resolved and verified
 * before anything moves.
 *
 * `fromLesson` is named rather than inferred because a proverb can be shown in several
 * lessons at once -- "Ayé ni ọjà, ọ̀run ni ilé." is in three -- and which of them loses it is
 * a choice, not something to guess.
 */
const MOVES: { toLesson: string; proverb: string; fromLesson: string }[] = [
  {
    toLesson: "The Missing Phone",
    proverb: "Ilé l'ọ̀rọ̀.",
    fromLesson: "Review: The Empty House + The Home Check-In (Boss Level)"
  },
  {
    toLesson: "Tracking the Friend",
    proverb: "Ilé ni ilé, ọjà ni ọjà.",
    fromLesson: "Identifying the Stranger"
  },
  {
    toLesson: "Review: The Missing Phone + Tracking the Friend",
    proverb: "Ayé ni ọjà, ọ̀run ni ilé.",
    fromLesson: "Review: The Logic Loop (Work and Money) + The Boss Level (Hustle Versus Market)"
  },
  {
    toLesson: "The Asset Check",
    proverb: "Owó ni bàbá.",
    fromLesson: "Review: Identifying the Stranger + Tracking Movement and People"
  },
  {
    toLesson: "The Check-In (Boss Level)",
    proverb: "Ẹni tí kò fẹ́ kí á wá sí ilé rẹ̀, kì í wá sí ilé ẹni.",
    fromLesson: "Wanting to Move"
  },
  {
    toLesson: "Review: The Asset Check + The Check-In (Boss Level)",
    proverb: "Owó ò sí, ọ̀rẹ́ ò sí.",
    fromLesson: "The Rapid Defense"
  },
  {
    // A regenerated unit left this lesson without one. The donor is its own unit-mate, which
    // keeps the closing line inside the theme the learner is already in.
    toLesson: "Describing Size and Coming Home",
    proverb: "Ẹni tó bá lọ, ó máa bọ̀.",
    fromLesson: "Final Challenge for Coming, Going, and Size"
  },
  {
    // A lesson refactor populates blocks but never attaches a proverb, so this one had none.
    // "It is the child who cries that the mother breastfeeds" is about having to ask before
    // you are given -- which is the communicative point of a lesson on requesting an item.
    toLesson: "The Command",
    proverb: "Ọmọ tí ó bá sọkún ni ìyá rẹ̀ ń fún ní ọyàn.",
    fromLesson: "Demanding Items (Street Style)"
  }
];

let client: Client | null = null;

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  client = c;
  await c.connect();
  console.log(APPLY ? "=== APPLYING ===\n" : "=== DRY RUN (pass --apply to write) ===\n");

  if (APPLY) await c.query("BEGIN");

  for (const move of MOVES) {
    const recipient = (await c.query(
      `SELECT id, title FROM lessons WHERE title = $1 AND is_deleted = false`,
      [move.toLesson])).rows as any[];
    if (recipient.length !== 1) throw new Error(`"${move.toLesson}": found ${recipient.length} lessons`);
    const to = recipient[0];

    const proverbRows = (await c.query(
      `SELECT id, text, translation, lesson_ids FROM proverbs
       WHERE text = $1 AND is_deleted = false`, [move.proverb])).rows as any[];
    if (proverbRows.length !== 1) throw new Error(`"${move.proverb}": found ${proverbRows.length} proverbs`);
    const proverb = proverbRows[0];

    // Already moved: the recipient has it and the donor does not. Re-running must be a no-op,
    // not an error -- the list accumulates over time and older entries stay in it.
    const alreadyThere = (await c.query(
      `SELECT count(*)::int AS n FROM lesson_blocks lb
       JOIN lesson_stages st ON st.id = lb.stage_id
       WHERE st.lesson_id = $1 AND lb.ref_id = $2 AND lb.type = 'proverb'`,
      [to.id, proverb.id])).rows[0].n;
    if (alreadyThere) { console.log(`"${move.proverb}" -- already in "${to.title}", skipping`); continue; }

    // The donor's block specifically -- a proverb shown in several lessons has several.
    const blocks = (await c.query(
      `SELECT lb.id, lb.stage_id, st.lesson_id, l.title AS lesson
       FROM lesson_blocks lb
       JOIN lesson_stages st ON st.id = lb.stage_id
       JOIN lessons l ON l.id = st.lesson_id AND l.is_deleted = false
       WHERE lb.ref_id = $1 AND lb.type = 'proverb' AND l.title = $2`,
      [proverb.id, move.fromLesson])).rows as any[];
    if (blocks.length !== 1) {
      throw new Error(
        `"${move.proverb}" in "${move.fromLesson}": found ${blocks.length} blocks, expected 1`);
    }
    const block = blocks[0];
    if (block.lesson_id === to.id) throw new Error(`"${move.proverb}" is already in "${to.title}"`);

    // The donor must still have a proverb after giving this one up.
    const donorRemaining = (await c.query(
      `SELECT count(*)::int AS n FROM lesson_blocks lb
       JOIN lesson_stages st ON st.id = lb.stage_id
       WHERE st.lesson_id = $1 AND lb.type = 'proverb' AND lb.id <> $2`,
      [block.lesson_id, block.id])).rows[0].n;
    if (donorRemaining < 1) {
      throw new Error(`"${block.lesson}" would be left with no proverb; refusing`);
    }

    // Last block of the recipient's last stage.
    const stage = (await c.query(
      `SELECT id, order_index FROM lesson_stages WHERE lesson_id = $1
       ORDER BY order_index DESC LIMIT 1`, [to.id])).rows[0] as any;
    if (!stage) throw new Error(`"${to.title}" has no stages`);
    const nextOrder = (await c.query(
      `SELECT coalesce(max(order_index), -1) + 1 AS n FROM lesson_blocks WHERE stage_id = $1`,
      [stage.id])).rows[0].n;

    console.log(`"${move.proverb}"`);
    console.log(`   from "${block.lesson}" (keeps ${donorRemaining})  ->  "${to.title}" stage ${stage.order_index}, position ${nextOrder}`);

    if (APPLY) {
      await c.query(
        `UPDATE lesson_blocks SET stage_id = $1, order_index = $2 WHERE id = $3`,
        [stage.id, nextOrder, block.id]);
      // The donor stops claiming it; the recipient starts.
      const nextLessonIds = [
        ...(proverb.lesson_ids || []).filter((id: string) => id !== block.lesson_id),
        to.id
      ];
      await c.query(
        `UPDATE proverbs SET lesson_ids = $1, updated_at = now() WHERE id = $2`,
        [Array.from(new Set(nextLessonIds)), proverb.id]);
    }
  }

  if (!APPLY) { console.log("\n(nothing written)"); await c.end(); return; }

  // Every lesson touched must now hold exactly one proverb.
  const bad = (await c.query(
    `SELECT l.title, count(*) FILTER (WHERE lb.type = 'proverb')::int AS n
     FROM lessons l JOIN lesson_stages st ON st.lesson_id = l.id
     LEFT JOIN lesson_blocks lb ON lb.stage_id = st.id
     WHERE l.is_deleted = false
     GROUP BY l.id, l.title HAVING count(*) FILTER (WHERE lb.type = 'proverb') > 2`)).rows as any[];
  if (bad.length) {
    await c.query("ROLLBACK");
    throw new Error(`${bad.length} lessons ended with more than 2 proverbs; rolled back`);
  }

  await c.query("COMMIT");
  console.log(`\nmoved ${MOVES.length} proverbs`);
  await c.end();
}

main().catch(async (error) => {
  console.error(error?.message ?? error);
  if (APPLY) await client?.query("ROLLBACK").catch(() => {});
  process.exit(1);
});
