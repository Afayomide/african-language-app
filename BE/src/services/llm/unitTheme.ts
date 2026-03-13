const STOP_WORDS = new Set([
  "a",
  "about",
  "after",
  "all",
  "an",
  "and",
  "any",
  "are",
  "as",
  "at",
  "be",
  "before",
  "between",
  "build",
  "by",
  "can",
  "coherent",
  "conversation",
  "conversational",
  "coverage",
  "curriculum",
  "daily",
  "design",
  "do",
  "each",
  "every",
  "for",
  "from",
  "high",
  "how",
  "in",
  "into",
  "is",
  "it",
  "its",
  "language",
  "later",
  "lesson",
  "level",
  "load",
  "logical",
  "manage",
  "manageable",
  "more",
  "must",
  "new",
  "next",
  "not",
  "of",
  "on",
  "or",
  "progression",
  "progressive",
  "real",
  "repeat",
  "repetition",
  "review",
  "sequence",
  "should",
  "simple",
  "slightly",
  "step",
  "than",
  "that",
  "the",
  "their",
  "them",
  "then",
  "this",
  "to",
  "too",
  "unit",
  "use",
  "useful",
  "utility",
  "vocabulary",
  "with"
]);

function normalizeWords(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 3 && !STOP_WORDS.has(item));
}

export function extractThemeAnchors(input: {
  unitTitle?: string;
  unitDescription?: string;
  topic?: string;
  curriculumInstruction?: string;
}) {
  const ranked = new Map<string, number>();

  const push = (text: string | undefined, weight: number) => {
    for (const word of normalizeWords(text || "")) {
      ranked.set(word, (ranked.get(word) || 0) + weight);
    }
  };

  push(input.unitTitle, 4);
  push(input.topic, 3);
  push(input.unitDescription, 2);
  push(input.curriculumInstruction, 1);

  return [...ranked.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 10)
    .map(([word]) => word);
}

export function buildThemeAlignmentInstruction(input: {
  unitTitle?: string;
  unitDescription?: string;
  topic?: string;
  themeAnchors?: string[];
}) {
  const parts: string[] = [
    "The generated lesson must be a clear subtopic of the active unit theme, not just a generic lesson for the level.",
    "Title, description, and objectives must all reflect the same unit theme."
  ];

  if (input.unitTitle) parts.push(`Active unit title: ${input.unitTitle}`);
  if (input.unitDescription) parts.push(`Active unit description: ${input.unitDescription}`);
  if (input.topic) parts.push(`Requested lesson focus: ${input.topic}`);
  if (input.themeAnchors && input.themeAnchors.length > 0) {
    parts.push(`Theme anchors to stay within: ${input.themeAnchors.join(", ")}`);
    parts.push("Do not drift into unrelated generic topics outside these anchors.");
  }

  return parts.join(" ");
}
