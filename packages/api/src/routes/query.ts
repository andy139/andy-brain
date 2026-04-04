import { Hono } from "hono";
import { stream } from "hono/streaming";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { generateEmbedding } from "../lib/embeddings.js";
import { supabase } from "../lib/supabase.js";
import { getPineconeIndex } from "../lib/pinecone.js";
import { buildRagPrompt, type ContextItem } from "../lib/prompts.js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const app = new Hono();

const querySchema = z.object({
  question: z.string().min(1, "question is required"),
  top_k: z.number().int().min(1).max(20).optional().default(8),
  filter: z
    .object({
      source_type: z.enum(["tiktok", "x", "article", "note", "other"]).optional(),
      tags: z.array(z.string()).optional(),
    })
    .optional(),
});

app.post("/query", zValidator("json", querySchema), async (c) => {
  const { question, top_k, filter } = c.req.valid("json");

  // 1. Embed the question
  let questionEmbedding: number[];
  try {
    questionEmbedding = await generateEmbedding(question);
  } catch (err) {
    console.error("Embedding error:", err);
    return c.json({ error: "Failed to embed question" }, 500);
  }

  // 2. Build Pinecone metadata filter
  const pineconeFilter: Record<string, unknown> = {};
  if (filter?.source_type) {
    pineconeFilter.source_type = { $eq: filter.source_type };
  }
  if (filter?.tags && filter.tags.length > 0) {
    pineconeFilter.tags = { $in: filter.tags };
  }

  // 3. Query Pinecone for nearest neighbours
  const index = getPineconeIndex();
  let matches: Array<{ id: string; score?: number; metadata?: Record<string, unknown> }>;
  try {
    const result = await index.query({
      vector: questionEmbedding,
      topK: top_k,
      includeMetadata: true,
      ...(Object.keys(pineconeFilter).length > 0 && { filter: pineconeFilter }),
    });
    matches = result.matches ?? [];
  } catch (err) {
    console.error("Pinecone query error:", err);
    return c.json({ error: "Failed to query vector store" }, 500);
  }

  // 4. Fetch full entries from Supabase for the matched entry IDs
  const entryIds = [
    ...new Set(
      matches.map((m) => m.metadata?.entry_id as string).filter(Boolean)
    ),
  ];

  const { data: entries } = await supabase
    .from("knowledge_entries")
    .select("*")
    .in("id", entryIds);

  const entriesMap = new Map((entries ?? []).map((e) => [e.id, e]));

  // 5. Build context array for the prompt.
  //    Prefer chunk_text from Pinecone metadata (the exact relevant passage found
  //    by vector search). Fall back to the first 3000 chars of the Supabase entry
  //    for older vectors that predate the chunk_text field.
  const context: ContextItem[] = matches.map((match) => {
    const entry = entriesMap.get(match.metadata?.entry_id as string);
    const chunkText = match.metadata?.chunk_text as string | undefined;
    const fallbackText = (entry?.content as string | undefined)?.slice(0, 3000) ?? "";
    return {
      text: chunkText ?? fallbackText,
      source_type: (match.metadata?.source_type as string) ?? entry?.source_type ?? "other",
      source_url: (match.metadata?.source_url as string) ?? entry?.source_url ?? null,
      tags: (match.metadata?.tags as string[]) ?? entry?.tags ?? [],
      score: match.score ?? 0,
    };
  });

  const prompt = buildRagPrompt(question, context);

  // 6. Stream Claude's response, then append source JSON as a sentinel
  return stream(c, async (s) => {
    try {
      const claudeStream = anthropic.messages.stream({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2048,
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

      // Append source attributions so the client can render cards
      const sources = (entries ?? []).map((e) => ({
        id: e.id,
        source_type: e.source_type,
        source_url: e.source_url,
        preview: (e.content as string).slice(0, 200),
        tags: e.tags,
      }));

      await s.write(`\n\n__SOURCES__${JSON.stringify(sources)}`);
    } catch (err) {
      console.error("Streaming error:", err);
      await s.write("\n\n[Error: failed to generate response]");
    }
  });
});

export default app;
