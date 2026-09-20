/**
 * Open every course, in every language, for one learner account.
 *
 * Nothing in the data marks a lesson "locked": the learner UI derives it from where the
 * learner has got to. The current unit is the first one that is not finished, everything
 * after it in that chapter is locked, and every later chapter is locked with it. So the way
 * to see any lesson is to have finished everything -- which is what this does, for one
 * account, on purpose.
 *
 *   npx tsx src/scripts/unlockAllCoursesForLearner.ts --email you@example.com
 *   npx tsx src/scripts/unlockAllCoursesForLearner.ts --email you@example.com --apply
 *   npx tsx src/scripts/unlockAllCoursesForLearner.ts --email you@example.com --apply --reset
 *
 * It enrols the account in every language that has content, then records each visible lesson
 * as completed. --reset undoes it: the enrolments stay, the progress this script wrote is
 * deleted, and the account starts from the beginning again.
 *
 * Only this one account is touched, and only its own progress rows. Lessons, units and
 * questions are not modified, so what the account sees is exactly what a learner would see.
 *
 * Note: XP, streaks and "completed lessons" will read as if the course was finished, because
 * to the app it has been.
 */
import "dotenv/config";
import { Client } from "pg";
import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import { genObjectId } from "../infrastructure/db/drizzle/ids.js";
import { learnerVisibleStatuses } from "../config/learnerVisibility.js";

const APPLY = process.argv.includes("--apply");
const RESET = process.argv.includes("--reset");
const EMAIL = (() => {
  const at = process.argv.indexOf("--email");
  const value = at < 0 ? "" : String(process.argv[at + 1] || "").trim();
  if (!value) throw new Error("--email <address> is required");
  return value;
})();

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  c.on("error", (err) => console.error(`database connection error: ${err.message}`));
  await c.connect();
  try {
    const user = (await c.query(`SELECT id, email, roles FROM users WHERE lower(email) = lower($1)`, [EMAIL])).rows[0];
    if (!user) throw new Error(`no account with email ${EMAIL}`);
    const roles: string[] = Array.isArray(user.roles) ? user.roles : [];
    console.log(`account: ${user.email} (${roles.join(", ") || "no roles"})`);
    if (!roles.includes("learner")) {
      console.log(
        `note: this account is not a learner (${roles.join(", ") || "no roles"}). Unlocking works either way, ` +
          `but the learner app signs in learners, so check you can sign in with it.`
      );
    }

    if (RESET) {
      const before = (await c.query(`SELECT count(*)::int AS n FROM lesson_progress WHERE user_id = $1`, [user.id])).rows[0].n;
      console.log(`${before} progress rows would be deleted, returning the account to the start`);
      if (!APPLY) return console.log("dry run -- pass --apply to write");
      await c.query(`DELETE FROM lesson_progress WHERE user_id = $1`, [user.id]);
      await c.query(
        `UPDATE learner_language_states
         SET completed_lessons_count = 0, current_chapter_id = NULL, current_unit_id = NULL, updated_at = now()
         WHERE user_id = $1`,
        [user.id]
      );
      return console.log("reset done");
    }

    // Only what a learner may see, so the account walks the same course a learner walks.
    const statuses = learnerVisibleStatuses();
    const lessons = (await c.query(
      `SELECT l.id, l.language FROM lessons l
       JOIN units u ON u.id = l.unit_id AND u.is_deleted = false AND u.status = ANY($1)
       WHERE l.is_deleted = false AND l.status = ANY($1)`,
      [statuses]
    )).rows;
    const languages = (await c.query(
      `SELECT DISTINCT language FROM lessons WHERE is_deleted = false AND status = ANY($1)`,
      [statuses]
    )).rows.map((row) => row.language);

    const already = (await c.query(
      `SELECT lesson_id FROM lesson_progress WHERE user_id = $1 AND status = 'completed'`,
      [user.id]
    )).rows.map((row) => row.lesson_id);
    const alreadyDone = new Set(already);
    const toComplete = lessons.filter((lesson) => !alreadyDone.has(lesson.id));

    console.log(`visible statuses: ${statuses.join(", ")}`);
    console.log(`languages: ${languages.join(", ") || "none"}`);
    console.log(`lessons: ${lessons.length}, already completed: ${alreadyDone.size}, to mark complete: ${toComplete.length}`);
    if (!APPLY) return console.log("dry run -- pass --apply to write");

    mkdirSync("scratch", { recursive: true });
    const backup = path.resolve("scratch", `learner-unlock-backup-${Date.now()}.json`);
    writeFileSync(
      backup,
      JSON.stringify(
        {
          user,
          lessonProgress: (await c.query(`SELECT * FROM lesson_progress WHERE user_id = $1`, [user.id])).rows,
          languageStates: (await c.query(`SELECT * FROM learner_language_states WHERE user_id = $1`, [user.id])).rows
        },
        null,
        2
      )
    );

    await c.query("BEGIN");
    try {
      for (const language of languages) {
        await c.query(
          `INSERT INTO learner_language_states (id, user_id, language_code, is_enrolled)
           VALUES ($1, $2, $3, true)
           ON CONFLICT (user_id, language_code) DO UPDATE SET is_enrolled = true, updated_at = now()`,
          [genObjectId(), user.id, language]
        );
      }
      for (const lesson of toComplete) {
        await c.query(
          `INSERT INTO lesson_progress (id, user_id, lesson_id, status, progress_percent, started_at, completed_at)
           VALUES ($1, $2, $3, 'completed', 100, now(), now())
           ON CONFLICT (user_id, lesson_id) DO UPDATE
             SET status = 'completed', progress_percent = 100, completed_at = now(), updated_at = now()`,
          [genObjectId(), user.id, lesson.id]
        );
      }
      for (const language of languages) {
        const count = lessons.filter((lesson) => lesson.language === language).length;
        await c.query(
          `UPDATE learner_language_states SET completed_lessons_count = $1, updated_at = now()
           WHERE user_id = $2 AND language_code = $3`,
          [count, user.id, language]
        );
      }
      await c.query("COMMIT");
    } catch (err) {
      await c.query("ROLLBACK");
      throw err;
    }

    console.log(`unlocked ${lessons.length} lessons across ${languages.length} languages; previous state saved to ${backup}`);
    console.log("sign in on the phone with this account; every chapter and unit should be open.");
  } finally {
    await c.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
