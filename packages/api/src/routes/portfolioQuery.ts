import { Hono } from "hono";
import { stream } from "hono/streaming";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { generateEmbedding } from "../lib/embeddings.js";
import { getPineconeIndex } from "../lib/pinecone.js";
import { buildPortfolioPrompt, type ContextItem } from "../lib/prompts.js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Simple in-memory cache — avoids re-embedding the same question twice
const embeddingCache = new Map<string, number[]>();

const app = new Hono();

const portfolioQuerySchema = z.object({
  question: z.string().min(1).max(500),
});

// Public endpoint — no auth required — used by the portfolio site
app.post("/portfolio/chat", zValidator("json", portfolioQuerySchema), async (c) => {
  const { question } = c.req.valid("json");

  let questionEmbedding: number[];
  try {
    const cacheKey = question.trim().toLowerCase();
    if (embeddingCache.has(cacheKey)) {
      questionEmbedding = embeddingCache.get(cacheKey)!;
    } else {
      questionEmbedding = await generateEmbedding(question);
      embeddingCache.set(cacheKey, questionEmbedding);
    }
  } catch (err) {
    console.error("Embedding error:", err);
    return c.json({ error: "Failed to process question" }, 500);
  }

  const index = getPineconeIndex();
  let matches: Array<{ id: string; score?: number; metadata?: Record<string, unknown> }>;
  try {
    const result = await index.query({
      vector: questionEmbedding,
      topK: 10,
      includeMetadata: true,
      filter: { source_type: { $eq: "note" } },
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

      let fullText = "";
      for await (const event of claudeStream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          fullText += event.delta.text;
          await s.write(event.delta.text);
        }
      }

      // Generate 3 contextual follow-up questions based on what was just answered
      const followupRes = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 200,
        messages: [{
          role: "user",
          content: `A recruiter just asked about Andy Tran: "${question}"\n\nThe answer was: "${fullText.slice(0, 500)}"\n\nSuggest exactly 3 follow-up questions that would make Andy look good — questions about his strengths, impact, technical depth, interesting projects, or what makes him stand out. Do NOT suggest questions about gaps, weaknesses, reasons for leaving, salary, or anything that could put him on the spot. Keep each question under 8 words. Return only a JSON array of 3 strings, nothing else.`,
        }],
      });

      const raw = followupRes.content[0].type === "text" ? followupRes.content[0].text.trim() : "[]";
      const followups = JSON.parse(raw.replace(/^```json\n?/, "").replace(/\n?```$/, ""));
      await s.write(`\n\n__FOLLOWUPS__${JSON.stringify(followups)}`);
    } catch (err) {
      console.error("Streaming error:", err);
      await s.write("\n\n[Error generating response]");
    }
  });
});

export default app;
