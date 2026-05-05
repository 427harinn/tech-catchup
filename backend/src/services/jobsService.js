import { getDb } from '../db/database.js';

export const JOB_TYPES = {
  fetchAndSummarize: 'fetch_and_summarize',
  summarizeLink: 'summarize_link'
};

const ACTIVE_JOB_STATUSES = ['queued', 'running'];
const FINAL_JOB_STATUSES = ['succeeded', 'failed', 'skipped'];

export function createFetchAndSummarizeJob() {
  return createJob(JOB_TYPES.fetchAndSummarize);
}

export function getLatestFetchAndSummarizeJob() {
  return getLatestJobByType(JOB_TYPES.fetchAndSummarize);
}

export function getNextFetchAndSummarizeJob() {
  return getNextQueuedJobByType(JOB_TYPES.fetchAndSummarize);
}

export function createJob(type) {
  const existing = getActiveJob(type);

  if (existing) {
    return {
      created: false,
      job: existing
    };
  }

  const db = getDb();
  const now = new Date().toISOString();
  const result = db.prepare(`
    INSERT INTO jobs (
      type,
      status,
      requested_at
    )
    VALUES (
      @type,
      'queued',
      @requested_at
    )
  `).run({
    type,
    requested_at: now
  });

  return {
    created: true,
    job: getJobById(Number(result.lastInsertRowid))
  };
}

export function startJob(jobId) {
  const job = getJobById(jobId);
  assertJobExists(job);

  if (job.status !== 'queued') {
    const error = new Error('Only queued jobs can be started.');
    error.status = 409;
    throw error;
  }

  const db = getDb();
  const result = db.prepare(`
    UPDATE jobs
    SET status = 'running',
        started_at = @started_at,
        finished_at = NULL,
        error_message = NULL
    WHERE id = @id
      AND status = 'queued'
  `).run({
    id: jobId,
    started_at: new Date().toISOString()
  });

  if (result.changes === 0) {
    const error = new Error('Job is no longer queued.');
    error.status = 409;
    throw error;
  }

  return getJobById(jobId);
}

export function completeJob(jobId, { status = 'succeeded', resultJson = null } = {}) {
  if (!FINAL_JOB_STATUSES.includes(status)) {
    const error = new Error('Invalid completion status.');
    error.status = 400;
    throw error;
  }

  const job = getJobById(jobId);
  assertJobExists(job);

  if (job.status !== 'running' && job.status !== 'queued') {
    const error = new Error('Only queued or running jobs can be completed.');
    error.status = 409;
    throw error;
  }

  const db = getDb();
  db.prepare(`
    UPDATE jobs
    SET status = @status,
        finished_at = @finished_at,
        result_json = @result_json,
        error_message = NULL
    WHERE id = @id
  `).run({
    id: jobId,
    status,
    finished_at: new Date().toISOString(),
    result_json: resultJson ? JSON.stringify(resultJson) : null
  });

  return getJobById(jobId);
}

export function failJob(jobId, message) {
  const job = getJobById(jobId);
  assertJobExists(job);

  if (job.status !== 'running' && job.status !== 'queued') {
    const error = new Error('Only queued or running jobs can be failed.');
    error.status = 409;
    throw error;
  }

  const db = getDb();
  db.prepare(`
    UPDATE jobs
    SET status = 'failed',
        finished_at = @finished_at,
        error_message = @error_message
    WHERE id = @id
  `).run({
    id: jobId,
    finished_at: new Date().toISOString(),
    error_message: String(message || 'Unknown job failure.')
  });

  return getJobById(jobId);
}

function getActiveJob(type) {
  const db = getDb();
  const placeholders = ACTIVE_JOB_STATUSES.map((_, index) => `@status${index}`).join(', ');
  const params = { type };

  for (const [index, status] of ACTIVE_JOB_STATUSES.entries()) {
    params[`status${index}`] = status;
  }

  const job = db.prepare(`
    SELECT *
    FROM jobs
    WHERE type = @type
      AND status IN (${placeholders})
    ORDER BY datetime(requested_at) DESC, id DESC
    LIMIT 1
  `).get(params);

  return parseJob(job);
}

function getLatestJobByType(type) {
  const db = getDb();
  const job = db.prepare(`
    SELECT *
    FROM jobs
    WHERE type = @type
    ORDER BY datetime(requested_at) DESC, id DESC
    LIMIT 1
  `).get({ type });

  return parseJob(job);
}

function getNextQueuedJobByType(type) {
  const db = getDb();
  const job = db.prepare(`
    SELECT *
    FROM jobs
    WHERE type = @type
      AND status = 'queued'
    ORDER BY datetime(requested_at) ASC, id ASC
    LIMIT 1
  `).get({ type });

  return parseJob(job);
}

function getJobById(id) {
  const db = getDb();
  const job = db.prepare(`
    SELECT *
    FROM jobs
    WHERE id = @id
  `).get({ id });

  return parseJob(job);
}

function assertJobExists(job) {
  if (!job) {
    const error = new Error('Job not found.');
    error.status = 404;
    throw error;
  }
}

function parseJob(job) {
  if (!job) {
    return null;
  }

  return {
    ...job,
    result_json: parseJsonValue(job.result_json, null)
  };
}

function parseJsonValue(value, fallback) {
  if (value == null) {
    return fallback;
  }

  if (typeof value !== 'string') {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}
