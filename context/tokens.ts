export const RESERVED_MODEL_TOKENS = 256;

export function countTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
