/**
 * Remove Báwo from the curriculum.
 *
 * Three rows existed for one phrase -- `Báwo` (word), `Báwo ni` and `Báwo ni?` (expressions) --
 * and the seven sentences containing "báwo" were split arbitrarily across them, so the same two
 * words carried three different glosses depending on the sentence. `Báwo ni` was never taught at
 * all. Rebuilding "Well-being & Checks" already left all three untaught and unlinked; this
 * finishes the job so nothing can reach for them again.
 *
 * The one sentence still in a lesson is trimmed rather than dropped: that lesson runs to eleven
 * blocks, so losing a sentence costs it more than shortening one does.
 *
 * Everything here is a soft delete. `is_deleted` flips back if this turns out to be wrong.
 *
 *   npx tsx src/scripts/scrapBawo.ts            # dry run
 *   npx tsx src/scripts/scrapBawo.ts --apply
 */
import "dotenv/config";
import { Client } from "pg";
import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import { genObjectId } from "../infrastructure/db/drizzle/ids.js";

const APPLY = process.argv.includes("--apply");
const lower = (s: string) => s.normalize("NFC").toLowerCase();

/** Drop the trailing "how are you" clause and close the sentence off. */
function trim(text: string) {
  return text.replace(/[,;]?\s*báwo\s*ni\s*\??\s*$/i, "").replace(/[,\s]+$/, "") + ".";
}
function trimEnglish(english: string) {
  return english.replace(/[,;]?\s*how\s+(are|is)\s+(you|it)\s*\??\s*$/i, "").replace(/[,\s]+$/, "") + ".";
}

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  c.on("error", (err) => console.error(`database connection error: ${err.message}`));
  await c.connect();
  const q = async (sql: string, params?: unknown[]) => (await c.query(sql, params)).rows;

  try {
    const rows = await q(
      `SELECT id, text, 'word' AS kind FROM words
        WHERE language='yoruba' AND is_deleted=false AND text IN ('Báwo','Báwo ni','Báwo ni?')
        UNION ALL
       SELECT id, text, 'expression' FROM expressions
        WHERE language='yoruba' AND is_deleted=false AND text IN ('Báwo','Báwo ni','Báwo ni?')`
    );
    const bawoIds = new Set(rows.map((r: any) => r.id as string));
    console.log(`rows to retire (${rows.length}):`);
    rows.forEach((r: any) => console.log(`   "${r.text}" [${r.kind}]`));

    const sentences = await q(
      `SELECT id, text, translations, language_id, explanation, literal_translation, difficulty, status
         FROM sentences WHERE language='yoruba' AND is_deleted=false AND lower(text) LIKE '%báwo%' ORDER BY text`
    );
    const existing = new Map(
      (await q(`SELECT id, text FROM sentences WHERE language='yoruba' AND is_deleted=false`)).map((r: any) => [
        lower(r.text),
        r.id as string
      ])
    );

    const trims: Array<{ source: any; text: string; english: string[]; newId: string; reuse?: string; links: any[] }> = [];
    const retireOnly: any[] = [];

    for (const s of sentences) {
      const links = await q(
        `SELECT lci.id, lci.lesson_id, l.title AS lesson, u.title AS unit
           FROM lesson_content_items lci
           JOIN lessons l ON l.id = lci.lesson_id AND l.is_deleted=false
           JOIN units u ON u.id = l.unit_id
          WHERE lci.content_id = $1 ORDER BY lci.id`,
        [s.id]
      );
      if (!links.length) {
        retireOnly.push(s);
        continue;
      }
      const text = trim(s.text);
      const english = (s.translations || []).map((t: string) => trimEnglish(t));
      const reuse = existing.get(lower(text));
      trims.push({ source: s, text, english, newId: reuse || genObjectId(), reuse, links });
    }

    console.log(`\nstill in a lesson -- trimmed rather than dropped (${trims.length}):`);
    for (const t of trims) {
      console.log(`   "${t.source.text}"`);
      console.log(`      -> "${t.text}"   ${t.reuse ? "(reuses an existing sentence)" : "(new sentence)"}`);
      console.log(`      English: "${(t.source.translations || [])[0]}" -> "${t.english[0]}"`);
      t.links.forEach((l) => console.log(`      link: ${l.unit} :: ${l.lesson}`));
      const comps = await q(`SELECT order_index, type, ref_id, text_snapshot FROM sentence_components WHERE sentence_id=$1 ORDER BY order_index`, [
        t.source.id
      ]);
      const keep = comps.filter((x: any) => !bawoIds.has(x.ref_id));
      console.log(`      components: ${comps.map((x: any) => x.text_snapshot).join(" + ")}`);
      console.log(`      kept:       ${keep.map((x: any) => x.text_snapshot).join(" + ")}`);
    }

    console.log(`\norphaned, retired as they stand (${retireOnly.length}):`);
    retireOnly.forEach((s: any) => console.log(`   "${s.text}"`));

    if (!APPLY) return console.log("\ndry run -- pass --apply to write");

    mkdirSync("scratch", { recursive: true });
    const backup: Record<string, unknown> = { rows, sentences, components: [], links: [] };
    for (const s of sentences)
      (backup.components as unknown[]).push(...(await q(`SELECT * FROM sentence_components WHERE sentence_id=$1`, [s.id])));
    for (const t of trims) (backup.links as unknown[]).push(...t.links);
    const backupPath = path.resolve("scratch", `scrap-bawo-backup-${Date.now()}.json`);
    writeFileSync(backupPath, JSON.stringify(backup, null, 2));

    await c.query("BEGIN");
    try {
      for (const t of trims) {
        if (!t.reuse) {
          await c.query(
            `INSERT INTO sentences (id, language_id, language, text, text_normalized, translations, explanation,
                                    literal_translation, difficulty, status, is_deleted)
             VALUES ($1,$2,'yoruba',$3,$4,$5,$6,$7,$8,$9,false)`,
            [
              t.newId,
              t.source.language_id,
              t.text,
              lower(t.text),
              t.english,
              t.source.explanation || "",
              trimEnglish(String(t.source.literal_translation || "")),
              t.source.difficulty ?? 1,
              t.source.status || "draft"
            ]
          );
          const comps = await q(`SELECT * FROM sentence_components WHERE sentence_id=$1 ORDER BY order_index`, [t.source.id]);
          let index = 0;
          for (const comp of comps) {
            if (bawoIds.has(comp.ref_id)) continue;
            await c.query(
              `INSERT INTO sentence_components (id, sentence_id, type, ref_id, order_index, text_snapshot, gloss, part_glosses)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
              [genObjectId(), t.newId, comp.type, comp.ref_id, index, comp.text_snapshot, comp.gloss, comp.part_glosses]
            );
            index += 1;
          }
        }
        for (const link of t.links) {
          const clash = await q(`SELECT id FROM lesson_content_items WHERE lesson_id=$1 AND content_id=$2 AND id<>$3`, [
            link.lesson_id,
            t.newId,
            link.id
          ]);
          if (clash.length) await c.query(`DELETE FROM lesson_content_items WHERE id=$1`, [link.id]);
          else await c.query(`UPDATE lesson_content_items SET content_id=$1, updated_at=now() WHERE id=$2`, [t.newId, link.id]);
        }
      }
      for (const s of [...trims.map((t) => t.source), ...retireOnly])
        await c.query(`UPDATE sentences SET is_deleted=true, deleted_at=now(), updated_at=now() WHERE id=$1`, [s.id]);
      for (const r of rows) {
        const table = r.kind === "word" ? "words" : "expressions";
        await c.query(`UPDATE ${table} SET is_deleted=true, deleted_at=now(), updated_at=now() WHERE id=$1`, [r.id]);
      }
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
