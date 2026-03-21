# Learning Architecture Rewrite

## Target structure

Curriculum hierarchy:
- Language track
- Chapter
- Unit
- Lesson
- Stage

Content hierarchy:
- Word
- Expression
- Sentence

Supporting maps:
- UnitContentItem
- LessonContentItem

## Why the rewrite exists

The old `Phrase` model mixed too many responsibilities:
- reusable content storage
- lesson introduction tracking
- exercise source data
- sentence-like practice data

That created repeated edge cases:
- single-word vs multi-word teaching drift
- phrase blocks being reintroduced incorrectly
- sentence context leaking into phrase exercises
- weak distinction between new content and review content

The rewrite separates:
- curriculum containers
- reusable content entities
- lesson/unit content assignment
- exercise instances

## New content model

### Word
Used for single lexical items with stable direct meaning.

Examples:
- `ọkùnrin`
- `obìnrin`
- `ilé`

### Expression
Used for fixed chunks that should be taught as a unit.

Examples:
- `ẹ káàárọ̀`
- `ẹ káàsán`
- `báwo ni`

### Sentence
Used for composed practice utterances.

Examples:
- `ẹ káàárọ̀, báwo ni?`
- `òun ni ọkùnrin náà`

## Curriculum semantics

### Chapter
A chapter is the high-level grouping inside a language track.

### Unit
A unit belongs to a chapter.

Unit kinds:
- `core`
- `review`

Review styles:
- `none`
- `star`
- `gym`

A review unit may reference prior units through `reviewSourceUnitIds`.

### Lesson
A lesson still owns stages and blocks.

Blocks now support a new generic `content` block:
- `contentType: word | expression | sentence`
- `refId`
- `translationIndex`

Legacy `phrase` blocks still exist temporarily during the rewrite.

## Assignment maps

### UnitContentItem
Stores which content a unit introduces or reviews.

Fields:
- `unitId`
- `contentType`
- `contentId`
- `role: introduce | review`
- `orderIndex`
- `sourceUnitId?`

### LessonContentItem
Stores which content a lesson teaches or practices.

Fields:
- `lessonId`
- `unitId`
- `contentType`
- `contentId`
- `role: introduce | review | practice`
- `stageIndex?`
- `orderIndex`

## Question model direction

Questions are moving from phrase-centric to generic content sourcing.

New fields added:
- `sourceType`
- `sourceId`
- `relatedSourceRefs`

Legacy phrase fields still exist temporarily:
- `phraseId`
- `relatedPhraseIds`

This transitional overlap is intentional. It allows the codebase to stay runnable while generation, learner flow, and admin/tutor CRUD are rewritten.

## Refactor order

1. Backend schema/domain foundation
2. Unit/lesson assignment maps
3. AI generation around word/expression/sentence
4. Question generation around generic content refs
5. Learner flow and study rendering
6. Admin/tutor CRUD and dashboards
7. Delete remaining phrase-only paths

## Current status

Completed in this phase:
- `Chapter` model/entity/repository foundation
- `Word`, `Expression`, `Sentence` model/entity/repository foundation
- `UnitContentItem` and `LessonContentItem` model/entity/repository foundation
- `Unit` extended with chapter/review metadata
- `Lesson` extended with generic `content` blocks
- `Question` extended with generic content source fields

Not completed yet:
- AI generation rewrite
- learner API rewrite
- FE/admin/tutor migration
- phrase removal

`Phrase` is still present only as a temporary compatibility layer while the rest of the stack is rewritten.
