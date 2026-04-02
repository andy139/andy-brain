const CHUNK_SIZE = 2000; // ~500 tokens at ~4 chars/token
const OVERLAP = 200;    // ~50 tokens overlap carried into the next chunk

const SEPARATORS = ["\n\n", "\n", ". "] as const;

/**
 * Splits text into overlapping chunks of ~500 tokens using a recursive
 * last-separator approach — no external dependencies.
 *
 * Strategy:
 *  1. If the input fits in one chunk, return it.
 *  2. Find the last occurrence of a paragraph/line/sentence separator
 *     within CHUNK_SIZE characters and split there.
 *  3. The next call receives the tail of the previous chunk (OVERLAP chars)
 *     prepended to the remainder, preserving context across chunk boundaries.
 *  4. If no separator is found, hard-split at CHUNK_SIZE.
 */
export function chunkText(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (normalized.length === 0) return [];
  if (normalized.length <= CHUNK_SIZE) return [normalized];

  const chunks: string[] = [];

  function doChunk(input: string): void {
    if (input.length <= CHUNK_SIZE) {
      chunks.push(input);
      return;
    }

    for (const sep of SEPARATORS) {
      const idx = input.lastIndexOf(sep, CHUNK_SIZE);
      if (idx > 0) {
        const chunk = input.slice(0, idx + sep.length).trim();
        if (chunk.length > 0) chunks.push(chunk);
        // Carry OVERLAP chars into the next call so context bleeds across chunks
        const nextStart = Math.max(0, idx + sep.length - OVERLAP);
        doChunk(input.slice(nextStart));
        return;
      }
    }

    // No separator found within CHUNK_SIZE — hard split
    chunks.push(input.slice(0, CHUNK_SIZE));
    doChunk(input.slice(CHUNK_SIZE - OVERLAP));
  }

  doChunk(normalized);
  return chunks.filter((c) => c.trim().length > 0);
}
