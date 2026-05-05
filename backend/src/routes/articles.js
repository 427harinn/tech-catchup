import express from 'express';
import {
  createArticle,
  createReaction,
  getArticle,
  listArticles
} from '../services/articlesService.js';

export const articlesRouter = express.Router();

articlesRouter.get('/', (req, res) => {
  const { status, saved } = req.query;
  res.json({
    articles: listArticles({
      status: status || undefined,
      saved: saved === 'true'
    })
  });
});

articlesRouter.post('/', (req, res, next) => {
  try {
    const article = createArticle(req.body);
    res.status(201).json({ article });
  } catch (error) {
    next(error);
  }
});

articlesRouter.get('/:id', (req, res) => {
  const article = getArticle(Number(req.params.id));
  if (!article) {
    res.status(404).json({ error: 'Article not found.' });
    return;
  }

  res.json({ article });
});

articlesRouter.post('/:id/reactions', (req, res, next) => {
  try {
    const article = createReaction(Number(req.params.id), req.body.reaction);
    res.status(201).json({ article });
  } catch (error) {
    next(error);
  }
});

