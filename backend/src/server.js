import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDb } from './db/database.js';
import { articlesRouter } from './routes/articles.js';
import { jobsRouter } from './routes/jobs.js';
import { notionRouter } from './routes/notion.js';
import { rssRouter } from './routes/rss.js';

const app = express();
const port = Number(process.env.BACKEND_PORT || 3000);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDistPath = process.env.FRONTEND_DIST_PATH
  ? path.resolve(process.env.FRONTEND_DIST_PATH)
  : path.resolve(__dirname, '../../frontend/dist');
const frontendIndexPath = path.join(frontendDistPath, 'index.html');

initDb();

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    service: 'tech-catchup-backend',
    time: new Date().toISOString()
  });
});

app.use('/api/articles', articlesRouter);
app.use('/api/jobs', jobsRouter);
app.use('/api/notion', notionRouter);
app.use('/api/rss', rssRouter);

app.use(express.static(frontendDistPath, { index: false }));

app.use((req, res) => {
  const isApiRequest = req.path === '/api' || req.path.startsWith('/api/');

  if (!isApiRequest) {
    return res.sendFile(frontendIndexPath, (error) => {
      if (error) {
        res.status(404).json({ error: 'Frontend build not found.' });
      }
    });
  }

  res.status(404).json({ error: 'Not found.' });
});

app.use((error, req, res, next) => {
  const status = error.status || 500;
  res.status(status).json({
    error: error.message || 'Internal server error.',
    article: error.article
  });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Backend API listening on port ${port}`);
});
