import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth.js";
import { supabase } from "../lib/supabase.js";
import { getPineconeIndex } from "../lib/pinecone.js";

const app = new Hono();

const listSchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  source_type: z.enum(["tiktok", "x", "article", "note", "other"]).optional(),
  tag: z.string().optional(),
});

app.get("/entries", zValidator("query", listSchema), async (c) => {
  const { page, limit, source_type, tag } = c.req.valid("query");
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabase
    .from("knowledge_entries")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (source_type) {
    query = query.eq("source_type", source_type);
  }
  if (tag) {
    query = query.contains("tags", [tag]);
  }

  const { data, count, error } = await query;

  if (error) {
    console.error("Supabase list error:", error);
    return c.json({ error: "Failed to fetch entries" }, 500);
  }

  return c.json({
    entries: data ?? [],
    total: count ?? 0,
    page,
    limit,
    pages: Math.ceil((count ?? 0) / limit),
  });
});

app.delete("/entries/:id", authMiddleware, async (c) => {
  const id = c.req.param("id");

  // Delete from Supabase — use .select() so we can detect RLS silent failures
  const { data: deleted, error } = await supabase
    .from("knowledge_entries")
    .delete()
    .eq("id", id)
    .select("id");

  if (error) {
    console.error("Supabase delete error:", error);
    return c.json({ error: "Failed to delete entry" }, 500);
  }

  if (!deleted || deleted.length === 0) {
    console.error("Delete silently failed — RLS may be blocking deletes with anon key");
    return c.json({ error: "Delete failed — check Supabase RLS policies" }, 500);
  }

  // Delete all Pinecone vectors for this entry by metadata filter.
  // Note: filter-based deleteMany requires Pinecone Standard plan or higher.
  // On free plans this will throw — we catch and warn rather than failing the request.
  try {
    const index = getPineconeIndex();
    await index.deleteMany({
      filter: { entry_id: { $eq: id } },
    } as Parameters<typeof index.deleteMany>[0]);
  } catch (err) {
    console.warn(
      `Could not delete Pinecone vectors for entry ${id} (filter-based delete ` +
        `requires Standard plan — vectors will remain but are orphaned):`,
      err
    );
  }

  return c.json({ success: true });
});

export default app;
