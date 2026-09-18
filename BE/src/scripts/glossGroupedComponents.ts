/**
 * Ask the model for a per-word gloss on the components no other source can supply.
 *
 * A sentence's meaning map pairs chunks of target text to chunks of English. When a chunk
 * covers ONE component ("Níbo" -> "Where") that pairing IS the component's contextual gloss,
 * and backfillComponentGlosses.ts already copied those across. When a chunk covers SEVERAL
 * ("ni" + "o" + "wà" -> "are you") it says nothing about any one of them, so those
 * components were left NULL and the learner fell back to the shared word row -- where `ń`
 * leads with "are" and `ni` with "am", each wrong the moment the subject disagrees.
 *
 * Sentences generated from now on carry this data already (SentenceDraftPersistenceService
 * stores the model's per-component meaning at write time). This script is the retroactive
 * pass for content generated before that column existed, where the per-word answer was
 * unioned into the shared word row and the link to the occurrence discarded.
 *
 * Scope guards, because this writes model output into learner-facing content:
 *   - only components that are inside a grouped segment AND currently NULL are touched;
 *     hand-set homograph glosses and the 354 already backfilled are never overwritten
 *   - the model is asked ONLY for English glosses. It never sees an instruction to alter
 *     target-language text, and any response whose component text differs from what is
 *     stored is discarded for that sentence -- tone marks and spelling are not up for
 *     revision here
 *   - a gloss longer than GLOSS_MAX_CHARS, or one that echoes the whole translation, is
 *     rejected as the model having restated the sentence instead of glossing a word
 *
 * Every proposal is written to glossProposals.json for review whether or not --apply is
 * passed, so the run can be inspected before and audited after.
 *
 *   npx tsx src/scripts/glossGroupedComponents.ts             # dry run, all sentences
 *   npx tsx src/scripts/glossGroupedComponents.ts --limit 10  # dry run, first 10
 *   npx tsx src/scripts/glossGroupedComponents.ts --apply     # write
 *   npx tsx src/scripts/glossGroupedComponents.ts --clear     # undo: null what this wrote
 */
import "dotenv/config";
import { Client } from "pg";
import { writeFileSync, readFileSync, existsSync } from "fs";
import { getLlmClient } from "../services/llm/index.js";
import { GLOSS_MAX_CHARS } from "../services/llm/componentGloss.js";

const APPLY = process.argv.includes("--apply");
const CLEAR = process.argv.includes("--clear");
const LIMIT = (() => {
  const at = process.argv.indexOf("--limit");
  if (at < 0) return Infinity;
  const value = Number.parseInt(process.argv[at + 1] || "", 10);
  return Number.isFinite(value) && value > 0 ? value : Infinity;
})();

/** Sample only sentences where this exact word is one of the components needing a gloss. */
const WORD_FILTER = (() => {
  const at = process.argv.indexOf("--word");
  return at < 0 ? "" : String(process.argv[at + 1] || "").trim();
})();

const PROPOSALS_PATH = "src/scripts/glossProposals.json";

type Component = { cid: string; index: number; text: string };
type Proposal = { cid: string; index: number; text: string; gloss: string; sentence: string };

