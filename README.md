# Andy's Brain

A production RAG (Retrieval-Augmented Generation) system I built to capture, search, and chat with everything I know. It ingests articles, PDFs, tweets, TikToks, and personal notes — then lets me (or anyone) ask questions and get answers streamed in real time, grounded in actual source material.

TikTok ingest is fully automated: audio is transcribed via Groq Whisper, then Claude Haiku generates a summary and auto-tags from the transcript before embedding.

The `/portfolio` route is a recruiter-facing AI assistant that answers questions about my background, experience, and projects. It's live on my portfolio site.

**Live demo:** [andytran.tech](https://andytran.tech) → Andy's Brain section

---

## What it does

- **Capture anything** — browser bookmarklet for one-click saves, PDF upload with Claude-powered extraction, iOS Shortcut for TikTok/mobile content, manual form
- **TikTok intelligence** — audio transcription via Groq Whisper, then Claude Haiku generates a concise summary and auto-tags from the transcript
- **Ask questions, get real answers** — semantic search via embeddings finds the most relevant chunks, Claude synthesizes a conversational response across multiple sources and streams it token by token
- **Dynamic suggestions** — the chat page shows AI-generated question suggestions based on your most recent saves, so you always have a starting point
- **Source attribution** — every response links back to the original URL so you can verify
- **Portfolio chatbot** — public endpoint with a notes-only filter so recruiters get clean career context, not my reading list. Generates contextual follow-up questions after every answer.
- **No hallucination** — system prompt enforces a strict rule: only answer from retrieved context, never invent details

---

## Tech Stack

| Layer | Tech |
|---|---|
| Web frontend | Next.js 14 App Router, Tailwind CSS |
| API | Hono, TypeScript, Node.js |
| AI | Claude Sonnet (streaming RAG) + Haiku (follow-ups, suggestions, TikTok analysis) |
| Transcription | Groq Whisper (`whisper-large-v3-turbo`) via yt-dlp audio extraction |
| Embeddings | Voyage AI (`voyage-large-2`) |
| Vector DB | Pinecone (stores full `chunk_text` in metadata for precise retrieval) |
| Database | Supabase (Postgres) — entry storage, metadata |
| Deploy | Railway (API + web) |

---

## Architecture

```
Browser / iOS Shortcut
        │
        ▼
   Hono REST API  ──── Auth middleware (token-gated ingest)
        │
        ├── Ingest routes ──► Voyage AI (embed) ──► Pinecone (store chunks + metadata)
        │       │                                ──► Supabase (entry + metadata)
        │       └── TikTok path: yt-dlp ──► Groq Whisper (transcribe)
        │                                ──► Claude Haiku (summary + auto-tags)
        │
        ├── Query routes ──► Voyage AI (embed question)
        │                ──► Pinecone (top-K semantic search, full chunk_text)
        │                ──► Claude (stream conversational answer)
        │
        └── Suggestions ──► Supabase (recent entries)
                         ──► Claude Haiku (generate contextual questions)
```

---

## Key Engineering Decisions

**Why Hono over Express?** Hono has first-class streaming support and edge-compatible request handling — critical for streaming Claude responses to the browser without buffering.

**Why Voyage AI over OpenAI embeddings?** Voyage's `voyage-large-2` model consistently outperforms `text-embedding-ada-002` on retrieval benchmarks, especially for longer documents.

**Groq Whisper for TikTok transcription** — TikTok captions are often missing or low-quality. Extracting audio with yt-dlp and transcribing via Groq's hosted Whisper gives us the actual spoken content, which is then summarized and tagged by Claude Haiku before embedding.

**Full chunk_text in Pinecone metadata** — earlier versions fell back to a 200-char preview from the Supabase entry. Now each Pinecone vector carries the full chunk text it was embedded from, so the RAG prompt always gets the exact relevant passage, not a truncated approximation.

**Conversational RAG prompt** — the system prompt tells Claude to act like a smart friend who watched the same videos and read the same articles. It synthesizes across multiple sources when the question is broad, and goes deep on a single source when the question is specific.

**Iterative chunker** — the text chunker was rewritten from a recursive implementation to an iterative one with guaranteed forward progress, eliminating stack overflow risk on large documents.

**Pinecone metadata filtering** — the portfolio endpoint filters on `source_type: "note"` so career-related context never mixes with personal reading. This keeps recruiter answers clean and prevents data leakage.

**Streaming sentinel pattern** — the API streams the Claude answer first, then appends `__SOURCES__[...]` at the end. The frontend strips the sentinel and renders source cards separately, without a second round-trip.

**In-memory embedding cache** — identical questions skip the Voyage API call entirely. Useful for the portfolio chatbot where questions cluster around a small set of topics.

---

## Project Structure

```
packages/
  api/
    src/
      routes/       Hono route handlers (ingest, query, portfolio, suggestions)
      lib/          Shared utilities (embeddings, chunker, prompts, Pinecone, Supabase)
      middleware/    Auth middleware
      scripts/      One-off utility scripts (backfill, testing, debugging)
  web/              Next.js frontend — chat UI, browse, capture flows, portfolio page
supabase/
  migrations/       Database schema
```

---

## API Routes

| Method | Route | Auth | Description |
|---|---|---|---|
| `POST` | `/api/query` | ✓ | RAG query — streaming response + source attribution |
| `GET` | `/api/suggestions` | — | Dynamic question suggestions based on recent entries |
| `POST` | `/api/portfolio/chat` | — | Public recruiter chatbot, notes-only filter |
| `POST` | `/api/ingest` | ✓ | Ingest a text/note entry |
| `POST` | `/api/ingest/pdf` | ✓ | PDF upload — Claude extracts and chunks content |
| `POST` | `/api/ingest/quick` | ✓ | Quick ingest from bookmarklet or iOS Shortcut (TikToks get Whisper transcription + Haiku analysis) |
| `GET` | `/api/entries` | ✓ | List all entries |
| `DELETE` | `/api/entries/:id` | ✓ | Delete an entry |

---

## Scripts

Utility scripts live in `packages/api/src/scripts/`. Run from the `packages/api` directory:

```bash
# Backfill existing TikTok entries with Claude summaries, auto-tags, and re-embedded vectors
npx tsx --env-file=../../.env.local src/scripts/backfillTiktoks.ts

# Test TikTok RAG retrieval end-to-end (assertion-based, no LLM judge)
npx tsx --env-file=../../.env.local src/scripts/testTikTokRAG.ts

# Inspect recent TikTok entries and their Pinecone metadata for debugging
npx tsx --env-file=../../.env.local src/scripts/inspectEntries.ts
```

| Script | Purpose |
|---|---|
| `backfillTiktoks.ts` | Adds Claude-generated summaries and auto-tags to all existing TikTok entries, re-embeds and re-upserts vectors with `chunk_text` and `source_url` in Pinecone metadata |
| `testTikTokRAG.ts` | End-to-end RAG test agent: asserts retrieval, grounding, source URLs, and no-hallucination for TikTok queries |
| `inspectEntries.ts` | Quick debug script to inspect recent TikTok entries (content, tags, URLs) |

---

## Running Locally

```bash
# Install deps
npm install

# API env vars — copy from wherever you store secrets
cp .env.example packages/api/.env.local
echo "NEXT_PUBLIC_API_URL=http://localhost:3001" > packages/web/.env.local

# Start API (port 3001)
cd packages/api && npm run dev

# Start web (port 4000)
cd packages/web && npm run dev
```

---

## Environment Variables

```bash
# API
ANTHROPIC_API_KEY=       # Claude API (Sonnet for RAG, Haiku for summaries/suggestions)
VOYAGE_API_KEY=          # Voyage AI embeddings
PINECONE_API_KEY=        # Pinecone vector DB
PINECONE_INDEX=          # index name
SUPABASE_URL=            # Supabase project URL
SUPABASE_ANON_KEY=       # Supabase anon key
AUTH_TOKEN=              # Bearer token protecting ingest/delete routes
ALLOWED_ORIGINS=         # Comma-separated CORS origins
GROQ_API_KEY=            # Groq API — Whisper transcription for TikTok audio

# Web
NEXT_PUBLIC_API_URL=     # Deployed API URL
```

---

Built by [Andy Tran](https://andytran.tech) · [LinkedIn](https://linkedin.com/in/andytran1140)
