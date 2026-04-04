/**
 * One-off backfill: updates all existing TikTok entries to the new convention:
 *   - Prepends "Source: <url>" and "Summary: <claude-summary>" to content
 *   - Generates + merges auto-tags via Claude Haiku
 *   - Re-embeds the enriched content and re-upserts Pinecone vectors with source_url in metadata
 *
 * Run from packages/api:
 *   npx tsx --env-file=../../.env.local src/scripts/backfillTiktoks.ts
 */

import Anthropic from "@anthropic-ai/sdk";
import { supabase, type KnowledgeEntry } from "../lib/supabase.js";
import { getPineconeIndex } from "../lib/pinecone.js";
import { generateEmbeddings } from "../lib/embeddings.js";
import { chunkText } from "../lib/chunker.js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function analyzeTikTokContent(content: string): Promise<{ summary: string; autoTags: string[] }> {
  try {
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: `You are analyzing a TikTok video for a personal knowledge base. Read the content below and respond with ONLY valid JSON — no markdown, no explanation.

Return this exact shape:
{
  "summary": "2-3 sentence description of what this video is about and its key takeaway",
  "tags": ["tag1", "tag2", "tag3"]
}

Rules for tags:
- 3-6 lowercase tags
- Use broad topic categories (e.g. "finance", "cooking", "productivity", "fitness", "tech", "politics", "comedy", "travel")
- Add specific subtopics if clearly relevant (e.g. "investing", "weight-loss", "ai")
- No hashtags, no spaces in tags

TikTok content:
${content}`,
        },
      ],
    });

    const raw = (message.content[0].type === "text" ? message.content[0].text.trim() : "")
      .replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    const parsed = JSON.parse(raw) as { summary?: string; tags?: string[] };
    return {
      summary: parsed.summary ?? "",
      autoTags: Array.isArray(parsed.tags) ? parsed.tags.map((t) => t.toLowerCase()) : [],
    };
  } catch (err) {
    console.warn("  Claude analysis failed:", err);
    return { summary: "", autoTags: [] };
  }
}

async function reembedEntry(entry: KnowledgeEntry, index: ReturnType<typeof getPineconeIndex>) {
  const chunks = chunkText(entry.content.slice(0, 100_000));
  if (chunks.length === 0) { console.warn("  No chunks produced."); return; }

  // Voyage free tier: batch in groups of 8, 20s between batches
  const BATCH = 8;
  const allEmbeddings: number[][] = [];
  for (let i = 0; i < chunks.length; i += BATCH) {
    const batch = chunks.slice(i, i + BATCH);
    const batchEmbeddings = await generateEmbeddings(batch);
    allEmbeddings.push(...batchEmbeddings);
    if (i + BATCH < chunks.length) {
      console.log(`  Embedded ${i + BATCH}/${chunks.length} chunks, waiting...`);
      await new Promise((r) => setTimeout(r, 20_000));
    }
  }

  const oldIds = Array.from({ length: Math.max(50, chunks.length) }, (_, i) => `${entry.id}-${i}`);
  try { await index.deleteMany(oldIds); } catch { /* ignore */ }
  await index.upsert(chunks.map((chunk, i) => ({
    id: `${entry.id}-${i}`,
    values: allEmbeddings[i],
    metadata: {
      entry_id: entry.id,
      chunk_index: i,
      source_type: "tiktok",
      source_url: entry.source_url ?? "",
      tags: entry.tags ?? [],
      chunk_text: chunk,
    },
  })));
  console.log(`  Re-embedded ${chunks.length} chunks.`);
}

