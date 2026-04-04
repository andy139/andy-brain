import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { authMiddleware } from "../middleware/auth.js";
import { generateEmbeddings } from "../lib/embeddings.js";
import { chunkText } from "../lib/chunker.js";
import { supabase } from "../lib/supabase.js";
import { getPineconeIndex } from "../lib/pinecone.js";

const app = new Hono();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Shared: extract text from base64 PDF via Claude, then store + embed
async function ingestPdfBase64(
  base64: string,
  filename: string,
  tags: string[],
  notes: string | undefined,
  sourceUrl: string | null
) {
  const msg = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: base64 },
          },
          {
            type: "text",
            text: "Extract all text from this PDF document. Output only the raw text content, preserving structure where helpful. No commentary or preamble.",
          },
        ],
      },
    ],
  });

  const content = (msg.content[0] as { text: string }).text.trim();
  if (!content) throw new Error("PDF contains no extractable text");

  const { data: entry, error: insertError } = await supabase
    .from("knowledge_entries")
    .insert({ content, source_url: sourceUrl, source_type: "other", tags, notes: notes ?? null })
    .select()
    .single();

  if (insertError || !entry) throw new Error("Failed to store entry");

  const chunks = chunkText(content);
  if (chunks.length === 0) throw new Error("Content produced no chunks");

  const embeddings = await generateEmbeddings(chunks);

  const index = getPineconeIndex();
  await index.upsert(
    chunks.map((chunk, i) => ({
      id: `${entry.id}-${i}`,
      values: embeddings[i],
      metadata: { entry_id: entry.id, chunk_index: i, source_type: "other", tags, text_preview: chunk.slice(0, 200) },
    }))
  );

  return { entry_id: entry.id, chunks_created: chunks.length, filename };
}

// POST /api/ingest/pdf — base64 upload (from Add page)
const pdfSchema = z.object({
  data: z.string().min(1),
  filename: z.string().min(1),
  tags: z.array(z.string()).optional().default([]),
  notes: z.string().optional(),
});

app.post("/ingest/pdf", authMiddleware, zValidator("json", pdfSchema), async (c) => {
  const { data, filename, tags, notes } = c.req.valid("json");
  if (!filename.toLowerCase().endsWith(".pdf")) {
    return c.json({ error: "File must be a PDF" }, 400);
  }
  try {
    const result = await ingestPdfBase64(data, filename, tags, notes, null);
    return c.json(result, 201);
  } catch (err) {
    console.error("PDF ingest error:", err);
    return c.json({ error: (err as Error).message }, 422);
  }
});

// POST /api/ingest/pdf/url — server fetches PDF from URL (from bookmarklet)
const pdfUrlSchema = z.object({
  url: z.string().url(),
  tags: z.array(z.string()).optional().default([]),
});

app.post("/ingest/pdf/url", authMiddleware, zValidator("json", pdfUrlSchema), async (c) => {
  const { url, tags } = c.req.valid("json");

  let base64: string;
  let filename: string;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "andy-brain/1.0" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return c.json({ error: `Failed to fetch PDF: HTTP ${res.status}` }, 422);
    const buf = await res.arrayBuffer();
    base64 = Buffer.from(buf).toString("base64");
    filename = url.split("/").pop()?.split("?")[0] || "document.pdf";
  } catch (err) {
    console.error("PDF fetch error:", err);
    return c.json({ error: "Could not fetch PDF from URL" }, 422);
  }

  try {
    const result = await ingestPdfBase64(base64, filename, tags, undefined, url);
    return c.json(result, 201);
  } catch (err) {
    console.error("PDF ingest error:", err);
    return c.json({ error: (err as Error).message }, 422);
  }
});

export default app;
