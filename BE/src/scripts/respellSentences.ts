/**
 * Respell a word inside sentences, merging any sentence that becomes a duplicate.
 *
 * Tone marks distinguish words in Yoruba: `rà` is "buy" and `ra` is "rub/spread", `èló` asks
 * "how much". Generation emitted both spellings for the same intended word, so the corpus holds
 * near-identical sentences that differ only in a mark, each with its own lesson slots and
 * questions.
 *
 * Respelling one of those lands exactly on a sentence that already exists. Writing it anyway
 * would leave two identical rows, so instead the correctly-spelled row wins and the other is
 * retired: every reference to it moves across and it is soft-deleted.
 *
 * Replacement is TOKEN-level, never substring. `ra` appears inside `ara` (body) and a substring
 * rule would silently produce `arà`; only a whole word between spaces or punctuation is a match.
 *
 * Guards, all fatal:
 *   - the two sentences must share translations[0], because questions pin translation_index 0
 *     and carry a baked copy of that English
 *   - no affected row may use translation_index <> 0
 *
 *   npx tsx src/scripts/respellSentences.ts           # dry run
 *   npx tsx src/scripts/respellSentences.ts --apply
 */
import "dotenv/config";
import { Client } from "pg";

const APPLY = process.argv.includes("--apply");

/** Whole words to respell, lowercase. Capitalised occurrences are handled automatically. */
const RULES: { from: string; to: string; why: string }[] = [
  { from: "ra", to: "rà", why: "the sentences mean 'buy', which is rà; ra is 'rub/spread'" },
  { from: "eló", to: "èló", why: "one word, one spelling: èló" }
];

/**
 * Two rows of the same Yoruba can lead with different English, and each one's questions bake
 * its own version in at translation_index 0. Merging then needs the retiring row's questions
 * restated in the surviving row's wording. Listed explicitly rather than inferred: which of two
 * valid translations leads is a content choice, not something to guess mid-merge.
 */
const ALIGN: { loser: string; from: string; to: string }[] = [
  {
    loser: "Obìnrin kan fẹ́ ra oúnjẹ.",
    from: "A woman wants to buy food.",
    to: "One woman wants to buy food."
  }
];

const lower = (s: string) => s.toLocaleLowerCase("yo");
const capitalise = (s: string) => s.charAt(0).toLocaleUpperCase("yo") + s.slice(1);

/**
 * Replace whole-word occurrences only. A token may carry punctuation ("eló?" / "rà,") so the
 * core is peeled off, compared, and the punctuation put back.
 */
function respell(text: string): string {
  return text
    .split(/(\s+)/)
    .map((token) => {
      if (!token.trim()) return token;
      const m = token.match(/^([^\p{L}]*)(.*?)([^\p{L}]*)$/u);
      if (!m) return token;
      const [, pre, core, post] = m;
      for (const rule of RULES) {
        if (lower(core) !== rule.from) continue;
        const replaced = core === capitalise(core) && core !== lower(core)
          ? capitalise(rule.to)
          : rule.to;
        return `${pre}${replaced}${post}`;
      }
      return token;
    })
    .join("");
}

/** Case-insensitive union that keeps the winner's existing wording and order. */
function unionTranslations(winner: string[], loser: string[]) {
  const seen = new Set(winner.map((t) => t.trim().toLowerCase()));
  const gained = loser.filter((t) => {
    const k = t.trim().toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return { merged: [...winner, ...gained], gained };
}

function rewriteDeep(value: unknown): unknown {
  if (typeof value === "string") return respell(value);
  if (Array.isArray(value)) return value.map(rewriteDeep);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, rewriteDeep(v)]));
  }
  return value;
}

