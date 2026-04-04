/**
 * TikTok RAG Test Agent
 *
 * Tests that the knowledge base retrieves TikTok content and produces
 * grounded answers for coding/AI questions.
 *
 * Assertions (no LLM judge — real checks only):
 *   1. RETRIEVAL   — at least 1 TikTok source returned
 *   2. GROUNDED    — answer contains ≥2 keywords from the retrieved TikTok summaries
 *   3. NO HALLUCINATION — answer doesn't fabricate a URL (if it cites one, it must
 *                         match a returned source)
 *   4. SOURCE URL  — at least 1 returned source has a non-empty source_url
 *
 * A test passes when RETRIEVAL + GROUNDED + SOURCE URL all pass.
 * Hallucination check is advisory (logs a warning, doesn't fail).
 *
 * Run against local API:
 *   npx tsx --env-file=../../.env.local src/scripts/testTikTokRAG.ts
 *
 * Run against deployed API:
 *   BRAIN_API_URL=https://api-production-f497.up.railway.app \
 *   npx tsx --env-file=../../.env.local src/scripts/testTikTokRAG.ts
 */

const API_URL = process.env.BRAIN_API_URL ?? "http://localhost:3001";
const AUTH_TOKEN = process.env.AUTH_TOKEN ?? "";

// Questions that map to the TikTok content in the knowledge base.
// grounding_keywords: terms that MUST appear in the answer if the right TikTok
// was retrieved. Derived from the Claude-generated summaries stored at ingest.
const TEST_CASES = [
  {
    question: "How can I use Claude Code to automate workflows instead of Zapier or Make?",
    grounding_keywords: ["automat", "workflow", "script", "zapier", "make", "custom", "build"],
    description: "Zapier/Make replacement via Claude Code",
  },
  {
    question: "What's a good QA testing strategy to make sure Claude actually verifies its own output?",
    grounding_keywords: ["qa", "test", "verif", "step", "system", "check", "output"],
    description: "QA testing strategy for Claude",
  },
  {
    question: "How do I work on multiple GitHub issues in parallel using an AI coding assistant?",
    grounding_keywords: ["github", "issue", "parallel", "simultaneous", "multiple", "branch"],
    description: "Parallel GitHub issues with AI",
  },
  {
    question: "What CLI tools should I add to my Claude Code setup to be more productive?",
    grounding_keywords: ["cli", "tool", "command", "terminal", "productiv", "setup", "essential"],
    description: "CLI tools for Claude Code",
  },
  {
    question: "How can I use Claude Code with Remotion to create animated videos programmatically?",
    grounding_keywords: ["remotion", "video", "animat", "code", "programmat", "generat"],
    description: "Claude Code + Remotion for video",
  },
  {
    question: "What are some open source projects that work well with Claude Code?",
    grounding_keywords: ["open.source", "project", "github", "releas", "tool", "integrat"],
    description: "Open source Claude Code projects",
  },
  {
    question: "How do I set up automated app testing using AI tools?",
    grounding_keywords: ["automat", "test", "app", "ai", "system", "verif", "browser"],
    description: "Automated AI testing setup",
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

function checkGrounding(answer: string, keywords: string[]): { matched: string[]; pass: boolean } {
  const lower = answer.toLowerCase();
  const matched = keywords.filter((kw) => lower.includes(kw.toLowerCase()));
  return { matched, pass: matched.length >= 2 };
}

function checkHallucination(answer: string, sources: Source[]): { suspicious: boolean; detail: string } {
  // Look for tiktok.com URLs in the answer that aren't in the returned sources
  const urlsInAnswer = [...answer.matchAll(/https?:\/\/(?:www\.)?tiktok\.com\/\S+/g)].map((m) => m[0]);
  const sourceUrls = new Set(sources.map((s) => s.source_url).filter(Boolean));
  const fabricated = urlsInAnswer.filter((u) => !sourceUrls.has(u));
  return {
    suspicious: fabricated.length > 0,
    detail: fabricated.length > 0 ? `Cites unknown URL(s): ${fabricated.join(", ")}` : "OK",
  };
}

function color(text: string, code: number) {
  return `\x1b[${code}m${text}\x1b[0m`;
}

async function run() {
  console.log(color(`\n Andy-Brain TikTok RAG Test Agent`, 1));
  console.log(color(`API: ${API_URL}`, 90));
  console.log(color(`Running ${TEST_CASES.length} test cases...\n`, 90));

  const results: { pass: boolean; checks: Record<string, boolean> }[] = [];

  for (const [i, tc] of TEST_CASES.entries()) {
    console.log(color(`[${i + 1}/${TEST_CASES.length}] ${tc.description}`, 36));
    console.log(color(`  Q: ${tc.question}`, 37));

    let answer = "";
    let sources: Source[] = [];

    try {
      ({ answer, sources } = await queryAPI(tc.question));
    } catch (err) {
      console.log(color(`  FETCH ERROR: ${err}`, 31));
      results.push({ pass: false, checks: { retrieval: false, grounded: false, source_url: false } });
      if (i < TEST_CASES.length - 1) await new Promise((r) => setTimeout(r, 22_000));
      continue;
    }

    const tiktokSources = sources.filter((s) => s.source_type === "tiktok");
    const grounding = checkGrounding(answer, tc.grounding_keywords);
    const hallucination = checkHallucination(answer, sources);
    const hasSourceUrl = tiktokSources.some((s) => !!s.source_url);

    const checks = {
      retrieval: tiktokSources.length > 0,
      grounded: grounding.pass,
      source_url: hasSourceUrl,
    };
    const pass = checks.retrieval && checks.grounded && checks.source_url;
    results.push({ pass, checks });

    // Print check results
    const checkLine = Object.entries(checks)
      .map(([k, v]) => `${v ? color("✓", 32) : color("✗", 31)} ${k}`)
      .join("  ");
    console.log(`  ${checkLine}`);

    // Grounding detail
    if (grounding.matched.length > 0) {
      console.log(color(`  Keywords matched: ${grounding.matched.join(", ")}`, 90));
    } else {
      console.log(color(`  Keywords matched: none (expected ≥2 of: ${tc.grounding_keywords.join(", ")})`, 33));
    }

    // Sources
    if (tiktokSources.length > 0) {
      tiktokSources.slice(0, 2).forEach((s) => {
        console.log(color(`  Source: ${s.source_url ?? "no url"}  [${s.tags?.slice(0, 3).join(", ")}]`, 90));
      });
    }

    // Hallucination advisory
    if (hallucination.suspicious) {
      console.log(color(`  ⚠ Hallucination warning: ${hallucination.detail}`, 33));
    }

    console.log(color(`  Answer: ${answer.slice(0, 160).replace(/\n/g, " ")}...`, 37));
    console.log(pass ? color("  PASS", 32) : color("  FAIL", 31));
    console.log();

    if (i < TEST_CASES.length - 1) await new Promise((r) => setTimeout(r, 22_000));
  }

  // Summary
  const passed = results.filter((r) => r.pass).length;
  const retrievalPassed = results.filter((r) => r.checks.retrieval).length;
  const groundedPassed = results.filter((r) => r.checks.grounded).length;
  const sourceUrlPassed = results.filter((r) => r.checks.source_url).length;

  const color2 = passed === TEST_CASES.length ? 32 : passed >= Math.ceil(TEST_CASES.length * 0.7) ? 33 : 31;
  console.log(color("─".repeat(60), 90));
  console.log(color(`Results: ${passed}/${TEST_CASES.length} passed`, color2));
  console.log(color(`  Retrieval (TikTok found):  ${retrievalPassed}/${TEST_CASES.length}`, 90));
  console.log(color(`  Grounded (keywords hit):   ${groundedPassed}/${TEST_CASES.length}`, 90));
  console.log(color(`  Source URL present:        ${sourceUrlPassed}/${TEST_CASES.length}`, 90));

  if (retrievalPassed < TEST_CASES.length) {
    console.log(color("\n→ Some queries returned no TikTok sources. Check Pinecone index or add more TikToks.", 33));
  }
  if (groundedPassed < TEST_CASES.length) {
    console.log(color("→ Some answers didn't hit grounding keywords. The TikTok transcripts may lack detail on those topics.", 33));
  }
}

run().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
