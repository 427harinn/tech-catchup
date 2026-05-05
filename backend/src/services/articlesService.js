import { getDb } from '../db/database.js';

const validReactions = new Set(['interested', 'not_interested', 'read_later', 'try_later']);
const queueReactions = new Set(['try_later']);
export function listArticles({ status, saved } = {}) {
  const db = getDb();
  const params = {};
  const where = [];

  if (status) {
    where.push('a.status = @status');
    params.status = status;
  }

  if (saved) {
    where.push(`
      EXISTS (
        SELECT 1
        FROM notion_queue nq
        WHERE nq.article_id = a.id
      )
    `);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  return db.prepare(`
    SELECT
      a.id,
      a.title,
      a.url,
      a.source,
      a.published_at,
      a.fetched_at,
      a.raw_excerpt,
      a.status,
      a.created_at,
      a.updated_at,
      s.summary_short,
      s.tech_points,
      s.relevance,
      s.next_action,
      s.tags,
      s.priority,
      COALESCE((
        SELECT json_group_array(reaction)
        FROM reactions r
        WHERE r.article_id = a.id
      ), '[]') AS reactions,
      COALESCE((
        SELECT json_group_array(type)
        FROM notion_queue nq
        WHERE nq.article_id = a.id
          AND nq.status = 'queued'
      ), '[]') AS notion_queue_types,
      COALESCE((
        SELECT json_group_array(status)
        FROM notion_queue nq
        WHERE nq.article_id = a.id
      ), '[]') AS notion_queue_statuses
    FROM articles a
    LEFT JOIN summaries s ON s.article_id = a.id
    ${whereSql}
    ORDER BY datetime(a.created_at) DESC, a.id DESC
  `).all(params).map(parseJsonColumns);
}

export function listUnsummarizedArticles({ limit = 5, includeFailed = true } = {}) {
  const db = getDb();
  const params = {
    limit: normalizeLimit(limit)
  };

  const statuses = includeFailed ? ['new', 'queued', 'failed'] : ['new', 'queued'];
  const placeholders = statuses.map((_, index) => `@status${index}`);
  for (const [index, value] of statuses.entries()) {
    params[`status${index}`] = value;
  }

  return db.prepare(`
    SELECT
      id,
      title,
      url,
      source,
      published_at,
      fetched_at,
      raw_excerpt,
      status,
      created_at,
      updated_at
    FROM articles
    WHERE status IN (${placeholders.join(', ')})
    ORDER BY datetime(created_at) DESC, id DESC
    LIMIT @limit
  `).all(params);
}

export function getArticle(id) {
  const db = getDb();
  const article = db.prepare(`
    SELECT
      a.*,
      s.summary_short,
      s.tech_points,
      s.relevance,
      s.next_action,
      s.tags,
      s.priority,
      COALESCE((
        SELECT json_group_array(reaction)
        FROM reactions r
        WHERE r.article_id = a.id
      ), '[]') AS reactions,
      COALESCE((
        SELECT json_group_array(type)
        FROM notion_queue nq
        WHERE nq.article_id = a.id
          AND nq.status = 'queued'
      ), '[]') AS notion_queue_types,
      COALESCE((
        SELECT json_group_array(status)
        FROM notion_queue nq
        WHERE nq.article_id = a.id
      ), '[]') AS notion_queue_statuses
    FROM articles a
    LEFT JOIN summaries s ON s.article_id = a.id
    WHERE a.id = @id
  `).get({ id });

  return article ? parseJsonColumns(article) : null;
}

export function createArticle({ title, url, source = 'manual' }) {
  return createArticleRecord({
    title,
    url,
    source,
    fetchedAt: new Date().toISOString(),
    createdAt: new Date().toISOString()
  });
}

export function createArticleIfNotExists({
  title,
  url,
  source = 'manual',
  publishedAt = null,
  fetchedAt = new Date().toISOString(),
  rawExcerpt = null
}) {
  const db = getDb();
  const trimmedUrl = String(url || '').trim();
  const existing = db.prepare('SELECT id FROM articles WHERE url = @url').get({ url: trimmedUrl });

  if (existing) {
    return {
      article: getArticle(existing.id),
      created: false
    };
  }

  const article = createArticleRecord({
    title,
    url: trimmedUrl,
    source,
    publishedAt,
    fetchedAt,
    rawExcerpt,
    createdAt: new Date().toISOString()
  });

  return {
    article,
    created: true
  };
}

function createArticleRecord({
  title,
  url,
  source = 'manual',
  publishedAt = null,
  fetchedAt = null,
  rawExcerpt = null,
  createdAt
}) {
  const db = getDb();
  const trimmedUrl = String(url || '').trim();
  const trimmedTitle = String(title || '').trim() || trimmedUrl;
  const now = createdAt || new Date().toISOString();

  if (!trimmedUrl) {
    const error = new Error('URL is required.');
    error.status = 400;
    throw error;
  }

  try {
    const result = db.prepare(`
      INSERT INTO articles (
        title,
        url,
        source,
        published_at,
        fetched_at,
        raw_excerpt,
        status,
        created_at,
        updated_at
      )
      VALUES (
        @title,
        @url,
        @source,
        @published_at,
        @fetched_at,
        @raw_excerpt,
        'new',
        @created_at,
        @updated_at
      )
    `).run({
      title: trimmedTitle,
      url: trimmedUrl,
      source: source || 'manual',
      published_at: publishedAt,
      fetched_at: fetchedAt || now,
      raw_excerpt: rawExcerpt,
      created_at: now,
      updated_at: now
    });

    return getArticle(result.lastInsertRowid);
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      const existing = db.prepare('SELECT id FROM articles WHERE url = @url').get({ url: trimmedUrl });
      const duplicate = new Error('This URL is already registered.');
      duplicate.status = 409;
      duplicate.article = existing ? getArticle(existing.id) : null;
      throw duplicate;
    }

    throw error;
  }
}