/** Move every reference to `loser` onto `winner`, dropping slots that would duplicate. */
async function repoint(c: Client, loser: string, winner: string) {
  const moves: string[] = [];

  // A lesson or unit must not end up listing the same sentence twice, so a slot whose target
  // already holds the winner is dropped rather than repointed.
  for (const [table, scope] of [
    ["lesson_content_items", "lesson_id"],
    ["unit_content_items", "unit_id"]
  ] as const) {
    const dropped = await c.query(
      `DELETE FROM ${table} a WHERE a.content_id = $1
         AND EXISTS (SELECT 1 FROM ${table} b
                     WHERE b.content_id = $2 AND b.${scope} = a.${scope})
       RETURNING a.id`, [loser, winner]);
    const moved = await c.query(
      `UPDATE ${table} SET content_id = $1 WHERE content_id = $2 RETURNING id`, [winner, loser]);
    moves.push(`${table}: ${moved.rowCount} moved, ${dropped.rowCount} dropped as duplicate`);
  }

  for (const [table, column] of [
    ["lesson_blocks", "ref_id"],
    ["exercise_questions", "source_id"],
    ["learner_question_misses", "source_id"],
    ["learner_content_performance", "content_id"],
    ["voice_audio_submissions", "content_id"]
  ] as const) {
    const r = await c.query(
      `UPDATE ${table} SET ${column} = $1 WHERE ${column} = $2 RETURNING id`, [winner, loser]);
    if (r.rowCount) moves.push(`${table}.${column}: ${r.rowCount} moved`);
  }

  const refs = await c.query(
    `SELECT id, related_source_refs FROM exercise_questions
     WHERE related_source_refs::text LIKE $1`, [`%${loser}%`]);
  for (const row of refs.rows as any[]) {
    const next = JSON.parse(JSON.stringify(row.related_source_refs).split(loser).join(winner));
    await c.query(`UPDATE exercise_questions SET related_source_refs = $1 WHERE id = $2`,
      [JSON.stringify(next), row.id]);
  }
  if (refs.rows.length) moves.push(`related_source_refs: ${refs.rows.length} rewritten`);

  return moves;
}

