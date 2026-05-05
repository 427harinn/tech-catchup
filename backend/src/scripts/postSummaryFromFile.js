import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';

const [, , articleId, filePath] = process.argv;

if (!articleId) {
  console.error('Usage: npm run summary:post -- <articleId> [jsonFilePath|-]');
  process.exit(1);
}

const raw = readInput(filePath);
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

function readInput(inputPath) {
  if (inputPath === '-') {
    return fs.readFileSync(0, 'utf8');
  }

  const resolvedPath = resolveInputPath(inputPath);
  return fs.readFileSync(resolvedPath, 'utf8');
}

function resolveInputPath(inputPath) {
  if (!inputPath) {
    return path.resolve('src/scripts/sample-summary-ja.json');
  }

  const normalized = inputPath.replace(/\\/g, '/');
  const candidates = [
    path.resolve(inputPath),
    path.resolve(normalized.replace(/^backend\//, '')),
    path.resolve(path.basename(normalized))
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  console.error(`Summary JSON file not found: ${inputPath}`);
  process.exit(1);
}
