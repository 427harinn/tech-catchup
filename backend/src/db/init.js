import 'dotenv/config';
import { initDb } from './database.js';

initDb();
console.log('SQLite database initialized.');

