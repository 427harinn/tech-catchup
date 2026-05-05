import 'dotenv/config';
import { initDb } from '../db/database.js';
import { listQueuedNotionItems, syncNotionQueueItem } from '../services/notionService.js';

const args = process.argv.slice(2);
const limit = parseLimit(args);

initDb();

const items = listQueuedNotionItems({
  limit,
  statuses: ['queued']
});

const summary = {
  requested_limit: limit,
  attempted: items.length,
  succeeded: 0,
  failed: 0,
  results: []
};

for (const item of items) {
  try {
    const result = await syncNotionQueueItem(item.id);
    summary.succeeded += 1;
    summary.results.push({
      queue_id: item.id,
      article_id: item.article_id,
      status: 'synced',
      notion_page_id: result.queue_item.notion_page_id
    });
  } catch (error) {
    summary.failed += 1;
    summary.results.push({
      queue_id: item.id,
      article_id: item.article_id,
      status: 'failed',
      error: error.message
    });
  }
}

console.log(JSON.stringify(summary, null, 2));

function parseLimit(values) {
  const flagIndex = values.findIndex((value) => value === '--limit');
  if (flagIndex === -1) {
    return 5;
  }

  const raw = values[flagIndex + 1];
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return 5;
  }

  return Math.min(parsed, 20);
}
