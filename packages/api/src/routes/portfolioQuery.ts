import { Hono } from "hono";
import { stream } from "hono/streaming";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { generateEmbedding } from "../lib/embeddings.js";
import { getPineconeIndex } from "../lib/pinecone.js";
import { buildPortfolioPrompt, type ContextItem } from "../lib/prompts.js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const app = new Hono();

const portfolioQuerySchema = z.object({
  question: z.string().min(1).max(500),
});

// Public endpoint — no auth required — used by the portfolio site
app.post("/portfolio/chat", zValidator("json", portfolioQuerySchema), async (c) => {
  const { question } = c.req.valid("json");

  let questionEmbedding: number[];
  try {
    questionEmbedding = await generateEmbedding(question);
  } catch (err) {
    console.error("Embedding error:", err);
    return c.json({ error: "Failed to process question" }, 500);
  }

  const index = getPineconeIndex();
  let matches: Array<{ id: string; score?: number; metadata?: Record<string, unknown> }>;
  try {
    const result = await index.query({
      vector: questionEmbedding,
      topK: 6,
      includeMetadata: true,
    });
    matches = result.matches ?? [];
  } catch (err) {
    console.error("Pinecone query error:", err);
    return c.json({ error: "Failed to query knowledge base" }, 500);
  }

  const context: ContextItem[] = matches.map((match) => ({
    text: (match.metadata?.text_preview as string) ?? "",
    source_type: (match.metadata?.source_type as string) ?? "other",
    source_url: null, // don't expose source URLs publicly
    tags: (match.metadata?.tags as string[]) ?? [],
    score: match.score ?? 0,
  }));

  const prompt = buildPortfolioPrompt(question, context);

  return stream(c, async (s) => {
    try {
      const claudeStream = anthropic.messages.stream({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      });

      for await (const event of claudeStream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          await s.write(event.delta.text);
        }
      }
    } catch (err) {
      console.error("Streaming error:", err);
      await s.write("\n\n[Error generating response]");
    }
  });
});

export default app;
