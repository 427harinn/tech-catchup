import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';

const [, , articleId, filePath] = process.argv;

if (!articleId) {
  console.error('Usage: npm run summary:post -- <articleId> [jsonFilePath]');
  process.exit(1);
}

const resolvedPath = filePath
  ? path.resolve(filePath)
  : path.resolve('src/scripts/sample-summary-ja.json');

const raw = fs.readFileSync(resolvedPath, 'utf8');
const payload = JSON.parse(raw);
const baseUrl = process.env.SUMMARY_API_BASE_URL || 'http://localhost:3000';
const response = await fetch(`${baseUrl}/api/articles/${articleId}/summary`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json; charset=utf-8'
  },
  body: JSON.stringify(payload)
});

const data = await response.json().catch(() => ({}));

if (!response.ok) {
  console.error(JSON.stringify(data, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(data, null, 2));

