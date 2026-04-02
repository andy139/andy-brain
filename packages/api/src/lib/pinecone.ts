import { Pinecone } from "@pinecone-database/pinecone";

let client: Pinecone | null = null;

function getClient(): Pinecone {
  if (!client) {
    client = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
  }
  return client;
}

export function getPineconeIndex() {
  const indexName = process.env.PINECONE_INDEX ?? "andy-brain";
  return getClient().index(indexName);
}
