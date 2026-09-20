/**
 * Clean up the review links the Màmá -> Ìyá swap left behind.
 *
 * Moving the teaching moved the introduce link and the vocabulary card, but four lessons in
 * "The 24-Hour Respect Loop" also carried Màmá as a `review` item. Reviewing a word the course
 * no longer introduces is worse than not reviewing it: the learner is drilled on something
 * they were never taught. Those links point at Ìyá instead, which is the word those lessons
 * now teach -- unless the lesson already reviews Ìyá, in which case the duplicate is dropped.
 *
 *   npx tsx src/scripts/fixMamaReviewLinks.ts            # dry run
 *   npx tsx src/scripts/fixMamaReviewLinks.ts --apply
 */
import "dotenv/config";
import { Client } from "pg";
import { mkdirSync, writeFileSync } from "fs";
import path from "path";

const APPLY = process.argv.includes("--apply");

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  c.on("error", (err) => console.error(`database connection error: ${err.message}`));
  await c.connect();
  const q = async (sql: string, params?: unknown[]) => (await c.query(sql, params)).rows;

  try {
    const mama = (await q(`SELECT id FROM words WHERE language='yoruba' AND text='Màmá' AND is_deleted=false`))[0];
    const iya = (await q(`SELECT id FROM words WHERE language='yoruba' AND text='Ìyá' AND is_deleted=false`))[0];
    if (!mama || !iya) throw new Error("missing Màmá or Ìyá word row");

    const links = await q(
      `SELECT lci.id, lci.lesson_id, lci.role, l.title AS lesson, u.title AS unit
         FROM lesson_content_items lci
         JOIN lessons l ON l.id = lci.lesson_id AND l.is_deleted = false
         JOIN units u ON u.id = l.unit_id
        WHERE lci.content_id = $1 ORDER BY lci.id`,
      [mama.id]
    );
    if (!links.length) return console.log("no live lesson links to Màmá -- nothing to do");

    const repoint: any[] = [];
    const drop: any[] = [];
    for (const link of links) {
      const clash = await q(`SELECT id FROM lesson_content_items WHERE lesson_id=$1 AND content_id=$2 AND id<>$3`, [
        link.lesson_id,
        iya.id,
        link.id
      ]);
      (clash.length ? drop : repoint).push(link);
      console.log(
        `   [${link.role}] ${link.unit} :: ${link.lesson}  ->  ${clash.length ? "DROP (lesson already has Ìyá)" : "point at Ìyá"}`
      );
    }
    console.log(`\n${repoint.length} repointed, ${drop.length} dropped`);
    if (!APPLY) return console.log("\ndry run -- pass --apply to write");

    mkdirSync("scratch", { recursive: true });
    const backupPath = path.resolve("scratch", `mama-review-links-backup-${Date.now()}.json`);
    writeFileSync(backupPath, JSON.stringify(links, null, 2));

    await c.query("BEGIN");
    try {
      for (const link of repoint)
        await c.query(`UPDATE lesson_content_items SET content_id=$1, updated_at=now() WHERE id=$2`, [iya.id, link.id]);
      for (const link of drop) await c.query(`DELETE FROM lesson_content_items WHERE id=$1`, [link.id]);
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
