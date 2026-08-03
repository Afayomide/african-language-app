import type { Status } from "../domain/entities/Lesson.js";

// Dev-only escape hatch for previewing unapproved content in the real learner UI.
//
// Normally the learner surface only serves `published` lessons/units/chapters/questions.
// When LEARNER_INCLUDE_UNAPPROVED=true AND the process is NOT running in production, the
// learner surface also serves `draft` and `finished` (i.e. generated-but-not-yet-approved)
// content, so you can walk an unapproved lesson exactly like a real learner without having
// to approve/publish it first.
//
// The NODE_ENV guard is deliberate belt-and-braces: even if the flag is ever set in a
// production environment, it has no effect there. With the flag off the returned list is
// exactly ["published"], so production behaviour is byte-for-byte unchanged.
export function learnerIncludesUnapproved(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.LEARNER_INCLUDE_UNAPPROVED === "true";
}

const APPROVED_ONLY: Status[] = ["published"];
const INCLUDING_UNAPPROVED: Status[] = ["draft", "finished", "published"];

// The set of statuses the learner surface is allowed to see right now. Pass this straight to
// a repository `list({ status })` filter (they accept an array and translate it to `$in`).
export function learnerVisibleStatuses(): Status[] {
  return learnerIncludesUnapproved() ? INCLUDING_UNAPPROVED : APPROVED_ONLY;
}

// Guard replacement for `lesson.status !== "published"` checks on a single already-fetched row.
export function isLearnerVisibleStatus(status: Status): boolean {
  return learnerVisibleStatuses().includes(status);
}
