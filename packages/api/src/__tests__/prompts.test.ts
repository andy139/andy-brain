import { describe, it, expect } from 'vitest'
import { buildRagPrompt, type ContextItem } from '../lib/prompts.js'

function item(overrides: Partial<ContextItem> = {}): ContextItem {
  return {
    text: 'Sample context.',
    source_type: 'article',
    source_url: 'https://example.com',
    tags: [],
    score: 0.9,
    ...overrides,
  }
}

describe('buildRagPrompt', () => {
  it('includes the question', () => {
    const prompt = buildRagPrompt('What is RAG?', [item()])
    expect(prompt).toContain('What is RAG?')
  })

  it('includes the source text in the context block', () => {
    const prompt = buildRagPrompt('q', [item({ text: 'unique phrase xyz123' })])
    expect(prompt).toContain('unique phrase xyz123')
  })

  it('formats source label with URL when present', () => {
    const prompt = buildRagPrompt('q', [item({ source_url: 'https://example.com/page' })])
    expect(prompt).toContain('https://example.com/page')
  })

  it('falls back to source_type when source_url is null', () => {
    const prompt = buildRagPrompt('q', [item({ source_url: null, source_type: 'note' })])
    expect(prompt).toContain('note')
    expect(prompt).not.toContain('null')
  })

  it('numbers multiple sources [1], [2]', () => {
    const prompt = buildRagPrompt('q', [item({ text: 'first' }), item({ text: 'second' })])
    expect(prompt).toContain('[1]')
    expect(prompt).toContain('[2]')
    expect(prompt).not.toContain('[3]')
  })

  it('handles empty context without throwing', () => {
    const prompt = buildRagPrompt('question', [])
    expect(typeof prompt).toBe('string')
    expect(prompt).toContain('question')
  })

  it('separates multiple sources with a divider', () => {
    const prompt = buildRagPrompt('q', [item(), item()])
    expect(prompt).toContain('---')
  })
})
