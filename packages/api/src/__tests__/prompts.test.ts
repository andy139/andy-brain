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

  // ── Conversational prompt format: source URLs and tags in context block ──

  it('includes source URL with source_type in the "Source:" line', () => {
    const prompt = buildRagPrompt('q', [
      item({
        source_type: 'tiktok',
        source_url: 'https://tiktok.com/@user/video/123',
      }),
    ])
    // Should contain the formatted "Source: tiktok — https://..." line
    expect(prompt).toContain('Source: tiktok')
    expect(prompt).toContain('https://tiktok.com/@user/video/123')
    // The em dash separator between type and URL
    expect(prompt).toMatch(/tiktok\s*—\s*https:\/\/tiktok\.com/)
  })

  it('includes tags in the context block', () => {
    const prompt = buildRagPrompt('q', [
      item({ tags: ['productivity', 'ai', 'typescript'] }),
    ])
    expect(prompt).toContain('Tags: productivity, ai, typescript')
  })

  it('renders empty tags as an empty Tags line', () => {
    const prompt = buildRagPrompt('q', [item({ tags: [] })])
    expect(prompt).toContain('Tags: ')
  })

  it('renders full context block with source, tags, and text together', () => {
    const prompt = buildRagPrompt('what did I save about cooking?', [
      item({
        text: 'Recipe for pasta carbonara with guanciale.',
        source_type: 'tiktok',
        source_url: 'https://tiktok.com/@chef/video/456',
        tags: ['cooking', 'italian'],
      }),
      item({
        text: 'Best knife sharpening technique from Japan.',
        source_type: 'article',
        source_url: 'https://blog.example.com/knives',
        tags: ['cooking', 'tools'],
      }),
    ])
    // Both sources present and numbered
    expect(prompt).toContain('[1] Source: tiktok')
    expect(prompt).toContain('[2] Source: article')
    // Both URLs present
    expect(prompt).toContain('https://tiktok.com/@chef/video/456')
    expect(prompt).toContain('https://blog.example.com/knives')
    // Tags from both items
    expect(prompt).toContain('Tags: cooking, italian')
    expect(prompt).toContain('Tags: cooking, tools')
    // Text bodies
    expect(prompt).toContain('Recipe for pasta carbonara with guanciale.')
    expect(prompt).toContain('Best knife sharpening technique from Japan.')
    // The question itself
    expect(prompt).toContain('what did I save about cooking?')
    // Wrapped in <context> and <question> blocks
    expect(prompt).toContain('<context>')
    expect(prompt).toContain('</context>')
    expect(prompt).toContain('<question>')
    expect(prompt).toContain('</question>')
  })

  it('omits URL from source label when source_url is null', () => {
    const prompt = buildRagPrompt('q', [
      item({ source_type: 'note', source_url: null, tags: ['personal'] }),
    ])
    // Should have just the type, no dash or URL
    expect(prompt).toContain('Source: note')
    expect(prompt).not.toMatch(/Source: note\s*—/)
    expect(prompt).toContain('Tags: personal')
  })

  it('includes conversational system instructions', () => {
    const prompt = buildRagPrompt('test question', [item()])
    // The new prompt should include the second-brain persona instructions
    expect(prompt).toContain('second brain')
  })
})
