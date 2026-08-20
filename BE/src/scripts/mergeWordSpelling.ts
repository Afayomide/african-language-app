/**
 * Merge two word rows that are the same Yoruba word under different spellings.
 *
 * Generation produced both `àbúrò` and `abúrò` -- the second missing the grave on the first
 * vowel -- as independent rows with independent meaning lists, and split 41 sentences between
 * them. Nothing joins them, so a fix applied to one silently misses the other, and the learner
 * sees the same word taught two ways.
 *
 * Which spelling is right is a tone-mark question and is NOT decided here: the caller states
 * the survivor and the script does exactly that merge. Tone marks distinguish real words in
 * Yoruba -- `rà` (buy) and `ra` (rub) are unrelated verbs -- so only run this on a pair
 * confirmed to be one word. Text is precomposed NFC (A=U+0041, À=U+00C0), so substring
 * replacement is unambiguous and cannot touch already-correct text.
 *
 * Everything holding the losing spelling has to move together -- the sentence text, the
 * component snapshots, the component `ref_id` pointing at the losing row, and the copies baked
 * into exercise questions as word-order tiles and gap-fill options. A partial merge leaves
 * tiles that no longer spell their own sentence.
 *
 * Respelling can make two sentences identical, when the corpus already contains the same
 * sentence under both spellings. Those are reported and left alone rather than silently
 * duplicated: collapsing them means retiring a sentence and repointing its lesson slots and
 * questions, which is a content decision, not a spelling one.
 *
 *   npx tsx src/scripts/mergeWordSpelling.ts --keep àbúrò --drop abúrò
 *   npx tsx src/scripts/mergeWordSpelling.ts --keep àbúrò --drop abúrò --apply
 */
import "dotenv/config";
import { Client } from "pg";

const APPLY = process.argv.includes("--apply");

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const keepArg = arg("keep");
const dropArg = arg("drop");
if (!keepArg || !dropArg) {
  console.error("usage: --keep <surviving spelling> --drop <losing spelling> [--apply]");
  process.exit(1);
}

const lower = (s: string) => s.toLocaleLowerCase("yo");
const capitalise = (s: string) => s.charAt(0).toLocaleUpperCase("yo") + s.slice(1);

const MERGE = {
  keep: keepArg,
  drop: dropArg,
  /**
   * A word row is stored under one casing but appears in sentences under two -- capitalised
   * when it opens the sentence, lower elsewhere -- so both are rewritten. Derived from the
   * lowercase stem rather than from the row text, which may itself be either casing.
   */
  pairs: [
    { from: capitalise(lower(dropArg)), to: capitalise(lower(keepArg)) },
    { from: lower(dropArg), to: lower(keepArg) }
  ].filter((p) => p.from !== p.to)
};

const rewrite = (s: string) =>
  MERGE.pairs.reduce((acc, p) => acc.split(p.from).join(p.to), s);

/**
 * Split into what a learner sees as one letter. Yoruba stacks a tone mark on a sub-dotted
 * vowel -- `ẹ̀` is two code points with no precomposed form -- so letter tiles are grapheme
 * clusters, never code points.
 */
const letters = (text: string) =>
  [...new Intl.Segmenter("yo", { granularity: "grapheme" }).segment(text)].map((s) => s.segment);

/** Rewrite every string inside a JSON value, leaving structure untouched. */
function rewriteDeep(value: unknown): unknown {
  if (typeof value === "string") return rewrite(value);
  if (Array.isArray(value)) return value.map(rewriteDeep);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, rewriteDeep(v)]));
  }
  return value;
}

