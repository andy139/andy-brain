import { describe, it, expect, vi, beforeEach } from 'vitest'
import app from '../index.js'

// ── Anthropic mock ────────────────────────────────────────────────────────────
// vi.hoisted ensures mockStream is defined before vi.mock hoisting runs
const mockStream = vi.hoisted(() => vi.fn())

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { stream: mockStream },
  })),
}))

// ── Embeddings mock ───────────────────────────────────────────────────────────
vi.mock('../lib/embeddings.js', () => ({
  generateEmbedding: vi.fn().mockResolvedValue(new Array(1024).fill(0.1)),
  generateEmbeddings: vi.fn().mockResolvedValue([new Array(1024).fill(0.1)]),
}))

// ── Pinecone mock ─────────────────────────────────────────────────────────────
vi.mock('../lib/pinecone.js', () => ({
  getPineconeIndex: vi.fn(() => ({
    query: vi.fn().mockResolvedValue({
      matches: [
        {
          id: 'entry-uuid-1-0',
          score: 0.95,
          metadata: {
            entry_id: 'entry-uuid-1',
            source_type: 'article',
            tags: ['ai'],
            text_preview: 'This is a relevant chunk about AI.',
          },
        },
      ],
    }),
  })),
}))

// ── Supabase mock ─────────────────────────────────────────────────────────────
const FAKE_ENTRIES = [
  {
    id: 'entry-uuid-1',
    content: 'Full article content about AI systems.',
    source_type: 'article',
    source_url: 'https://example.com/ai',
    tags: ['ai'],
  },
]

let dbResult: { data: unknown; error: unknown } = { data: FAKE_ENTRIES, error: null }

const dbChain: Record<string, unknown> = {}
for (const m of ['select', 'in']) {
  dbChain[m] = vi.fn(() => dbChain)
}
dbChain.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
  Promise.resolve(dbResult).then(resolve, reject)

vi.mock('../lib/supabase.js', () => ({
  supabase: { from: vi.fn(() => dbChain) },
}))

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeTextStream(chunks: string[]) {
  return {
    [Symbol.asyncIterator]: async function* () {
      for (const text of chunks) {
        yield { type: 'content_block_delta', delta: { type: 'text_delta', text } }
      }
    },
  }
}

function post(body: unknown) {
  return app.request('/api/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  dbResult = { data: FAKE_ENTRIES, error: null }
  mockStream.mockReturnValue(makeTextStream(['The answer is ', '42.']))
})

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('POST /api/query', () => {
  it('returns 400 for missing question', async () => {
    const res = await post({})
    expect(res.status).toBe(400)
  })

  it('returns 400 for empty question', async () => {
    const res = await post({ question: '' })
    expect(res.status).toBe(400)
  })

  it('streams Claude response followed by __SOURCES__ sentinel', async () => {
    const res = await post({ question: 'What is AI?' })
    expect(res.status).toBe(200)

    const text = await res.text()
    expect(text).toContain('The answer is ')
    expect(text).toContain('42.')
    expect(text).toContain('__SOURCES__')
  })

  it('includes source entry data in __SOURCES__ sentinel', async () => {
    const res = await post({ question: 'What is AI?' })
    const text = await res.text()

    const sentinelIndex = text.indexOf('__SOURCES__')
    const sourcesJson = text.slice(sentinelIndex + '__SOURCES__'.length)
    const sources = JSON.parse(sourcesJson)

    expect(Array.isArray(sources)).toBe(true)
    expect(sources[0]).toMatchObject({
      id: 'entry-uuid-1',
      source_type: 'article',
      source_url: 'https://example.com/ai',
    })
  })

  it('respects top_k parameter', async () => {
    const res = await post({ question: 'test', top_k: 3 })
    expect(res.status).toBe(200)
  })

  it('rejects top_k above 20', async () => {
    const res = await post({ question: 'test', top_k: 99 })
    expect(res.status).toBe(400)
  })
})
