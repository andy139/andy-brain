# Andy's Brain

A production RAG (Retrieval-Augmented Generation) system I built to capture, search, and chat with everything I know. It ingests articles, PDFs, tweets, TikToks, and personal notes — then lets me (or anyone) ask questions and get answers streamed in real time, grounded in actual source material.

The `/portfolio` route is a recruiter-facing AI assistant that answers questions about my background, experience, and projects. It's live on my portfolio site.

**Live demo:** [andytran.dev](https://andytran.dev) → Andy's Brain section

---

## What it does

- **Capture anything** — browser bookmarklet for one-click saves, PDF upload with Claude-powered extraction, iOS Shortcut for TikTok/mobile content, manual form
- **Ask questions, get real answers** — semantic search via embeddings finds the most relevant chunks, Claude synthesizes a grounded response and streams it token by token
- **Source attribution** — every response links back to the original URL so you can verify
- **Portfolio chatbot** — public endpoint with a notes-only filter so recruiters get clean career context, not my reading list. Generates contextual follow-up questions after every answer.
- **No hallucination** — system prompt enforces a strict rule: only answer from retrieved context, never invent details

---

## Tech Stack

| Layer | Tech |
|---|---|
| Web frontend | Next.js 14 App Router, Tailwind CSS |
| API | Hono, TypeScript, Node.js |
| AI | Claude 3.5 Sonnet (streaming) + Haiku (follow-ups) |
| Embeddings | Voyage AI (`voyage-large-2`) |
| Vector DB | Pinecone |
| Database | Supabase (Postgres) — entry storage, metadata |
| Deploy | Vercel (web) · Railway (API) |

---

## Architecture

```
Browser / iOS Shortcut
        │
        ▼
   Hono REST API  ──── Auth middleware (token-gated ingest)
        │
        ├── Ingest routes ──► Voyage AI (embed) ──► Pinecone (store)
        │                                       ──► Supabase (metadata)
        │
        └── Query routes ──► Voyage AI (embed question)
                         ──► Pinecone (top-K semantic search)
                         ──► Claude (stream grounded answer)
                         ──► Haiku (generate follow-up chips)
```

---

## Key Engineering Decisions

**Why Hono over Express?** Hono has first-class streaming support and edge-compatible request handling — critical for streaming Claude responses to the browser without buffering.

**Why Voyage AI over OpenAI embeddings?** Voyage's `voyage-large-2` model consistently outperforms `text-embedding-ada-002` on retrieval benchmarks, especially for longer documents.

**Pinecone metadata filtering** — the portfolio endpoint filters on `source_type: "note"` so career-related context never mixes with personal reading. This keeps recruiter answers clean and prevents data leakage.

**Streaming sentinel pattern** — the API streams the Claude answer first, then appends `__FOLLOWUPS__[...]` at the end. The frontend strips the sentinel and renders the follow-up chips separately, without a second round-trip.

**In-memory embedding cache** — identical questions skip the Voyage API call entirely. Useful for the portfolio chatbot where questions cluster around a small set of topics.

---

## Project Structure

```
packages/
  api/        Hono REST API — ingest, query, portfolio chat
  web/        Next.js frontend — chat UI, capture flows, portfolio page
supabase/
  migrations/ Database schema
```

---

## API Routes

| Method | Route | Auth | Description |
|---|---|---|---|
| `POST` | `/api/query` | ✓ | RAG query — streaming response + source attribution |
| `POST` | `/api/portfolio/chat` | — | Public recruiter chatbot, notes-only filter |
| `POST` | `/api/ingest` | ✓ | Ingest a text/note entry |
| `POST` | `/api/ingest/pdf` | ✓ | PDF upload — Claude extracts and chunks content |
| `POST` | `/api/ingest/quick` | ✓ | Quick ingest from bookmarklet or iOS Shortcut |
| `GET` | `/api/entries` | ✓ | List all entries |
| `DELETE` | `/api/entries/:id` | ✓ | Delete an entry |

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
ANTHROPIC_API_KEY=       # Claude API
VOYAGE_API_KEY=          # Voyage AI embeddings
PINECONE_API_KEY=        # Pinecone vector DB
PINECONE_INDEX=          # index name
SUPABASE_URL=            # Supabase project URL
SUPABASE_ANON_KEY=       # Supabase anon key
AUTH_TOKEN=              # Bearer token protecting ingest/delete routes
ALLOWED_ORIGINS=         # Comma-separated CORS origins

# Web
NEXT_PUBLIC_API_URL=     # Deployed API URL
```

---

Built by [Andy Tran](https://linkedin.com/in/andytran1140)
