'use client'

import { use, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  expressionService,
  lessonService,
  proverbService,
  questionService,
  sentenceService,
  wordService,
} from '@/services'
import type { Expression, LessonBlock, Sentence, Word } from '@/types'
import { LessonPlayer } from '@lesson-player/LessonPlayer'
import type {
  ExerciseQuestion,
  Language,
  LearningContent,
  LearningContentComponent,
  LessonFlowData,
  PopulatedLessonBlock,
  Proverb,
} from '@lesson-player/types'

function pickTranslation(translations: string[], preferredIndex?: number) {
  if (!Array.isArray(translations) || translations.length === 0) return ''
  if (typeof preferredIndex === 'number' && preferredIndex >= 0 && preferredIndex < translations.length) {
    return translations[preferredIndex]
  }
  return translations[0]
}

export default function TutorLessonReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()

  const loadFlow = useCallback(async (lessonId: string): Promise<LessonFlowData> => {
    const [lessonData, expressions, words, sentences, proverbs, questions] = await Promise.all([
      lessonService.getLesson(lessonId),
      expressionService.listExpressions(lessonId),
      wordService.listWords(lessonId),
      sentenceService.listSentences(lessonId),
      proverbService.listProverbs(lessonId),
      questionService.listQuestions({ lessonId }),
    ])

    const sortedStages = (lessonData.stages || []).slice().sort((left, right) => left.orderIndex - right.orderIndex)
    const expressionById = new Map(expressions.map((item) => [item._id, item] as const))
    const wordById = new Map(words.map((item) => [item._id, item] as const))
    const sentenceById = new Map(sentences.map((item) => [item._id, item] as const))
    const proverbById = new Map(proverbs.map((item) => [item._id, item] as const))

    const missingWordIds = new Set<string>()
    const missingExpressionIds = new Set<string>()
    const missingSentenceIds = new Set<string>()

    for (const stage of sortedStages) {
      for (const block of stage.blocks || []) {
        if (block.type === 'content') {
          if (block.contentType === 'word' && !wordById.has(block.refId)) missingWordIds.add(block.refId)
          if (block.contentType === 'expression' && !expressionById.has(block.refId)) missingExpressionIds.add(block.refId)
          if (block.contentType === 'sentence' && !sentenceById.has(block.refId)) missingSentenceIds.add(block.refId)
        }
      }
    }

    for (const question of questions) {
      if (question.sourceType === 'word' && question.sourceId && !wordById.has(question.sourceId)) {
        missingWordIds.add(question.sourceId)
      }
      if (question.sourceType === 'expression' && question.sourceId && !expressionById.has(question.sourceId)) {
        missingExpressionIds.add(question.sourceId)
      }
      if (question.sourceType === 'sentence' && question.sourceId && !sentenceById.has(question.sourceId)) {
        missingSentenceIds.add(question.sourceId)
      }

      for (const ref of question.relatedSourceRefs || []) {
        if (ref.type === 'word' && !wordById.has(ref.id)) missingWordIds.add(ref.id)
        if (ref.type === 'expression' && !expressionById.has(ref.id)) missingExpressionIds.add(ref.id)
        if (ref.type === 'sentence' && !sentenceById.has(ref.id)) missingSentenceIds.add(ref.id)
      }

      for (const pair of question.interactionData?.matchingPairs || []) {
        if (pair.contentType === 'word' && pair.contentId && !wordById.has(pair.contentId)) {
          missingWordIds.add(pair.contentId)
        }
        if (pair.contentType === 'expression' && pair.contentId && !expressionById.has(pair.contentId)) {
          missingExpressionIds.add(pair.contentId)
        }
        if (pair.contentType === 'sentence' && pair.contentId && !sentenceById.has(pair.contentId)) {
          missingSentenceIds.add(pair.contentId)
        }
      }
    }

    if (missingWordIds.size > 0 || missingExpressionIds.size > 0 || missingSentenceIds.size > 0) {
      const [resolvedWords, resolvedExpressions, resolvedSentences] = await Promise.all([
        Promise.all(
          Array.from(missingWordIds).map(async (wordId) => {
            try {
              return await wordService.getWord(wordId)
            } catch {
              return null
            }
          }),
        ),
        Promise.all(
          Array.from(missingExpressionIds).map(async (expressionId) => {
            try {
              return await expressionService.getExpression(expressionId)
            } catch {
              return null
            }
          }),
        ),
        Promise.all(
          Array.from(missingSentenceIds).map(async (sentenceId) => {
            try {
              return await sentenceService.getSentence(sentenceId)
            } catch {
              return null
            }
          }),
        ),
      ])

      for (const word of resolvedWords) {
        if (word) wordById.set(word._id, word)
      }
      for (const expression of resolvedExpressions) {
        if (expression) expressionById.set(expression._id, expression)
      }
      for (const sentence of resolvedSentences) {
        if (sentence) sentenceById.set(sentence._id, sentence)
      }
    }

    const missingComponentWordIds = new Set<string>()
    const missingComponentExpressionIds = new Set<string>()

    for (const sentence of sentenceById.values()) {
      for (const component of sentence.components || []) {
        if (component.type === 'word') {
          if (!wordById.has(component.refId)) {
            missingComponentWordIds.add(component.refId)
          }
          continue
        }
        if (component.type === 'expression' && !expressionById.has(component.refId)) {
          missingComponentExpressionIds.add(component.refId)
        }
      }
    }

    if (missingComponentWordIds.size > 0 || missingComponentExpressionIds.size > 0) {
      const [resolvedWords, resolvedExpressions] = await Promise.all([
        Promise.all(
          Array.from(missingComponentWordIds).map(async (wordId) => {
            try {
              return await wordService.getWord(wordId)
            } catch {
              return null
            }
          }),
        ),
        Promise.all(
          Array.from(missingComponentExpressionIds).map(async (expressionId) => {
            try {
              return await expressionService.getExpression(expressionId)
            } catch {
              return null
            }
          }),
        ),
      ])

      for (const word of resolvedWords) {
        if (word) wordById.set(word._id, word)
      }
      for (const expression of resolvedExpressions) {
        if (expression) expressionById.set(expression._id, expression)
      }
    }

    const contentByKey = new Map<string, LearningContent>()

    function toContent(
      item: Expression | Word | Sentence,
      kind: 'expression' | 'word' | 'sentence',
      translationIndex = 0,
    ): LearningContent {
      const audioUrl = item.audio?.url || ''
      const base: LearningContent = {
        _id: item._id,
        id: item._id,
        kind,
        text: item.text,
        translations: item.translations || [],
        selectedTranslationIndex: translationIndex,
        selectedTranslation: pickTranslation(item.translations || [], translationIndex),
        pronunciation: item.pronunciation,
        explanation: item.explanation,
        audio: audioUrl ? { url: audioUrl } : undefined,
      }

      if (kind === 'sentence') {
        const sentence = item as Sentence
        const hydratedComponents: LearningContentComponent[] = []
        for (const component of sentence.components || []) {
          const source = component.type === 'word' ? wordById.get(component.refId) : expressionById.get(component.refId)
          if (!source) continue
          hydratedComponents.push({
            id: source._id,
            kind: component.type,
            text: source.text,
            translations: source.translations || [],
            selectedTranslationIndex: 0,
            selectedTranslation: pickTranslation(source.translations || [], 0),
            pronunciation: source.pronunciation || undefined,
            explanation: source.explanation || undefined,
            audio: source.audio?.url ? { url: source.audio.url } : undefined,
          })
        }
        base.components = hydratedComponents
      }

      return base
    }

    for (const item of expressionById.values()) {
      contentByKey.set(`expression:${item._id}`, toContent(item, 'expression'))
    }
    for (const item of wordById.values()) {
      contentByKey.set(`word:${item._id}`, toContent(item, 'word'))
    }
    for (const item of sentenceById.values()) {
      contentByKey.set(`sentence:${item._id}`, toContent(item, 'sentence'))
    }

    const questionById = new Map(
      questions.map((question) => {
        const source =
          question.sourceId && question.sourceType
            ? contentByKey.get(`${question.sourceType}:${question.sourceId}`) || null
            : null
        return [question._id, { ...question, source }] as const
      }),
    )

    const flattenedBlocks: PopulatedLessonBlock[] = []

    for (const stage of sortedStages) {
      for (const block of stage.blocks || []) {
        if (block.type === 'text') {
          flattenedBlocks.push({ type: 'text', content: block.content })
          continue
        }

        if (block.type === 'content') {
          const content = contentByKey.get(`${block.contentType}:${block.refId}`)
          if (!content) continue
          const normalizedContent =
            block.contentType === 'sentence'
              ? content
              : {
                  ...content,
                  selectedTranslationIndex: block.translationIndex ?? 0,
                  selectedTranslation: pickTranslation(content.translations, block.translationIndex ?? 0),
                }
          flattenedBlocks.push({
            type: 'content',
            contentType: block.contentType,
            data: normalizedContent,
          })
          continue
        }

        if (block.type === 'proverb') {
          const proverb = proverbById.get(block.refId)
          if (proverb) {
            flattenedBlocks.push({ type: 'proverb', data: proverb as Proverb })
          }
          continue
        }

        if (block.type === 'question') {
          const question = questionById.get(block.refId)
          if (question) {
            flattenedBlocks.push({ type: 'question', data: question as ExerciseQuestion })
          }
        }
      }
    }

    return {
      lesson: {
        ...lessonData,
        stages: sortedStages,
      },
      blocks: flattenedBlocks,
      progress: {
        currentStageIndex: 0,
        stageProgress: [],
        progressPercent: 0,
        status: 'not_started',
      },
    }
  }, [])

  const handleExit = useCallback(() => {
    router.push(`/lessons/${id}`)
  }, [id, router])

  const handleLoadError = useCallback(() => {
    router.push(`/lessons/${id}`)
  }, [id, router])

  const handleLessonComplete = useCallback(() => {
    router.push(`/lessons/${id}`)
  }, [id, router])

  return (
    <LessonPlayer
      lessonId={id}
      loadFlow={loadFlow}
      onExit={handleExit}
      onLoadError={handleLoadError}
      onLessonComplete={handleLessonComplete}
      loadingMessage="Loading lesson review..."
      emptyMessage="Lesson preview not available."
      preview
      allowStagePicker
      continuousMode
    />
  )
}
