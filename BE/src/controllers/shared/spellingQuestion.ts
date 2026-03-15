function getGraphemeSegments(value: string) {
  const source = String(value || "").trim();
  if (!source) return [];

  const SegmenterCtor = Intl.Segmenter;
  if (typeof SegmenterCtor !== "function") {
    return Array.from(source);
  }

  const segmenter = new SegmenterCtor(undefined, { granularity: "grapheme" });
  return Array.from(segmenter.segment(source), (entry) => entry.segment).filter(Boolean);
}

function splitWords(value: string) {
  return String(value || "")
    .trim()
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function buildLetterOrderReviewData(input: {
  phraseText: string;
  meaning: string;
}) {
  const words = getGraphemeSegments(input.phraseText);
  if (words.length < 2) return null;

  return {
    sentence: String(input.phraseText || "").trim(),
    words,
    correctOrder: words.map((_, index) => index),
    meaning: String(input.meaning || "").trim()
  };
}

export function buildWordOrderReviewData(input: {
  phraseText: string;
  meaning: string;
}) {
  const sentence = String(input.phraseText || "").trim();
  const words = splitWords(sentence);
  if (words.length < 2) return null;

  return {
    sentence,
    words,
    correctOrder: words.map((_, index) => index),
    meaning: String(input.meaning || "").trim()
  };
}
