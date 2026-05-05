import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import morgan from 'morgan';
import { initDb } from './db/database.js';
import { articlesRouter } from './routes/articles.js';

const app = express();
const port = Number(process.env.BACKEND_PORT || 3000);

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

app.use((req, res) => {
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