export function createReaction(articleId, reaction) {
  if (!validReactions.has(reaction)) {
    const error = new Error('Invalid reaction.');
    error.status = 400;
    throw error;
  }

  const db = getDb();
  const article = getArticle(articleId);
  if (!article) {
    const error = new Error('Article not found.');
    error.status = 404;
    throw error;
  }

  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO reactions (article_id, reaction, created_at)
      VALUES (@article_id, @reaction, @created_at)
    `).run({ article_id: articleId, reaction, created_at: now });

    if (queueReactions.has(reaction)) {
      db.prepare(`
        INSERT INTO notion_queue (article_id, type, status, created_at)
        VALUES (@article_id, @type, 'queued', @created_at)
      `).run({ article_id: articleId, type: reaction, created_at: now });

      db.prepare(`
        UPDATE articles
        SET status = 'queued',
            updated_at = @updated_at
        WHERE id = @id
          AND status != 'summarized'
      `).run({ id: articleId, updated_at: now });
    }
  });

  tx();
  return getArticle(articleId);
}

export function saveSummary(articleId, payload) {
  const article = getArticle(articleId);
  if (!article) {
    const error = new Error('Article not found.');
    error.status = 404;
    throw error;
  }

  const normalized = normalizeSummaryPayload(payload);
  const db = getDb();
  const now = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO summaries (
        article_id,
        summary_short,
        tech_points,
        relevance,
        next_action,
        tags,
        priority,
        generated_at
      )
      VALUES (
        @article_id,
        @summary_short,
        @tech_points,
        @relevance,
        @next_action,
        @tags,
        @priority,
        @generated_at
      )
      ON CONFLICT(article_id) DO UPDATE SET
        summary_short = excluded.summary_short,
        tech_points = excluded.tech_points,
        relevance = excluded.relevance,
        next_action = excluded.next_action,
        tags = excluded.tags,
        priority = excluded.priority,
        generated_at = excluded.generated_at
    `).run({
      article_id: articleId,
      summary_short: normalized.summary_short,
      tech_points: normalized.tech_points,
      relevance: normalized.relevance,
      next_action: normalized.next_action,
      tags: JSON.stringify(normalized.tags),
      priority: normalized.priority,
      generated_at: now
    });

    db.prepare(`
      UPDATE articles
      SET status = 'summarized',
          updated_at = @updated_at
      WHERE id = @id
    `).run({ id: articleId, updated_at: now });
  });

  tx();
  return getArticle(articleId);
}

export function markArticleSummaryFailed(articleId) {
  const article = getArticle(articleId);
  if (!article) {
    const error = new Error('Article not found.');
    error.status = 404;
    throw error;
  }

  const db = getDb();
  db.prepare(`
    UPDATE articles
    SET status = 'failed',
        updated_at = @updated_at
    WHERE id = @id
  `).run({
    id: articleId,
    updated_at: new Date().toISOString()
  });

  return getArticle(articleId);
}

function parseJsonColumns(article) {
  return {
    ...article,
    tags: parseJsonValue(article.tags, []),
    reactions: JSON.parse(article.reactions || '[]'),
    notion_queue_types: JSON.parse(article.notion_queue_types || '[]'),
    notion_queue_statuses: JSON.parse(article.notion_queue_statuses || '[]')
  };
}

function normalizeSummaryPayload(payload) {
  const summary_short = String(payload.summary_short || '').trim();
  const tech_points = String(payload.tech_points || '').trim();
  const relevance = String(payload.relevance || '').trim();
  const next_action = String(payload.next_action || '').trim();
  const tags = Array.isArray(payload.tags)
    ? payload.tags.map((tag) => String(tag).trim()).filter(Boolean)
    : [];
  const priority = Number(payload.priority);

  if (!summary_short || !tech_points || !relevance || !next_action) {
    const error = new Error('Summary fields are required.');
    error.status = 400;
    throw error;
  }

  if (!Number.isInteger(priority) || priority < 1 || priority > 5) {
    const error = new Error('Priority must be an integer between 1 and 5.');
    error.status = 400;
    throw error;
  }

  return {
    summary_short,
    tech_points,
    relevance,
    next_action,
    tags,
    priority
  };
}

function normalizeLimit(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return 5;
  }

  return Math.min(parsed, 10);
}

function parseJsonValue(value, fallback) {
  if (value == null) {
    return fallback;
  }

  if (typeof value !== 'string') {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}
