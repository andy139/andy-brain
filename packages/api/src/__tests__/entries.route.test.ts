import { describe, it, expect, vi, beforeEach } from 'vitest'
import app from '../index.js'

// ── Supabase mock ─────────────────────────────────────────────────────────────
// We need a thenable chain so `await supabase.from(...).select(...).range(...)` works.
// The `then` method reads from `dbResult` at call time so tests can control it.
let dbResult: { data: unknown; error: unknown; count: number | null } = {
  data: [],
  error: null,
  count: 0,
}

const dbChain: Record<string, unknown> = {}
for (const m of ['select', 'delete', 'eq', 'in', 'order', 'range', 'contains']) {
  dbChain[m] = vi.fn(() => dbChain)
}
dbChain.single = vi.fn(() => Promise.resolve(dbResult))
dbChain.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
  Promise.resolve(dbResult).then(resolve, reject)

vi.mock('../lib/supabase.js', () => ({
  supabase: { from: vi.fn(() => dbChain) },
}))

// ── Embeddings mock (prevents OpenAI client init at module load) ──────────────
vi.mock('../lib/embeddings.js', () => ({
  generateEmbedding: vi.fn().mockResolvedValue(new Array(1024).fill(0.1)),
  generateEmbeddings: vi.fn().mockResolvedValue([new Array(1024).fill(0.1)]),
}))

// ── Pinecone mock ─────────────────────────────────────────────────────────────
const mockDeleteMany = vi.fn().mockResolvedValue(undefined)

vi.mock('../lib/pinecone.js', () => ({
  getPineconeIndex: vi.fn(() => ({ deleteMany: mockDeleteMany })),
}))

// ── Helpers ───────────────────────────────────────────────────────────────────
function setDb(data: unknown, opts: { error?: unknown; count?: number } = {}) {
  dbResult = { data, error: opts.error ?? null, count: opts.count ?? null }
}

function req(path: string, init?: RequestInit) {
  return app.request(path, init)
}

const AUTH = { 'x-api-key': 'test-token' }

beforeEach(() => {
  vi.clearAllMocks()
  process.env.AUTH_TOKEN = 'test-token'
  setDb([])
})

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('GET /api/entries', () => {
  it('returns paginated entries', async () => {
    const entries = [
      { id: 'a', content: 'hello', source_type: 'note', tags: [], created_at: '' },
    ]
    setDb(entries, { count: 1 })

    const res = await req('/api/entries')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.entries).toHaveLength(1)
    expect(body.total).toBe(1)
    expect(body.pages).toBe(1)
  })

  it('returns empty list when there are no entries', async () => {
    setDb([], { count: 0 })

    const res = await req('/api/entries')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.entries).toEqual([])
    expect(body.total).toBe(0)
  })

  it('accepts source_type filter', async () => {
    setDb([], { count: 0 })
    const res = await req('/api/entries?source_type=article')
    expect(res.status).toBe(200)
  })

  it('returns 400 for invalid source_type', async () => {
    const res = await req('/api/entries?source_type=invalid')
    expect(res.status).toBe(400)
  })

  it('returns 500 when Supabase errors', async () => {
    setDb(null, { error: { message: 'db error' } })
    const res = await req('/api/entries')
    expect(res.status).toBe(500)
  })
})

describe('DELETE /api/entries/:id', () => {
  it('requires auth', async () => {
    const res = await req('/api/entries/abc', { method: 'DELETE' })
    expect(res.status).toBe(401)
  })

  it('deletes entry and returns success', async () => {
    setDb(null, { error: null })

    const res = await req('/api/entries/abc', {
      method: 'DELETE',
      headers: AUTH,
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
  })

  it('returns 500 when Supabase delete fails', async () => {
    setDb(null, { error: { message: 'delete failed' } })

    const res = await req('/api/entries/abc', {
      method: 'DELETE',
      headers: AUTH,
    })
    expect(res.status).toBe(500)
  })

  it('still returns 200 when Pinecone delete throws (free plan)', async () => {
    setDb(null, { error: null })
    mockDeleteMany.mockRejectedValueOnce(new Error('filter delete not supported'))

    const res = await req('/api/entries/abc', {
      method: 'DELETE',
      headers: AUTH,
    })
    expect(res.status).toBe(200)
  })
})
