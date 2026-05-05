import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const databasePath = process.env.DATABASE_PATH || '/app/data/app.db';
const schemaPath = path.join(__dirname, 'schema.sql');

let db;

export function getDb() {
  if (!db) {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
    db = new Database(databasePath);
    db.pragma('foreign_keys = ON');
  }

  return db;
}

export function initDb() {
  const database = getDb();
  const schema = fs.readFileSync(schemaPath, 'utf8');
  database.exec(schema);
  seedInterestWeights(database);
}

function seedInterestWeights(database) {
  const now = new Date().toISOString();
  const tags = [
    ['AI活用', 95],
    ['アバター', 95],
    ['業務システム', 90],
    ['Unity', 85],
    ['Webアプリ', 85],
    ['自動化', 85],
    ['Cloudflare', 75],
    ['Notion', 70],
    ['GitHub', 75],
    ['3D / Blender', 80],
    ['ローカルLLM', 80],
    ['セキュリティ', 65],
    ['React', 70],
    ['Firebase', 65],
    ['RSS', 70]
  ];

  const insert = database.prepare(`
    INSERT INTO interest_weights (tag, weight, updated_at)
    VALUES (@tag, @weight, @updated_at)
    ON CONFLICT(tag) DO NOTHING
  `);

  const tx = database.transaction(() => {
    for (const [tag, weight] of tags) {
      insert.run({ tag, weight, updated_at: now });
    }
  });

  tx();
}

