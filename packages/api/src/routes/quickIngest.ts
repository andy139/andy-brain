import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import { execFile } from "child_process";
import { promisify } from "util";
import { readFile, unlink, mkdtemp } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { authMiddleware } from "../middleware/auth.js";
import { generateEmbeddings } from "../lib/embeddings.js";
import { chunkText } from "../lib/chunker.js";
import { supabase } from "../lib/supabase.js";
import { getPineconeIndex } from "../lib/pinecone.js";

const execFileAsync = promisify(execFile);

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
  // Step 1: get direct video URL via TikWM (free, no auth)
  const tikwmRes = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; andy-brain/1.0)" },
    signal: AbortSignal.timeout(10_000),
  });
  const tikwmData = await tikwmRes.json() as {
    code?: number;
    data?: { play?: string; title?: string; author?: { nickname?: string } };
  };

  const caption = tikwmData.data?.title ?? "";
  const author = tikwmData.data?.author?.nickname ?? "";
  const videoUrl = tikwmData.data?.play;

  // Step 2: use yt-dlp to download audio, then transcribe with Groq Whisper
  let transcript = "";
  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
    let tmpDir: string | null = null;
    try {
      tmpDir = await mkdtemp(join(tmpdir(), "tiktok-"));
      const audioPath = join(tmpDir, "audio.m4a");

      await execFileAsync("yt-dlp", [
        "--no-playlist",
        "-x",                         // extract audio only
        "--audio-format", "m4a",
        "--audio-quality", "0",
        "-o", audioPath,
        "--no-progress",
        "--quiet",
        url,
      ], { timeout: 30_000 });

      const audioBuffer = await readFile(audioPath);
      const formData = new FormData();
      formData.append("file", new Blob([audioBuffer], { type: "audio/m4a" }), "audio.m4a");
      formData.append("model", "whisper-large-v3-turbo");
      formData.append("response_format", "text");

      const groqRes = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${groqKey}` },
        body: formData,
        signal: AbortSignal.timeout(30_000),
      });
      if (groqRes.ok) {
        transcript = (await groqRes.text()).trim();
      } else {
        console.warn("Groq Whisper error:", groqRes.status, await groqRes.text());
      }
    } catch (err) {
      console.warn("TikTok yt-dlp/Whisper transcription failed:", err);
    } finally {
      if (tmpDir) {
        try { await unlink(join(tmpDir, "audio.m4a")); } catch { /* ignore */ }
      }
    }
  }

  // Step 3: build content — transcript preferred, caption as fallback
  const parts: string[] = [];
  if (transcript) {
    parts.push(`Transcript: ${transcript}`);
  }
  if (caption) {
    parts.push(`Caption: ${caption}`);
  }
  if (author) {
    parts.push(`Posted by: @${author}`);
  }

  if (!parts.length) {
    // Last resort: oEmbed caption only
    const oembedRes = await fetch(
      `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`,
      { headers: { "User-Agent": "Mozilla/5.0 (compatible; andy-brain/1.0)" }, signal: AbortSignal.timeout(8_000) }
    );
    if (oembedRes.ok) {
      const oembed = await oembedRes.json() as { title?: string; author_name?: string };
      if (oembed.title) parts.push(oembed.title);
      if (oembed.author_name) parts.push(`Posted by: @${oembed.author_name}`);
    }
  }

  if (!parts.length) throw new Error("Could not extract any TikTok content");
  return parts.join("\n");
}

app.post("/ingest/quick", authMiddleware, zValidator("json", quickIngestSchema), async (c) => {
  const { url, tags, notes } = c.req.valid("json");

  const source_type = detectSourceType(url);

  // Extract readable content from the URL
  let content = "";
  if (source_type === "tiktok") {
    try {
      content = await fetchTikTokContent(url);
    } catch (err) {
      console.warn("TikTok content extraction failed:", err);
    }
  } else {
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
