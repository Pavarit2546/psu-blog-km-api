import type { Payload, PayloadRequest } from 'payload'
import { sql } from '@payloadcms/db-postgres'

import type { Article, User } from '@/payload-types'

/**
 * Keyword search over PostgreSQL (NOT semantic/AI search).
 *
 * - Thai text has no word delimiters, so PostgreSQL's built-in full-text parser
 *   cannot tokenise it. We therefore use case-insensitive substring matching on a
 *   denormalised `search_text` column (title, subtitle, excerpt, tags, public author
 *   name, community, body), accelerated by a pg_trgm GIN index (see migrations).
 * - Every term must match (AND). Results are ranked title-match first, then recency.
 * - Candidate ids from SQL are re-loaded through the Payload Local API with
 *   `overrideAccess: false`, so visibility and permissions are always enforced.
 *
 * `SearchProvider` is the seam for a future semantic provider (pgvector/Qdrant + embeddings).
 */
export interface SearchProvider {
  search(args: SearchArgs): Promise<SearchResult>
}

export type SearchArgs = {
  payload: Payload
  user: User | null
  query: string
  limit?: number
  req?: Partial<PayloadRequest>
}

export type SearchHit = Pick<
  Article,
  'id' | 'title' | 'slug' | 'excerpt' | 'published_at' | 'verification_status' | 'publication_type' | 'author_public'
> & { community: { name: string; slug: string } | null }

export type SearchResult = { query: string; hits: SearchHit[]; engine: 'postgres-keyword' }

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`)

export function parseTerms(query: string): string[] {
  return Array.from(
    new Set(
      query
        .normalize('NFC')
        .trim()
        .split(/\s+/)
        .map((t) => t.slice(0, 50))
        .filter((t) => t.length > 0),
    ),
  ).slice(0, 6)
}

export const postgresKeywordSearch: SearchProvider = {
  async search({ payload, user, query, limit = 20 }) {
    const terms = parseTerms(query)
    if (terms.length === 0) return { query, hits: [], engine: 'postgres-keyword' }
    const capped = Math.min(Math.max(limit, 1), 50)

    const conditions = terms.map((t) => sql`a.search_text ILIKE ${`%${escapeLike(t)}%`} ESCAPE '\\'`)
    const titlePattern = `%${escapeLike(terms[0])}%`
    const db = (payload.db as unknown as { drizzle: { execute: (q: unknown) => Promise<{ rows: { id: string }[] }> } }).drizzle
    const result = await db.execute(sql`
      SELECT a.id
      FROM articles a
      WHERE a.publication_status = 'PUBLISHED'
        AND ${sql.join(conditions, sql` AND `)}
      ORDER BY (a.title ILIKE ${titlePattern} ESCAPE '\\') DESC, a.published_at DESC NULLS LAST
      LIMIT ${capped * 3}
    `)
    const ids = result.rows.map((r) => String(r.id))
    if (ids.length === 0) return { query, hits: [], engine: 'postgres-keyword' }

    const { docs } = await payload.find({
      collection: 'articles',
      where: { id: { in: ids } },
      overrideAccess: false,
      user: user ?? undefined,
      depth: 1,
      limit: ids.length,
      select: {
        title: true,
        slug: true,
        excerpt: true,
        published_at: true,
        verification_status: true,
        publication_type: true,
        author_public: true,
        community: true,
      },
      populate: { communities: { name: true, slug: true } },
    })
    const byId = new Map(docs.map((d) => [String(d.id), d]))
    const hits: SearchHit[] = ids
      .map((id) => byId.get(id))
      .filter((d): d is NonNullable<typeof d> => Boolean(d))
      .slice(0, capped)
      .map((d) => ({
        id: d.id,
        title: d.title,
        slug: d.slug,
        excerpt: d.excerpt,
        published_at: d.published_at,
        verification_status: d.verification_status,
        publication_type: d.publication_type,
        author_public: d.author_public,
        community:
          d.community && typeof d.community === 'object' ? { name: d.community.name, slug: d.community.slug } : null,
      }))
    return { query, hits, engine: 'postgres-keyword' }
  },
}

export const searchArticles = (args: SearchArgs) => postgresKeywordSearch.search(args)
