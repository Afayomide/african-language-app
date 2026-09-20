/**
 * Retire `Ẹ káalẹ́` by splitting its sentences evenly between morning and afternoon.
 *
 * The evening greeting is taught twice in the course under two spellings, and the course
 * leans heavily on morning: 16 sentences against afternoon's 5. Rather than sending every
 * evening sentence to morning and widening that gap, each sentence's lesson slots are dealt
 * alternately to `Ẹ káàárọ̀` and `Ẹ káàsán`, so both greetings gain lessons.
 *
 * A variant that already exists is reused rather than duplicated, and a lesson that already
 * holds the variant simply loses the old link instead of gaining a second copy of the same
 * sentence.
 *
 * Sentences containing `báwo ni` are skipped: Báwo is being removed from the curriculum
 * entirely, so converting them would create rows that are about to be deleted.
 *
 *   npx tsx src/scripts/splitEveningGreeting.ts            # dry run, prints every action
 *   npx tsx src/scripts/splitEveningGreeting.ts --apply
 */
import "dotenv/config";
import { Client } from "pg";
import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import { genObjectId } from "../infrastructure/db/drizzle/ids.js";

const APPLY = process.argv.includes("--apply");
const EVENING = "Ẹ káalẹ́";

type Variant = { label: "morning" | "afternoon"; greeting: string; english: string };
const VARIANTS: Variant[] = [
  { label: "morning", greeting: "Ẹ káàárọ̀", english: "Good morning" },
  { label: "afternoon", greeting: "Ẹ káàsán", english: "Good afternoon" }
];

const lower = (s: string) => s.normalize("NFC").toLowerCase();

