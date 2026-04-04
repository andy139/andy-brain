/**
 * TikTok RAG Test Agent
 *
 * Tests that the knowledge base can retrieve TikTok content and produce
 * grounded, useful answers for coding/AI questions.
 *
 * Run against local API:
 *   npx tsx --env-file=../../.env.local src/scripts/testTikTokRAG.ts
 *
 * Run against deployed API:
 *   BRAIN_API_URL=https://api-production-f497.up.railway.app \
 *   npx tsx --env-file=../../.env.local src/scripts/testTikTokRAG.ts
 */

import Anthropic from "@anthropic-ai/sdk";

const API_URL = process.env.BRAIN_API_URL ?? "http://localhost:3001";
const AUTH_TOKEN = process.env.AUTH_TOKEN ?? "";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Questions that map to the TikTok content in the knowledge base.
// Intent: apply saved TikTok knowledge to real coding/productivity decisions.
const TEST_CASES = [
  {
    question: "How can I use Claude Code to automate workflows instead of Zapier or Make?",
    expect_topics: ["automation", "claude", "code"],
  },
  {
    question: "What's a good QA testing strategy to make sure Claude actually verifies its own output?",
    expect_topics: ["testing", "qa", "claude", "verification"],
  },
  {
    question: "How do I work on multiple GitHub issues in parallel using an AI coding assistant?",
    expect_topics: ["github", "parallel", "issues", "coding"],
  },
  {
    question: "What CLI tools should I add to my Claude Code setup to be more productive?",
    expect_topics: ["cli", "tools", "productivity", "claude"],
  },
  {
    question: "How can I use Claude Code with Remotion to create animated videos programmatically?",
    expect_topics: ["remotion", "video", "animation", "claude"],
  },
  {
    question: "What are some open source projects that work well with Claude Code?",
    expect_topics: ["open-source", "claude", "projects"],
  },
  {
    question: "How can I set up automated app testing using AI tools?",
    expect_topics: ["testing", "automation", "ai"],
  },
];

interface Source {
  id: string;
  source_type: string;
  source_url: string | null;
  preview: string;
  tags: string[];
}

async function queryAPI(question: string): Promise<{ answer: string; sources: Source[] }> {
  const res = await fetch(`${API_URL}/api/query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": AUTH_TOKEN,
    },
    body: JSON.stringify({
      question,
      top_k: 5,
      filter: { source_type: "tiktok" },
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);

  const raw = await res.text();
  const sentinelIdx = raw.lastIndexOf("\n\n__SOURCES__");
  const answer = sentinelIdx >= 0 ? raw.slice(0, sentinelIdx).trim() : raw.trim();
  const sources: Source[] = sentinelIdx >= 0
    ? JSON.parse(raw.slice(sentinelIdx + "\n\n__SOURCES__".length))
    : [];

  return { answer, sources };
}

async function gradeAnswer(
  question: string,
  answer: string,
  sources: Source[],
  expect_topics: string[]
): Promise<{ score: number; verdict: string; grounded: boolean }> {
  const tiktokSources = sources.filter((s) => s.source_type === "tiktok");
  const sourceUrls = tiktokSources.map((s) => s.source_url ?? "unknown").join(", ");

  const msg = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 200,
    messages: [
      {
        role: "user",
        content: `Rate this RAG answer. Respond with ONLY valid JSON, no markdown.

Question: "${question}"
Expected topics: ${expect_topics.join(", ")}
TikTok sources retrieved: ${tiktokSources.length} (${sourceUrls || "none"})
Answer: "${answer.slice(0, 1500)}"

Return:
{
  "score": <1-5 integer>,
  "verdict": "<one sentence>",
  "grounded": <true if answer uses retrieved content, false if hallucinated/generic>
}

Scoring: 5=excellent grounded answer from TikTok content, 3=ok but vague, 1=no relevant content found or hallucinated`,
      },
    ],
  });

  const raw = (msg.content[0].type === "text" ? msg.content[0].text : "")
    .replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

  try {
    return JSON.parse(raw);
  } catch {
    return { score: 0, verdict: "Grader parse error", grounded: false };
  }
}

function color(text: string, code: number) {
  return `\x1b[${code}m${text}\x1b[0m`;
}

async function run() {
  console.log(color(`\n Andy-Brain TikTok RAG Test Agent`, 1));
  console.log(color(`API: ${API_URL}`, 90));
  console.log(color(`Running ${TEST_CASES.length} test cases...\n`, 90));

  const results: { pass: boolean; score: number }[] = [];

  for (const [i, tc] of TEST_CASES.entries()) {
    console.log(color(`[${i + 1}/${TEST_CASES.length}] ${tc.question}`, 36));

    let answer = "";
    let sources: Source[] = [];

    try {
      ({ answer, sources } = await queryAPI(tc.question));
    } catch (err) {
      console.log(color(`  FETCH ERROR: ${err}`, 31));
      results.push({ pass: false, score: 0 });
      continue;
    }

    const tiktokSources = sources.filter((s) => s.source_type === "tiktok");
    const grade = await gradeAnswer(tc.question, answer, sources, tc.expect_topics);

    const pass = grade.score >= 3 && tiktokSources.length > 0;
    results.push({ pass, score: grade.score });

    const scoreColor = grade.score >= 4 ? 32 : grade.score >= 3 ? 33 : 31;
    console.log(color(`  Score: ${grade.score}/5  |  Grounded: ${grade.grounded}  |  TikTok sources: ${tiktokSources.length}`, scoreColor));
    console.log(color(`  ${grade.verdict}`, 90));

    if (tiktokSources.length > 0) {
      const url = tiktokSources[0].source_url ?? "no url";
      const tags = tiktokSources[0].tags?.slice(0, 4).join(", ");
      console.log(color(`  Top source: ${url}`, 90));
      console.log(color(`  Tags: ${tags}`, 90));
    }

    console.log(color(`  Answer preview: ${answer.slice(0, 120)}...`, 37));
    console.log(pass ? color("  PASS", 32) : color("  FAIL", 31));
    console.log();

    // Space queries to avoid Voyage rate limits on the API side
    if (i < TEST_CASES.length - 1) await new Promise((r) => setTimeout(r, 22_000));
  }

  const passed = results.filter((r) => r.pass).length;
  const avgScore = (results.reduce((s, r) => s + r.score, 0) / results.length).toFixed(1);

  console.log(color("─".repeat(60), 90));
  console.log(color(`Results: ${passed}/${TEST_CASES.length} passed  |  Avg score: ${avgScore}/5`, passed === TEST_CASES.length ? 32 : passed >= TEST_CASES.length * 0.7 ? 33 : 31));

  if (passed < TEST_CASES.length) {
    console.log(color("\nFailed tests suggest TikTok content isn't being retrieved for those topics.", 33));
    console.log(color("Check: source_type filter, Pinecone metadata, or add more TikToks on those topics.", 33));
  } else {
    console.log(color("\nAll tests passed — TikTok knowledge is queryable and grounded.", 32));
  }
}

run().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
