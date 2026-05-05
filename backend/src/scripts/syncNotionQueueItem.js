import 'dotenv/config';
import { initDb } from '../db/database.js';
import { syncNotionQueueItem } from '../services/notionService.js';

const [, , queueId] = process.argv;

if (!queueId) {
  console.error('Usage: npm run notion:sync -- <queueId>');
  process.exit(1);
}

initDb();

try {
  const result = await syncNotionQueueItem(Number(queueId));
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    error: error.message,
    details: error.details || null
  }, null, 2));
  process.exit(1);
}
