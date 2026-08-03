// JSON Schemas passed to Ollama's `format` field for structured output. Unlike the
// blunt format:"json" (valid syntax only), a schema constrains the exact shape: it forces
// required keys and enum values to be present, so the model cannot omit `role` on a
// component or emit a malformed bracket. llama.cpp converts these to a GBNF grammar, so we
// keep to the widely supported subset (type/properties/items/enum/required) and avoid
// constraints it honors inconsistently (minItems/maxItems), enforcing those in code instead.

const componentSchema = {
  type: "object",
  properties: {
    type: { type: "string", enum: ["word", "expression"] },
    text: { type: "string" },
    translations: { type: "array", items: { type: "string" } },
    fixed: { type: "boolean" },
    role: { type: "string", enum: ["core", "support"] }
  },
  // role is the field the model kept dropping; requiring it forces it into every component.
  // `fixed` needs the same treatment: validation rejects any multi-word component that does
  // not carry an explicit marker, and an optional boolean is simply never emitted, so every
  // multi-word component failed on "missing fixed marker" before it could be judged on merit.
  required: ["type", "text", "translations", "role", "fixed"]
} as const;

const meaningSegmentSchema = {
  type: "object",
  properties: {
    text: { type: "string" },
    componentIndexes: { type: "array", items: { type: "integer" } }
  },
  required: ["text", "componentIndexes"]
} as const;

export const SENTENCES_SCHEMA = {
  type: "object",
  properties: {
    sentences: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          translations: { type: "array", items: { type: "string" } },
          literalTranslation: { type: "string" },
          usageNotes: { type: "string" },
          explanation: { type: "string" },
          components: { type: "array", items: componentSchema },
          meaningSegments: { type: "array", items: meaningSegmentSchema }
        },
        required: ["text", "translations", "components", "meaningSegments"]
      }
    }
  },
  required: ["sentences"]
} as const;
