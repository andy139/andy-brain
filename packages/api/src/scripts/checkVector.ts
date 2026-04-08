import { getPineconeIndex } from "../lib/pinecone.js";

const id = process.argv[2] ?? "b6da9d0f-ece9-4c6a-a834-8aa51c5a84ac";
const index = getPineconeIndex();
const r = await index.fetch([`${id}-0`]);
const vec = r.records?.[`${id}-0`];
if (vec) {
  console.log("FOUND in Pinecone");
  console.log("metadata:", JSON.stringify(vec.metadata, null, 2));
} else {
  console.log("NOT in Pinecone — needs embedding");
}
