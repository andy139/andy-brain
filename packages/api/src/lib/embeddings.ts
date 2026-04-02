import OpenAI from "openai";

// Voyage AI is OpenAI-API compatible — no new package needed
const voyage = new OpenAI({
  apiKey: process.env.VOYAGE_API_KEY,
  baseURL: "https://api.voyageai.com/v1/",
});

const EMBEDDING_MODEL = "voyage-3"; // 1024 dimensions

export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await voyage.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  });
  return response.data[0].embedding;
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