function byIndexText(comps: Component[], index: number) {
  return comps.find((c) => c.index === index)?.text || "";
}

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  if (CLEAR) {
    if (!existsSync(PROPOSALS_PATH)) {
      console.log(`no ${PROPOSALS_PATH}; nothing to undo`);
      await c.end();
      return;
    }
    const written: Proposal[] = JSON.parse(readFileSync(PROPOSALS_PATH, "utf8"));
    // Match on gloss too, so a value edited by hand after the fact is left alone.
    let cleared = 0;
    for (const p of written) {
      const res = await c.query(
        `UPDATE sentence_components SET gloss = NULL WHERE id = $1 AND gloss = $2`,
        [p.cid, p.gloss]
      );
      cleared += res.rowCount || 0;
    }
    console.log(`cleared ${cleared} of ${written.length} glosses written by this script`);
    await c.end();
    return;
  }

  const rows = (await c.query(
    `SELECT s.id, s.text, s.translations, s.meaning_segments,
            json_agg(json_build_object('cid', sc.id, 'i', sc.order_index,
                                       'snap', sc.text_snapshot, 'gloss', sc.gloss)
                     ORDER BY sc.order_index) AS comps
     FROM sentences s JOIN sentence_components sc ON sc.sentence_id = s.id
     WHERE s.is_deleted = false
     GROUP BY s.id
     ORDER BY s.id`
  )).rows as any[];

  // Work out, per sentence, which components have no source of truth for their gloss.
  const jobs: Array<{ sentence: string; translation: string; comps: Component[]; targets: number[] }> = [];
  for (const s of rows) {
    const segments = Array.isArray(s.meaning_segments) ? s.meaning_segments : [];
    const singles = new Set<number>();
    const grouped = new Set<number>();
    for (const seg of segments) {
      const idx = Array.isArray(seg?.sourceComponentIndexes) ? seg.sourceComponentIndexes : [];
      if (idx.length === 1) singles.add(Number(idx[0]));
      else if (idx.length > 1) idx.forEach((n: any) => grouped.add(Number(n)));
    }

    const comps: Component[] = (s.comps || []).map((x: any) => ({
      cid: x.cid,
      index: Number(x.i),
      text: String(x.snap || "")
    }));
    const targets = (s.comps || [])
      .filter((x: any) => !x.gloss && !singles.has(Number(x.i)) && grouped.has(Number(x.i)))
      .map((x: any) => Number(x.i));

    if (!targets.length) continue;
    if (WORD_FILTER && !targets.some((i: number) => byIndexText(comps, i) === WORD_FILTER)) continue;
    const translation = Array.isArray(s.translations) ? String(s.translations[0] || "") : "";
    if (!translation) continue; // nothing to gloss against
    jobs.push({ sentence: String(s.text), translation, comps, targets });
  }

  const selected = jobs.slice(0, LIMIT === Infinity ? jobs.length : LIMIT);
  const totalTargets = selected.reduce((n, j) => n + j.targets.length, 0);
  console.log(APPLY ? "=== APPLYING ===" : "=== DRY RUN (pass --apply to write) ===");
  console.log(`sentences to process : ${selected.length}${jobs.length > selected.length ? ` of ${jobs.length}` : ""}`);
  console.log(`components to gloss  : ${totalTargets}\n`);

  const llm = getLlmClient();
  if (typeof llm.glossComponents !== "function") {
    throw new Error(
      `The configured provider (${llm.modelName}) does not implement glossComponents. ` +
      `Set LLM_SENTENCES_PROVIDER / LLM_PROVIDER to one that does.`);
  }
  console.log(`model: ${llm.modelName}
`);

  const proposals: Proposal[] = [];
  const rejected: string[] = [];
  let done = 0;

  for (const job of selected) {
    done += 1;
    const byIndex = new Map(job.comps.map((x) => [x.index, x] as const));
    // Through the routed client, so this pass uses whatever model the app is configured to
    // generate with -- and applies the identical guards the runtime pass does.
    const results = await llm.glossComponents!({
      sentence: job.sentence,
      translation: job.translation,
      components: job.comps.map((x) => ({ index: x.index, text: x.text })),
      targets: job.targets
    });

    if (!results.length) {
      rejected.push(`"${job.sentence}" -- model returned nothing usable`);
      continue;
    }

    const accepted: Proposal[] = results.flatMap((r) => {
      const comp = byIndex.get(r.index);
      return comp ? [{ cid: comp.cid, index: comp.index, text: comp.text, gloss: r.gloss, sentence: job.sentence }] : [];
    });

    proposals.push(...accepted);
    console.log(`[${done}/${selected.length}] "${job.sentence}"  (${job.translation})`);
    accepted.forEach((p) => console.log(`      ${p.text.padEnd(10)} -> "${p.gloss}"`));
  }

  writeFileSync(PROPOSALS_PATH, JSON.stringify(proposals, null, 2), "utf8");

  console.log(`\n${"=".repeat(64)}`);
  console.log(`glosses proposed : ${proposals.length} of ${totalTargets}`);
  console.log(`sentences skipped: ${rejected.length}`);
  rejected.slice(0, 15).forEach((r) => console.log(`   ${r}`));
  if (rejected.length > 15) console.log(`   ... and ${rejected.length - 15} more`);
  console.log(`\nproposals written to ${PROPOSALS_PATH}`);

  if (!APPLY) { console.log("(nothing written to the database)"); await c.end(); return; }

  try {
    await c.query("BEGIN");
    for (const p of proposals) {
      // `gloss IS NULL` in the predicate, so a value set between the read and this write
      // is never clobbered.
      await c.query(
        `UPDATE sentence_components SET gloss = $2 WHERE id = $1 AND gloss IS NULL`,
        [p.cid, p.gloss]
      );
    }
    await c.query("COMMIT");
    console.log(`committed ${proposals.length} glosses`);
  } catch (error) {
    await c.query("ROLLBACK");
    throw error;
  }
  await c.end();
}

main().catch((error) => { console.error(error); process.exit(1); });
