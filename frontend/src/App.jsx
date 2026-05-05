import React, { useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  Filter,
  LoaderCircle,
  RefreshCcw,
  Rss,
  Search,
  SlidersHorizontal,
  Sparkles
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
  { key: 'try_later', label: '試したい' },
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
          setMessage(toFetchJobStatusMessage(nextJob));
          if (nextJob.status === 'succeeded' || nextJob.status === 'skipped') {
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
          setMessage(toLinkJobStatusMessage(nextJob));
          if (nextJob.status === 'succeeded') {
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
      setMessage(toLinkJobCreationMessage(result));
      await loadLatestLinkJob({ silent: true });
    } catch (requestError) {
      if (requestError.status === 409 && requestError.data?.job) {
        setLatestLinkJob(requestError.data.job);
        setMessage('同じURLのジョブがすでにあります。状態表示をご確認ください。');
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
      setMessage(toReactionMessage(reaction, result.notion_sync));
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
      setMessage(toFetchJobCreationMessage(result));
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
  const compactJobChips = buildCompactJobChips(latestJob, latestLinkJob);
  const activeFilterSummary = buildFilterSummary({
    searchText,
    priorityFilter,
    sourceFilter
  });

  return (
    <main className="app-shell">
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

        {compactJobChips.length > 0 ? (
          <div className="compact-status-row">
            {compactJobChips.map((chip) => (
              <span key={chip.key} className={`compact-status compact-status--${chip.tone}`}>
                {chip.label}
              </span>
            ))}
          </div>
        ) : null}
      </section>

      <div className="quick-tools">
        <details className="accordion-card">
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
              <LoaderCircle size={16} />
              処理状況
            </span>
            <span className="accordion-card__summary-text">
              {latestJob ? renderJobStateLabel(latestJob.status) : 'idle'}
            </span>
            <ChevronDown size={18} className="accordion-card__chevron" />
          </summary>
          <div className="accordion-card__content">
            <div className="status-stack">
              {latestJob ? (
                <div className={`status-card status-card--${latestJob.status}`}>
                  <p className="status-card__label">取得＆要約</p>
                  <strong>{toFetchJobStatusMessage(latestJob)}</strong>
                  <div className="status-card__counts">
                    <span>attempted {latestJob?.result_json?.attempted ?? '-'}</span>
                    <span>succeeded {latestJob?.result_json?.succeeded ?? '-'}</span>
                    <span>failed {latestJob?.result_json?.failed ?? '-'}</span>
                  </div>
                </div>
              ) : null}

              {latestLinkJob ? (
                <div className={`status-card status-card--${latestLinkJob.status}`}>
                  <p className="status-card__label">手動URL要約</p>
                  <strong>{toLinkJobStatusMessage(latestLinkJob)}</strong>
                </div>
              ) : null}

              {!latestJob && !latestLinkJob ? (
                <div className="status-card">
                  <strong>まだジョブはありません。</strong>
                </div>
              ) : null}
            </div>
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

      {(message || error) && (
        <div className={error ? 'notice notice--error' : 'notice'}>
          {error || message}
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

  if (reaction === 'try_later' && !notionQueueStatuses.includes('queued')) {
    notionQueueStatuses.push('queued');
  }

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

function renderJobStateLabel(status) {
  const labels = {
    queued: 'queued',
    running: 'running',
    succeeded: 'succeeded',
    failed: 'failed',
    skipped: 'skipped',
    needs_manual_text: 'needs_manual_text',
    idle: 'idle'
  };

  return labels[status] || status;
}

function buildCompactJobChips(fetchJob, linkJob) {
  const chips = [];

  if (fetchJob) {
    chips.push({
      key: `fetch-${fetchJob.id}`,
      tone: fetchJob.status,
      label: `取得 ${renderJobStateLabel(fetchJob.status)}`
    });
  }

  if (linkJob) {
    chips.push({
      key: `link-${linkJob.id}`,
      tone: linkJob.status,
      label: `URL ${renderJobStateLabel(linkJob.status)}`
    });
  }

  return chips;
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

function toReactionMessage(reaction, notionSync) {
  if (reaction === 'try_later' && notionSync?.attempted) {
    if (notionSync.succeeded) {
      return '試したいに保存して、Notionにも同期しました。';
    }

    return notionSync.message || 'Notion同期に失敗しましたが、記事カード上で再同期状態は確認できます。';
  }

  if (reaction === 'interested') return '興味ありに更新しました。';
  if (reaction === 'not_interested') return '興味なしに更新しました。';
  if (reaction === 'read_later') return 'あとで読むに更新しました。';
  if (reaction === 'try_later') return '試したいに更新しました。';
  return '保存しました。';
}

function toLinkJobCreationMessage(result) {
  const notification = result.notification;

  if (!result.created) {
    if (notification?.attempted && !notification.succeeded) {
      return `URL要約ジョブはすでにあります。runner通知は失敗しました: ${notification.message}`;
    }

    return 'URL要約ジョブはすでにあります。状態表示をご確認ください。';
  }

  if (notification?.attempted && notification.succeeded) {
    return 'URL要約ジョブを受け付けました。要約中です。';
  }

  if (notification?.attempted && !notification.succeeded) {
    return `URL要約ジョブを受け付けました。runner通知は失敗しましたが、queued のまま残ります: ${notification.message}`;
  }

  return 'URL要約ジョブを受け付けました。';
}

function toFetchJobCreationMessage(result) {
  const notification = result.notification;

  if (!result.created) {
    if (notification?.attempted && !notification.succeeded) {
      return `取得＆要約ジョブはすでにあります。runner通知は失敗しました: ${notification.message}`;
    }

    return '取得＆要約ジョブはすでにあります。状態表示をご確認ください。';
  }

  if (notification?.attempted && notification.succeeded) {
    return '取得＆要約ジョブを受け付けました。';
  }

  if (notification?.attempted && !notification.succeeded) {
    return `取得＆要約ジョブを受け付けました。runner通知は失敗しましたが、queued のまま残ります: ${notification.message}`;
  }

  return '取得＆要約ジョブを受け付けました。';
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
