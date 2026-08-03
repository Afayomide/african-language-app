/**
 * One-off: retire the word `Ọmọ` and every sentence that teaches it, without shortening
 * the lessons that used them.
 *
 * Each removed sentence is swapped for an existing inventory sentence that
 *   - contains no `Ọmọ`,
 *   - has every component introduced STRICTLY EARLIER in the curriculum than the target
 *     lesson (chapter -> unit -> lesson ordering), so nothing is taught out of order,
 *   - already carries audio, components and meaning segments (no TTS or LLM spend), and
 *   - is not already used by the target lesson.
 *
 * The replacement is then given the SAME question subtypes at the SAME stages as the
 * sentence it replaces, so block counts per stage are unchanged.
 *
 * Question drafts mirror buildSentenceQuestionDrafts in AdminUnitAiContentUseCases.ts --
 * that function is module-local, so the four shapes actually in use here are rebuilt from
 * the same helper logic rather than imported.
 *
 * Run with --apply to write; defaults to a dry run.
 */
import "dotenv/config";
import { Client } from "pg";
import { genObjectId } from "../utils/ids.js";

const OMO_WORD_ID = "69e43090d08b4ae542444249";
const APPLY = process.argv.includes("--apply");

type Sentence = { id: string; text: string; translations: string[]; explanation: string | null };

/** Curriculum rank: chapter, then unit, then lesson. Matches the learner's path order. */
const POS_SQL = "(COALESCE(ch.order_index,0)*10000 + u.order_index*100 + l.order_index)";

function splitWords(value: string) {
  return String(value || "").trim().split(/\s+/).map((item) => item.trim()).filter(Boolean);
}

function pickTranslation(source: { translations: string[] }) {
  return String(source.translations?.[0] || "").trim();
}

function buildOrderReviewData(sentence: Sentence) {
  const text = String(sentence.text || "").trim();
  const words = splitWords(text);
  if (words.length < 2) return null;
  return { sentence: text, words, correctOrder: words.map((_, i) => i), meaning: pickTranslation(sentence) };
}

