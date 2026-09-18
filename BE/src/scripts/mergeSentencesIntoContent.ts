/**
 * Move sentence rows that are really words or expressions into the right table, keeping
 * every lesson that used them intact.
 *
 * WHY. Curriculum instructions describe "lines" -- some are words ("m"), some are noun
 * phrases ("Nna gị"), some are sentences -- and the generator has one container for a
 * line, a sentence row. So `m.` and `Nna gị.` were stored as sentences alongside the word
 * `m` and the expression `Nna gị` that already exist. This script folds each such sentence
 * into its existing twin. It is a MERGE, not a delete: the lesson keeps every exercise it
 * had, now sourced from the word or expression.
 *
 * WHAT MOVES.
 *   exercise_questions   source_type/source_id -> the twin; translation_index remapped by
 *                        matching the sentence's translation text against the twin's;
 *                        prompt_template swapped for the wording the app already uses for
 *                        that (source type, subtype) pair, copied from a live question
 *                        rather than invented; word-order/gap-fill payloads lose the
 *                        trailing full stop so tokens match the twin's text.
 *   lesson_content_items dropped when the lesson already lists the twin, else repointed.
 *   unit_content_items   same rule.
 *   lesson_blocks        untouched -- they reference questions by id, and those survive.
 *   sentences            hard deleted; sentence_components cascade.
 *
 * TWIN LOOKUP. The sentence text minus its trailing full stop, matched case-insensitively
 * against words first, then expressions. A sentence with no twin stops the run unless
 * --create-expression is passed, in which case a twin expression is minted from the
 * sentence's own word components (this is for fragments the plan itself named as a target
 * expression, such as "Ọ dị").
 *
 * SAFETY. Refuses if any learner progress row, voice submission, lesson block, or
 * related_source_refs entry points at a sentence being merged, or if no canonical prompt
 * exists for a question that would move. Everything runs in one transaction.
 *
 *   npx tsx src/scripts/mergeSentencesIntoContent.ts --language=igbo --from=list.json
 *   npx tsx src/scripts/mergeSentencesIntoContent.ts --language=igbo --from=list.json --apply
 *
 * list.json is a JSON array of exact sentence texts.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { Client } from "pg";

import { contentTextKey } from "../services/content/contentTextKey.js";

const APPLY = process.argv.includes("--apply");
const CREATE_EXPRESSION = process.argv.includes("--create-expression");
const LANGUAGE = (process.argv.find((arg) => arg.startsWith("--language="))?.slice("--language=".length) || "").trim();
const FROM = (process.argv.find((arg) => arg.startsWith("--from="))?.slice("--from=".length) || "").trim();

if (!LANGUAGE) throw new Error("pass --language=<language>");
if (!FROM) throw new Error("pass --from=<json file listing sentence texts>");

const TEXTS: string[] = JSON.parse(readFileSync(FROM, "utf8"));
if (!Array.isArray(TEXTS) || TEXTS.some((item) => typeof item !== "string" || !item.trim())) {
  throw new Error("--from must be a JSON array of non-empty strings");
}

type Twin = { type: "word" | "expression"; id: string; text: string; translations: string[]; created?: boolean };

type Plan = {
  sentence: { id: string; text: string; translations: string[] };
  twin: Twin;
  questions: Array<{
    id: string;
    subtype: string;
    oldTranslationIndex: number;
    newTranslationIndex: number;
    oldPrompt: string;
    newPrompt: string;
    reviewData: unknown;
    newReviewData: unknown;
    options: unknown;
    newOptions: unknown;
  }>;
  lessonItems: Array<{ id: string; lessonTitle: string; action: "drop" | "repoint"; role: string }>;
  unitItems: Array<{ id: string; unitTitle: string; action: "drop" | "repoint" }>;
  newExpressionComponents?: Array<{ type: string; ref_id: string; order_index: number; text_snapshot: string }>;
};

const newId = () => randomBytes(12).toString("hex");
const stripTrailingStop = (value: string) => String(value || "").replace(/\.+$/, "");
const isTokenSubtype = (subtype: string) => /^(ls-)?fg-/.test(subtype);
/** The `{placeholder}` names a prompt template consumes, as a sorted comparable string. */
const placeholders = (prompt: string) =>
  Array.from(String(prompt || "").matchAll(/\{(\w+)\}/g), (match) => match[1])
    .sort()
    .join(",");

