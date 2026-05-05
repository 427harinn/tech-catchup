import 'dotenv/config';
import { initDb } from '../db/database.js';
import { archiveOldArticles } from '../services/articlesService.js';

initDb();

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const visibleTarget = readNumericOption(args, '--visible-target');

const result = archiveOldArticles({
  dryRun,
  visibleTarget
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
