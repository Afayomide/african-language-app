import type { LearnerContentPerformanceEntity } from "../../domain/entities/LearnerContentPerformance.js";
import type { LearnerQuestionMissEntity } from "../../domain/entities/LearnerQuestionMiss.js";
import type { QuestionEntity } from "../../domain/entities/Question.js";

export function scoreAdaptiveReviewTarget(metrics: LearnerContentPerformanceEntity) {
  return (
    metrics.wrongCount * 3 +
    metrics.retryCount * 2 +
    metrics.speakingFailureCount * 4 +
    metrics.listeningFailureCount * 2 +
    metrics.contextScenarioFailureCount * 5 +
    Math.max(0, metrics.attemptCount - metrics.correctCount) -
    Math.floor(metrics.correctCount / 2)
  );
}

export function compareAdaptiveReviewMissedQuestions(
  left: { question: QuestionEntity; miss: LearnerQuestionMissEntity },
  right: { question: QuestionEntity; miss: LearnerQuestionMissEntity }
) {
  const leftIsScenario = left.question.subtype === "mc-select-context-response" ? 1 : 0;
  const rightIsScenario = right.question.subtype === "mc-select-context-response" ? 1 : 0;
  if (rightIsScenario !== leftIsScenario) {
    return rightIsScenario - leftIsScenario;
  }
  if (right.miss.missCount !== left.miss.missCount) {
    return right.miss.missCount - left.miss.missCount;
  }
  return right.miss.lastMissedAt.getTime() - left.miss.lastMissedAt.getTime();
}
