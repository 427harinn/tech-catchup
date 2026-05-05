import express from 'express';
import { listQueuedNotionItems, syncNotionQueueItem } from '../services/notionService.js';

export const notionRouter = express.Router();

notionRouter.get('/queue', (req, res) => {
  const { limit } = req.query;
  const items = listQueuedNotionItems({ limit: limit || 20 });
  res.json({
    items,
    count: items.length
  });
});

notionRouter.post('/queue/:id/sync', async (req, res, next) => {
  try {
    const result = await syncNotionQueueItem(Number(req.params.id));
    res.json(result);
  } catch (error) {
    next(error);
  }
});
