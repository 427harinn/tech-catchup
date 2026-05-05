import express from 'express';
import {
  JOB_TYPES,
  completeJob,
  createFetchAndSummarizeJob,
  failJob,
  getLatestFetchAndSummarizeJob,
  getNextFetchAndSummarizeJob,
  startJob
} from '../services/jobsService.js';
import { notifyRunnerServer } from '../services/runnerNotificationService.js';

export const jobsRouter = express.Router();

jobsRouter.post('/fetch-and-summarize', async (req, res, next) => {
  try {
    const result = createFetchAndSummarizeJob();
    const notification = await notifyIfNeeded(result.job);

    res.status(result.created ? 201 : 200).json({
      ...result,
      notification
    });
  } catch (error) {
    next(error);
  }
});

jobsRouter.get('/fetch-and-summarize/latest', (req, res, next) => {
  try {
    res.json({
      job: getLatestFetchAndSummarizeJob()
    });
  } catch (error) {
    next(error);
  }
});

jobsRouter.get('/fetch-and-summarize/next', (req, res, next) => {
  try {
    res.json({
      job: getNextFetchAndSummarizeJob()
    });
  } catch (error) {
    next(error);
  }
});

jobsRouter.post('/:id/start', (req, res, next) => {
  try {
    res.json({
      job: startJob(Number(req.params.id))
    });
  } catch (error) {
    next(error);
  }
});

jobsRouter.post('/:id/complete', (req, res, next) => {
  try {
    res.json({
      job: completeJob(Number(req.params.id), {
        status: req.body.status || 'succeeded',
        resultJson: req.body.result_json || null
      })
    });
  } catch (error) {
    next(error);
  }
});

jobsRouter.post('/:id/fail', (req, res, next) => {
  try {
    res.json({
      job: failJob(Number(req.params.id), req.body.error_message)
    });
  } catch (error) {
    next(error);
  }
});

async function notifyIfNeeded(job) {
  if (!job) {
    return {
      attempted: false,
      succeeded: false,
      message: 'No job to notify.'
    };
  }

  if (job.status === 'running') {
    return {
      attempted: false,
      succeeded: true,
      message: 'Job is already running.'
    };
  }

  if (job.type === JOB_TYPES.fetchAndSummarize && job.status === 'queued') {
    return notifyRunnerServer({ jobType: job.type });
  }

  return {
    attempted: false,
    succeeded: false,
    message: `No runner notification handler for job type: ${job.type}`
  };
}
