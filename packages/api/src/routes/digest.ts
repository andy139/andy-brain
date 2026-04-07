/**
 * Daily TikTok Digest — queries yesterday's saved TikToks,
 * groups them by topic using Claude, and posts to Discord webhook.
 */
import { Hono } from "hono";
import Anthropic from "@anthropic-ai/sdk";
import { supabase } from "../lib/supabase.js";

const app = new Hono();

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || "";
const MAX_CHUNK = 1900;

interface KnowledgeEntry {
  id: string;
  content: string;
  source_url: string;
  source_type: string;
  tags: string[];
  notes: string | null;
  created_at: string;
}

function getYesterdayRangePST(): { from: string; to: string; label: string } {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(now);
  const year = parts.find((p) => p.type === "year")!.value;
  const month = parts.find((p) => p.type === "month")!.value;
  const day = parts.find((p) => p.type === "day")!.value;

  // Use -07:00 for PDT; this is approximate but fine for a daily digest
  const todayPST = new Date(`${year}-${month}-${day}T00:00:00-07:00`);
  const yesterdayPST = new Date(todayPST.getTime() - 24 * 60 * 60 * 1000);

  const label = yesterdayPST.toLocaleDateString("en-US", {
    timeZone: "America/Los_Angeles",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return {
    from: yesterdayPST.toISOString(),
    to: todayPST.toISOString(),
    label,
  };
}

function extractSummary(content: string): string {
  const match = content.match(/Summary:\s*(.+?)(?:\n|$)/);
  return match ? match[1].trim() : content.slice(0, 120).trim();
}

function splitChunks(text: string, max: number): string[] {
  if (text.length <= max) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= max) {
      chunks.push(remaining);
      break;
    }
    let cut = remaining.lastIndexOf("\n", max);
    if (cut <= 0) cut = max;
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut).trimStart();
  }
  return chunks;
}

async function postToDiscord(content: string): Promise<void> {
  if (!DISCORD_WEBHOOK_URL) throw new Error("DISCORD_WEBHOOK_URL is not set");
  for (const chunk of splitChunks(content, MAX_CHUNK)) {
    const res = await fetch(DISCORD_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: chunk }),
    });
    if (!res.ok) {
      throw new Error(`Discord webhook failed: ${res.status} ${await res.text()}`);
    }
  }
}

async function groupWithClaude(entries: KnowledgeEntry[]): Promise<
  { title: string; emoji: string; indices: number[] }[]
> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const summaries = entries
    .map((e, i) => {
      const summary = extractSummary(e.content);
      const tags = e.tags.length > 0 ? ` [${e.tags.join(", ")}]` : "";
      return `${i + 1}. ${summary}${tags}`;
    })
    .join("\n");

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system: `You group TikTok video summaries into themed categories. Return ONLY valid JSON — no markdown, no explanation.

Output format:
[{"title":"Group Title","emoji":"single emoji","indices":[0,1,2]}]

Rules:
- Create 2-6 groups based on content similarity
- Every video must appear in exactly one group
- Use catchy, short group titles (2-4 words)
- indices are 0-based`,
    messages: [
      {
        role: "user",
        content: `Group these ${entries.length} TikTok videos by topic:\n\n${summaries}`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  const raw = textBlock?.type === "text" ? textBlock.text : "[]";
  return JSON.parse(raw);
}

app.post("/digest/tiktok", async (c) => {
  if (!DISCORD_WEBHOOK_URL) {
    return c.json({ error: "DISCORD_WEBHOOK_URL not configured" }, 500);
  }

  const { from, to, label } = getYesterdayRangePST();

  // Fetch yesterday's TikToks
  const { data: entries, error } = await supabase
    .from("knowledge_entries")
    .select("*")
    .eq("source_type", "tiktok")
    .gte("created_at", from)
    .lt("created_at", to)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("Digest query error:", error);
    return c.json({ error: "Failed to fetch entries" }, 500);
  }

  if (!entries || entries.length === 0) {
    console.log("TikTok digest: no videos saved yesterday");
    return c.json({ sent: false, count: 0, message: "No TikToks saved yesterday" });
  }

  // Group by topic
  let groups: { title: string; emoji: string; indices: number[] }[];
  try {
    groups = await groupWithClaude(entries as KnowledgeEntry[]);
  } catch (err) {
    console.warn("Claude grouping failed, falling back to flat list:", err);
    groups = [{ title: "Saved Videos", emoji: "🎬", indices: entries.map((_, i) => i) }];
  }

  // Format message
  const lines: string[] = [
    `**🎬 TikTok Digest — ${label}**`,
    `You saved ${entries.length} video${entries.length === 1 ? "" : "s"} yesterday.\n`,
  ];

  for (const group of groups) {
    lines.push(
      `**${group.emoji} ${group.title}** (${group.indices.length} video${group.indices.length === 1 ? "" : "s"})`,
    );
    for (const idx of group.indices) {
      const entry = entries[idx] as KnowledgeEntry | undefined;
      if (!entry) continue;
      const summary = extractSummary(entry.content);
      const link = entry.source_url || "";
      lines.push(`  • ${summary}${link ? ` — ${link}` : ""}`);
    }
    lines.push("");
  }

  const message = lines.join("\n").trim();
  await postToDiscord(message);

  return c.json({ sent: true, count: entries.length, groups: groups.length });
});

export default app;
