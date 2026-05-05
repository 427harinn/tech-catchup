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
  ensureSchemaMigrations(database);
  seedInterestWeights(database);
}

function ensureSchemaMigrations(database) {
  ensureColumn(database, 'articles', 'archived_at', 'TEXT');
  database.exec('CREATE INDEX IF NOT EXISTS idx_articles_archived_at ON articles(archived_at)');
  ensureJobsTableSchema(database);
}

function ensureColumn(database, tableName, columnName, columnDefinition) {
  const columns = database.prepare(`PRAGMA table_info(${tableName})`).all();
  const exists = columns.some((column) => column.name === columnName);

  if (!exists) {
    database.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`);
  }
}

function ensureJobsTableSchema(database) {
  const columns = database.prepare('PRAGMA table_info(jobs)').all();
  const hasPayloadJson = columns.some((column) => column.name === 'payload_json');

  if (hasPayloadJson) {
    return;
  }

  database.exec(`
    CREATE TABLE IF NOT EXISTS jobs_next (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'skipped', 'needs_manual_text')),
      requested_at TEXT NOT NULL,
      started_at TEXT,
      finished_at TEXT,
      payload_json TEXT,
      result_json TEXT,
      error_message TEXT
    );
  `);

  database.exec(`
    INSERT INTO jobs_next (
      id,
      type,
      status,
      requested_at,
      started_at,
      finished_at,
      result_json,
      error_message
    )
    SELECT
      id,
      type,
      status,
      requested_at,
      started_at,
      finished_at,
      result_json,
      error_message
    FROM jobs;
  `);

  database.exec('DROP TABLE jobs');
  database.exec('ALTER TABLE jobs_next RENAME TO jobs');
  database.exec('CREATE INDEX IF NOT EXISTS idx_jobs_type_requested_at ON jobs(type, requested_at DESC)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_jobs_type_status ON jobs(type, status)');
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

