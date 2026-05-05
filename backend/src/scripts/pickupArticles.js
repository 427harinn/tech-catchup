import 'dotenv/config';
import { initDb } from '../db/database.js';
import { pickupArticles } from '../services/articlePickupService.js';

initDb();

const args = process.argv.slice(2);
const limit = readNumericOption(args, '--limit');
const includeFailed = args.includes('--include-failed');

const result = pickupArticles({
  limit,
  includeFailed
});

console.log(JSON.stringify(result, null, 2));

function readNumericOption(values, name) {
  const index = values.indexOf(name);
  if (index < 0 || index === values.length - 1) {
    return undefined;
  }

  const parsed = Number(values[index + 1]);
  return Number.isFinite(parsed) ? parsed : undefined;
}
