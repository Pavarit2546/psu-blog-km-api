import { createHash, randomBytes } from 'crypto'

type LexicalNode = {
  type?: string
  text?: string
  children?: LexicalNode[]
  fields?: Record<string, unknown>
}

const BLOCK_TYPES = new Set(['paragraph', 'heading', 'quote', 'listitem', 'list', 'tablecell', 'block'])

/** Extract plain text from a Lexical serialized editor state. */
export function lexicalToPlainText(state: unknown): string {
  const root = (state as { root?: LexicalNode } | null)?.root
  if (!root) return ''
  const parts: string[] = []
  const walk = (node: LexicalNode) => {
    if (typeof node.text === 'string') parts.push(node.text)
    if (node.type === 'block' && node.fields) {
      const { url, caption } = node.fields as { url?: string; caption?: string }
      if (url) parts.push(` ${url} `)
      if (caption) parts.push(` ${caption} `)
    }
    if (node.type === 'linebreak') parts.push('\n')
    node.children?.forEach(walk)
    if (node.type && BLOCK_TYPES.has(node.type)) parts.push('\n')
  }
  walk(root)
  return parts.join('').replace(/\n{3,}/g, '\n\n').trim()
}

/** Normalise text so whitespace-only edits do not count as content changes. */
export const normaliseForHash = (text: string) => text.normalize('NFC').replace(/\s+/g, ' ').trim()

/**
 * Hash of the content that a verification decision covers.
 * Significant change = any change to the title, subtitle or body text
 * (whitespace and formatting-only changes are ignored).
 */
export function computeContentHash(input: { title?: string | null; subtitle?: string | null; content?: unknown }): string {
  const payload = [input.title ?? '', input.subtitle ?? '', lexicalToPlainText(input.content)]
    .map(normaliseForHash)
    .join('\u0000')
  return createHash('sha256').update(payload, 'utf8').digest('hex')
}

export function makeExcerpt(text: string, max = 220): string {
  const clean = normaliseForHash(text)
  if (clean.length <= max) return clean
  return `${clean.slice(0, max).replace(/\s+\S*$/, '')}…`
}

export function slugify(input: string): string {
  const ascii = input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return ascii
}

export const randomKey = (bytes = 9) => randomBytes(bytes).toString('base64url')

/** Unique, URL-safe slug. Thai titles have no ASCII slug, so a random suffix keeps them unique. */
export const makeArticleSlug = (title: string) => `${slugify(title) || 'article'}-${randomKey(4).toLowerCase()}`

export function readingMinutes(text: string): number {
  // Thai has no word spaces; approximate by characters (≈ 900 chars/min) and words for Latin text.
  const words = text.split(/\s+/).filter(Boolean).length
  const chars = text.replace(/\s+/g, '').length
  return Math.max(1, Math.round(Math.max(words / 220, chars / 900)))
}
