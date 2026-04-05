import { describe, it, expect } from 'vitest'
import { chunkText } from '../lib/chunker.js'

const CHUNK_SIZE = 2000
const OVERLAP = 200

describe('chunkText', () => {
  it('returns empty array for empty or whitespace-only input', () => {
    expect(chunkText('')).toEqual([])
    expect(chunkText('   \n  ')).toEqual([])
  })

  it('returns single chunk for short text', () => {
    const text = 'Hello world'
    expect(chunkText(text)).toEqual([text])
  })

  it('returns single chunk for text exactly at CHUNK_SIZE', () => {
    const text = 'a'.repeat(CHUNK_SIZE)
    const chunks = chunkText(text)
    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toBe(text)
  })

  it('splits long text on paragraph breaks', () => {
    // Two paragraphs each > 1000 chars so combined they exceed CHUNK_SIZE
    const para = 'word '.repeat(250) // ~1250 chars
    const text = `${para}\n\n${para}\n\n${para}`
    const chunks = chunkText(text)
    expect(chunks.length).toBeGreaterThan(1)
  })

  it('no chunk exceeds CHUNK_SIZE', () => {
    const para = 'word '.repeat(250)
    const text = Array(8).fill(para).join('\n\n')
    for (const chunk of chunkText(text)) {
      expect(chunk.length).toBeLessThanOrEqual(CHUNK_SIZE)
    }
  })

  it('hard-splits text with no separators', () => {
    const text = 'a'.repeat(6000)
    const chunks = chunkText(text)
    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(CHUNK_SIZE)
    }
  })

  it('normalises CRLF line endings', () => {
    const text = 'line one\r\nline two\r\nline three'
    const [chunk] = chunkText(text)
    expect(chunk).not.toContain('\r')
  })

  it('adjacent chunks overlap near boundaries', () => {
    const para = 'word '.repeat(250)
    const text = `${para}\n\n${para}\n\n${para}`
    const chunks = chunkText(text)
    if (chunks.length < 2) return
    // The tail of chunk[0] should share content with the start of chunk[1]
    const tail = chunks[0].slice(-OVERLAP).trim()
    const head = chunks[1].slice(0, OVERLAP * 2)
    const overlap = tail.split(' ').slice(0, 5).join(' ')
    expect(head).toContain(overlap)
  })

  // ── Edge cases for iterative implementation ──────────────────────────────

  it('handles very long text (10000+ chars) with no separators without stack overflow', () => {
    const text = 'x'.repeat(12000)
    const chunks = chunkText(text)
    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(CHUNK_SIZE)
    }
    // Verify all content is covered — total chars across chunks (accounting for overlap)
    // should be at least the original length
    const totalChars = chunks.reduce((sum, c) => sum + c.length, 0)
    expect(totalChars).toBeGreaterThanOrEqual(text.length)
  })

  it('handles separators only within the first OVERLAP (200) chars', () => {
    // Place a paragraph break early then fill with no-separator content
    const earlyBreak = 'short\n\n'
    const filler = 'a'.repeat(CHUNK_SIZE * 3)
    const text = earlyBreak + filler
    const chunks = chunkText(text)
    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(CHUNK_SIZE)
    }
  })

  it('splits text that is exactly CHUNK_SIZE + 1', () => {
    const text = 'b'.repeat(CHUNK_SIZE + 1)
    const chunks = chunkText(text)
    expect(chunks.length).toBe(2)
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(CHUNK_SIZE)
    }
    // Second chunk should contain the overlap region plus the extra character
    expect(chunks[1].length).toBeGreaterThan(0)
  })

  it('handles a single word repeated many times', () => {
    // "go " repeated 1500 times = 4500 chars, well above CHUNK_SIZE
    const text = 'go '.repeat(1500).trim()
    const chunks = chunkText(text)
    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(CHUNK_SIZE)
    }
    // Every chunk should only contain 'go' words (no corruption from splitting)
    for (const chunk of chunks) {
      expect(chunk).toMatch(/^(go\s*)+$/)
    }
  })

  it('guarantees forward progress and terminates on pathological input', () => {
    // A string with no separators at all — the iterative loop must always advance
    const text = 'Z'.repeat(CHUNK_SIZE * 5 + 7)
    const chunks = chunkText(text)
    // Should produce at least 5 chunks (with overlap maybe 6)
    expect(chunks.length).toBeGreaterThanOrEqual(5)
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(CHUNK_SIZE)
      expect(chunk.length).toBeGreaterThan(0)
    }
  })

  it('does not produce empty chunks from whitespace-heavy separators', () => {
    // Lots of paragraph breaks scattered around
    const text = Array(20)
      .fill('word '.repeat(250))
      .join('\n\n\n\n')
    const chunks = chunkText(text)
    for (const chunk of chunks) {
      expect(chunk.trim().length).toBeGreaterThan(0)
    }
  })

  it('splits correctly when the only separator is ". "', () => {
    // No newlines at all — only sentence endings with ". "
    const sentence = 'The quick brown fox jumps over the lazy dog. '
    const repetitions = Math.ceil((CHUNK_SIZE * 3) / sentence.length)
    const text = sentence.repeat(repetitions).trim()
    const chunks = chunkText(text)
    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(CHUNK_SIZE)
    }
  })
})
