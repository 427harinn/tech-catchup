import 'dotenv/config';
import { initDb } from '../db/database.js';
import { fetchAllRssSources } from '../services/rssService.js';

initDb();

const summary = await fetchAllRssSources();
console.log(JSON.stringify(summary, null, 2));

