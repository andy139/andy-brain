export type ContextItem = {
  text: string;
  source_type: string;
  source_url: string | null;
  tags: string[];
  score: number;
};

export function buildRagPrompt(question: string, context: ContextItem[]): string {
  const contextBlock = context
    .map((item, i) => {
      const sourceLabel = item.source_url
        ? `${item.source_type} — ${item.source_url}`
        : item.source_type;
      return `[${i + 1}] Source: ${sourceLabel}\n${item.text}`;
    })
    .join("\n\n---\n\n");

  return `You are a helpful assistant with access to Andy's personal knowledge base — a curated collection of articles, notes, tweets, and other content.

Answer the question below using only the provided context. Be concise and precise. If the context doesn't contain enough information to answer confidently, say so rather than guessing. You may cite sources by their number (e.g. [1], [2]) when relevant.

<context>
${contextBlock}
</context>

<question>
${question}
</question>`;
}
