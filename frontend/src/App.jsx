import React, { useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  Filter,
  LoaderCircle,
  RefreshCcw,
  Rss,
  Search,
  SlidersHorizontal,
  Sparkles,
  X
} from 'lucide-react';
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

const tabs = [
  { key: 'all', label: 'すべて' },
  { key: 'interested', label: '興味あり' },
  { key: 'try_later', label: '@Muse' },
  { key: 'manual', label: '手動登録' }
];

const ACTIVE_JOB_STATUSES = new Set(['queued', 'running']);

export function App() {
  const [articles, setArticles] = useState([]);
  const [activeTab, setActiveTab] = useState('all');
  const [searchText, setSearchText] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [form, setForm] = useState({ url: '', title: '', memo: '', body_text: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fetchingRss, setFetchingRss] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [latestJob, setLatestJob] = useState(null);
  const [latestLinkJob, setLatestLinkJob] = useState(null);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [pendingReactions, setPendingReactions] = useState({});
  const [reactionErrors, setReactionErrors] = useState({});

  useEffect(() => {
    loadArticles();
  }, []);

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

  async function loadArticles() {
    setLoading(true);
    setError('');

    try {
      const data = await fetchArticles({
        status: 'summarized',
        sort: 'updated_desc',
        limit: 60
      });
      setArticles(data.articles || []);
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

      setLatestJob((previousJob) => {
        if (
          silent &&
          previousJob?.status &&
          previousJob.status !== nextJob?.status &&
          nextJob
        ) {
          if (nextJob.status === 'succeeded' || nextJob.status === 'skipped' || nextJob.status === 'failed') {
            if (nextJob.status === 'failed') {
              setError(toFetchJobStatusMessage(nextJob));
            } else {
              setMessage(toFetchJobStatusMessage(nextJob));
            }
            loadArticles();
          }
        }

        return nextJob;
      });
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

      setLatestLinkJob((previousJob) => {
        if (
          silent &&
          previousJob?.status &&
          previousJob.status !== nextJob?.status &&
          nextJob
        ) {
          if (nextJob.status === 'succeeded' || nextJob.status === 'failed' || nextJob.status === 'needs_manual_text') {
            if (nextJob.status === 'failed' || nextJob.status === 'needs_manual_text') {
              setError(toLinkJobStatusMessage(nextJob));
            } else {
              setMessage(toLinkJobStatusMessage(nextJob));
            }
            loadArticles();
          }
        }

        return nextJob;
      });
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
      setForm({ url: '', title: '', memo: '', body_text: '' });
      setIsManualModalOpen(false);
      await loadLatestLinkJob({ silent: true });
    } catch (requestError) {
      if (requestError.status === 409 && requestError.data?.job) {
        setLatestLinkJob(requestError.data.job);
        setError('同じURLの要約がすでに実行中です。完了後に通知します。');
      } else {
        setError(requestError.message);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleReaction(articleId, reaction) {
    const previousArticle = articles.find((article) => article.id === articleId);
    if (!previousArticle) {
      return;
    }

    setError('');
    setMessage('');
    setReactionErrors((current) => ({ ...current, [articleId]: '' }));
    setPendingReactions((current) => ({ ...current, [articleId]: reaction }));

    const optimisticArticle = buildOptimisticArticle(previousArticle, reaction);
    setArticles((current) => current.map((article) => (
      article.id === articleId ? optimisticArticle : article
    )));

    try {
      const result = await sendReaction(articleId, reaction);
      setArticles((current) => current.map((article) => (
        article.id === articleId ? result.article : article
      )));
      setMessage(toReactionMessage(reaction));
    } catch (requestError) {
      setArticles((current) => current.map((article) => (
        article.id === articleId ? previousArticle : article
      )));
      setReactionErrors((current) => ({
        ...current,
        [articleId]: requestError.message || '保存に失敗しました。'
      }));
    } finally {
      setPendingReactions((current) => {
        const next = { ...current };
        delete next[articleId];
        return next;
      });
    }
  }

  async function handleFetchAndSummarize() {
    setFetchingRss(true);
    setError('');
    setMessage('');

    try {
      const result = await createFetchAndSummarizeJob();
      setLatestJob(result.job || null);
      await loadLatestJob({ silent: true });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setFetchingRss(false);
    }
  }

  const visibleArticles = useMemo(() => filterArticles(articles, {
    activeTab,
    searchText,
    priorityFilter,
    sourceFilter
  }), [activeTab, articles, priorityFilter, searchText, sourceFilter]);

  const hasActiveFetchJob = ACTIVE_JOB_STATUSES.has(latestJob?.status);
  const hasActiveJob = hasActiveFetchJob || ACTIVE_JOB_STATUSES.has(latestLinkJob?.status);
  const activeFilterSummary = buildFilterSummary({
    searchText,
    priorityFilter,
    sourceFilter
  });

  return (
    <main className="app-shell">
      {hasActiveJob ? (
        <div className="active-job-indicator" aria-live="polite" aria-label="処理中">
          <LoaderCircle size={16} className="spin" />
        </div>
      ) : null}

      <section className="hero hero--compact">
        <div className="hero__copy">
          <p className="eyebrow">Tech Catchup</p>
          <h1>要約済み記事をすぐ読む</h1>
        </div>

        <button
          type="button"
          className="primary-button primary-button--wide"
          onClick={handleFetchAndSummarize}
          disabled={fetchingRss || hasActiveFetchJob}
        >
          {fetchingRss || hasActiveFetchJob
            ? <RefreshCcw size={18} className="spin" />
            : <Rss size={18} />}
          {fetchingRss ? '受け付け中' : hasActiveFetchJob ? '取得＆要約 実行中' : '取得＆要約'}
        </button>

      </section>

      <div className="quick-tools">
        <button
          type="button"
          className="accordion-card manual-desktop-trigger"
          onClick={() => setIsManualModalOpen(true)}
        >
          <span className="accordion-card__title">
            <Sparkles size={16} />
            手動URL登録
          </span>
        </button>

        <details className="accordion-card manual-mobile-panel">
          <summary>
            <span className="accordion-card__title">
              <Sparkles size={16} />
              手動URL登録
            </span>
            <ChevronDown size={18} className="accordion-card__chevron" />
          </summary>
          <div className="accordion-card__content">
            <ArticleForm
              form={form}
              saving={saving}
              latestLinkJob={latestLinkJob}
              onChange={setForm}
              onSubmit={handleSubmit}
            />
          </div>
        </details>

        <details className="accordion-card">
          <summary>
            <span className="accordion-card__title">
              <Filter size={16} />
              絞り込み
            </span>
            <span className="accordion-card__summary-text">{activeFilterSummary}</span>
            <ChevronDown size={18} className="accordion-card__chevron" />
          </summary>
          <div className="accordion-card__content">
            <div className="filter-grid">
              <label className="field">
                <span>検索</span>
                <div className="field__input">
                  <Search size={16} />
                  <input
                    type="search"
                    value={searchText}
                    onChange={(event) => setSearchText(event.target.value)}
                    placeholder="タイトル / 要約 / 技術ポイント / タグ"
                  />
                </div>
              </label>

              <label className="field">
                <span>優先度</span>
                <div className="field__input field__input--select">
                  <SlidersHorizontal size={16} />
                  <select
                    value={priorityFilter}
                    onChange={(event) => setPriorityFilter(event.target.value)}
                  >
                    <option value="all">すべて</option>
                    <option value="5">高</option>
                    <option value="4">やや高</option>
                    <option value="3">中</option>
                    <option value="2">低</option>
                    <option value="1">控えめ</option>
                  </select>
                </div>
              </label>

              <label className="field">
                <span>情報源</span>
                <div className="field__input field__input--select">
                  <SlidersHorizontal size={16} />
                  <select
                    value={sourceFilter}
                    onChange={(event) => setSourceFilter(event.target.value)}
                  >
                    <option value="all">すべて</option>
                    <option value="manual">手動登録</option>
                    <option value="rss">自動取得</option>
                  </select>
                </div>
              </label>
            </div>
          </div>
        </details>
      </div>

      {isManualModalOpen ? (
        <div className="manual-modal" role="dialog" aria-modal="true">
          <button
            type="button"
            className="manual-modal__backdrop"
            aria-label="Close manual URL form"
            onClick={() => setIsManualModalOpen(false)}
          />
          <div className="manual-modal__panel">
            <button
              type="button"
              className="manual-modal__close"
              aria-label="Close manual URL form"
              onClick={() => setIsManualModalOpen(false)}
            >
              <X size={18} />
            </button>
            <ArticleForm
              form={form}
              saving={saving}
              latestLinkJob={latestLinkJob}
              onChange={setForm}
              onSubmit={handleSubmit}
            />
          </div>
        </div>
      ) : null}

      {(message || error) && (
        <div className={error ? 'toast toast--error' : 'toast'} role={error ? 'alert' : 'status'}>
          <div className="toast__content">
            <strong>{error ? '失敗しました' : '完了しました'}</strong>
            <p>{error || message}</p>
          </div>
          <button
            type="button"
            className="toast__close"
            aria-label="通知を閉じる"
            onClick={() => {
              setMessage('');
              setError('');
            }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      <section className="tab-row tab-row--sticky" role="tablist" aria-label="記事フィルタ">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={activeTab === tab.key ? 'is-active' : ''}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </section>

      <section className="article-list" aria-live="polite">
        {loading && <div className="empty-state"><LoaderCircle size={18} className="spin" /> 読み込み中です</div>}

        {!loading && visibleArticles.length === 0 && (
          <div className="empty-state">条件に合う記事はまだありません。</div>
        )}

        {!loading && visibleArticles.map((article) => (
          <ArticleCard
            key={article.id}
            article={article}
            pendingReaction={pendingReactions[article.id]}
            reactionError={reactionErrors[article.id]}
            onReacting={handleReaction}
          />
        ))}
      </section>
    </main>
  );
}

function filterArticles(articles, { activeTab, searchText, priorityFilter, sourceFilter }) {
  const query = searchText.trim().toLowerCase();

  return articles.filter((article) => {
    if (activeTab === 'interested' && getLatestReaction(article) !== 'interested') {
      return false;
    }

    if (activeTab === 'try_later' && getLatestReaction(article) !== 'try_later') {
      return false;
    }

    if (activeTab === 'manual' && article.source !== 'manual') {
      return false;
    }

    if (priorityFilter !== 'all' && Number(article.priority) !== Number(priorityFilter)) {
      return false;
    }

    if (sourceFilter === 'manual' && article.source !== 'manual') {
      return false;
    }

    if (sourceFilter === 'rss' && article.source === 'manual') {
      return false;
    }

    if (!query) {
      return true;
    }

    const haystack = [
      article.title,
      article.summary_short,
      article.tech_points,
      article.relevance,
      article.next_action,
      Array.isArray(article.tags) ? article.tags.join(' ') : ''
    ].join(' ').toLowerCase();

    return haystack.includes(query);
  });
}

function buildOptimisticArticle(article, reaction) {
  const reactions = Array.isArray(article.reactions) ? [...article.reactions, reaction] : [reaction];
  const notionQueueStatuses = Array.isArray(article.notion_queue_statuses)
    ? [...article.notion_queue_statuses]
    : [];

  return {
    ...article,
    reactions,
    notion_queue_statuses: notionQueueStatuses
  };
}

function getLatestReaction(article) {
  if (!Array.isArray(article.reactions) || article.reactions.length === 0) {
    return null;
  }

  return article.reactions[article.reactions.length - 1] || null;
}

function buildFilterSummary({ searchText, priorityFilter, sourceFilter }) {
  const parts = [];

  if (searchText.trim()) {
    parts.push('検索中');
  }

  if (priorityFilter !== 'all') {
    parts.push(`優先度 ${priorityFilter}`);
  }

  if (sourceFilter === 'manual') {
    parts.push('手動登録のみ');
  }

  if (sourceFilter === 'rss') {
    parts.push('自動取得のみ');
  }

  return parts.length > 0 ? parts.join(' / ') : '未設定';
}

function toReactionMessage(reaction) {
  if (reaction === 'interested') return '興味ありに更新しました。';
  if (reaction === 'not_interested') return '興味なしに更新しました。';
  if (reaction === 'read_later') return 'あとで読むに更新しました。';
  if (reaction === 'try_later') return 'Museにメンションしました。';
  return '保存しました。';
}

function toLinkJobStatusMessage(job) {
  const result = job.result_json || null;

  if (job.status === 'queued') {
    return `URL要約ジョブ #${job.id} は待機中です。`;
  }

  if (job.status === 'running') {
    return `URL要約ジョブ #${job.id} を要約中です。`;
  }

  if (job.status === 'failed') {
    return `URL要約ジョブ #${job.id} は失敗しました。${job.error_message || ''}`.trim();
  }

  if (job.status === 'needs_manual_text') {
    return 'URL本文を確認できませんでした。本文貼り付け対応に回せます。';
  }

  if (job.status === 'succeeded') {
    const articleId = result?.article_id;
    return articleId
      ? `URL要約が完了しました。article_id=${articleId}`
      : 'URL要約が完了しました。';
  }

  return `URL要約ジョブ #${job.id} の状態: ${job.status}`;
}

function toFetchJobStatusMessage(job) {
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
    return buildJobResultMessage(job, result, '取得＆要約はスキップされました。');
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
