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
})
