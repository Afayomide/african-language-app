import dotenv from "dotenv";
import mongoose from "mongoose";
import ExpressionModel from "../models/Expression.js";
import WordModel from "../models/Word.js";

dotenv.config();

type ComponentTokenSpec = {
  snapshot: string;
  wordText: string;
};

type ExpressionBackfillSpec = {
  expressionText: string;
  components: ComponentTokenSpec[];
};

const LANGUAGE = "yoruba" as const;

const EXPRESSION_SPECS: ExpressionBackfillSpec[] = [
  {
    expressionText: "Ẹ káàárọ̀",
    components: [
      { snapshot: "Ẹ", wordText: "Ẹ" },
      { snapshot: "káàárọ̀", wordText: "Káàárọ̀" }
    ]
  },
  {
    expressionText: "Ẹ káàárọ̀ o",
    components: [
      { snapshot: "Ẹ", wordText: "Ẹ" },
      { snapshot: "káàárọ̀", wordText: "Káàárọ̀" },
      { snapshot: "o", wordText: "o" }
    ]
  },
  {
    expressionText: "Ẹ káàsán",
    components: [
      { snapshot: "Ẹ", wordText: "Ẹ" },
      { snapshot: "káàsán", wordText: "Káàsán" }
    ]
  },
  {
    expressionText: "ẹ káàsán o",
    components: [
      { snapshot: "ẹ", wordText: "Ẹ" },
      { snapshot: "káàsán", wordText: "Káàsán" },
      { snapshot: "o", wordText: "o" }
    ]
  },
  {
    expressionText: "Ẹ káalẹ́",
    components: [
      { snapshot: "Ẹ", wordText: "Ẹ" },
      { snapshot: "káalẹ́", wordText: "káalẹ́" }
    ]
  },
  {
    expressionText: "Ẹ káalẹ́ o",
    components: [
      { snapshot: "Ẹ", wordText: "Ẹ" },
      { snapshot: "káalẹ́", wordText: "káalẹ́" },
      { snapshot: "o", wordText: "o" }
    ]
  },
  {
    expressionText: "ẹ kúùrọ̀lẹ́",
    components: [
      { snapshot: "ẹ", wordText: "Ẹ" },
      { snapshot: "kúùrọ̀lẹ́", wordText: "kúùrọ̀lẹ́" }
    ]
  },
  {
    expressionText: "ẹ káàbọ̀",
    components: [
      { snapshot: "ẹ", wordText: "Ẹ" },
      { snapshot: "káàbọ̀", wordText: "káàbọ̀" }
    ]
  },
  {
    expressionText: "Báwo ni",
    components: [
      { snapshot: "Báwo", wordText: "Báwo" },
      { snapshot: "ni", wordText: "ni" }
    ]
  },
  {
    expressionText: "ṣé ẹ wà dáadáa",
    components: [
      { snapshot: "ṣé", wordText: "Ṣé" },
      { snapshot: "ẹ", wordText: "Ẹ" },
      { snapshot: "wà", wordText: "wà" },
      { snapshot: "dáadáa", wordText: "dáadáa" }
    ]
  },
  {
    expressionText: "màmá mi",
    components: [
      { snapshot: "màmá", wordText: "Màmá" },
      { snapshot: "mi", wordText: "mi" }
    ]
  },
  {
    expressionText: "bàbá mi",
    components: [
      { snapshot: "bàbá", wordText: "bàbá" },
      { snapshot: "mi", wordText: "mi" }
    ]
  },
  {
    expressionText: "Bàbá àgbà",
    components: [
      { snapshot: "Bàbá", wordText: "bàbá" },
      { snapshot: "àgbà", wordText: "àgbà" }
    ]
  },
  {
    expressionText: "Ìyá àgbà",
    components: [
      { snapshot: "Ìyá", wordText: "Ìyá" },
      { snapshot: "àgbà", wordText: "àgbà" }
    ]
  },
  {
    expressionText: "Bẹ́ẹ̀ ni",
    components: [
      { snapshot: "Bẹ́ẹ̀", wordText: "Bẹ́ẹ̀" },
      { snapshot: "ni", wordText: "ni" }
    ]
  }
];

