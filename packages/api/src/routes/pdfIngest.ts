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

const pdfSchema = z.object({
  data: z.string().min(1, "data is required"), // base64-encoded PDF
  filename: z.string().min(1),
  tags: z.array(z.string()).optional().default([]),
  notes: z.string().optional(),
});

app.post("/ingest/pdf", authMiddleware, zValidator("json", pdfSchema), async (c) => {
  const { data, filename, tags, notes } = c.req.valid("json");

  if (!filename.toLowerCase().endsWith(".pdf")) {
    return c.json({ error: "File must be a PDF" }, 400);
  }

  // Use Claude to extract text from the PDF
  let content = "";
  try {
    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: { type: "base64", media_type: "application/pdf", data },
            },
            {
              type: "text",
              text: "Extract all text from this PDF document. Output only the raw text content, preserving structure where helpful. No commentary or preamble.",
            },
          ],
        },
      ],
    });
    content = (msg.content[0] as { text: string }).text.trim();
  } catch (err) {
    console.error("PDF extraction error:", err);
    return c.json({ error: "Failed to extract text from PDF" }, 422);
  }

  if (!content) {
    return c.json({ error: "PDF contains no extractable text" }, 422);
  }

  const { data: entry, error: insertError } = await supabase
    .from("knowledge_entries")
    .insert({
      content,
      source_url: null,
      source_type: "other",
      tags,
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
      source_type: "other",
      tags,
      text_preview: chunk.slice(0, 200),
    },
  }));

  try {
    await index.upsert(vectors);
  } catch (err) {
    console.error("Pinecone upsert error:", err);
    return c.json({ error: "Failed to store embeddings" }, 500);
  }

  return c.json(
    { entry_id: entry.id, chunks_created: chunks.length, filename },
    201
  );
});

export default app;