let client: Client | null = null;

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  client = c;
  await c.connect();
  console.log(APPLY ? "=== APPLYING ===\n" : "=== DRY RUN (pass --apply to write) ===\n");

  // The losing row is looked up whether or not it is already soft-deleted, so a re-run repairs
  // anything a previous run left pointing at it.
  const rows = (await c.query(
    `SELECT id, text, translations, is_deleted FROM words WHERE text = ANY($1)`,
    [[MERGE.keep, MERGE.drop]])).rows as any[];
  const keep = rows.find((r) => r.text === MERGE.keep && !r.is_deleted);
  const drop = rows.find((r) => r.text === MERGE.drop);
  if (!keep) throw new Error(`no live word row for the surviving spelling "${MERGE.keep}"`);
  if (!drop) { console.log(`no row at all for "${MERGE.drop}" -- nothing to merge`); await c.end(); return; }
  if (drop.is_deleted) console.log(`(losing row already retired -- re-running to catch stragglers)\n`);

  console.log(`keep  "${keep.text}"  ${keep.id}`);
  console.log(`drop  "${drop.text}"  ${drop.id}\n`);

  if (APPLY) await c.query("BEGIN");

  // Meanings only recorded against the losing row would vanish with it. Compared on the same
  // equivalence dedupeTranslations.ts uses -- case and leading article are noise for a
  // dictionary entry -- so a merge cannot reintroduce the variants that script just collapsed.
  const meaningKey = (s: string) =>
    s.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase()
      .replace(/^(?:the|a|an)\s+/, "").replace(/[.]+$/, "");
  const merged = [...keep.translations];
  const known = new Set(merged.map(meaningKey));
  const gained = (drop.translations as string[]).filter((t) => {
    if (known.has(meaningKey(t))) return false;
    known.add(meaningKey(t));
    return true;
  });
  merged.push(...gained);
  console.log(`meanings: ${gained.length ? `gained ${JSON.stringify(gained)}` : "nothing unique on the losing row"}`);
  console.log(`   -> ${JSON.stringify(merged)}\n`);
  if (APPLY && gained.length) {
    await c.query(`UPDATE words SET translations = $1, updated_at = now() WHERE id = $2`,
      [merged, keep.id]);
  }

  const live = (await c.query(
    `SELECT id, text FROM sentences WHERE is_deleted = false`)).rows as any[];
  const existing = new Set(live.map((s) => s.text));
  const affected = live.filter((s) => rewrite(s.text) !== s.text);

  // Respelling can land on a sentence the corpus already has under the other spelling. Writing
  // it anyway would leave two identical rows, each with its own lesson slots and questions.
  const collisions = affected.filter((s) => existing.has(rewrite(s.text)));
  const safe = affected.filter((s) => !existing.has(rewrite(s.text)));
  const held = new Set<string>(collisions.map((s) => s.id));

  console.log(`--- sentences (${affected.length} contain the losing spelling) ---`);
  for (const s of safe) {
    console.log(`   "${s.text}"  ->  "${rewrite(s.text)}"`);
    if (APPLY) await c.query(`UPDATE sentences SET text = $1, updated_at = now() WHERE id = $2`,
      [rewrite(s.text), s.id]);
  }
  if (collisions.length) {
    console.log(`\n   HELD BACK -- respelling these would duplicate a sentence that already exists:`);
    for (const s of collisions) console.log(`      "${s.text}"  ==  "${rewrite(s.text)}"`);
    console.log(`   Retiring one of each pair means repointing its lesson slots and questions,`);
    console.log(`   which is a content decision. Left untouched.`);
  }

  // A component snapshot must keep matching the sentence text it was taken from, so components
  // of a held-back sentence stay on the losing spelling -- and keep pointing at the losing word
  // row, which is why that row is only retired when nothing is held back.
  const heldIds = [...held];
  const comps = (await c.query(
    `SELECT sc.id, sc.text_snapshot, sc.ref_id FROM sentence_components sc
     WHERE (sc.text_snapshot = ANY($1) OR sc.ref_id = $2)
       AND sc.sentence_id <> ALL($3::text[])`,
    [MERGE.pairs.map((p) => p.from), drop.id, heldIds])).rows as any[];
  const snapshotFixes = comps.filter((r) => rewrite(r.text_snapshot) !== r.text_snapshot).length;
  const refFixes = comps.filter((r) => r.ref_id === drop.id).length;
  console.log(`\n--- sentence components (${comps.length}) ---`);
  console.log(`   snapshots to respell : ${snapshotFixes}`);
  console.log(`   ref_id to repoint    : ${refFixes}`);
  if (APPLY && comps.length) {
    const ids = comps.map((r) => r.id);
    for (const p of MERGE.pairs) {
      await c.query(
        `UPDATE sentence_components SET text_snapshot = $1
         WHERE text_snapshot = $2 AND id = ANY($3::text[])`, [p.to, p.from, ids]);
    }
    await c.query(
      `UPDATE sentence_components SET ref_id = $1 WHERE ref_id = $2 AND id = ANY($3::text[])`,
      [keep.id, drop.id, ids]);
  }

  // Expressions are built from the same word rows, so they hold the losing spelling too.
  const exprComps = (await c.query(
    `SELECT ec.id, ec.text_snapshot FROM expression_components ec
     JOIN expressions e ON e.id = ec.expression_id AND e.is_deleted = false
     WHERE ec.text_snapshot = ANY($1) OR ec.ref_id = $2`,
    [MERGE.pairs.map((p) => p.from), drop.id])).rows as any[];
  console.log(`   expression components affected : ${exprComps.length}`);
  if (APPLY && exprComps.length) {
    const ids = exprComps.map((r) => r.id);
    for (const p of MERGE.pairs) {
      await c.query(
        `UPDATE expression_components SET text_snapshot = $1
         WHERE text_snapshot = $2 AND id = ANY($3::text[])`, [p.to, p.from, ids]);
    }
    await c.query(
      `UPDATE expression_components SET ref_id = $1 WHERE ref_id = $2 AND id = ANY($3::text[])`,
      [keep.id, drop.id, ids]);
  }

  // Questions bake the sentence in: as Yoruba word-order tiles, as gap-fill options, and inside
  // review_data. These must move with the sentence or a tile stops matching its own answer.
  const questions = (await c.query(
    `SELECT id, source_id, subtype, options, review_data, interaction_data, prompt_template, explanation
     FROM exercise_questions
     WHERE is_deleted = false
       AND (array_to_string(options, ' | ') LIKE ANY($1) OR review_data::text LIKE ANY($1)
            OR interaction_data::text LIKE ANY($1) OR prompt_template LIKE ANY($1)
            OR explanation LIKE ANY($1))`,
    [MERGE.pairs.map((p) => `%${p.from}%`)])).rows as any[];

  let changed = 0;
  let skipped = 0;
  console.log(`\n--- exercise questions (${questions.length} mention the losing spelling) ---`);
  for (const q of questions) {
    // A question hanging off a held-back sentence keeps that sentence's spelling, or its
    // word-order tiles stop spelling the sentence they are the answer to.
    if (held.has(q.source_id)) { skipped++; continue; }
    // A letter-order exercise spells the word out one tile per letter, so its tiles have to be
    // rebuilt from the new spelling -- substitution never reaches them, since no single tile
    // holds the whole word.
    const spelled: string | null = q.review_data?.sentence ?? null;
    const isLetterOrder = q.subtype === "fg-letter-order" && spelled && rewrite(spelled) !== spelled;
    const rebuilt = isLetterOrder ? letters(rewrite(spelled)) : null;

    const next = {
      options: (rebuilt ?? rewriteDeep(q.options)) as string[],
      review_data: rebuilt
        ? { ...(rewriteDeep(q.review_data) as any), words: rebuilt,
            correctOrder: rebuilt.map((_, i) => i) }
        : rewriteDeep(q.review_data),
      interaction_data: rewriteDeep(q.interaction_data),
      prompt_template: rewrite(q.prompt_template ?? ""),
      explanation: rewrite(q.explanation ?? "")
    };
    const dirty =
      JSON.stringify(next.options) !== JSON.stringify(q.options) ||
      JSON.stringify(next.review_data) !== JSON.stringify(q.review_data) ||
      JSON.stringify(next.interaction_data) !== JSON.stringify(q.interaction_data) ||
      next.prompt_template !== (q.prompt_template ?? "") ||
      next.explanation !== (q.explanation ?? "");
    if (!dirty) continue;
    changed++;
    if (changed <= 6) console.log(`   ${q.subtype}: ${JSON.stringify(q.options)} -> ${JSON.stringify(next.options)}`);
    if (APPLY) {
      await c.query(
        `UPDATE exercise_questions
         SET options = $1, review_data = $2, interaction_data = $3,
             prompt_template = $4, explanation = $5, updated_at = now()
         WHERE id = $6`,
        [next.options, JSON.stringify(next.review_data), JSON.stringify(next.interaction_data),
         next.prompt_template, next.explanation, q.id]);
    }
  }
  console.log(`   questions rewritten: ${changed}${changed > 6 ? " (first 6 shown)" : ""}`);
  if (skipped) console.log(`   left alone (belong to a held-back sentence): ${skipped}`);

  // Questions can hang off a WORD rather than a sentence (letter-order, match-translation,
  // pronunciation). Those carry no sentence text, so nothing above touches them, and retiring
  // the losing row would leave them pointing at a word that is gone.
  const wordSourced = (await c.query(
    `SELECT id, subtype FROM exercise_questions
     WHERE is_deleted = false AND source_type = 'word' AND source_id = $1`, [drop.id])).rows as any[];
  console.log(`\n--- questions sourced from the losing word row (${wordSourced.length}) ---`);
  wordSourced.forEach((q) => console.log(`   ${q.subtype} -> repointed to "${keep.text}"`));
  if (APPLY && wordSourced.length) {
    await c.query(
      `UPDATE exercise_questions SET source_id = $1, updated_at = now() WHERE id = ANY($2::text[])`,
      [keep.id, wordSourced.map((q) => q.id)]);
  }

  console.log(`\n--- retiring the losing row ---`);
  if (collisions.length) {
    console.log(`   KEPT LIVE: ${collisions.length} sentence(s) still use the losing spelling.`);
    console.log(`   Retiring the word row now would leave them pointing at a deleted word.`);
    if (APPLY) await c.query("COMMIT");
    console.log(APPLY ? "\ncommitted (word row kept)" : "\n(nothing written)");
    await c.end();
    return;
  }
  if (APPLY) {
    await c.query(
      `UPDATE words SET is_deleted = true, deleted_at = now(), updated_at = now() WHERE id = $1`,
      [drop.id]);
    // Anything still pointing at it after the repoint above would now dangle. Components of a
    // soft-deleted sentence are unreachable and keep whatever they had, so only live ones count.
    const left = (await c.query(
      `SELECT count(*)::int AS n FROM sentence_components sc
       JOIN sentences s ON s.id = sc.sentence_id AND s.is_deleted = false
       WHERE sc.ref_id = $1`, [drop.id])).rows[0].n;
    const leftExpr = (await c.query(
      `SELECT count(*)::int AS n FROM expression_components ec
       JOIN expressions e ON e.id = ec.expression_id AND e.is_deleted = false
       WHERE ec.ref_id = $1`, [drop.id])).rows[0].n;
    if (left || leftExpr) throw new Error(`${left + leftExpr} components still reference the retired row`);
    console.log(`   soft-deleted, no components left pointing at it`);
    await c.query("COMMIT");
    console.log("\ncommitted");
  } else {
    console.log(`   would soft-delete ${drop.id}`);
    console.log("\n(nothing written)");
  }
  await c.end();
}

main().catch(async (error) => {
  console.error(error?.message ?? error);
  // A merge is only correct whole: half of it leaves tiles that no longer spell their sentence.
  if (APPLY) await client?.query("ROLLBACK").catch(() => {});
  process.exit(1);
});
