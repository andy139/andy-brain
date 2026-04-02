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

const quickIngestSchema = z.object({
  url: z.string().url("url must be a valid URL"),
  tags: z.array(z.string()).optional().default([]),
  notes: z.string().optional(),
});

function detectSourceType(url: string): "x" | "tiktok" | "article" {
  const host = new URL(url).hostname.replace(/^www\./, "");
  if (host === "x.com" || host === "twitter.com") return "x";
  if (host === "tiktok.com") return "tiktok";
  return "article";
}

app.post("/ingest/quick", authMiddleware, zValidator("json", quickIngestSchema), async (c) => {
  const { url, tags, notes } = c.req.valid("json");

  const source_type = detectSourceType(url);

  // Extract readable content from the URL
  let content = "";
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "andy-brain/1.0 (+https://github.com/andy)" },
    });
    if (res.ok) {
      const html = await res.text();
      const dom = new JSDOM(html, { url });
      const reader = new Readability(dom.window.document);
      const article = reader.parse();
      if (article?.textContent?.trim()) {
        content = article.textContent.trim();
      }
    }
  } catch (err) {
    console.warn("Quick ingest: extraction failed:", err);
  }

  if (!content) {
    return c.json({ error: "Could not extract content from URL" }, 422);
  }

  const { data: entry, error: insertError } = await supabase
    .from("knowledge_entries")
    .insert({
      content,
      source_url: url,
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