/** Options must be shuffled: the app's builders do, and a fixed correct index is learnable. */
function shuffle(values: string[]) {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function buildGapFill(reviewData: { words: string[] }, distractorPool: string[]) {
  const blankIndex = reviewData.words.length > 2 ? 1 : 0;
  const answer = reviewData.words[blankIndex];
  const promptSentence = reviewData.words.map((w, i) => (i === blankIndex ? "____" : w)).join(" ");
  const unique = Array.from(new Set(distractorPool.filter(Boolean)))
    .filter((item) => item.toLowerCase() !== answer.toLowerCase());
  const options = shuffle(Array.from(new Set([answer, ...unique.slice(0, 3)]))).slice(0, 4);
  while (options.length < 4) options.push(`Option ${options.length + 1}`);
  const correctIndex = options.findIndex((item) => item.toLowerCase() === answer.toLowerCase());
  return { promptSentence, options, correctIndex: correctIndex >= 0 ? correctIndex : 0 };
}

function buildMcOptions(sentence: Sentence, pool: Sentence[]) {
  const correct = pickTranslation(sentence);
  const distractors = Array.from(new Set(pool.filter((p) => p.id !== sentence.id).map(pickTranslation)))
    .filter((item) => item && item.toLowerCase() !== correct.toLowerCase());
  const options = shuffle(Array.from(new Set([correct, ...distractors.slice(0, 3)])));
  const correctIndex = options.findIndex((item) => item.toLowerCase() === correct.toLowerCase());
  return { options, correctIndex: correctIndex >= 0 ? correctIndex : 0 };
}

/** Rebuild one question for `sentence` matching an existing question's subtype. */
function draftFor(
  subtype: string,
  sentence: Sentence,
  pool: Sentence[],
  wordPool: string[]
): { type: string; promptTemplate: string; options: string[]; correctIndex: number; reviewData: unknown; explanation: string } | null {
  const order = buildOrderReviewData(sentence);
  const englishWords = splitWords(pickTranslation(sentence));

  switch (subtype) {
    case "fg-word-order": {
      if (!order) return null;
      return {
        type: "fill-in-the-gap",
        promptTemplate: "Arrange the words to mean: {meaning}",
        options: order.words,
        correctIndex: 0,
        reviewData: order,
        explanation: `Correct order: ${order.words.join(" ")}`
      };
    }
    case "ls-fg-gap-fill":
    case "ls-mc-select-missing-word":
    case "mc-select-missing-word": {
      if (!order) return null;
      const gap = buildGapFill(order, wordPool);
      const listening = subtype !== "mc-select-missing-word";
      const isGapFill = subtype === "ls-fg-gap-fill";
      return {
        type: listening ? "listening" : "multiple-choice",
        promptTemplate: isGapFill ? "Listen and fill in the blank: {sentence}" : listening
          ? "Listen and choose the missing word: {sentence}"
          : "Select the missing word: {sentence}",
        options: gap.options,
        correctIndex: gap.correctIndex,
        reviewData: { ...order, sentence: gap.promptSentence },
        explanation: sentence.explanation || `The correct word completes ${order.sentence}.`
      };
    }
    case "mc-select-translation":
    case "ls-mc-select-translation": {
      const mc = buildMcOptions(sentence, pool);
      const listening = subtype.startsWith("ls-");
      return {
        type: listening ? "listening" : "multiple-choice",
        promptTemplate: listening
          ? "Listen and choose the correct translation for {phrase}."
          : "What does this sentence mean in English?",
        options: mc.options,
        correctIndex: mc.correctIndex,
        reviewData: null,
        explanation: sentence.explanation || `The correct meaning is ${pickTranslation(sentence)}.`
      };
    }
    case "sp-pronunciation-compare": {
      return {
        type: "speaking",
        promptTemplate: "Say this sentence aloud. Match the tutor's tone and rhythm.",
        options: [],
        correctIndex: 0,
        reviewData: null,
        explanation: sentence.explanation || `Say ${sentence.text} aloud and match the tutor reference.`
      };
    }
    case "fg-english-word-order": {
      if (englishWords.length < 2) return null;
      return {
        type: "fill-in-the-gap",
        promptTemplate: "Build the English meaning of this sentence.",
        options: englishWords,
        correctIndex: 0,
        reviewData: {
          sentence: sentence.text,
          words: englishWords,
          correctOrder: englishWords.map((_, i) => i),
          meaning: pickTranslation(sentence)
        },
        explanation: sentence.explanation || `Correct translation: ${pickTranslation(sentence)}`
      };
    }
    default:
      return null;
  }
}

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const now = new Date();

  // --- curriculum ordering -------------------------------------------------
  const lessonPos = new Map<string, number>(
    (await c.query(
      `SELECT l.id, ${POS_SQL} AS pos FROM lessons l
       JOIN units u ON u.id=l.unit_id LEFT JOIN chapters ch ON ch.id=u.chapter_id
       WHERE l.is_deleted=false AND u.is_deleted=false`
    )).rows.map((r: any) => [r.id, Number(r.pos)])
  );
  const introPos = new Map<string, number>(
    (await c.query(
      `SELECT lci.content_id, min(${POS_SQL}) AS p FROM lesson_content_items lci
       JOIN lessons l ON l.id=lci.lesson_id AND l.is_deleted=false
       JOIN units u ON u.id=l.unit_id AND u.is_deleted=false
       LEFT JOIN chapters ch ON ch.id=u.chapter_id
       WHERE lci.content_type IN ('word'::content_type,'expression'::content_type) GROUP BY 1`
    )).rows.map((r: any) => [r.content_id, Number(r.p)])
  );

  const omoSentenceIds = (await c.query(
    `SELECT DISTINCT s.id FROM sentence_components sc JOIN sentences s ON s.id=sc.sentence_id
     WHERE sc.ref_id=$1 AND s.is_deleted=false`, [OMO_WORD_ID]
  )).rows.map((r: any) => r.id);

  const allSentences: Sentence[] = (await c.query(
    `SELECT id, text, translations, explanation FROM sentences WHERE is_deleted=false`
  )).rows;
  const sentenceById = new Map(allSentences.map((s) => [s.id, s]));
  const componentsBySentence = new Map<string, string[]>();
  for (const r of (await c.query(`SELECT sentence_id, ref_id FROM sentence_components`)).rows as any[]) {
    if (!componentsBySentence.has(r.sentence_id)) componentsBySentence.set(r.sentence_id, []);
    componentsBySentence.get(r.sentence_id)!.push(r.ref_id);
  }
  const globalUse = new Map<string, number>(
    (await c.query(
      `SELECT content_id, count(*)::int n FROM lesson_content_items
       WHERE content_type='sentence'::content_type GROUP BY 1`
    )).rows.map((r: any) => [r.content_id, Number(r.n)])
  );

  // Inverse document frequency per component. Plain overlap counting rewards short
  // sentences built from ubiquitous particles ("mi", "ni"), which is how a destination
  // lesson ended up matched with "That is your father's father". Weighting by rarity
  // makes a shared `níbo` or `ò` outrank a shared `mi`.
  const componentDf = new Map<string, number>();
  for (const comps of componentsBySentence.values()) {
    for (const ref of new Set(comps)) componentDf.set(ref, (componentDf.get(ref) || 0) + 1);
  }
  const totalSentences = componentsBySentence.size || 1;
  const weightOf = (ref: string) => Math.log(totalSentences / (1 + (componentDf.get(ref) || 0)));
  const withSegments = new Set(
    (await c.query(
      `SELECT id FROM sentences WHERE is_deleted=false AND jsonb_array_length(COALESCE(meaning_segments,'[]'::jsonb)) > 0`
    )).rows.map((r: any) => r.id)
  );

  // --- the slots that need filling ----------------------------------------
  const slots = (await c.query(
    `SELECT lci.id AS item_id, lci.lesson_id, lci.unit_id, lci.content_id, lci.role,
            lci.stage_index, lci.order_index, lci.created_by,
            l.title AS lesson, u.title AS unit
     FROM lesson_content_items lci
     JOIN lessons l ON l.id=lci.lesson_id AND l.is_deleted=false
     JOIN units u ON u.id=l.unit_id
     WHERE lci.content_id = ANY($1) AND lci.content_type='sentence'::content_type
     ORDER BY l.order_index, lci.order_index`, [omoSentenceIds]
  )).rows as any[];

  const claimed = new Set<string>();
  const plan: any[] = [];

  for (const slot of slots) {
    const pos = lessonPos.get(slot.lesson_id)!;
    const lessonSentenceIds = (await c.query(
      `SELECT content_id FROM lesson_content_items
       WHERE lesson_id=$1 AND content_type='sentence'::content_type`, [slot.lesson_id]
    )).rows.map((r: any) => r.content_id);
    const already = new Set(lessonSentenceIds);

    // vocabulary this lesson already works with, minus the ọmọ sentences
    const own = new Set(
      (await c.query(
        `SELECT DISTINCT sc.ref_id FROM lesson_content_items lci
         JOIN sentence_components sc ON sc.sentence_id=lci.content_id
         WHERE lci.lesson_id=$1 AND lci.content_type='sentence'::content_type
           AND NOT (lci.content_id = ANY($2))`, [slot.lesson_id, omoSentenceIds]
      )).rows.map((r: any) => r.ref_id)
    );

    // The lesson's signature vocabulary: components that RECUR across its own sentences.
    // Corpus rarity is the wrong signal here -- it ranked `náà` and `rẹ` above `Níbo` for
    // a lesson about asking where people went, because rare function words look
    // distinctive. What a lesson repeats is what a lesson is about.
    const lessonSentenceComponents = (await c.query(
      `SELECT lci.content_id, array_agg(DISTINCT sc.ref_id) AS refs
       FROM lesson_content_items lci JOIN sentence_components sc ON sc.sentence_id=lci.content_id
       WHERE lci.lesson_id=$1 AND lci.content_type='sentence'::content_type
         AND NOT (lci.content_id = ANY($2))
       GROUP BY 1`, [slot.lesson_id, omoSentenceIds]
    )).rows as any[];
    const recurrence = new Map<string, number>();
    for (const row of lessonSentenceComponents) {
      for (const ref of row.refs as string[]) recurrence.set(ref, (recurrence.get(ref) || 0) + 1);
    }
    const sentenceCount = lessonSentenceComponents.length || 1;
    const signature = new Set(
      Array.from(recurrence.entries())
        .filter(([, n]) => n / sentenceCount >= 0.5)
        .map(([ref]) => ref)
    );

    const scored = allSentences
      .filter((s) => !already.has(s.id) && !omoSentenceIds.includes(s.id) && !claimed.has(s.id))
      .filter((s) => withSegments.has(s.id))
      .map((s) => {
        const comps = componentsBySentence.get(s.id) || [];
        return { s, comps };
      })
      .filter(({ comps }) => comps.length >= 2 && !comps.includes(OMO_WORD_ID))
      // hard prerequisite gate: every component introduced strictly earlier
      .filter(({ comps }) => comps.every((ref) => (introPos.get(ref) ?? Number.POSITIVE_INFINITY) < pos))
      .filter(({ comps }) => comps.some((ref) => signature.has(ref)))
      .map(({ s, comps }) => {
        const shared = comps.filter((ref) => own.has(ref));
        // Thematic fit = how much of the lesson's DISTINCTIVE vocabulary this sentence
        // reuses, as a share of everything distinctive the lesson works with.
        const sharedWeight = shared.reduce((sum, ref) => sum + weightOf(ref), 0);
        const lessonWeight = Array.from(own).reduce((sum, ref) => sum + weightOf(ref), 0) || 1;
        return {
          s,
          overlap: shared.length,
          size: comps.length,
          theme: sharedWeight / lessonWeight,
          coverage: shared.length / comps.length,
          used: globalUse.get(s.id) || 0
        };
      })
      // coverage gate keeps the sentence inside the lesson's world; theme gate keeps it
      // on topic rather than merely built from words the learner happens to know.
      .filter((r) => r.coverage >= 0.6 && r.theme > 0)
      .sort((a, b) => a.used - b.used || b.theme - a.theme || b.coverage - a.coverage);

    const pick = scored[0];
    if (!pick) {
      console.log(`  !! no eligible replacement for slot in ${slot.lesson}`);
      continue;
    }
    claimed.add(pick.s.id);

    const questions = (await c.query(
      `SELECT q.id, q.subtype, q.translation_index, b.id AS block_id, b.stage_id, b.order_index AS block_order
       FROM exercise_questions q
       LEFT JOIN lesson_blocks b ON b.ref_id = q.id
       WHERE q.lesson_id=$1 AND q.source_id=$2 AND q.is_deleted=false`, [slot.lesson_id, slot.content_id]
    )).rows as any[];

    plan.push({ slot, pick, questions, pool: lessonSentenceIds.map((id: string) => sentenceById.get(id)).filter(Boolean) });
  }

  console.log(APPLY ? "=== APPLYING ===" : "=== DRY RUN (pass --apply to write) ===");
  for (const p of plan) {
    console.log(`\n${p.slot.unit} / ${p.slot.lesson}`);
    console.log(`   remove : ${sentenceById.get(p.slot.content_id)?.text}`);
    console.log(`   insert : ${p.pick.s.text}   ::  ${pickTranslation(p.pick.s)}`);
    console.log(`   fit    : ${p.pick.overlap}/${p.pick.size} components known, theme score ${p.pick.theme.toFixed(2)}, used elsewhere by ${p.pick.used}`);
    console.log(`   rebuild: ${p.questions.map((q: any) => q.subtype).join(", ") || "(none)"}`);
  }

  if (!APPLY) { await c.end(); return; }

  try {
    await c.query("BEGIN");
    for (const p of plan) {
      const { slot, pick, questions, pool } = p;
      const wordPool = pool.flatMap((s: Sentence) => splitWords(s.text));

      // 1. roster: swap the content item over to the replacement
      await c.query(
        `UPDATE lesson_content_items SET content_id=$2, updated_at=$3 WHERE id=$1`,
        [slot.item_id, pick.s.id, now]
      );
      await c.query(
        `UPDATE unit_content_items SET content_id=$3, updated_at=$4
         WHERE unit_id=$1 AND content_id=$2 AND content_type='sentence'::content_type`,
        [slot.unit_id, slot.content_id, pick.s.id, now]
      );

      // 2. rebuild each question in place so its block keeps its slot in the stage
      for (const q of questions) {
        const draft = draftFor(q.subtype, pick.s, pool, wordPool);
        if (!draft) {
          // Shape impossible for the replacement (e.g. single-word sentence). Drop the
          // question and its block rather than leave a broken exercise.
          await c.query(`UPDATE exercise_questions SET is_deleted=true, deleted_at=$2, updated_at=$2 WHERE id=$1`, [q.id, now]);
          if (q.block_id) await c.query(`DELETE FROM lesson_blocks WHERE id=$1`, [q.block_id]);
          console.log(`   (dropped ${q.subtype} -- not constructible for the replacement)`);
          continue;
        }
        await c.query(
          `UPDATE exercise_questions
             SET source_id=$2, type=$3, prompt_template=$4, options=$5, correct_index=$6,
                 review_data=$7, explanation=$8, updated_at=$9
           WHERE id=$1`,
          // options is text[]; review_data is jsonb. node-pg maps a JS array to the former
          // natively, so only review_data gets stringified.
          // options is text[]; review_data is jsonb NOT NULL, so subtypes without review
          // data store an empty object exactly as the app's own writer does.
          [q.id, pick.s.id, draft.type, draft.promptTemplate, draft.options,
           draft.correctIndex, JSON.stringify(draft.reviewData ?? {}),
           draft.explanation, now]
        );
      }
    }
    await c.query("COMMIT");
    console.log("\ncommitted");
  } catch (error) {
    await c.query("ROLLBACK");
    throw error;
  }

  await c.end();
}

main().catch((error) => { console.error(error); process.exit(1); });
