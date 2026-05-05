import Parser from 'rss-parser';
import { getEnabledRssSources, listRssSources } from '../config/rssSources.js';
import { createArticleIfNotExists } from './articlesService.js';

const parser = new Parser({
  customFields: {
    item: ['content:encoded', 'summary']
  }
});

const DEFAULT_TIMEOUT_MS = Number(process.env.RSS_FETCH_TIMEOUT_MS || 15000);
const DEFAULT_MAX_ITEMS_PER_SOURCE = Number(process.env.RSS_MAX_ITEMS_PER_SOURCE || 15);

export function getRssSources() {
  return listRssSources();
}

export async function fetchAllRssSources() {
  const enabledSources = getEnabledRssSources();
  const startedAt = new Date().toISOString();
  const results = [];
  const totals = {
    sources: enabledSources.length,
    fetched: 0,
    created: 0,
    skipped: 0,
    failed: 0
  };

  for (const source of enabledSources) {
    const sourceResult = await fetchSingleSource(source);
    results.push(sourceResult);

    totals.fetched += sourceResult.fetched;
    totals.created += sourceResult.created;
    totals.skipped += sourceResult.skipped;
    if (sourceResult.error) totals.failed += 1;
  }

  return {
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    totals,
    results
  };
}

async function fetchSingleSource(source) {
  try {
    const xml = await fetchFeedXml(source.url);
    const parsed = await parser.parseString(xml);
    const items = Array.isArray(parsed.items) ? parsed.items.slice(0, DEFAULT_MAX_ITEMS_PER_SOURCE) : [];

    let created = 0;
    let skipped = 0;

    for (const item of items) {
      const normalized = normalizeFeedItem(item, source);
      if (!normalized.url) {
        skipped += 1;
        continue;
      }

      const result = createArticleIfNotExists(normalized);
      if (result.created) {
        created += 1;
      } else {
        skipped += 1;
      }
    }

    return {
      source_id: source.id,
      source_name: source.name,
      feed_url: source.url,
      fetched: items.length,
      created,
      skipped,
      error: null
    };
  } catch (error) {
    return {
      source_id: source.id,
      source_name: source.name,
      feed_url: source.url,
      fetched: 0,
      created: 0,
      skipped: 0,
      error: error.message
    };
  }
}

async function fetchFeedXml(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'tech-catchup-rss-fetcher/0.1'
      }
    });

    if (!response.ok) {
      throw new Error(`Feed request failed with HTTP ${response.status}`);
    }

    return await response.text();
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`Feed request timed out after ${DEFAULT_TIMEOUT_MS}ms`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeFeedItem(item, source) {
  const url = normalizeUrl(item.link || item.id || '');
  const title = item.title || url;
  const publishedAt = item.isoDate || item.pubDate || null;
  const rawExcerpt = firstNonEmptyString(
    item.contentSnippet,
    item.summary,
    item.content,
    item['content:encoded']
  );

  return {
    title,
    url,
    source: source.id,
    publishedAt,
    fetchedAt: new Date().toISOString(),
    rawExcerpt: rawExcerpt ? truncateText(stripHtml(rawExcerpt), 600) : null
  };
}

function normalizeUrl(url) {
  return String(url || '').trim().replace(/\?utm_[^#]+/g, '').replace(/#.*$/, '');
}

function stripHtml(value) {
  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function truncateText(value, maxLength) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 3)}...`;
}

function firstNonEmptyString(...values) {
  return values.find((value) => typeof value === 'string' && value.trim()) || '';
}