type DryRunExpressionRow = {
  expressionId: string;
  expressionText: string;
  existingComponentCount: number;
  nextComponentCount: number;
  existingComponents: Array<{
    type: string;
    refId: string;
    orderIndex: number;
    textSnapshot: string;
  }>;
  nextComponents: Array<{
    type: "word";
    refId: string;
    orderIndex: number;
    textSnapshot: string;
    linkedWordText: string;
  }>;
};

function serializeExistingComponents(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((component) => {
    const row = component as {
      type?: unknown;
      refId?: mongoose.Types.ObjectId | string;
      orderIndex?: unknown;
      textSnapshot?: unknown;
    };
    return {
      type: String(row.type || ""),
      refId: String(row.refId || ""),
      orderIndex: Number(row.orderIndex || 0),
      textSnapshot: String(row.textSnapshot || "")
    };
  });
}

async function main() {
  const mongoUri = process.env.MONGODB_URI || "";
  if (!mongoUri) throw new Error("Missing MONGODB_URI");

  const shouldApply = process.argv.includes("--apply");
  await mongoose.connect(mongoUri);

  const expressions = await ExpressionModel.find({
    language: LANGUAGE,
    isDeleted: { $ne: true },
    status: { $ne: "deleted" },
    text: { $in: EXPRESSION_SPECS.map((item) => item.expressionText) }
  })
    .select({ text: 1, language: 1, components: 1 })
    .lean();

  const words = await WordModel.find({
    language: LANGUAGE,
    isDeleted: { $ne: true },
    status: { $ne: "deleted" }
  })
    .select({ text: 1, translations: 1 })
    .lean();

  const expressionByText = new Map(expressions.map((item) => [String(item.text), item]));
  const wordsByText = new Map<string, typeof words>();

  for (const word of words) {
    const key = String(word.text);
    const current = wordsByText.get(key) || [];
    current.push(word);
    wordsByText.set(key, current);
  }

  const missingExpressions: Array<{ expressionText: string }> = [];
  const ambiguousWords: Array<{ expressionText: string; wordText: string; matches: string[] }> = [];
  const missingWords: Array<{ expressionText: string; wordText: string }> = [];
  const updates: DryRunExpressionRow[] = [];

  for (const spec of EXPRESSION_SPECS) {
    const expression = expressionByText.get(spec.expressionText);
    if (!expression) {
      missingExpressions.push({ expressionText: spec.expressionText });
      continue;
    }

    const nextComponents: DryRunExpressionRow["nextComponents"] = [];

    for (const [index, component] of spec.components.entries()) {
      const matches = wordsByText.get(component.wordText) || [];
      if (matches.length === 0) {
        missingWords.push({ expressionText: spec.expressionText, wordText: component.wordText });
        continue;
      }
      if (matches.length > 1) {
        ambiguousWords.push({
          expressionText: spec.expressionText,
          wordText: component.wordText,
          matches: matches.map((item) => `${String(item._id)}:${item.text}`)
        });
        continue;
      }

      const word = matches[0]!;
      nextComponents.push({
        type: "word",
        refId: String(word._id),
        orderIndex: index,
        textSnapshot: component.snapshot,
        linkedWordText: word.text
      });
    }

    updates.push({
      expressionId: String(expression._id),
      expressionText: spec.expressionText,
      existingComponentCount: Array.isArray(expression.components) ? expression.components.length : 0,
      nextComponentCount: nextComponents.length,
      existingComponents: serializeExistingComponents(expression.components),
      nextComponents
    });
  }

  const hasBlockingIssues = missingExpressions.length > 0 || missingWords.length > 0 || ambiguousWords.length > 0;

  let modifiedCount = 0;
  if (shouldApply && !hasBlockingIssues) {
    for (const update of updates) {
      const result = await ExpressionModel.updateOne(
        { _id: update.expressionId, language: LANGUAGE, isDeleted: { $ne: true } },
        {
          $set: {
            components: update.nextComponents.map((component) => ({
              type: component.type,
              refId: component.refId,
              orderIndex: component.orderIndex,
              textSnapshot: component.textSnapshot
            }))
          }
        }
      );
      modifiedCount += result.modifiedCount;
    }
  }

  console.log(
    JSON.stringify(
      {
        language: LANGUAGE,
        dryRun: !shouldApply,
        shouldApply,
        hasBlockingIssues,
        matchedExpressions: updates.length,
        modifiedCount,
        missingExpressions,
        missingWords,
        ambiguousWords,
        updates
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
