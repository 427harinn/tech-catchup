import { getDb } from '../db/database.js';
import { getArticle } from './articlesService.js';

const NOTION_API_BASE_URL = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';
const ALLOWED_TAGS = new Set([
  'AI',
  'Unity',
  'Web',
  '3D',
  '業務システム',
  'Cloudflare',
  'Notion',
  'GitHub',
  'React',
  'Firebase',
  'セキュリティ',
  'ローカルLLM',
  '自動化'
]);

export function listQueuedNotionItems({ limit = 20, statuses = ['queued', 'failed'] } = {}) {
  const db = getDb();
  const normalizedStatuses = Array.isArray(statuses) && statuses.length > 0
    ? statuses
    : ['queued', 'failed'];
  const params = {
    limit: normalizeLimit(limit, 50, 20)
  };
  const placeholders = normalizedStatuses.map((_, index) => `@status${index}`);

  for (const [index, value] of normalizedStatuses.entries()) {
    params[`status${index}`] = value;
  }

  return db.prepare(`
    SELECT
      nq.id,
      nq.article_id,
      nq.type,
      nq.status,
      nq.notion_page_id,
      nq.created_at,
      nq.synced_at,
      a.title,
      a.url,
      a.source
    FROM notion_queue nq
    INNER JOIN articles a ON a.id = nq.article_id
    WHERE nq.type = 'try_later'
      AND nq.status IN (${placeholders.join(', ')})
    ORDER BY datetime(nq.created_at) ASC, nq.id ASC
    LIMIT @limit
  `).all(params);
}

export async function syncNotionQueueItem(queueId) {
  const queueItem = getQueueItemById(queueId);
  if (!queueItem) {
    const error = new Error('Notion queue item not found.');
    error.status = 404;
    throw error;
  }

  if (queueItem.type !== 'try_later') {
    const error = new Error('Only try_later items can be synced to Notion.');
    error.status = 400;
    throw error;
  }

  assertNotionConfig();

  const article = getArticle(queueItem.article_id);
  if (!article) {
    const error = new Error('Article not found for queue item.');
    error.status = 404;
    throw error;
  }

  const syncedAt = new Date().toISOString();
  const payload = buildNotionCreatePagePayload(article, syncedAt);

  try {
    const response = await fetch(`${NOTION_API_BASE_URL}/pages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.NOTION_API_KEY}`,
        'Content-Type': 'application/json',
        'Notion-Version': NOTION_VERSION
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      markQueueItemFailed(queueId);
      const error = new Error(data.message || `Notion API request failed with HTTP ${response.status}`);
      error.status = response.status >= 400 && response.status < 500 ? 400 : 502;
      error.details = data;
      throw error;
    }

    markQueueItemSynced(queueId, data.id, syncedAt);
    return {
      queue_item: getQueueItemById(queueId),
      notion_page: {
        id: data.id,
        url: data.url
      }
    };
  } catch (error) {
    if (!error.details) {
      markQueueItemFailed(queueId);
    }

    throw error;
  }
}

function buildNotionCreatePagePayload(article, syncedAt) {
  const tags = filterAllowedTags(article.tags);
  const summaryText = article.summary_short || article.raw_excerpt || '';
  const properties = {
    タイトル: {
      title: toRichTextArray(article.title, 2000)
    },
    URL: {
      url: article.url
    },
    ステータス: {
      select: {
        name: '試したい'
      }
    },
    優先度: {
      select: {
        name: toPriorityLabel(article.priority)
      }
    },
    分野: {
      multi_select: tags.map((tag) => ({ name: tag }))
    },
    要約: {
      rich_text: toRichTextArray(summaryText, 2000)
    },
    自分に関係ある理由: {
      rich_text: toRichTextArray(article.relevance || '', 2000)
    },
    登録日: {
      date: {
        start: syncedAt
      }
    },
    情報源: {
      select: {
        name: toSourceLabel(article.source)
      }
    },
    元記事ID: {
      rich_text: toRichTextArray(String(article.id), 100)
    }
  };

  return {
    parent: {
      database_id: process.env.NOTION_DATABASE_ID
    },
    properties
  };
}

function toRichTextArray(value, limit) {
  const trimmed = truncateText(String(value || '').trim(), limit);
  if (!trimmed) {
    return [];
  }

  return [
    {
      text: {
        content: trimmed
      }
    }
  ];
}

function filterAllowedTags(tags) {
  if (!Array.isArray(tags)) {
    return [];
  }

  return tags
    .map((tag) => String(tag).trim())
    .filter((tag) => ALLOWED_TAGS.has(tag))
    .slice(0, 20);
}

function toSourceLabel(source) {
  const labels = {
    manual: '手動登録',
    zenn: 'Zenn',
    qiita: 'Qiita',
    github_blog: 'GitHub',
    openai_blog: 'OpenAI Blog',
    itmedia_news: 'ITmedia NEWS',
    itmedia_ai: 'ITmedia AI+',
    codezine: 'CodeZine',
    yahoo_news_it_topics: 'Yahoo!ニュース IT',
    yahoo_news_it: 'Yahoo!ニュース IT',
    forest_watch: '窓の杜',
    gigazine: 'GIGAZINE',
    unity_blog: 'Blog',
    cloudflare_blog: 'Cloudflare Blog'
  };

  return labels[source] || 'Blog';
}

function toPriorityLabel(priority) {
  const numericPriority = Number(priority);
  if (!Number.isFinite(numericPriority)) return '中';
  if (numericPriority >= 4) return '高';
  if (numericPriority >= 2) return '中';
  return '低';
}

function getQueueItemById(queueId) {
  const db = getDb();
  return db.prepare(`
    SELECT
      id,
      article_id,
      type,
      status,
      notion_page_id,
      created_at,
      synced_at
    FROM notion_queue
    WHERE id = @id
  `).get({ id: queueId });
}

function markQueueItemSynced(queueId, notionPageId, syncedAt) {
  const db = getDb();
  db.prepare(`
    UPDATE notion_queue
    SET status = 'synced',
        notion_page_id = @notion_page_id,
        synced_at = @synced_at
    WHERE id = @id
  `).run({
    id: queueId,
    notion_page_id: notionPageId,
    synced_at: syncedAt
  });
}

function markQueueItemFailed(queueId) {
  const db = getDb();
  db.prepare(`
    UPDATE notion_queue
    SET status = 'failed'
    WHERE id = @id
  `).run({ id: queueId });
}

function assertNotionConfig() {
  if (!process.env.NOTION_API_KEY) {
    const error = new Error('NOTION_API_KEY is not configured.');
    error.status = 400;
    throw error;
  }

  if (!process.env.NOTION_DATABASE_ID) {
    const error = new Error('NOTION_DATABASE_ID is not configured.');
    error.status = 400;
    throw error;
  }
}

function truncateText(value, maxLength) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 3)}...`;
}

function normalizeLimit(value, max, fallback) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(parsed, max);
}
