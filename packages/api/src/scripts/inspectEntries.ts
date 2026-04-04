import { supabase } from "../lib/supabase.js";
import { getPineconeIndex } from "../lib/pinecone.js";

const { data } = await supabase
  .from("knowledge_entries")
  .select("id,content,source_url,tags")
  .eq("source_type", "tiktok")
  .order("created_at", { ascending: false })
  .limit(3);

for (const e of data ?? []) {
  console.log("=== ENTRY", e.id, "===");
  console.log("URL:", e.source_url);
  console.log("TAGS:", e.tags?.join(", "));
  console.log("CONTENT LENGTH:", e.content?.length, "chars");
  console.log("CONTENT:");
  console.log(e.content?.slice(0, 800));
  console.log();
}

// Check a Pinecone vector to see what metadata is stored
const index = getPineconeIndex();
const entry = data?.[0];
if (entry) {
  const fetched = await index.fetch([`${entry.id}-0`, `${entry.id}-1`]);
  console.log("=== PINECONE METADATA for", entry.id, "===");
  for (const [id, vec] of Object.entries(fetched.records ?? {})) {
    console.log(`[${id}]:`, JSON.stringify(vec.metadata, null, 2));
  }
}
