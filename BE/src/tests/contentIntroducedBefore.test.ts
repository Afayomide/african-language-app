import test from "node:test";
import assert from "node:assert/strict";

import { ContentCurriculumService } from "../application/services/ContentCurriculumService.js";

type Row = { lessonId: string; contentType: string; contentId: string; role: string };

/** unit 0 lesson 1, unit 0 lesson 2, unit 15 lesson 1 -- in the order a learner meets them. */
const lessons: Record<string, any> = {
  "u0-l1": { id: "u0-l1", unitId: "u0", orderIndex: 0, createdAt: new Date(1) },
  "u0-l2": { id: "u0-l2", unitId: "u0", orderIndex: 1, createdAt: new Date(2) },
  "u15-l1": { id: "u15-l1", unitId: "u15", orderIndex: 0, createdAt: new Date(3) },
  "ch2-l1": { id: "ch2-l1", unitId: "u-ch2", orderIndex: 0, createdAt: new Date(4) }
};
const units: Record<string, any> = {
  u0: { id: "u0", chapterId: "ch1", orderIndex: 0, createdAt: new Date(1) },
  u15: { id: "u15", chapterId: "ch1", orderIndex: 15, createdAt: new Date(2) },
  // A low order index, but in a later chapter: it still comes after everything in chapter 1.
  "u-ch2": { id: "u-ch2", chapterId: "ch2", orderIndex: 0, createdAt: new Date(3) }
};
const chapters: Record<string, any> = {
  ch1: { id: "ch1", orderIndex: 0 },
  ch2: { id: "ch2", orderIndex: 1 }
};

function serviceWith(rows: Row[]) {
  return new ContentCurriculumService(
    { findById: async (id: string) => lessons[id] ?? null } as any,
    { findById: async (id: string) => units[id] ?? null } as any,
    { list: async () => rows } as any,
    {} as any,
    { findById: async (id: string) => chapters[id] ?? null } as any
  );
}

const intro = (lessonId: string): Row => ({ lessonId, contentType: "word", contentId: "babá", role: "introduce" });

test("an introduction later in the course does not count as already taught", async () => {
  const service = serviceWith([intro("u15-l1")]);
  assert.equal(
    await service.wasContentIntroducedBeforeLesson({ lesson: lessons["u0-l1"], contentType: "word", contentId: "babá" }),
    false
  );
});

test("an introduction earlier in the course does count", async () => {
  const service = serviceWith([intro("u0-l1")]);
  assert.equal(
    await service.wasContentIntroducedBeforeLesson({ lesson: lessons["u15-l1"], contentType: "word", contentId: "babá" }),
    true
  );
});

test("an earlier lesson in the same unit counts", async () => {
  const service = serviceWith([intro("u0-l1")]);
  assert.equal(
    await service.wasContentIntroducedBeforeLesson({ lesson: lessons["u0-l2"], contentType: "word", contentId: "babá" }),
    true
  );
});

test("the lesson's own introduction does not count", async () => {
  const service = serviceWith([intro("u0-l1")]);
  assert.equal(
    await service.wasContentIntroducedBeforeLesson({ lesson: lessons["u0-l1"], contentType: "word", contentId: "babá" }),
    false
  );
});

test("a later chapter does not count, even with a lower unit order index", async () => {
  const service = serviceWith([intro("ch2-l1")]);
  assert.equal(
    await service.wasContentIntroducedBeforeLesson({ lesson: lessons["u15-l1"], contentType: "word", contentId: "babá" }),
    false
  );
});

test("an introduction whose lesson is gone does not count", async () => {
  const service = serviceWith([intro("deleted-lesson")]);
  assert.equal(
    await service.wasContentIntroducedBeforeLesson({ lesson: lessons["u15-l1"], contentType: "word", contentId: "babá" }),
    false
  );
});
