/**
 * Teach `Ìyá` where the course taught `Màmá`.
 *
 * Both words mean mother and both are taught: `Màmá` in the first lesson of the course,
 * `Ìyá` three units later, teaching the same idea twice. `Ìyá` is the core Yoruba word, so it
 * takes the slot and `Màmá` is freed to be taught later as the familiar form.
 *
 * `Màmá` is NOT deleted. Its word row stays, and the sentences that no lesson uses are left
 * alone, so there is something to build on when it is taught again.
 *
 * Three kinds of change:
 *   - a sentence with no `Ìyá` twin is rewritten in place, keeping its lesson links
 *   - a sentence whose twin already exists has its lessons repointed and is retired
 *   - the teaching itself moves: the introduce link and the vocabulary card in "Good Morning"
 *     point at `Ìyá`, and the later lesson that introduced it now reviews it instead
 *
 * meaning_segments reference components by index, not by text, so they survive the swap.
 *
 *   npx tsx src/scripts/swapMamaForIya.ts            # dry run
 *   npx tsx src/scripts/swapMamaForIya.ts --apply
 */
import "dotenv/config";
import { Client } from "pg";
import { mkdirSync, writeFileSync } from "fs";
import path from "path";

const APPLY = process.argv.includes("--apply");
const lower = (s: string) => s.normalize("NFC").toLowerCase();
const swap = (text: string) => text.replace(/màmá/gi, (m) => (m[0] === m[0].toUpperCase() ? "Ìyá" : "ìyá"));

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  c.on("error", (err) => console.error(`database connection error: ${err.message}`));
  await c.connect();
  const q = async (sql: string, params?: unknown[]) => (await c.query(sql, params)).rows;

  try {
    const mama = (await q(`SELECT id FROM words WHERE language='yoruba' AND text='Màmá' AND is_deleted=false`))[0];
    const iya = (await q(`SELECT id FROM words WHERE language='yoruba' AND text='Ìyá' AND is_deleted=false`))[0];
    if (!mama || !iya) throw new Error("missing Màmá or Ìyá word row");

    const existing = new Map(
      (await q(`SELECT id, text FROM sentences WHERE language='yoruba' AND is_deleted=false`)).map((r: any) => [
        lower(r.text),
        r.id as string
      ])
    );

    const sentences = await q(
      `SELECT id, text, text_normalized FROM sentences
        WHERE language='yoruba' AND is_deleted=false AND text ILIKE '%màmá%' ORDER BY text`
    );

    const rewrite: Array<{ id: string; from: string; to: string }> = [];
    const repoint: Array<{ id: string; from: string; to: string; toId: string; links: any[] }> = [];
    const leave: string[] = [];
    const backup: Record<string, unknown> = { sentences: [], components: [], links: [], blocks: [] };

    for (const s of sentences) {
      const links = await q(
        `SELECT lci.id, lci.lesson_id, l.title AS lesson, u.title AS unit
           FROM lesson_content_items lci
           JOIN lessons l ON l.id = lci.lesson_id AND l.is_deleted = false
           JOIN units u ON u.id = l.unit_id
          WHERE lci.content_id = $1 ORDER BY lci.id`,
        [s.id]
      );
      const target = swap(s.text);
      if (!links.length) {
        leave.push(`"${s.text}"  -- in no lesson; kept for when Màmá is taught again`);
        continue;
      }
      const twin = existing.get(lower(target));
      if (twin && twin !== s.id) repoint.push({ id: s.id, from: s.text, to: target, toId: twin, links });
      else rewrite.push({ id: s.id, from: s.text, to: target });
      (backup.sentences as unknown[]).push(s);
      (backup.links as unknown[]).push(...links);
    }

    console.log(`REWRITE IN PLACE (${rewrite.length}) -- lesson links unchanged:`);
    rewrite.forEach((r) => console.log(`   "${r.from}"  ->  "${r.to}"`));
    console.log(`\nREPOINT TO EXISTING Ìyá SENTENCE (${repoint.length}):`);
    repoint.forEach((r) => {
      console.log(`   "${r.from}"  ->  "${r.to}"   (${r.links.length} lesson link(s), then retired)`);
      r.links.forEach((l) => console.log(`        ${l.unit} :: ${l.lesson}`));
    });
    console.log(`\nLEFT ALONE (${leave.length}):`);
    leave.forEach((l) => console.log(`   ${l}`));

    const introHere = await q(
      `SELECT lci.id, l.title AS lesson, u.title AS unit FROM lesson_content_items lci
         JOIN lessons l ON l.id = lci.lesson_id AND l.is_deleted=false
         JOIN units u ON u.id = l.unit_id
        WHERE lci.content_id = $1 AND lci.role='introduce'`,
      [mama.id]
    );
    const introThere = await q(
      `SELECT lci.id, l.title AS lesson, u.title AS unit FROM lesson_content_items lci
         JOIN lessons l ON l.id = lci.lesson_id AND l.is_deleted=false
         JOIN units u ON u.id = l.unit_id
        WHERE lci.content_id = $1 AND lci.role='introduce'`,
      [iya.id]
    );
    const cards = await q(
      `SELECT lb.id, l.title AS lesson FROM lesson_blocks lb
         JOIN lesson_stages st ON st.id = lb.stage_id
         JOIN lessons l ON l.id = st.lesson_id AND l.is_deleted=false
        WHERE lb.ref_id = $1`,
      [mama.id]
    );
    console.log(`\nMOVE THE TEACHING:`);
    introHere.forEach((r: any) => console.log(`   introduce link in "${r.unit} :: ${r.lesson}"  Màmá -> Ìyá`));
    cards.forEach((r: any) => console.log(`   vocabulary card in "${r.lesson}"  Màmá -> Ìyá`));
    introThere.forEach((r: any) => console.log(`   "${r.unit} :: ${r.lesson}" introduced Ìyá -> becomes a review`));

    if (!APPLY) return console.log("\ndry run -- pass --apply to write");

    mkdirSync("scratch", { recursive: true });
    for (const r of [...rewrite, ...repoint])
      (backup.components as unknown[]).push(...(await q(`SELECT * FROM sentence_components WHERE sentence_id=$1`, [r.id])));
    (backup.blocks as unknown[]).push(...cards);
    const backupPath = path.resolve("scratch", `mama-to-iya-backup-${Date.now()}.json`);
    writeFileSync(backupPath, JSON.stringify(backup, null, 2));

    await c.query("BEGIN");
    try {
      for (const r of rewrite) {
        await c.query(`UPDATE sentences SET text=$1, text_normalized=$2, updated_at=now() WHERE id=$3`, [
          r.to,
          lower(r.to),
          r.id
        ]);
        await c.query(
          `UPDATE sentence_components SET ref_id=$1, text_snapshot=$2 WHERE sentence_id=$3 AND ref_id=$4`,
          [iya.id, "Ìyá", r.id, mama.id]
        );
      }
      for (const r of repoint) {
        for (const link of r.links) {
          const clash = await q(
            `SELECT id FROM lesson_content_items WHERE lesson_id=$1 AND content_id=$2 AND id<>$3`,
            [link.lesson_id, r.toId, link.id]
          );
          if (clash.length) await c.query(`DELETE FROM lesson_content_items WHERE id=$1`, [link.id]);
          else await c.query(`UPDATE lesson_content_items SET content_id=$1, updated_at=now() WHERE id=$2`, [r.toId, link.id]);
        }
        await c.query(`UPDATE sentences SET is_deleted=true, deleted_at=now(), updated_at=now() WHERE id=$1`, [r.id]);
      }
      for (const r of introHere)
        await c.query(`UPDATE lesson_content_items SET content_id=$1, updated_at=now() WHERE id=$2`, [iya.id, r.id]);
      for (const r of cards) await c.query(`UPDATE lesson_blocks SET ref_id=$1 WHERE id=$2`, [iya.id, r.id]);
      for (const r of introThere)
        await c.query(`UPDATE lesson_content_items SET role='review', updated_at=now() WHERE id=$1`, [r.id]);
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
