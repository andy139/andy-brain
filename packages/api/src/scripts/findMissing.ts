import { supabase } from "../lib/supabase.js";
import { getPineconeIndex } from "../lib/pinecone.js";

const { data } = await supabase.from("knowledge_entries").select("id,source_type,created_at").order("created_at", { ascending: false });
const index = getPineconeIndex();
let missing = 0;
for (const e of data ?? []) {
  const r = await index.fetch([`${e.id}-0`]);
  if (!r.records?.[`${e.id}-0`]) {
    missing++;
    console.log(`MISSING: ${e.id} | ${e.source_type} | ${e.created_at}`);
  }
}
console.log(`\nTotal: ${data?.length}, Missing from Pinecone: ${missing}`);
