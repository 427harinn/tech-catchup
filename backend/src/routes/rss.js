import express from 'express';
import { fetchAllRssSources, getRssSources } from '../services/rssService.js';

export const rssRouter = express.Router();

rssRouter.get('/sources', (req, res) => {
  res.json({ sources: getRssSources() });
});

rssRouter.post('/fetch', async (req, res, next) => {
  try {
    const summary = await fetchAllRssSources();
    res.json(summary);
  } catch (error) {
    next(error);
  }
});