function rewriteTokenPayload(subtype: string, reviewData: unknown, options: unknown) {
  if (!isTokenSubtype(subtype)) return { reviewData, options };
  let nextReview = reviewData;
  if (reviewData && typeof reviewData === "object") {
    const copy = { ...(reviewData as Record<string, unknown>) };
    if (typeof copy.sentence === "string") copy.sentence = stripTrailingStop(copy.sentence);
    if (Array.isArray(copy.words)) copy.words = copy.words.map((word) => (typeof word === "string" ? stripTrailingStop(word) : word));
    nextReview = copy;
  }
  const nextOptions = Array.isArray(options)
    ? options.map((option) => (typeof option === "string" ? stripTrailingStop(option) : option))
    : options;
  return { reviewData: nextReview, options: nextOptions };
}

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  const problems: string[] = [];
  const plans: Plan[] = [];
  const promptCache = new Map<string, string | null>();

  async function canonicalPrompt(type: "word" | "expression", subtype: string): Promise<string | null> {
    const key = `${type}:${subtype}`;
    if (promptCache.has(key)) return promptCache.get(key) ?? null;
    const sameLanguage = await c.query(
      `select q.prompt_template from exercise_questions q join lessons l on l.id = q.lesson_id
       where q.source_type = $1 and q.subtype = $2 and q.is_deleted = false and l.is_deleted = false and l.language = $3
       order by q.created_at desc limit 1`,
      [type, subtype, LANGUAGE]
    );
    const any = sameLanguage.rows[0]
      ? sameLanguage
      : await c.query(
          `select prompt_template from exercise_questions where source_type = $1 and subtype = $2 and is_deleted = false
           order by created_at desc limit 1`,
          [type, subtype]
        );
    const prompt = any.rows[0]?.prompt_template ? String(any.rows[0].prompt_template) : null;
    promptCache.set(key, prompt);
    return prompt;
  }

  try {
    console.log(APPLY ? "=== APPLYING (irreversible) ===" : "=== DRY RUN (pass --apply to write) ===");
    console.log(`language: ${LANGUAGE}   sentences listed: ${TEXTS.length}\n`);

    for (const text of TEXTS) {
      const sentence = (
        await c.query(`select id, text, translations from sentences where language = $1 and is_deleted = false and text = $2`, [
          LANGUAGE,
          text
        ])
      ).rows[0];
      if (!sentence) {
        problems.push(`sentence not found (live, exact text): ${JSON.stringify(text)}`);
        continue;
      }

      const bare = stripTrailingStop(sentence.text).trim();
      const word = (
        await c.query(`select id, text, translations from words where language = $1 and is_deleted = false and lower(text) = lower($2)`, [
          LANGUAGE,
          bare
        ])
      ).rows[0];
      const expression = word
        ? null
        : (
            await c.query(
              `select id, text, translations from expressions where language = $1 and is_deleted = false and lower(text) = lower($2)`,
              [LANGUAGE, bare]
            )
          ).rows[0];

      let twin: Twin | null = word
        ? { type: "word", id: word.id, text: word.text, translations: word.translations }
        : expression
          ? { type: "expression", id: expression.id, text: expression.text, translations: expression.translations }
          : null;

      let newExpressionComponents: Plan["newExpressionComponents"];
      if (!twin) {
        const components = (
          await c.query(`select type, ref_id, order_index, text_snapshot, gloss from sentence_components where sentence_id = $1 order by order_index`, [
            sentence.id
          ])
        ).rows;
        if (!CREATE_EXPRESSION) {
          problems.push(`no word or expression twin for ${JSON.stringify(sentence.text)} (pass --create-expression to mint one)`);
          continue;
        }
        if (components.length < 2 || components.some((component) => component.type !== "word")) {
          problems.push(`cannot mint an expression for ${JSON.stringify(sentence.text)}: needs 2+ word components`);
          continue;
        }
        twin = {
          type: "expression",
          id: newId(),
          text: bare,
          translations: Array.from(new Set(sentence.translations.map((item: string) => stripTrailingStop(item).trim()).filter(Boolean))),
          created: true
        };
        newExpressionComponents = components.map((component) => ({
          type: component.type,
          ref_id: component.ref_id,
          order_index: component.order_index,
          text_snapshot: component.text_snapshot
        }));
      }

      // Anything that would dangle if the sentence went away.
      const guards: Array<[string, string]> = [
        ["lesson block referencing the sentence", `select count(*) n from lesson_blocks where ref_id = $1`],
        ["question related_source_refs mentioning the sentence", `select count(*) n from exercise_questions where is_deleted = false and related_source_refs::text like '%' || $1 || '%'`],
        ["learner_content_performance rows", `select count(*) n from learner_content_performance where content_id = $1`],
        ["learner_question_misses rows", `select count(*) n from learner_question_misses where source_id = $1`],
        ["voice_audio_submissions rows", `select count(*) n from voice_audio_submissions where content_id = $1`],
        ["sentence used as a component elsewhere", `select count(*) n from sentence_components where ref_id = $1`]
      ];
      for (const [label, sql] of guards) {
        const n = Number((await c.query(sql, [sentence.id])).rows[0].n);
        if (n > 0) problems.push(`${JSON.stringify(sentence.text)}: ${n} ${label}`);
      }

      const twinKeys = twin.translations.map((item) => contentTextKey(item));
      const questions = (
        await c.query(
          `select id, subtype, translation_index, prompt_template, review_data, options from exercise_questions where source_id = $1 order by created_at`,
          [sentence.id]
        )
      ).rows;
      const plannedQuestions: Plan["questions"] = [];
      for (const question of questions) {
        const oldPrompt = String(question.prompt_template || "");
        const canonical = await canonicalPrompt(twin.type, question.subtype);
        if (!canonical) {
          problems.push(`${JSON.stringify(sentence.text)}: no canonical ${twin.type} prompt exists for subtype ${question.subtype} (question ${question.id})`);
        }
        // One subtype can carry two flavours: fg-word-order is "Arrange the words to mean:
        // {meaning}" over target-language tokens, but also "Build the English meaning of
        // this sentence." over English tokens. The canonical prompt is only a drop-in when
        // it consumes the same placeholders as the old one; otherwise the wording stays and
        // only the source moves, since the payload is self-contained.
        const newPrompt = canonical && placeholders(canonical) === placeholders(oldPrompt) ? canonical : oldPrompt;
        const oldIndex = Number(question.translation_index) || 0;
        const oldTranslation = sentence.translations[oldIndex] ?? sentence.translations[0] ?? "";
        const matched = twinKeys.indexOf(contentTextKey(oldTranslation));
        const rewritten = rewriteTokenPayload(question.subtype, question.review_data, question.options);
        plannedQuestions.push({
          id: question.id,
          subtype: question.subtype,
          oldTranslationIndex: oldIndex,
          newTranslationIndex: matched >= 0 ? matched : 0,
          oldPrompt,
          newPrompt,
          reviewData: question.review_data,
          newReviewData: rewritten.reviewData,
          options: question.options,
          newOptions: rewritten.options
        });
      }

      const lessonItems = (
        await c.query(
          `select i.id, i.role, l.title,
             exists (select 1 from lesson_content_items x where x.lesson_id = i.lesson_id and x.content_id = $2) as has_twin
           from lesson_content_items i join lessons l on l.id = i.lesson_id where i.content_id = $1`,
          [sentence.id, twin.id]
        )
      ).rows;
      const unitItems = (
        await c.query(
          `select i.id, u.title,
             exists (select 1 from unit_content_items x where x.unit_id = i.unit_id and x.content_id = $2) as has_twin
           from unit_content_items i join units u on u.id = i.unit_id where i.content_id = $1`,
          [sentence.id, twin.id]
        )
      ).rows;
      // A repointed item says the lesson works with the twin without introducing it. If the
      // twin was never introduced anywhere, the first lesson that gets it introduces it.
      const twinIntroduced =
        Number(
          (
            await c.query(
              `select count(*) n from lesson_content_items i join lessons l on l.id = i.lesson_id
               where i.content_id = $1 and i.role = 'introduce' and l.is_deleted = false`,
              [twin.id]
            )
          ).rows[0].n
        ) > 0;
      let introduced = twinIntroduced;

      plans.push({
        sentence: { id: sentence.id, text: sentence.text, translations: sentence.translations },
        twin,
        questions: plannedQuestions,
        lessonItems: lessonItems.map((item) => {
          if (item.has_twin) return { id: item.id, lessonTitle: item.title, action: "drop" as const, role: item.role };
          const role = introduced ? "review" : "introduce";
          introduced = true;
          return { id: item.id, lessonTitle: item.title, action: "repoint" as const, role };
        }),
        unitItems: unitItems.map((item) => ({ id: item.id, unitTitle: item.title, action: item.has_twin ? ("drop" as const) : ("repoint" as const) })),
        newExpressionComponents
      });
    }

    for (const plan of plans) {
      const twinLabel = `${plan.twin.type} ${JSON.stringify(plan.twin.text)}${plan.twin.created ? "  (NEW -- minted from the sentence's components)" : ""}`;
      console.log(`sentence ${JSON.stringify(plan.sentence.text)}  ->  ${twinLabel}`);
      for (const q of plan.questions) {
        const flags = [
          q.oldTranslationIndex !== q.newTranslationIndex ? `tr ${q.oldTranslationIndex}->${q.newTranslationIndex}` : "",
          JSON.stringify(q.reviewData) !== JSON.stringify(q.newReviewData) || JSON.stringify(q.options) !== JSON.stringify(q.newOptions) ? "payload period stripped" : ""
        ].filter(Boolean);
        console.log(`   question ${q.subtype.padEnd(26)} ${JSON.stringify(q.oldPrompt)} -> ${JSON.stringify(q.newPrompt)}${flags.length ? `   [${flags.join(", ")}]` : ""}`);
      }
      for (const item of plan.lessonItems) {
        console.log(`   lesson item ${item.action.padEnd(7)} ${JSON.stringify(item.lessonTitle)}${item.action === "repoint" ? ` as ${item.role}` : "  (lesson already lists the twin)"}`);
      }
      for (const item of plan.unitItems) {
        console.log(`   unit item   ${item.action.padEnd(7)} ${JSON.stringify(item.unitTitle)}${item.action === "drop" ? "  (unit already lists the twin)" : ""}`);
      }
      console.log();
    }

    if (problems.length) {
      console.log("REFUSING -- fix these first:");
      for (const problem of problems) console.log(`   - ${problem}`);
      return;
    }

    const totalQuestions = plans.reduce((sum, plan) => sum + plan.questions.length, 0);
    console.log(`${plans.length} sentence(s), ${totalQuestions} question(s) to move.`);

    if (!APPLY) {
      console.log("\ndry run -- nothing written.");
      return;
    }

    await c.query("begin");
    try {
      for (const plan of plans) {
        if (plan.twin.created) {
          const languageId = (await c.query(`select language_id from sentences where id = $1`, [plan.sentence.id])).rows[0]?.language_id ?? null;
          await c.query(
            `insert into expressions (id, language_id, language, text, text_normalized, translations, pronunciation, explanation, examples, difficulty, ai_meta, audio, status, is_deleted, register)
             select $1, $2, language, $3, $4, $5::text[], '', '', '[]'::jsonb, difficulty, ai_meta, audio, status, false, 'neutral'
             from sentences where id = $6`,
            [plan.twin.id, languageId, plan.twin.text, contentTextKey(plan.twin.text), plan.twin.translations, plan.sentence.id]
          );
          for (const component of plan.newExpressionComponents || []) {
            await c.query(
              `insert into expression_components (id, expression_id, type, ref_id, order_index, text_snapshot) values ($1, $2, $3, $4, $5, $6)`,
              [newId(), plan.twin.id, component.type, component.ref_id, component.order_index, component.text_snapshot]
            );
          }
        }

        for (const q of plan.questions) {
          await c.query(
            // review_data is jsonb; options is text[], so it goes through as a JS array.
            `update exercise_questions set source_type = $1, source_id = $2, translation_index = $3, prompt_template = $4, review_data = $5, options = $6::text[], updated_at = now() where id = $7`,
            [plan.twin.type, plan.twin.id, q.newTranslationIndex, q.newPrompt, JSON.stringify(q.newReviewData ?? {}), Array.isArray(q.newOptions) ? q.newOptions : [], q.id]
          );
        }
        for (const item of plan.lessonItems) {
          if (item.action === "drop") await c.query(`delete from lesson_content_items where id = $1`, [item.id]);
          else
            await c.query(`update lesson_content_items set content_type = $1, content_id = $2, role = $3, updated_at = now() where id = $4`, [
              plan.twin.type,
              plan.twin.id,
              item.role,
              item.id
            ]);
        }
        for (const item of plan.unitItems) {
          if (item.action === "drop") await c.query(`delete from unit_content_items where id = $1`, [item.id]);
          else await c.query(`update unit_content_items set content_type = $1, content_id = $2, updated_at = now() where id = $3`, [plan.twin.type, plan.twin.id, item.id]);
        }
        // components cascade
        await c.query(`delete from sentences where id = $1`, [plan.sentence.id]);
      }
      await c.query("commit");
    } catch (error) {
      await c.query("rollback");
      throw error;
    }

    console.log("\nmerge complete.");
  } finally {
    await c.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
