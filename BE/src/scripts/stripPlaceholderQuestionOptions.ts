/**
 * Remove placeholder options -- "Option 3", "Option 4", "Word 2" -- from exercise questions.
 *
 * The option builders used to pad a multiple-choice list out to four entries when the
 * distractor pool ran dry, and a placeholder reads on screen as a real choice that is never
 * the answer. The pool runs dry exactly when a language is new: Igbo's whole corpus is five
 * words, so the first unit could not field four real options for a missing-word question.
 * The padding is gone from the builders (buildGapFillOptions, buildMissingWordOptions,
 * LessonRefactorService and the learner-side option builder); this clears what already shipped.
 *
 * Only the `options` array and `correct_index` change. `review_data` carries the sentence and
 * its word order, never a copy of the options, so it is left alone.
 *
 * A question is skipped, not written, if stripping would leave it with fewer than two real
 * options -- a single-option question is worse than a padded one. Those are reported so the
 * question can be regenerated or dropped by hand.
 *
 * Run with --apply to write; defaults to a dry run. Narrow the scope with --lesson=<id> or
 * --language=<igbo|yoruba|hausa|pidgin>; without either, every live question is in scope.
 */
import "dotenv/config";
import { Client } from "pg";

const APPLY = process.argv.includes("--apply");
const LESSON_ID = (process.argv.find((arg) => arg.startsWith("--lesson=")) || "").split("=")[1] || "";
const LANGUAGE = (process.argv.find((arg) => arg.startsWith("--language=")) || "").split("=")[1] || "";

/** "Option 3", "Word 2" -- the exact shapes the builders used to emit. */
const PLACEHOLDER = /^(?:Option|Word)\s+\d+$/i;

type Row = {
  id: string;
  subtype: string | null;
  options: string[] | null;
  correct_index: number | null;
  lesson_title: string;
  lesson_id: string;
  unit_title: string;
  language: string;
};

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    // Live rows only: a deleted lesson's questions are already out of the learner's way.
    const { rows } = await client.query<Row>(`
      select eq.id, eq.subtype, eq.options, eq.correct_index,
             l.id as lesson_id, l.title as lesson_title, u.title as unit_title, l.language
      from exercise_questions eq
      join lesson_blocks b on b.ref_id = eq.id and b.type = 'question'
      join lesson_stages s on s.id = b.stage_id
      join lessons l on l.id = s.lesson_id
      join units u on u.id = l.unit_id
      where eq.is_deleted = false
        and l.is_deleted = false
        and u.is_deleted = false
        and ($1 = '' or l.id = $1)
        and ($2 = '' or l.language::text = $2)
      order by u.order_index, l.order_index
    `, [LESSON_ID, LANGUAGE]);

    const planned: Array<{ row: Row; options: string[]; correctIndex: number }> = [];
    const skipped: Array<{ row: Row; options: string[]; reason: string }> = [];

    for (const row of rows) {
      const options = Array.isArray(row.options) ? row.options.map((item) => String(item ?? "")) : [];
      if (!options.some((item) => PLACEHOLDER.test(item.trim()))) continue;

      const correctIndex = Number(row.correct_index ?? 0);
      const answer = options[correctIndex];

      // The answer itself being a placeholder means the question never had a right answer.
      // Stripping cannot repair that, so leave it for a human.
      if (answer === undefined || PLACEHOLDER.test(String(answer).trim())) {
        skipped.push({ row, options, reason: "correct answer is itself a placeholder" });
        continue;
      }

      const kept = options.filter((item) => !PLACEHOLDER.test(item.trim()));
      if (kept.length < 2) {
        skipped.push({ row, options, reason: `only ${kept.length} real option(s) would remain` });
        continue;
      }

      planned.push({ row, options: kept, correctIndex: kept.indexOf(answer) });
    }

    console.log(`scanned ${rows.length} live questions`);
    console.log(`${planned.length} to rewrite, ${skipped.length} skipped\n`);

    for (const item of planned) {
      console.log(`${item.row.language}  ${item.row.unit_title} / ${item.row.lesson_title}`);
      console.log(`  ${item.row.id}  ${item.row.subtype}`);
      console.log(`  before: ${JSON.stringify(item.row.options)} correct_index=${item.row.correct_index}`);
      console.log(`  after:  ${JSON.stringify(item.options)} correct_index=${item.correctIndex}`);
      console.log(`  answer: ${JSON.stringify(item.options[item.correctIndex])}\n`);
    }

    for (const item of skipped) {
      console.log(`SKIPPED  ${item.row.id}  ${item.row.lesson_title}`);
      console.log(`  ${JSON.stringify(item.options)} -- ${item.reason}\n`);
    }

    if (!APPLY) {
      console.log("dry run -- nothing written. Re-run with --apply to write.");
      return;
    }

    for (const item of planned) {
      await client.query("update exercise_questions set options = $1, correct_index = $2, updated_at = now() where id = $3", [
        item.options,
        item.correctIndex,
        item.row.id
      ]);
    }

    console.log(`wrote ${planned.length} question(s).`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
