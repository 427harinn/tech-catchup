import express from 'express';
import {
  createArticle,
  markArticleSummaryFailed,
  createReaction,
  getArticle,
  listArticles,
  listUnsummarizedArticles,
  saveSummary
} from '../services/articlesService.js';
import { syncNotionQueueItem } from '../services/notionService.js';

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

articlesRouter.get('/unsummarized', (req, res) => {
  const { limit, include_failed } = req.query;
  const articles = listUnsummarizedArticles({
    limit: limit || 5,
    includeFailed: include_failed !== 'false'
  });

  res.json({
    articles,
    count: articles.length
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

articlesRouter.post('/:id/summary', (req, res, next) => {
  try {
    const articleId = Number(req.params.id);
    const status = req.body.status;

    const article = status === 'failed'
      ? markArticleSummaryFailed(articleId)
      : saveSummary(articleId, req.body);

    res.status(201).json({ article });
  } catch (error) {
    next(error);
  }
});

articlesRouter.post('/:id/reactions', async (req, res, next) => {
  try {
    const reaction = req.body.reaction;
    const { article, notionQueueItemId } = createReaction(Number(req.params.id), reaction);

    if (reaction !== 'try_later' || !notionQueueItemId) {
      res.status(201).json({ article });
      return;
    }

    try {
      const notionResult = await syncNotionQueueItem(notionQueueItemId);
      res.status(201).json({
        article: getArticle(Number(req.params.id)),
        notion_sync: {
          attempted: true,
          succeeded: true,
          queue_item: notionResult.queue_item,
          notion_page: notionResult.notion_page
        }
      });
    } catch (error) {
      console.error('Immediate Notion sync failed', {
        articleId: Number(req.params.id),
        queueItemId: notionQueueItemId,
        message: error.message
      });

      res.status(201).json({
        article: getArticle(Number(req.params.id)),
        notion_sync: {
          attempted: true,
          succeeded: false,
          queue_item_id: notionQueueItemId,
          message: 'Notion同期に失敗しましたが、あとで再同期できます。'
        }
      });
    }
  } catch (error) {
    next(error);
  }
});