/** Swap the greeting, keeping the rest of the sentence and its capitalisation intact. */
function swapText(text: string, greeting: string) {
  return text.replace(/Ẹ káalẹ́/g, greeting).replace(/ẹ káalẹ́/g, greeting.toLowerCase());
}
function swapEnglish(english: string, replacement: string) {
  return english.replace(/Good evening/g, replacement).replace(/good evening/g, replacement.toLowerCase());
}

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  c.on("error", (err) => console.error(`database connection error: ${err.message}`));
  await c.connect();
  const q = async (sql: string, params?: unknown[]) => (await c.query(sql, params)).rows;

  try {
    const expressions = await q(
      `SELECT id, text FROM expressions WHERE language='yoruba' AND is_deleted=false AND text = ANY($1)`,
      [[EVENING, ...VARIANTS.map((v) => v.greeting)]]
    );
    const expressionId = new Map(expressions.map((r: any) => [r.text, r.id as string]));
    const eveningId = expressionId.get(EVENING);
    if (!eveningId) throw new Error(`no expression row for ${EVENING}`);
    for (const v of VARIANTS) if (!expressionId.get(v.greeting)) throw new Error(`no expression row for ${v.greeting}`);

    const sources = await q(
      `SELECT s.id, s.text, s.translations, s.language_id, s.explanation, s.literal_translation, s.difficulty, s.status
         FROM sentences s
        WHERE s.language='yoruba' AND s.is_deleted=false AND s.text ILIKE '%káalẹ́%'
        ORDER BY s.text`
    );

    const existing = new Map(
      (await q(`SELECT id, text FROM sentences WHERE language='yoruba' AND is_deleted=false`)).map((r: any) => [
        lower(r.text),
        r.id as string
      ])
    );

    const backup: Record<string, unknown> = { sentences: [], components: [], links: [] };
    const plan: string[] = [];
    const creates: Array<{ id: string; text: string; source: any; variant: Variant }> = [];
    const relinks: Array<{ linkId: string; from: string; toText: string; lesson: string; variant: string }> = [];
    const dropLinks: Array<{ linkId: string; lesson: string; reason: string }> = [];
    const retire: string[] = [];
    let dealt = 0;

    for (const source of sources) {
      const links = await q(
        `SELECT lci.id, lci.lesson_id, l.title AS lesson, u.title AS unit
           FROM lesson_content_items lci
           JOIN lessons l ON l.id = lci.lesson_id AND l.is_deleted = false
           JOIN units u ON u.id = l.unit_id
          WHERE lci.content_id = $1
          ORDER BY lci.id`,
        [source.id]
      );
      if (/báwo/i.test(source.text)) {
        plan.push(`SKIP  "${source.text}"  (${links.length} lesson link(s)) -- goes with the Báwo removal`);
        continue;
      }
      if (!links.length) {
        plan.push(`ORPHAN  "${source.text}"  -- in no lesson; left alone`);
        continue;
      }

      // `Káalẹ́, àbúrò.` greets with the bare word rather than the `Ẹ káalẹ́` expression, so the
      // swap above would leave it unchanged and it would be "reused" as its own replacement.
      if (VARIANTS.some((v) => swapText(source.text, v.greeting) === source.text)) {
        plan.push(`SKIP  "${source.text}"  -- greeting is not the ${EVENING} expression; needs a hand-written replacement`);
        continue;
      }

      plan.push(`\n"${source.text}"  (${links.length} lesson link(s))`);
      const targets = new Map<string, { id: string; text: string; variant: Variant; isNew: boolean }>();
      for (const v of VARIANTS) {
        const text = swapText(source.text, v.greeting);
        const found = existing.get(lower(text));
        targets.set(v.label, { id: found || genObjectId(), text, variant: v, isNew: !found });
      }

      // Deal the lesson slots alternately, continuing the alternation across sentences so an
      // odd count does not always favour the same greeting. If the dealt greeting is already
      // in that lesson, try the other one before giving up -- these lessons are short enough
      // that losing a sentence costs more than a slightly uneven split.
      const used = new Set<string>();
      for (const link of links) {
        const order = [VARIANTS[dealt % VARIANTS.length]!, VARIANTS[(dealt + 1) % VARIANTS.length]!];
        dealt += 1;
        let placed = false;
        for (const v of order) {
          const target = targets.get(v.label)!;
          const clash = await q(
            `SELECT id FROM lesson_content_items WHERE lesson_id = $1 AND content_id = $2 AND id <> $3`,
            [link.lesson_id, target.id, link.id]
          );
          if (clash.length) continue;
          relinks.push({ linkId: link.id, from: source.id, toText: target.text, lesson: `${link.unit} :: ${link.lesson}`, variant: v.label });
          plan.push(`   "${link.lesson}" -> ${v.label}${v.label !== order[0].label ? "  (other greeting was already there)" : ""}`);
          used.add(v.label);
          placed = true;
          break;
        }
        if (!placed) {
          dropLinks.push({ linkId: link.id, lesson: `${link.unit} :: ${link.lesson}`, reason: "lesson already holds both greetings" });
          plan.push(`   drop link in "${link.lesson}" -- it already holds both greetings`);
        }
        (backup.links as unknown[]).push(link);
      }

      // Only build a variant something actually points at.
      for (const label of used) {
        const target = targets.get(label)!;
        if (target.isNew) {
          creates.push({ id: target.id, text: target.text, source, variant: target.variant });
          existing.set(lower(target.text), target.id);
          plan.push(`   ${label.padEnd(9)} -> CREATE "${target.text}"`);
        } else {
          plan.push(`   ${label.padEnd(9)} -> reuse existing "${target.text}"`);
        }
      }
      retire.push(source.id);
      (backup.sentences as unknown[]).push(source);
    }

    console.log(plan.join("\n"));
    console.log(
      `\nsummary: ${creates.length} sentence(s) to create, ${relinks.length} lesson link(s) repointed, ` +
        `${dropLinks.length} duplicate link(s) dropped, ${retire.length} evening sentence(s) retired`
    );
    const byVariant = relinks.reduce<Record<string, number>>((a, r) => ((a[r.variant] = (a[r.variant] || 0) + 1), a), {});
    console.log(`split: ${JSON.stringify(byVariant)}`);
    if (!APPLY) return console.log("\ndry run -- pass --apply to write");

    mkdirSync("scratch", { recursive: true });
    for (const id of retire)
      (backup.components as unknown[]).push(...(await q(`SELECT * FROM sentence_components WHERE sentence_id=$1`, [id])));
    const backupPath = path.resolve("scratch", `evening-greeting-backup-${Date.now()}.json`);
    writeFileSync(backupPath, JSON.stringify(backup, null, 2));

    await c.query("BEGIN");
    try {
      for (const create of creates) {
        const text = create.text;
        const english = (create.source.translations || []).map((t: string) => swapEnglish(t, create.variant.english));
        await c.query(
          `INSERT INTO sentences (id, language_id, language, text, text_normalized, translations, explanation,
                                  literal_translation, difficulty, status, is_deleted)
           VALUES ($1,$2,'yoruba',$3,$4,$5,$6,$7,$8,$9,false)`,
          [
            create.id,
            create.source.language_id,
            text,
            lower(text),
            english,
            create.source.explanation || "",
            swapEnglish(String(create.source.literal_translation || ""), create.variant.english),
            create.source.difficulty ?? 1,
            create.source.status || "draft"
          ]
        );
        // Copy the components, pointing the greeting at the new expression.
        const components = await q(`SELECT * FROM sentence_components WHERE sentence_id=$1 ORDER BY order_index`, [
          create.source.id
        ]);
        for (const comp of components) {
          const isGreeting = comp.ref_id === eveningId;
          await c.query(
            `INSERT INTO sentence_components (id, sentence_id, type, ref_id, order_index, text_snapshot, gloss, part_glosses)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [
              genObjectId(),
              create.id,
              comp.type,
              isGreeting ? expressionId.get(create.variant.greeting) : comp.ref_id,
              comp.order_index,
              isGreeting ? create.variant.greeting : comp.text_snapshot,
              isGreeting ? create.variant.english.toLowerCase() : comp.gloss,
              comp.part_glosses
            ]
          );
        }
      }
      const idOf = new Map(creates.map((x) => [lower(x.text), x.id]));
      for (const relink of relinks) {
        const target = idOf.get(lower(relink.toText)) || existing.get(lower(relink.toText));
        await c.query(`UPDATE lesson_content_items SET content_id=$1, updated_at=now() WHERE id=$2`, [target, relink.linkId]);
      }
      for (const drop of dropLinks) await c.query(`DELETE FROM lesson_content_items WHERE id=$1`, [drop.linkId]);
      for (const id of retire)
        await c.query(`UPDATE sentences SET is_deleted=true, deleted_at=now(), updated_at=now() WHERE id=$1`, [id]);
      await c.query("COMMIT");
    } catch (err) {
      await c.query("ROLLBACK");
      throw err;
    }
    console.log(`\napplied. previous state saved to ${backupPath}`);
  } finally {
    await c.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
