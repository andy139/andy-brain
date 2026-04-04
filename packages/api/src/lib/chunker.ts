const CHUNK_SIZE = 2000; // ~500 tokens at ~4 chars/token
const OVERLAP = 200;    // ~50 tokens overlap carried into the next chunk

const SEPARATORS = ["\n\n", "\n", ". "] as const;

/**
 * Splits text into overlapping chunks of ~500 tokens.
 * Iterative implementation — guaranteed forward progress, no stack overflow risk.
 */
export function chunkText(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (normalized.length === 0) return [];
  if (normalized.length <= CHUNK_SIZE) return [normalized];

  const chunks: string[] = [];
  let pos = 0;

  while (pos < normalized.length) {
    const remaining = normalized.length - pos;
    if (remaining <= CHUNK_SIZE) {
      chunks.push(normalized.slice(pos));
      break;
    }

    const window = normalized.slice(pos, pos + CHUNK_SIZE);

    // Find the last separator within the window
    let splitAt = -1;
    for (const sep of SEPARATORS) {
      const idx = window.lastIndexOf(sep);
      if (idx > 0) {
        splitAt = idx + sep.length;
        break;
      }
    }

    if (splitAt > 0) {
      chunks.push(window.slice(0, splitAt).trim());
      // Advance by splitAt, then back up by OVERLAP — but never go backward
      pos += Math.max(1, splitAt - OVERLAP);
    } else {
      // No separator found — hard split
      chunks.push(window.trim());
      pos += CHUNK_SIZE - OVERLAP;
    }
  }

  return chunks.filter((c) => c.trim().length > 0);
}
