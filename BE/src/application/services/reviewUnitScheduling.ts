import type { UnitEntity } from "../../domain/entities/Unit.js";

export type ReviewUnitSource = Pick<UnitEntity, "id" | "title" | "kind">;

export function getTrailingCoreUnitsSinceLastReview(units: ReviewUnitSource[]) {
  const trailing: ReviewUnitSource[] = [];
  for (const unit of units) {
    if (unit.kind === "review") {
      trailing.length = 0;
      continue;
    }
    trailing.push(unit);
  }
  return trailing;
}

export function buildAutoReviewUnitBaseTitle(sourceUnits: ReviewUnitSource[]) {
  const titles = sourceUnits.map((unit) => unit.title.trim()).filter(Boolean);
  if (titles.length === 0) return "Review Unit";
  return `Review: ${titles.join(" + ")}`;
}

export function buildAutoReviewUnitTitle(sourceUnits: ReviewUnitSource[], existingTitleKeys: Set<string>) {
  const baseTitle = buildAutoReviewUnitBaseTitle(sourceUnits);
  let candidate = baseTitle;
  let suffix = 2;
  while (existingTitleKeys.has(candidate.trim().toLowerCase())) {
    candidate = `${baseTitle} (${suffix})`;
    suffix += 1;
  }
  return candidate;
}

export function buildAutoReviewUnitDescription(sourceUnits: ReviewUnitSource[]) {
  const titles = sourceUnits.map((unit) => unit.title.trim()).filter(Boolean);
  if (titles.length >= 2) {
    return `Sentence-focused review unit using the known words and expressions from ${titles[0]} and ${titles[1]}. Emphasize fresh sentence practice and exercises without introducing new targets.`;
  }
  if (titles.length === 1) {
    return `Sentence-focused review unit using the known words and expressions from ${titles[0]}. Emphasize fresh sentence practice and exercises without introducing new targets.`;
  }
  return "Sentence-focused review unit using known words and expressions from earlier units. Emphasize fresh sentence practice and exercises without introducing new targets.";
}
