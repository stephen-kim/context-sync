export function buildLocalEmbedding(input: string, dimensions = 256): number[] {
  const cleaned = input.trim().toLowerCase();
  const vector = new Array<number>(dimensions).fill(0);
  if (!cleaned) {
    return vector;
  }
  const tokens = cleaned.split(/[\s,.;:!?()[\]{}"'`<>/\\|+-]+/g).filter(Boolean);
  for (const token of tokens) {
    let hash = 2166136261;
    for (let i = 0; i < token.length; i += 1) {
      hash ^= token.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    const index = Math.abs(hash) % dimensions;
    vector[index] += 1;
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (norm === 0) {
    return vector;
  }
  return vector.map((value) => Number((value / norm).toFixed(6)));
}

export function toVectorLiteral(vector: number[]): string {
  return `[${vector.map((value) => (Number.isFinite(value) ? value : 0)).join(',')}]`;
}