async function backfill() {
  // Fetch all TikTok entries
  const { data: entries, error } = await supabase
    .from("knowledge_entries")
    .select("*")
    .eq("source_type", "tiktok")
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Supabase fetch failed: ${error.message}`);
  if (!entries || entries.length === 0) {
    console.log("No TikTok entries found.");
    return;
  }

  console.log(`Found ${entries.length} TikTok entries to backfill.\n`);
  const index = getPineconeIndex();

  for (const entry of entries as KnowledgeEntry[]) {
    // Supabase content is updated but Pinecone may still be stale — check the vector
    const hasNewContent = entry.content.startsWith("Source:") && entry.content.includes("\nSummary:");
    if (hasNewContent) {
      try {
        const fetched = await index.fetch([`${entry.id}-0`]);
        const vec = fetched.records?.[`${entry.id}-0`];
        if (vec?.metadata?.["source_url"] && vec?.metadata?.["chunk_text"]) {
          console.log(`[${entry.id}] SKIP (fully migrated)`);
          continue;
        }
        // Supabase done, Pinecone stale or missing chunk_text — re-embed
        console.log(`[${entry.id}] Re-embedding only (Pinecone stale or no chunk_text)...`);
        await reembedEntry(entry, index);
      } catch (err) {
        console.error(`[${entry.id}] FAILED: ${err instanceof Error ? err.message : err}`);
      }
      await new Promise((r) => setTimeout(r, 20_000));
      continue;
    }

    console.log(`[${entry.id}] Processing...`);
    try {
      await processEntry(entry, index);
    } catch (err) {
      console.error(`  FAILED: ${err instanceof Error ? err.message : err}`);
    }

    await new Promise((r) => setTimeout(r, 20_000));
  }
}

async function processEntry(entry: KnowledgeEntry, index: ReturnType<typeof getPineconeIndex>) {
    // Analyze with Claude
    const { summary, autoTags } = await analyzeTikTokContent(entry.content);
    console.log(`  Summary: ${summary.slice(0, 80)}...`);
    console.log(`  Auto-tags: ${autoTags.join(", ")}`);

    // Build enriched content
    const headerParts: string[] = [`Source: ${entry.source_url ?? "unknown"}`];
    if (summary) headerParts.push(`Summary: ${summary}`);
    const enrichedContent = `${headerParts.join("\n")}\n\n${entry.content}`;
    const fullContent = entry.notes ? `${enrichedContent}\n\nMy notes: ${entry.notes}` : enrichedContent;

    // Merge tags (deduplicated)
    const mergedTags = [...new Set([...autoTags, ...(entry.tags ?? [])])];

    // Update Supabase
    const { error: updateError } = await supabase
      .from("knowledge_entries")
      .update({ content: fullContent, tags: mergedTags })
      .eq("id", entry.id);

    if (updateError) {
      console.error(`  Supabase update failed: ${updateError.message}`);
      return;
    }

    // Re-chunk and re-embed (cap at 100k chars, batched to respect Voyage rate limits)
    const chunks = chunkText(fullContent.slice(0, 100_000));
    if (chunks.length === 0) {
      console.warn("  No chunks produced, skipping Pinecone update.");
      return;
    }

    const BATCH = 8;
    const embeddings: number[][] = [];
    try {
      for (let i = 0; i < chunks.length; i += BATCH) {
        const batch = chunks.slice(i, i + BATCH);
        const batchEmbeddings = await generateEmbeddings(batch);
        embeddings.push(...batchEmbeddings);
        if (i + BATCH < chunks.length) await new Promise((r) => setTimeout(r, 20_000));
      }
    } catch (err) {
      console.error("  Embedding failed:", err);
      return;
    }

    // Delete old Pinecone vectors for this entry (best-effort prefix scan)
    // Vectors are keyed as "<entry_id>-<chunk_index>" so we delete by known indices.
    // Pinecone free tier doesn't support deleteByPrefix, so we delete known chunk IDs.
    // We'll try up to 50 old chunks (safe upper bound).
    const oldIds = Array.from({ length: 50 }, (_, i) => `${entry.id}-${i}`);
    try {
      await index.deleteMany(oldIds);
    } catch {
      // Ignore — vectors may not exist or may already be gone
    }

    // Upsert new vectors
    const vectors = chunks.map((chunk, i) => ({
      id: `${entry.id}-${i}`,
      values: embeddings[i],
      metadata: {
        entry_id: entry.id,
        chunk_index: i,
        source_type: "tiktok",
        source_url: entry.source_url ?? "",
        tags: mergedTags,
        chunk_text: chunk,
      },
    }));

    try {
      await index.upsert(vectors);
      console.log(`  Done — ${chunks.length} chunks re-indexed, tags: [${mergedTags.join(", ")}]`);
    } catch (err) {
      console.error("  Pinecone upsert failed:", err);
    }

}

backfill().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
