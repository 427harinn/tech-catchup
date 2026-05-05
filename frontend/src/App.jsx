import React, { useEffect, useState } from 'react';
import { RefreshCcw, Rss } from 'lucide-react';
import { ArticleCard } from './components/ArticleCard.jsx';
import { ArticleForm } from './components/ArticleForm.jsx';
import {
  createFetchAndSummarizeJob,
  createSummarizeLinkJob,
  fetchArticles,
  fetchLatestFetchAndSummarizeJob,
  fetchLatestSummarizeLinkJob,
  sendReaction
} from './api/client.js';

const filters = [
  { key: 'all', label: 'すべて' },
  { key: 'new', label: '未要約' },
  { key: 'summarized', label: '要約済み' },
  { key: 'saved', label: '保存済み' }
];

const ACTIVE_JOB_STATUSES = new Set(['queued', 'running']);

export function App() {
  const [articles, setArticles] = useState([]);
  const [filter, setFilter] = useState('all');
  const [form, setForm] = useState({ url: '', title: '', memo: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fetchingRss, setFetchingRss] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [latestJob, setLatestJob] = useState(null);
  const [latestLinkJob, setLatestLinkJob] = useState(null);

  useEffect(() => {
    loadArticles(filter);
  }, [filter]);

  useEffect(() => {
    loadLatestJob();
    loadLatestLinkJob();
  }, []);

  useEffect(() => {
    if (!latestJob || !ACTIVE_JOB_STATUSES.has(latestJob.status)) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      loadLatestJob({ silent: true });
    }, 4000);

    return () => window.clearInterval(timer);
  }, [latestJob?.id, latestJob?.status]);

  useEffect(() => {
    if (!latestLinkJob || !ACTIVE_JOB_STATUSES.has(latestLinkJob.status)) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      loadLatestLinkJob({ silent: true });
    }, 4000);

    return () => window.clearInterval(timer);
  }, [latestLinkJob?.id, latestLinkJob?.status]);

  async function loadArticles(nextFilter = filter) {
    setLoading(true);
    setError('');

    try {
      const data = await fetchArticles(nextFilter);
      setArticles(data.articles);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadLatestJob({ silent = false } = {}) {
    try {
      const data = await fetchLatestFetchAndSummarizeJob();
      const nextJob = data.job || null;
      const previousStatus = latestJob?.status;

      setLatestJob(nextJob);

      if (silent && previousStatus && previousStatus !== nextJob?.status && nextJob) {
        setMessage(toJobStatusMessage(nextJob));
        if (nextJob.status === 'succeeded' || nextJob.status === 'skipped') {
          await loadArticles();
        }
      }
    } catch (requestError) {
      if (!silent) {
        setError(requestError.message);
      }
    }
  }

  async function loadLatestLinkJob({ silent = false } = {}) {
    try {
      const data = await fetchLatestSummarizeLinkJob();
      const nextJob = data.job || null;
      const previousStatus = latestLinkJob?.status;

      setLatestLinkJob(nextJob);

      if (silent && previousStatus && previousStatus !== nextJob?.status && nextJob) {
        setMessage(toLinkJobStatusMessage(nextJob));
        if (nextJob.status === 'succeeded') {
          await loadArticles();
        }
      }
    } catch (requestError) {
      if (!silent) {
        setError(requestError.message);
      }
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');

    try {
      const result = await createSummarizeLinkJob(form);
      setLatestLinkJob(result.job || null);
      setForm({ url: '', title: '', memo: '' });
      setMessage(toLinkJobCreationMessage(result));
      await loadLatestLinkJob({ silent: true });
    } catch (requestError) {
      if (requestError.status === 409 && requestError.data?.job) {
        setLatestLinkJob(requestError.data.job);
        setMessage('URL要約ジョブはすでに待機中または実行中です。');
      } else {
        setError(requestError.message);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleReaction(articleId, reaction) {
    setError('');
    setMessage('');

    try {
      const result = await sendReaction(articleId, reaction);
      setMessage(toReactionMessage(reaction, result.notion_sync));
      await loadArticles();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function handleFetchRss() {
    setFetchingRss(true);
    setError('');
    setMessage('');

    try {
      const result = await createFetchAndSummarizeJob();
      setLatestJob(result.job || null);
      setMessage(toJobCreationMessage(result));
      await loadLatestJob({ silent: true });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setFetchingRss(false);
    }
  }

  const hasActiveJob = ACTIVE_JOB_STATUSES.has(latestJob?.status);

  return (
    <main className="app">
      <header className="app__header">
        <div className="app__header-copy">
          <p>Tech Catchup</p>
          <h1>毎日の技術キャッチアップを、あとで使える形に。</h1>
        </div>

        <button
          type="button"
          className="app__rss-button"
          onClick={handleFetchRss}
          disabled={fetchingRss || hasActiveJob}
        >
          {fetchingRss || hasActiveJob
            ? <RefreshCcw size={18} className="spin" />
            : <Rss size={18} />}
          {fetchingRss
            ? '登録中'
            : hasActiveJob
              ? '取得＆要約中'
              : '取得＆要約'}
        </button>
      </header>

      <ArticleForm
        form={form}
        saving={saving}
        onChange={setForm}
        onSubmit={handleSubmit}
      />

      <section className="toolbar" aria-label="記事フィルタ">
        {filters.map((item) => (
          <button
            key={item.key}
            type="button"
            className={filter === item.key ? 'is-active' : ''}
            onClick={() => setFilter(item.key)}
          >
            {item.label}
          </button>
        ))}
      </section>

      {latestJob && (
        <div className={`notice ${latestJob.status === 'failed' ? 'notice--error' : ''}`}>
          {toJobStatusMessage(latestJob)}
        </div>
      )}

      {latestLinkJob && (
        <div className={`notice ${latestLinkJob.status === 'failed' ? 'notice--error' : ''}`}>
          {toLinkJobStatusMessage(latestLinkJob)}
        </div>
      )}

      {(message || error) && (
        <div className={error ? 'notice notice--error' : 'notice'}>
          {error || message}
        </div>
      )}

      <section className="article-list" aria-live="polite">
        {loading && <div className="empty-state">読み込み中です</div>}

        {!loading && articles.length === 0 && (
          <div className="empty-state">まだ記事がありません</div>
        )}

        {!loading && articles.map((article) => (
          <ArticleCard
            key={article.id}
            article={article}
            onReacting={handleReaction}
          />
        ))}
      </section>
    </main>
  );
}

function toReactionMessage(reaction, notionSync) {
  if (reaction === 'try_later' && notionSync?.attempted) {
    if (notionSync.succeeded) return '試したいに保存し、Notion へ同期しました';
    return notionSync.message || 'Notion 同期に失敗しましたが、あとで再実行できます';
  }

  if (reaction === 'interested') return '興味ありとして保存しました';
  if (reaction === 'not_interested') return '興味なしとして保存しました';
  if (reaction === 'read_later') return 'あとで読むに保存しました';
  if (reaction === 'try_later') return '試したいに保存しました';
  return '保存しました';
}

function toLinkJobCreationMessage(result) {
  const notification = result.notification;

  if (!result.created) {
    if (notification?.attempted && !notification.succeeded) {
      return `URL要約ジョブはすでに待機中または実行中です。runner 通知: ${notification.message}`;
    }

    return 'URL要約ジョブはすでに待機中または実行中です。';
  }

  if (notification?.attempted && notification.succeeded) {
    return 'URL要約ジョブを登録し、runner に通知しました。';
  }

  if (notification?.attempted && !notification.succeeded) {
    return `URL要約ジョブを登録しました。runner 通知に失敗したため queued のままです: ${notification.message}`;
  }

  return 'URL要約ジョブを登録しました。';
}

function toJobCreationMessage(result) {
  const notification = result.notification;

  if (!result.created) {
    if (notification?.attempted && !notification.succeeded) {
      return `取得＆要約ジョブはすでに待機中または実行中です。runner 通知: ${notification.message}`;
    }

    return '取得＆要約ジョブはすでに待機中または実行中です。';
  }

  if (notification?.attempted && notification.succeeded) {
    return '取得＆要約ジョブを登録し、runner に通知しました。';
  }

  if (notification?.attempted && !notification.succeeded) {
    return `取得＆要約ジョブを登録しました。runner 通知に失敗したため queued のままです: ${notification.message}`;
  }

  return '取得＆要約ジョブを登録しました。';
}

function toLinkJobStatusMessage(job) {
  const result = job.result_json || null;

  if (job.status === 'queued') {
    return `URL要約ジョブ #${job.id} は待機中です。`;
  }

  if (job.status === 'running') {
    return `URL要約ジョブ #${job.id} を実行中です。`;
  }

  if (job.status === 'failed') {
    return `URL要約ジョブ #${job.id} は失敗しました。${job.error_message || ''}`.trim();
  }

  if (job.status === 'needs_manual_text') {
    return `URL要約ジョブ #${job.id} は本文確認ができませんでした。後で本文貼り付け対応に回せます。`;
  }

  if (job.status === 'succeeded') {
    const articleId = result?.article_id;
    return articleId
      ? `URL要約が完了しました。article_id=${articleId}`
      : 'URL要約が完了しました。';
  }

  return `URL要約ジョブ #${job.id} の状態: ${job.status}`;
}

function toJobStatusMessage(job) {
  const result = job.result_json || null;

  if (job.status === 'queued') {
    return `取得＆要約ジョブ #${job.id} は待機中です。`;
  }

  if (job.status === 'running') {
    return `取得＆要約ジョブ #${job.id} を実行中です。`;
  }

  if (job.status === 'failed') {
    return `取得＆要約ジョブ #${job.id} は失敗しました。${job.error_message || ''}`.trim();
  }

  if (job.status === 'skipped') {
    return buildJobResultMessage(job, result, '取得＆要約ジョブはスキップされました。');
  }

  if (job.status === 'succeeded') {
    return buildJobResultMessage(job, result, '取得＆要約が完了しました。');
  }

  return `取得＆要約ジョブ #${job.id} の状態: ${job.status}`;
}

function buildJobResultMessage(job, result, prefix) {
  if (!result) {
    return `${prefix} ジョブ #${job.id}`;
  }

  return `${prefix} attempted=${result.attempted} succeeded=${result.succeeded} failed=${result.failed}`;
}
