import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import app from '../index.js'

// ── Supabase mock ─────────────────────────────────────────────────────────────
let dbResult: { data: unknown; error: unknown } = { data: null, error: null }

const dbChain: Record<string, unknown> = {}
for (const m of ['select', 'insert', 'eq']) {
  dbChain[m] = vi.fn(() => dbChain)
}
dbChain.single = vi.fn(() => Promise.resolve(dbResult))
dbChain.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
  Promise.resolve(dbResult).then(resolve, reject)

vi.mock('../lib/supabase.js', () => ({
  supabase: { from: vi.fn(() => dbChain) },
}))

// ── Pinecone mock ─────────────────────────────────────────────────────────────
vi.mock('../lib/pinecone.js', () => ({
  getPineconeIndex: vi.fn(() => ({ upsert: vi.fn().mockResolvedValue(undefined) })),
}))

// ── Embeddings mock ───────────────────────────────────────────────────────────
vi.mock('../lib/embeddings.js', () => ({
  generateEmbedding: vi.fn().mockResolvedValue(new Array(1024).fill(0.1)),
  generateEmbeddings: vi.fn().mockResolvedValue([new Array(1024).fill(0.1)]),
}))

// ── Helpers ───────────────────────────────────────────────────────────────────
const AUTH = { 'Content-Type': 'application/json', 'x-api-key': 'test-token' }

function post(path: string, body: unknown, headers: Record<string, string> = AUTH) {
  return app.request(path, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

function setDb(data: unknown, error: unknown = null) {
  dbResult = { data, error }
}

const FAKE_ENTRY = { id: 'entry-uuid-1', content: 'test content', source_type: 'note' }

beforeEach(() => {
  vi.clearAllMocks()
  process.env.AUTH_TOKEN = 'test-token'
  setDb(FAKE_ENTRY)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('POST /api/ingest', () => {
  it('returns 401 without auth', async () => {
    const res = await post(
      '/api/ingest',
      { content: 'hello', source_type: 'note' },
      { 'Content-Type': 'application/json' },
    )
    expect(res.status).toBe(401)
  })

  it('ingests a note and returns entry_id + chunks_created', async () => {
    const res = await post('/api/ingest', {
      content: 'This is a test note with enough content to chunk.',
      source_type: 'note',
      tags: ['test'],
    })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.entry_id).toBe('entry-uuid-1')
    expect(body.chunks_created).toBeGreaterThan(0)
  })

  it('returns 400 for missing required fields', async () => {
    const res = await post('/api/ingest', { source_type: 'note' })
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid source_type', async () => {
    const res = await post('/api/ingest', { content: 'text', source_type: 'blog' })
    expect(res.status).toBe(400)
  })

  it('returns 500 when Supabase insert fails', async () => {
    setDb(null, { message: 'insert failed' })
    const res = await post('/api/ingest', { content: 'text', source_type: 'note' })
    expect(res.status).toBe(500)
  })

  it('skips article extraction when source_type is not article', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    await post('/api/ingest', { content: 'a note', source_type: 'note' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('attempts article extraction when source_type is article and url is provided', async () => {
    const html = '<html><body><article><p>Extracted article body content.</p></article></body></html>'
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(html) }),
    )

    const res = await post('/api/ingest', {
      content: 'fallback content',
      source_type: 'article',
      source_url: 'https://example.com/article',
    })
    expect(res.status).toBe(201)
  })
})
