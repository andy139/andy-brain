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
  if (host.includes("tiktok.com")) return "tiktok";
  return "article";
}

async function fetchTikTokContent(url: string): Promise<string> {
  // Follow redirects to resolve vm.tiktok.com short links → canonical URL
  let canonicalUrl = url;
  try {
    const head = await fetch(url, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(5_000), headers: { "User-Agent": "Mozilla/5.0 (compatible; andy-brain/1.0)" } });
    if (head.url) canonicalUrl = head.url;
  } catch { /* use original */ }

  const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(canonicalUrl)}`;
  const res = await fetch(oembedUrl, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; andy-brain/1.0)" },
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`oEmbed HTTP ${res.status}`);
  const data = await res.json() as { title?: string; author_name?: string };
  const parts: string[] = [];
  if (data.title) parts.push(data.title);
  if (data.author_name) parts.push(`Posted by: @${data.author_name}`);
  if (!parts.length) throw new Error("oEmbed returned no usable content");
  return parts.join("\n");
}

app.post("/ingest/quick", authMiddleware, zValidator("json", quickIngestSchema), async (c) => {
  const { url, tags, notes } = c.req.valid("json");

  const source_type = detectSourceType(url);

  // Extract readable content from the URL
  let content = "";
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "andy-brain/1.0 (+https://github.com/andy)" },
      signal: AbortSignal.timeout(10_000),
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

  // TikTok fallback: use public oEmbed API to get caption + author
  if (!content && source_type === "tiktok") {
    try {
      content = await fetchTikTokContent(url);
    } catch (err) {
      console.warn("TikTok oEmbed fallback failed:", err);
    }
  }

  if (!content) {
    return c.json({ error: "Could not extract content from URL" }, 422);
  }

  // Include notes in the embedded content so they're searchable
  const fullContent = notes ? `${content}\n\nMy notes: ${notes}` : content;

  const { data: entry, error: insertError } = await supabase
    .from("knowledge_entries")
    .insert({
      content: fullContent,
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

  const chunks = chunkText(fullContent);
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
