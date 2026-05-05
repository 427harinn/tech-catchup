import { getDb } from '../db/database.js';

const validReactions = new Set(['interested', 'not_interested', 'read_later', 'try_later']);
const queueReactions = new Set(['try_later']);
const VISIBLE_ARTICLE_TARGET = 20;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

export function listArticles({ status, saved, sort, limit, includeArchived = false } = {}) {
  const db = getDb();
  const params = {};
  const where = [];
  const orderBySql = buildArticleOrderBy(sort);
  const limitSql = buildArticleLimit(limit, params);

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

  if (!includeArchived) {
    where.push('a.archived_at IS NULL');
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
      a.archived_at,
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
    ${orderBySql}
    ${limitSql}
  `).all(params).map(parseJsonColumns);
}

export function listUnsummarizedArticles({ limit = 10, includeFailed = true } = {}) {
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
      AND archived_at IS NULL
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
  let notionQueueItemId = null;
  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO reactions (article_id, reaction, created_at)
      VALUES (@article_id, @reaction, @created_at)
    `).run({ article_id: articleId, reaction, created_at: now });

    if (queueReactions.has(reaction)) {
      const queueResult = db.prepare(`
        INSERT INTO notion_queue (article_id, type, status, created_at)
        VALUES (@article_id, @type, 'queued', @created_at)
      `).run({ article_id: articleId, type: reaction, created_at: now });
      notionQueueItemId = Number(queueResult.lastInsertRowid);

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
  return {
    article: getArticle(articleId),
    notionQueueItemId
  };
}

export function saveManualSummarizedArticle({
  url,
  title,
  memo = null,
  body_text = null,
  summary
}) {
  const trimmedUrl = String(url || '').trim();
  const trimmedTitle = String(title || '').trim();
  const trimmedMemo = String(memo || '').trim();
  const trimmedBodyText = String(body_text || '').trim();

  if (!trimmedUrl) {
    const error = new Error('URL is required.');
    error.status = 400;
    throw error;
  }

  const sourceTitle = trimmedTitle || String(summary?.title_suggested || '').trim() || trimmedUrl;
  const rawExcerpt = String(summary?.raw_excerpt || '').trim() || trimmedMemo || trimmedBodyText.slice(0, 600) || null;
  const articleResult = createArticleIfNotExists({
    title: sourceTitle,
    url: trimmedUrl,
    source: 'manual',
    fetchedAt: new Date().toISOString(),
    rawExcerpt
  });

  const db = getDb();
  db.prepare(`
    UPDATE articles
    SET title = @title,
        source = 'manual',
        raw_excerpt = @raw_excerpt,
        archived_at = NULL,
        updated_at = @updated_at
    WHERE id = @id
  `).run({
    id: articleResult.article.id,
    title: sourceTitle,
    raw_excerpt: rawExcerpt,
    updated_at: new Date().toISOString()
  });

  const savedArticle = saveSummary(articleResult.article.id, summary);
  return {
    article: savedArticle,
    created: articleResult.created
  };
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

export function archiveOldArticles({ dryRun = false, visibleTarget = VISIBLE_ARTICLE_TARGET } = {}) {
  const db = getDb();
  const candidates = db.prepare(`
    SELECT
      a.id,
      a.title,
      a.status,
      a.archived_at,
      a.created_at,
      a.updated_at,
      s.generated_at AS summary_generated_at,
      (
        SELECT r.reaction
        FROM reactions r
        WHERE r.article_id = a.id
        ORDER BY datetime(r.created_at) DESC, r.id DESC
        LIMIT 1
      ) AS latest_reaction,
      (
        SELECT r.created_at
        FROM reactions r
        WHERE r.article_id = a.id
        ORDER BY datetime(r.created_at) DESC, r.id DESC
        LIMIT 1
      ) AS latest_reaction_at,
      EXISTS (
        SELECT 1
        FROM notion_queue nq
        WHERE nq.article_id = a.id
          AND nq.type = 'try_later'
          AND nq.status IN ('queued', 'failed')
      ) AS has_pending_notion,
      EXISTS (
        SELECT 1
        FROM notion_queue nq
        WHERE nq.article_id = a.id
          AND nq.type = 'try_later'
      ) AS has_try_later_queue,
      (
        SELECT nq.synced_at
        FROM notion_queue nq
        WHERE nq.article_id = a.id
          AND nq.type = 'try_later'
          AND nq.status = 'synced'
          AND nq.synced_at IS NOT NULL
        ORDER BY datetime(nq.synced_at) DESC, nq.id DESC
        LIMIT 1
      ) AS latest_try_later_synced_at
    FROM articles a
    LEFT JOIN summaries s ON s.article_id = a.id
    WHERE a.archived_at IS NULL
    ORDER BY datetime(a.created_at) DESC, a.id DESC
  `).all();

  const now = new Date();
  const checked = candidates.length;
  const archivedArticles = [];
  const skippedArticles = [];
  const archiveIds = new Set();

  for (const article of candidates) {
    const decision = evaluateArchiveRule(article, now);
    if (decision.archive) {
      archiveIds.add(article.id);
      archivedArticles.push(buildArchiveLogEntry(article, decision.reason));
    } else {
      skippedArticles.push(buildSkipLogEntry(article, decision.reason));
    }
  }

  const remaining = candidates
    .filter((article) => !archiveIds.has(article.id))
    .map((article) => ({
      ...article,
      protected_from_trim: isProtectedFromTrim(article)
    }));

  const trimmable = remaining
    .filter((article) => article.status === 'summarized' && !article.protected_from_trim)
    .sort(compareArticlesNewestFirst);

  const keepCount = Math.max(0, normalizeArchiveVisibleTarget(visibleTarget));
  const overflow = trimmable.slice(keepCount);

  for (const article of overflow) {
    if (archiveIds.has(article.id)) {
      continue;
    }

    archiveIds.add(article.id);
    archivedArticles.push(buildArchiveLogEntry(article, 'max_visible_trim'));
    removeSkippedEntry(skippedArticles, article.id);
  }

  const archivedAt = new Date().toISOString();
  if (!dryRun && archiveIds.size > 0) {
    const update = db.prepare(`
      UPDATE articles
      SET archived_at = @archived_at,
          updated_at = @updated_at
      WHERE id = @id
        AND archived_at IS NULL
    `);

    const tx = db.transaction((ids) => {
      for (const id of ids) {
        update.run({
          id,
          archived_at: archivedAt,
          updated_at: archivedAt
        });
      }
    });

    tx(Array.from(archiveIds));
  }

  return {
    checked,
    archived: archiveIds.size,
    skipped: checked - archiveIds.size,
    archived_articles: archivedArticles.sort((left, right) => left.article_id - right.article_id),
    skipped_articles: skippedArticles
      .filter((article) => !archiveIds.has(article.article_id))
      .sort((left, right) => left.article_id - right.article_id),
    dry_run: dryRun,
    visible_target: keepCount
  };
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
  const next_action = String(payload.next_action || '').trim() || null;
  const tags = Array.isArray(payload.tags)
    ? payload.tags.map((tag) => String(tag).trim()).filter(Boolean)
    : [];
  const priority = Number(payload.priority);

  if (!summary_short || !tech_points || !relevance) {
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
    return 10;
  }

  return Math.min(parsed, 10);
}

function normalizeArticleListLimit(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return Math.min(parsed, 100);
}

function buildArticleLimit(limit, params) {
  const normalized = normalizeArticleListLimit(limit);
  if (!normalized) {
    return '';
  }

  params.limit = normalized;
  return 'LIMIT @limit';
}

function buildArticleOrderBy(sort) {
  switch (sort) {
    case 'updated_desc':
      return 'ORDER BY datetime(a.updated_at) DESC, a.id DESC';
    case 'created_asc':
      return 'ORDER BY datetime(a.created_at) ASC, a.id ASC';
    case 'updated_asc':
      return 'ORDER BY datetime(a.updated_at) ASC, a.id ASC';
    case 'created_desc':
    default:
      return 'ORDER BY datetime(a.created_at) DESC, a.id DESC';
  }
}

function evaluateArchiveRule(article, now) {
  if (article.archived_at) {
    return { archive: false, reason: 'already_archived' };
  }

  if (article.status !== 'summarized') {
    return { archive: false, reason: `status_${article.status}` };
  }

  const latestReaction = article.latest_reaction || null;
  const latestReactionAt = parseDate(article.latest_reaction_at);
  const summaryGeneratedAt = parseDate(article.summary_generated_at);
  const latestTryLaterSyncedAt = parseDate(article.latest_try_later_synced_at);
  const hasPendingNotion = Boolean(article.has_pending_notion);

  if (latestReaction === 'not_interested') {
    return evaluateAgeRule(latestReactionAt, now, 1, 'not_interested_expired', 'not_interested_recent');
  }

  if (latestReaction === 'interested') {
    return evaluateAgeRule(latestReactionAt, now, 7, 'interested_expired', 'interested_recent');
  }

  if (latestReaction === 'try_later' || article.has_try_later_queue) {
    if (hasPendingNotion) {
      return { archive: false, reason: 'try_later_pending_notion' };
    }

    return evaluateAgeRule(
      latestTryLaterSyncedAt,
      now,
      3,
      'try_later_synced_expired',
      'try_later_synced_recent',
      'try_later_not_synced'
    );
  }

  return evaluateAgeRule(
    summaryGeneratedAt,
    now,
    3,
    latestReaction === 'read_later' ? 'read_later_expired' : 'no_reaction_expired',
    latestReaction === 'read_later' ? 'read_later_recent' : 'no_reaction_recent',
    'summary_missing'
  );
}

function evaluateAgeRule(referenceDate, now, thresholdDays, expiredReason, recentReason, missingReason = 'missing_reference_date') {
  if (!referenceDate) {
    return { archive: false, reason: missingReason };
  }

  if (daysSince(referenceDate, now) >= thresholdDays) {
    return { archive: true, reason: expiredReason };
  }

  return { archive: false, reason: recentReason };
}

function isProtectedFromTrim(article) {
  const latestReaction = article.latest_reaction || null;
  if (latestReaction === 'interested' || latestReaction === 'try_later') {
    return true;
  }

  return Boolean(article.has_pending_notion);
}

function buildArchiveLogEntry(article, reason) {
  return {
    article_id: Number(article.id),
    title: String(article.title),
    status: String(article.status),
    reason
  };
}

function buildSkipLogEntry(article, reason) {
  return {
    article_id: Number(article.id),
    title: String(article.title),
    status: String(article.status),
    reason
  };
}

function removeSkippedEntry(entries, articleId) {
  const index = entries.findIndex((entry) => entry.article_id === Number(articleId));
  if (index >= 0) {
    entries.splice(index, 1);
  }
}

function compareArticlesNewestFirst(left, right) {
  const leftTime = parseDate(left.summary_generated_at || left.updated_at || left.created_at)?.getTime() || 0;
  const rightTime = parseDate(right.summary_generated_at || right.updated_at || right.created_at)?.getTime() || 0;

  if (rightTime !== leftTime) {
    return rightTime - leftTime;
  }

  return Number(right.id) - Number(left.id);
}

function parseDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysSince(referenceDate, now) {
  return (now.getTime() - referenceDate.getTime()) / DAY_IN_MS;
}

function normalizeArchiveVisibleTarget(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return VISIBLE_ARTICLE_TARGET;
  }

  return Math.min(parsed, 200);
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
