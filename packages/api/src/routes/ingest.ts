import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import { authMiddleware } from "../middleware/auth.js";
import { generateEmbeddings } from "../lib/embeddings.js";
import { chunkText } from "../lib/chunker.js";
import { supabase } from "../lib/supabase.js";
import { getPineconeIndex } from "../lib/pinecone.js";

const app = new Hono();

const ingestSchema = z.object({
  content: z.string().min(1, "content is required"),
  source_url: z.string().url().optional(),
  source_type: z.enum(["tiktok", "x", "article", "note", "other"]),
  tags: z.array(z.string()).optional().default([]),
  notes: z.string().optional(),
});

app.post("/ingest", authMiddleware, zValidator("json", ingestSchema), async (c) => {
  let { content, source_url, source_type, tags, notes } = c.req.valid("json");

  // If an article URL is provided, attempt to extract readable text from it
  if (source_url && source_type === "article") {
    try {
      const res = await fetch(source_url, {
        headers: { "User-Agent": "andy-brain/1.0 (+https://github.com/andy)" },
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) {
        const html = await res.text();
        const dom = new JSDOM(html, { url: source_url });
        const reader = new Readability(dom.window.document);
        const article = reader.parse();
        if (article?.textContent?.trim()) {
          content = article.textContent.trim();
        }
      }
    } catch (err) {
      // Fall through to use the content provided in the request body
      console.warn("Article extraction failed, using provided content:", err);
    }
  }

  // Persist the raw entry to Supabase
  const { data: entry, error: insertError } = await supabase
    .from("knowledge_entries")
    .insert({
      content,
      source_url: source_url ?? null,
      source_type,
      tags: tags ?? [],
      notes: notes ?? null,
    })
    .select()
    .single();

  if (insertError || !entry) {
    console.error("Supabase insert error:", insertError);
    return c.json({ error: "Failed to store entry" }, 500);
  }

  // Chunk + embed
  const chunks = chunkText(content);
  if (chunks.length === 0) {
    return c.json({ error: "Content produced no chunks" }, 422);
  }

  let embeddings: number[][];
  try {
    embeddings = await generateEmbeddings(chunks);
  } catch (err) {
    console.error("Embedding error:", err);
    return c.json({ error: "Failed to generate embeddings" }, 500);
  }

  // Upsert chunk vectors to Pinecone
  const index = getPineconeIndex();
  const vectors = chunks.map((chunk, i) => ({
    id: `${entry.id}-${i}`,
    values: embeddings[i],
    metadata: {
      entry_id: entry.id,
      chunk_index: i,
      source_type,
      tags: tags ?? [],
      text_preview: chunk.slice(0, 200),
    },
  }));

  try {
    await index.upsert(vectors);
  } catch (err) {
    console.error("Pinecone upsert error:", err);
    return c.json({ error: "Failed to store embeddings" }, 500);
  }

  return c.json({ entry_id: entry.id, chunks_created: chunks.length }, 201);
});

export default app;