/** Rewrite the sentence copies baked into a sentence's own questions. */
async function respellQuestions(c: Client, sentenceId: string, align?: { from: string; to: string }) {
  const questions = (await c.query(
    `SELECT id, options, review_data, interaction_data, explanation
     FROM exercise_questions WHERE source_id = $1 AND is_deleted = false`, [sentenceId])).rows as any[];
  // Word-order tiles spell the English out one word per tile, so a whole-string swap never
  // reaches them; they are rebuilt from the new wording instead.
  const tiles = (s: string) => s.split(/\s+/).filter(Boolean);
  const applyAlign = (v: unknown): unknown => {
    if (!align) return v;
    if (typeof v === "string") return v === align.from ? align.to : v;
    if (Array.isArray(v)) return v.map(applyAlign);
    if (v && typeof v === "object") {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, applyAlign(x)]));
    }
    return v;
  };
  let n = 0;
  for (const q of questions) {
    const englishTiles =
      align && q.review_data?.words?.join(" ") === align.from ? tiles(align.to) : null;
    const review = englishTiles
      ? { ...(applyAlign(rewriteDeep(q.review_data)) as any),
          words: englishTiles, correctOrder: englishTiles.map((_, i) => i) }
      : applyAlign(rewriteDeep(q.review_data));
    const next = {
      options: (englishTiles ?? applyAlign(rewriteDeep(q.options))) as string[],
      review_data: review,
      interaction_data: applyAlign(rewriteDeep(q.interaction_data)),
      explanation: respell(q.explanation ?? "")
    };
    if (JSON.stringify(next) === JSON.stringify({
      options: q.options, review_data: q.review_data,
      interaction_data: q.interaction_data, explanation: q.explanation ?? ""
    })) continue;
    n++;
    if (APPLY) {
      await c.query(
        `UPDATE exercise_questions
         SET options = $1, review_data = $2, interaction_data = $3, explanation = $4, updated_at = now()
         WHERE id = $5`,
        [next.options, JSON.stringify(next.review_data), JSON.stringify(next.interaction_data),
         next.explanation, q.id]);
    }
  }
  return n;
}

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  console.log(APPLY ? "=== APPLYING ===\n" : "=== DRY RUN (pass --apply to write) ===\n");
  RULES.forEach((r) => console.log(`   ${r.from} -> ${r.to}   (${r.why})`));
  console.log();

  const nonZero = (await c.query(
    `SELECT count(*)::int AS n FROM exercise_questions WHERE is_deleted = false AND translation_index <> 0`
  )).rows[0].n;
  if (nonZero) throw new Error(`${nonZero} questions use translation_index <> 0; merging is unsafe`);

  if (APPLY) await c.query("BEGIN");

  const live = (await c.query(
    `SELECT id, text, translations FROM sentences WHERE is_deleted = false`)).rows as any[];
  const byText = new Map(live.map((s) => [s.text, s]));
  const affected = live.filter((s) => respell(s.text) !== s.text);

  console.log(`sentences to respell: ${affected.length}\n`);

  for (const s of affected) {
    const target = respell(s.text);
    const existing = byText.get(target);

    if (!existing || existing.id === s.id) {
      console.log(`RESPELL  "${s.text}"  ->  "${target}"`);
      if (APPLY) {
        await c.query(`UPDATE sentences SET text = $1, updated_at = now() WHERE id = $2`, [target, s.id]);
        for (const comp of (await c.query(
          `SELECT id, text_snapshot FROM sentence_components WHERE sentence_id = $1`, [s.id])).rows as any[]) {
          const next = respell(comp.text_snapshot);
          if (next !== comp.text_snapshot) {
            await c.query(`UPDATE sentence_components SET text_snapshot = $1 WHERE id = $2`, [next, comp.id]);
          }
        }
      }
      const n = await respellQuestions(c, s.id);
      console.log(`         questions rewritten: ${n}`);
      byText.delete(s.text);
      byText.set(target, s);
      continue;
    }

    // The target already exists: retire this row into it.
    const align = ALIGN.find((a) => a.loser === s.text);
    if (existing.translations[0] !== s.translations[0]) {
      if (!align || align.from !== s.translations[0] || align.to !== existing.translations[0]) {
        throw new Error(
          `"${s.text}" and "${existing.text}" disagree on translations[0]:\n` +
          `   "${s.translations[0]}"  vs  "${existing.translations[0]}"\n` +
          `   Questions bake that English in at index 0, so merging would mislabel them.\n` +
          `   Add an ALIGN entry naming which wording survives.`);
      }
      console.log(`         aligning English: "${align.from}" -> "${align.to}"`);
    }

    const { merged, gained } = unionTranslations(existing.translations, s.translations);
    console.log(`MERGE    "${s.text}"  into  "${existing.text}"`);
    if (gained.length) console.log(`         translations gained: ${JSON.stringify(gained)}`);

    if (APPLY) {
      if (gained.length) {
        await c.query(`UPDATE sentences SET translations = $1, updated_at = now() WHERE id = $2`,
          [merged, existing.id]);
        existing.translations = merged;
      }
      // Respell the loser's questions BEFORE they move, so their baked copies match the winner.
      const n = await respellQuestions(c, s.id, align);
      const moves = await repoint(c, s.id, existing.id);
      moves.forEach((m) => console.log(`         ${m}`));
      console.log(`         questions rewritten before moving: ${n}`);
      await c.query(
        `UPDATE sentences SET is_deleted = true, deleted_at = now(), updated_at = now() WHERE id = $1`,
        [s.id]);
      console.log(`         retired`);
    }
    byText.delete(s.text);
  }

  // Expressions are multi-word units held in their own table, referenced by sentences as a
  // single component. They carry the same spellings and are missed by anything that only walks
  // sentences -- which is how "eló ni" survived a full sentence pass.
  const expressions = (await c.query(
    `SELECT id, text FROM expressions WHERE is_deleted = false`)).rows as any[];
  const exprByText = new Set(expressions.map((e) => e.text));
  const exprAffected = expressions.filter((e) => respell(e.text) !== e.text);
  console.log(`\nexpressions to respell: ${exprAffected.length}`);
  for (const e of exprAffected) {
    const target = respell(e.text);
    if (exprByText.has(target)) {
      throw new Error(
        `expression "${e.text}" would collide with existing "${target}". ` +
        `Merging expressions means repointing every sentence component that uses them; ` +
        `not handled here.`);
    }
    console.log(`RESPELL  "${e.text}"  ->  "${target}"`);
    if (APPLY) {
      await c.query(`UPDATE expressions SET text = $1, updated_at = now() WHERE id = $2`,
        [target, e.id]);
      for (const comp of (await c.query(
        `SELECT id, text_snapshot FROM expression_components WHERE expression_id = $1`,
        [e.id])).rows as any[]) {
        const next = respell(comp.text_snapshot);
        if (next !== comp.text_snapshot) {
          await c.query(`UPDATE expression_components SET text_snapshot = $1 WHERE id = $2`,
            [next, comp.id]);
        }
      }
      // A sentence stores the expression's text at the moment it was built.
      const snap = await c.query(
        `UPDATE sentence_components SET text_snapshot = $1
         WHERE type = 'expression' AND ref_id = $2 AND text_snapshot = $3 RETURNING id`,
        [target, e.id, e.text]);
      if (snap.rowCount) console.log(`         sentence component snapshots: ${snap.rowCount}`);
    }
  }

  if (APPLY) { await c.query("COMMIT"); console.log("\ncommitted"); }
  else console.log("\n(nothing written)");
  await c.end();
}

main().catch((error) => { console.error(error?.message ?? error); process.exit(1); });
