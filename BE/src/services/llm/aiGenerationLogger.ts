import util from "node:util";

function formatPayload(payload: Record<string, unknown>) {
  return util.inspect(payload, {
    depth: null,
    colors: true,
    compact: false,
    breakLength: 120,
    sorted: false
  });
}

export function logAiValidation(context: string, payload: Record<string, unknown>) {
  console.warn(`[AI_VALIDATION] ${context} ${formatPayload(payload)}`);
}

export function logAiRetry(context: string, payload: Record<string, unknown>) {
  console.info(`[AI_RETRY] ${context} ${formatPayload(payload)}`);
}

export function buildRetryInstruction(reasons: string[]) {
  const compactReasons = reasons.filter(Boolean).slice(0, 6).join(", ");
  return `Previous attempt failed validation for these reasons: ${compactReasons}. Regenerate and satisfy every requirement exactly.`; 
}
