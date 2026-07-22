"use node";

export const MAX_CARD_COUNT = 1000;
export const MAX_CHUNK_SIZE = 9000;
export const MAX_CHUNKS = 10;

export function clampCardCount(value: number): number {
  if (!Number.isFinite(value)) {
    return 12;
  }
  return Math.min(MAX_CARD_COUNT, Math.max(1, Math.round(value)));
}

export function chunkText(text: string, maxChunks = MAX_CHUNKS): string[] {
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  const chunks: string[] = [];
  let current = "";

  for (const para of paragraphs) {
    if (current.length + para.length + 2 > MAX_CHUNK_SIZE) {
      if (current) chunks.push(current.trim());
      if (para.length > MAX_CHUNK_SIZE) {
        const sentences = para.match(/[^.!?]+[.!?]+|\S+/g) ?? [para];
        current = "";
        for (const sentence of sentences) {
          if (current.length + sentence.length > MAX_CHUNK_SIZE) {
            if (current) chunks.push(current.trim());
            current = sentence;
          } else {
            current += sentence;
          }
        }
      } else {
        current = para;
      }
    } else {
      current += (current ? "\n\n" : "") + para;
    }
  }
  if (current.trim()) chunks.push(current.trim());

  if (chunks.length <= maxChunks) return chunks;

  const sampled: string[] = [];
  const step = (chunks.length - 1) / (maxChunks - 1);
  for (let i = 0; i < maxChunks; i++) {
    sampled.push(chunks[Math.round(i * step)]!);
  }
  return sampled;
}
