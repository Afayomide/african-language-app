/**
 * Backfill sentence_components.gloss from each sentence's own meaningSegments.
 *
 * A meaning segment whose `sourceComponentIndexes` names exactly one component IS that
 * component's contextual gloss -- the model saying "this word means this HERE". Until now
 * that was only used for the grouped sentence breakdown, while a word-tap fell back to the
 * shared word row's translations[0]. For a word like `ni`, whose meaning agrees with its
 * subject, no single default can be right: the learner sees "am" inside `Ọkùnrin ni.`
 * ("He is a man").
 *
 * Only components whose displayed text actually differs from the segment are written, so
 * the 730 that already agree stay NULL and keep resolving through the word row.
 *
 * Components covered by a GROUPED segment (`ò` + `sí` -> "is not") are skipped: no segment
 * describes them individually, and the grouped breakdown already reads correctly.
 *
 * Run with --apply to write; defaults to a dry run. Reversible with --clear, which nulls
 * only the glosses this script set (never the hand-set homograph ones).
 */
import "dotenv/config";
import { Client } from "pg";

const APPLY = process.argv.includes("--apply");
const CLEAR = process.argv.includes("--clear");

/** Glosses set by backfillHomographGlosses.ts -- never touched by --clear. */
const HOMOGRAPH_GLOSSES = new Set(["present", "is expensive"]);

/** Segment text is prose lifted from a translation: "Mom." / "Dad," -> "Mom" / "Dad". */
function cleanGloss(value: string): string {
  return String(value || "")
    .trim()
    .replace(/^[\s,;:.!?"'-]+|[\s,;:.!?"']+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Compare display vs segment ignoring case, punctuation, parentheticals and articles. */
function norm(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^\p{L}\p{N}\s/'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(the|a|an)\s+/, "");
}

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  if (CLEAR) {
    const res = await c.query(
      `UPDATE sentence_components SET gloss = NULL
       WHERE gloss IS NOT NULL AND NOT (gloss = ANY($1))`,
      [Array.from(HOMOGRAPH_GLOSSES)]
    );
    console.log(`cleared ${res.rowCount} backfilled glosses (homograph glosses preserved)`);
    await c.end();
    return;
  }

  const sentences = (await c.query(
    `SELECT s.id, s.text, s.meaning_segments,
            json_agg(json_build_object(
              'cid', sc.id, 'i', sc.order_index, 'ref', sc.ref_id,
              'snap', sc.text_snapshot, 'gloss', sc.gloss
            ) ORDER BY sc.order_index) AS comps
     FROM sentences s JOIN sentence_components sc ON sc.sentence_id = s.id
     WHERE s.is_deleted = false
     GROUP BY s.id`
  )).rows as any[];

  const entities = new Map(
    [
      ...(await c.query(`SELECT id, translations FROM words`)).rows,
      ...(await c.query(`SELECT id, translations FROM expressions`)).rows
    ].map((r: any) => [r.id, r])
  );

  const updates: Array<{ cid: string; gloss: string; snap: string; shown: string; sentence: string }> = [];
  let skippedGrouped = 0;
  let alreadyAgree = 0;
  let keptExisting = 0;

  for (const s of sentences) {
    const segments = Array.isArray(s.meaning_segments) ? s.meaning_segments : [];
    const singles = new Map<number, string>();
    for (const seg of segments) {
      const idx = Array.isArray(seg?.sourceComponentIndexes) ? seg.sourceComponentIndexes : [];
      if (idx.length === 1) singles.set(Number(idx[0]), String(seg.text || ""));
    }

    for (const comp of s.comps || []) {
      if (comp.gloss) { keptExisting += 1; continue; }   // homograph glosses win
      const raw = singles.get(Number(comp.i));
      if (!raw) { skippedGrouped += 1; continue; }
      const gloss = cleanGloss(raw);
      if (!gloss) { skippedGrouped += 1; continue; }
      const shown = String(entities.get(comp.ref)?.translations?.[0] || "");
      if (norm(shown) === norm(gloss)) { alreadyAgree += 1; continue; }
      updates.push({ cid: comp.cid, gloss, snap: comp.snap, shown, sentence: s.text });
    }
  }

  console.log(APPLY ? "=== APPLYING ===\n" : "=== DRY RUN (pass --apply to write) ===\n");
  updates.slice(0, 20).forEach((u) =>
    console.log(`  "${u.snap}" in "${u.sentence}"\n       "${u.shown}" -> "${u.gloss}"`));
  if (updates.length > 20) console.log(`  ... and ${updates.length - 20} more`);

  console.log(`\n${"=".repeat(60)}`);
  console.log(`already correct, left NULL        : ${alreadyAgree}`);
  console.log(`grouped segment, no single gloss  : ${skippedGrouped}`);
  console.log(`hand-set homograph glosses kept   : ${keptExisting}`);
  console.log(`components to gloss               : ${updates.length}`);

  if (!APPLY) { console.log("\n(nothing written)"); await c.end(); return; }

  try {
    await c.query("BEGIN");
    // Grouped by gloss so a few hundred rows go out as a handful of statements.
    const byGloss = new Map<string, string[]>();
    for (const u of updates) {
      if (!byGloss.has(u.gloss)) byGloss.set(u.gloss, []);
      byGloss.get(u.gloss)!.push(u.cid);
    }
    for (const [gloss, ids] of byGloss) {
      await c.query(`UPDATE sentence_components SET gloss = $2 WHERE id = ANY($1)`, [ids, gloss]);
    }
    await c.query("COMMIT");
    console.log(`\ncommitted ${updates.length} glosses across ${byGloss.size} distinct values`);
  } catch (error) {
    await c.query("ROLLBACK");
    throw error;
  }

  await c.end();
}

main().catch((error) => { console.error(error); process.exit(1); });
