import { Hono } from "hono";
import { stream } from "hono/streaming";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { generateEmbedding } from "../lib/embeddings.js";
import { supabase } from "../lib/supabase.js";
import { getPineconeIndex } from "../lib/pinecone.js";
import { buildRagPrompt, type ContextItem } from "../lib/prompts.js";
import { groq, MODEL_LARGE, MODEL_SMALL } from "../lib/groq.js";

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
  const context: ContextItem[] = matches.filter((m) => (m.score ?? 0) >= 0.35).map((match) => {
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

  // 6. Stream LLM response, then append sources + follow-up questions
  return stream(c, async (s) => {
    try {
      let fullAnswer = "";
      const llmStream = await groq.chat.completions.create({
        model: MODEL_LARGE,
        max_tokens: 2048,
        stream: true,
        messages: [{ role: "user", content: prompt }],
      });

      for await (const chunk of llmStream) {
        const text = chunk.choices[0]?.delta?.content;
        if (text) {
          fullAnswer += text;
          await s.write(text);
        }
      }

      // Build source attributions — deduplicated, with title extracted from content
      const MIN_SCORE = 0.35;
      const seenIds = new Set<string>();
      const sources = matches
        .filter((m) => (m.score ?? 0) >= MIN_SCORE)
        .map((m) => {
          const entryId = m.metadata?.entry_id as string;
          if (seenIds.has(entryId)) return null;
          seenIds.add(entryId);
          const entry = entriesMap.get(entryId);
          if (!entry) return null;
          // Extract a title: use Summary line if present, else first line of content
          const content = entry.content as string;
          const summaryMatch = content.match(/^Summary:\s*(.+)$/m);
          const title = summaryMatch?.[1]?.slice(0, 100)
            ?? content.replace(/^Source:.*\n?/m, "").trim().split("\n")[0].slice(0, 100);
          return {
            id: entry.id,
            source_type: entry.source_type,
            source_url: entry.source_url,
            title,
            tags: entry.tags,
            score: m.score,
          };
        })
        .filter(Boolean);

      // Generate 3 follow-up questions based on the answer
      let followups: string[] = [];
      try {
        const followupRes = await groq.chat.completions.create({
          model: MODEL_SMALL,
          max_tokens: 200,
          messages: [{
            role: "user",
            content: `You're helping someone learn from their saved TikToks, articles, and notes. They just asked a question and got an answer. Now suggest 3 follow-up questions that help them GO DEEPER and actually APPLY what they learned.

Think like a curious learner:
- 1 question that connects this to something else they might have saved ("how does this relate to X?")
- 1 question that makes it actionable ("how would I actually implement/use this?")
- 1 question that challenges or extends the idea ("what's the downside?" or "what's the next level?")

Be specific to the actual content. No generic crap like "tell me more." Under 50 chars each. Return ONLY a JSON array of 3 strings.

Question: "${question}"
Answer: "${fullAnswer.slice(0, 500)}"`,
          }],
        });
        const raw = (followupRes.choices[0]?.message?.content ?? "[]")
          .replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
        followups = JSON.parse(raw);
      } catch {
        // Follow-up generation failed — no big deal, skip
      }

      await s.write(`\n\n__SOURCES__${JSON.stringify(sources)}`);
      await s.write(`\n\n__FOLLOWUPS__${JSON.stringify(followups)}`);
    } catch (err) {
      console.error("Streaming error:", err);
      await s.write("\n\n[Error: failed to generate response]");
    }
  });
});

export default app;
