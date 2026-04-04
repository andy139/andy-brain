import { Hono } from "hono";
import Anthropic from "@anthropic-ai/sdk";
import { supabase } from "../lib/supabase.js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const app = new Hono();

app.get("/suggestions", async (c) => {
  // Grab the 10 most recent entries (mix of TikToks, articles, etc.)
  const { data: entries } = await supabase
    .from("knowledge_entries")
    .select("content, source_type, tags, source_url, created_at")
    .order("created_at", { ascending: false })
    .limit(10);

  if (!entries || entries.length === 0) {
    return c.json({ suggestions: ["What have I saved recently?"] });
  }

  // Build a digest of what's in the knowledge base
  const digest = entries
    .map((e, i) => {
      const preview = (e.content as string).slice(0, 300);
      const tags = (e.tags as string[])?.join(", ") || "none";
      return `[${i + 1}] ${e.source_type} | Tags: ${tags}\n${preview}`;
    })
    .join("\n\n");

  try {
    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: `You are Andy's second brain. Below are his 10 most recently saved items (TikToks, articles, notes). Generate exactly 6 short questions he'd naturally ask to recall and USE this knowledge. Think: "what did I learn", "how do I apply X", "remind me about Y".

Rules:
- Be casual and specific to the actual content (not generic)
- Reference real topics/tools/techniques from the items
- Mix: 2 recall questions, 2 "how to apply" questions, 2 synthesis/connection questions
- Each question under 60 characters
- Return ONLY a JSON array of strings, no markdown

Recent saves:
${digest}`,
        },
      ],
    });

    const raw = (msg.content[0].type === "text" ? msg.content[0].text : "[]")
      .replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    const suggestions = JSON.parse(raw) as string[];

    return c.json({ suggestions: suggestions.slice(0, 6) });
  } catch (err) {
    console.warn("Suggestions generation failed:", err);
    return c.json({
      suggestions: [
        "What did I save recently?",
        "Summarize my TikTok saves",
        "Any coding tips in my brain?",
      ],
    });
  }
});

export default app;
