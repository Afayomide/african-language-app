/**
 * Merge content rows that differ only by a trailing full stop, then bring every
 * `text_normalized` in line with the new dedupe key.
 *
 * `normalizeContentText` used to lowercase and nothing else, so "Ụtụtụ ọma." and "Ụtụtụ ọma"
 * were two different keys and the `(language, text_normalized)` unique index let both live.
 * That is how one Igbo unit taught the bare greeting and the next unit generated it again
 * with a period: lesson 2 of "The Well-being Check" practises `Ehihie ọma.` and `Ehihie ọma`
 * as if they were separate sentences. The normalizer now drops a trailing "." (never "?" or
 * "!", which change the utterance), and `findByText` uses that same function instead of its
 * own inline lowercase -- so the two forms now collide, as they should.
 *
 * TWO JOBS, IN ORDER.
 *
 * 1. MERGE. For each colliding group the OLDEST row wins, because it is the one earlier
 *    lessons already taught. Every reference to a loser is repointed at the keeper --
 *    exercise_questions.source_id, lesson_blocks.ref_id, lesson_content_items and
 *    unit_content_items -- and the loser is HARD deleted. Soft deleting it would leave a row
 *    that the next generation's "what already exists" check still reads while no lesson can
 *    reach it.
 *
 *    lesson_content_items and unit_content_items carry a unique key on
 *    (parent, content_type, content_id), and a lesson can already hold BOTH rows -- lesson 2
 *    does. Repointing there would violate the index, so a colliding link is deleted rather
 *    than updated: the lesson keeps one link to the keeper instead of two links to what was
 *    always one sentence.
 *
 * 2. RECOMPUTE. Every live row's `text_normalized` is rewritten under the new rule. This is
 *    not optional cleanup: `findByText` now strips the trailing period from the text it looks
 *    up, so a row still storing the old key with the period would never be found again, and
 *    the next generation would create a third copy.
 *
 * GROUPING IS ON THE KEY THE RECOMPUTE WRITES, `rtrim(lower(btrim(text)), '.')`, not on the
 * stored `text_normalized`. The two disagree on 26 sentences and 2 expressions, where an old
 * normalizer mangled the key -- "Àbúrò mi nìyẹn." is stored with the key "abúrò mi nìyẹn.",
 * its first vowel stripped of its grave accent. Those rows are exact duplicates of another
 * row hiding behind a corrupted key, and grouping on the stored key misses them: the first
 * run merged the three Igbo pairs, then died on
 * `duplicate key value ... (yoruba, àbúrò mi nìyẹn)` when the recompute brought two of them
 * onto the same key. Deriving the group from `text`, exactly as the recompute does, means
 * every collision the recompute can hit is merged before it runs.
 *
 * Run with --apply to write; defaults to a dry run.
 */
import "dotenv/config";
import { Client } from "pg";

const APPLY = process.argv.includes("--apply");

/** The three content tables, with the label their links use in *_content_items rows. */
const TABLES = [
  { table: "sentences", contentType: "sentence" },
  { table: "expressions", contentType: "expression" },
  { table: "words", contentType: "word" }
] as const;

type Group = { language: string; ids: string[]; texts: string[] };

async function findGroups(client: Client, table: string): Promise<Group[]> {
  const { rows } = await client.query<Group>(
    `select language::text as language,
            array_agg(id order by created_at) as ids,
            array_agg(text order by created_at) as texts
     from ${table}
     where is_deleted = false
     group by language, rtrim(lower(btrim(text)), '.')
     having count(*) > 1`
  );
  return rows;
}

async function mergeGroup(client: Client, table: string, contentType: string, group: Group) {
  const [keeper, ...losers] = group.ids;

  for (const loser of losers) {
    await client.query(`update exercise_questions set source_id = $1 where source_id = $2 and source_type = $3`, [
      keeper,
      loser,
      contentType
    ]);
    await client.query(`update lesson_blocks set ref_id = $1 where ref_id = $2 and content_type = $3`, [
      keeper,
      loser,
      contentType
    ]);
    // Components point at the word/expression they are made of. Missing these left a Yoruba
    // sentence, "Èló ni? Méjì ni.", holding a component whose expression had just been
    // merged away -- an unresolvable reference the gloss panel cannot look up.
    await client.query(`update sentence_components set ref_id = $1 where ref_id = $2 and type = $3`, [
      keeper,
      loser,
      contentType
    ]);
    await client.query(`update expression_components set ref_id = $1 where ref_id = $2 and type = $3`, [
      keeper,
      loser,
      contentType
    ]);

    // Drop the links that would collide with the keeper's own, then repoint what is left.
    await client.query(
      `delete from lesson_content_items loser
       where loser.content_id = $1
         and exists (
           select 1 from lesson_content_items keeper
           where keeper.lesson_id = loser.lesson_id
             and keeper.content_type = loser.content_type
             and keeper.content_id = $2
         )`,
      [loser, keeper]
    );
    await client.query(`update lesson_content_items set content_id = $1 where content_id = $2`, [keeper, loser]);

    await client.query(
      `delete from unit_content_items loser
       where loser.content_id = $1
         and exists (
           select 1 from unit_content_items keeper
           where keeper.unit_id = loser.unit_id
             and keeper.content_type = loser.content_type
             and keeper.content_id = $2
         )`,
      [loser, keeper]
    );
    await client.query(`update unit_content_items set content_id = $1 where content_id = $2`, [keeper, loser]);

    // Components cascade with the row.
    await client.query(`delete from ${table} where id = $1`, [loser]);
  }
}

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    let merged = 0;

    for (const { table, contentType } of TABLES) {
      const groups = await findGroups(client, table);
      const { rows: drift } = await client.query<{ n: string }>(
        `select count(*) as n from ${table} where is_deleted = false and text_normalized <> lower(btrim(text))`
      );
      console.log(`${table}: ${groups.length} colliding group(s), ${drift[0].n} row(s) whose stored key disagrees with their text`);

      for (const group of groups) {
        const [keeperText, ...loserTexts] = group.texts;
        console.log(`  ${group.language}  keep ${JSON.stringify(keeperText)}  drop ${JSON.stringify(loserTexts)}`);

        const { rows } = await client.query<{ questions: string; lesson_links: string; unit_links: string }>(
          `select (select count(*) from exercise_questions where source_id = any($1)) as questions,
                  (select count(*) from lesson_content_items where content_id = any($1)) as lesson_links,
                  (select count(*) from unit_content_items where content_id = any($1)) as unit_links`,
          [group.ids.slice(1)]
        );
        console.log(
          `    references to repoint: ${rows[0].questions} question(s), ${rows[0].lesson_links} lesson link(s), ${rows[0].unit_links} unit link(s)`
        );

        if (APPLY) {
          await mergeGroup(client, table, contentType, group);
          merged += group.ids.length - 1;
        }
      }
    }

    if (!APPLY) {
      console.log("\ndry run -- nothing written. Re-run with --apply.");
      return;
    }

    console.log(`\nhard deleted ${merged} duplicate row(s).`);

    for (const { table } of TABLES) {
      const { rowCount } = await client.query(
        `update ${table}
         set text_normalized = rtrim(lower(btrim(text)), '.'), updated_at = now()
         where is_deleted = false and text_normalized <> rtrim(lower(btrim(text)), '.')`
      );
      console.log(`${table}: recomputed text_normalized on ${rowCount} row(s).`);
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
