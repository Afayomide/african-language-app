/**
 * Link a run of word components back to the expression they spell.
 *
 * A sentence's components come from the model. Asked for `Ẹ káàárọ̀, Màmá.` it may return the
 * greeting as one fixed component (stored as the expression) or as the words `Ẹ` + `káàárọ̀`
 * (stored as two words). The second form teaches the wrong thing: `Káàárọ̀` on its own is the
 * CASUAL good morning, so a learner tapping it inside the respectful greeting is told it is
 * casual, in the unit whose whole point is that contrast. It also hides the expression the
 * lesson introduced, so nothing reinforces it.
 *
 * The merge is deliberately conservative:
 *   - only consecutive WORD components, never across an existing expression
 *   - only when the joined text matches an active expression exactly, once normalised
 *   - longest match wins, so `Ẹ fún mi ni` beats `fún mi`
 *   - at most MAX_EXPRESSION_WORDS words, matching the generation rule for a fixed expression
 *
 * Merging changes component positions, and a sentence's meaning map addresses components by
 * position, so `remapIndex` is exported alongside: every caller must remap what it stores.
 */

/** "A fixed expression is at most four words" (prompts.ts). */
export const MAX_EXPRESSION_WORDS = 4;

export type LinkableComponent = {
  type: "word" | "expression";
  text: string;
  gloss?: string;
};

export type ExpressionMatch = { id: string; text: string };

export type MergePlan = {
  /** Index of the first component in the run. */
  start: number;
  /** How many components the run covers. */
  length: number;
  expression: ExpressionMatch;
  /** The merged words' own meanings, in order, to keep as the expression's part glosses. */
  partGlosses: string[];
};

export function planExpressionMerges(
  components: LinkableComponent[],
  findExpression: (normalizedText: string) => ExpressionMatch | undefined,
  normalize: (value: string) => string
): MergePlan[] {
  const plans: MergePlan[] = [];
  let index = 0;

  while (index < components.length) {
    if (components[index].type !== "word") {
      index += 1;
      continue;
    }
    // How far the run of words extends from here.
    let runEnd = index;
    while (runEnd + 1 < components.length && components[runEnd + 1].type === "word") runEnd += 1;

    let matched = false;
    const longest = Math.min(runEnd - index + 1, MAX_EXPRESSION_WORDS);
    for (let length = longest; length >= 2; length -= 1) {
      const span = components.slice(index, index + length);
      const expression = findExpression(normalize(span.map((c) => c.text).join(" ")));
      if (!expression) continue;
      plans.push({
        start: index,
        length,
        expression,
        partGlosses: span.map((c) => String(c.gloss ?? ""))
      });
      index += length;
      matched = true;
      break;
    }
    if (!matched) index += 1;
  }

  return plans;
}

/** The components after merging, with each merged run replaced by its expression. */
export function applyExpressionMerges<T extends LinkableComponent>(
  components: T[],
  plans: MergePlan[]
): Array<T | { type: "expression"; text: string; refId: string; partGlosses: string[] }> {
  const byStart = new Map(plans.map((plan) => [plan.start, plan]));
  const merged: Array<T | { type: "expression"; text: string; refId: string; partGlosses: string[] }> = [];
  let index = 0;
  while (index < components.length) {
    const plan = byStart.get(index);
    if (plan) {
      merged.push({
        type: "expression",
        text: plan.expression.text,
        refId: plan.expression.id,
        // An empty slot falls back to the expression's own gloss, so all-empty means "nothing
        // worth keeping" rather than a row of blanks.
        partGlosses: plan.partGlosses.some(Boolean) ? plan.partGlosses : []
      });
      index += plan.length;
      continue;
    }
    merged.push(components[index]);
    index += 1;
  }
  return merged;
}

/**
 * Where a component index lands after merging. Every index inside a merged run collapses onto
 * the run's new position, and everything after it shifts down.
 */
export function remapIndex(index: number, plans: MergePlan[]): number {
  let shift = 0;
  for (const plan of plans) {
    if (index >= plan.start + plan.length) shift += plan.length - 1;
    else if (index >= plan.start) return plan.start - shift;
  }
  return index - shift;
}
