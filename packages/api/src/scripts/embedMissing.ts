import { supabase } from "../lib/supabase.js";
import { getPineconeIndex } from "../lib/pinecone.js";
import { generateEmbeddings } from "../lib/embeddings.js";
import { chunkText } from "../lib/chunker.js";

const MISSING_IDS = [
  "b6da9d0f-ece9-4c6a-a834-8aa51c5a84ac",
  "d7b2722a-6268-4130-9898-d88b6366acff",
];

const index = getPineconeIndex();

for (const id of MISSING_IDS) {
  const { data: entry } = await supabase.from("knowledge_entries").select("*").eq("id", id).single();
  if (!entry) { console.log(`${id}: not found in Supabase`); continue; }

  console.log(`Embedding ${id} (${entry.source_type})...`);
  const chunks = chunkText((entry.content as string).slice(0, 100_000));
  const embeddings = await generateEmbeddings(chunks);

  await index.upsert(chunks.map((chunk, i) => ({
    id: `${id}-${i}`,
    values: embeddings[i],
    metadata: {
      entry_id: id,
      chunk_index: i,
      source_type: entry.source_type,
      source_url: entry.source_url ?? "",
      tags: entry.tags ?? [],
      chunk_text: chunk,
    },
  })));
  console.log(`  Done — ${chunks.length} chunks`);
  await new Promise(r => setTimeout(r, 20_000));
}
console.log("All done.");
