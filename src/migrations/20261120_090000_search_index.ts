import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'

/**
 * Keyword search support (PostgreSQL only, no external engine).
 * pg_trgm GIN index accelerates `search_text ILIKE '%term%'`, which also works for
 * Thai text (no word delimiters, so tsvector tokenisation is not usable for Thai).
 * The extension is created by the DB bootstrap script as superuser; `IF NOT EXISTS`
 * keeps this idempotent (pg_trgm is a trusted extension, so DB owners may create it).
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS pg_trgm;`)
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "articles_search_text_trgm_idx"
      ON "articles" USING gin ("search_text" gin_trgm_ops);
  `)
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "articles_status_published_idx"
      ON "articles" ("publication_status", "published_at" DESC);
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`DROP INDEX IF EXISTS "articles_status_published_idx";`)
  await db.execute(sql`DROP INDEX IF EXISTS "articles_search_text_trgm_idx";`)
  // The pg_trgm extension is left in place (it may be used by other objects).
}
