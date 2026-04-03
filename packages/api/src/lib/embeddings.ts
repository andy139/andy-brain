import OpenAI from "openai";

// Voyage AI is OpenAI-API compatible — no new package needed
const voyage = new OpenAI({
  apiKey: process.env.VOYAGE_API_KEY,
  baseURL: "https://api.voyageai.com/v1/",
});

const EMBEDDING_MODEL = "voyage-3"; // 1024 dimensions

export async function generateEmbedding(text: string, retries = 3): Promise<number[]> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await voyage.embeddings.create({ model: EMBEDDING_MODEL, input: text });
      return response.data[0].embedding;
    } catch (err: any) {
      if (err?.status === 429 && attempt < retries - 1) {
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
  throw new Error("Embedding failed after retries");
}

/**
 * Batch-embeds multiple texts in a single API call.
 * Results are returned in input order.
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const response = await voyage.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts,
  });
  return response.data
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);
}
