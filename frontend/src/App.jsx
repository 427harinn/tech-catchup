import React, { useEffect, useState } from 'react';
import { RefreshCcw, Rss } from 'lucide-react';
import { ArticleCard } from './components/ArticleCard.jsx';
import { ArticleForm } from './components/ArticleForm.jsx';
import { createArticle, fetchArticles, fetchRss, sendReaction } from './api/client.js';

const filters = [
  { key: 'all', label: '全件' },
  { key: 'new', label: '未要約' },
  { key: 'summarized', label: '要約済み' },
  { key: 'saved', label: '保存済み' }
];

export function App() {
  const [articles, setArticles] = useState([]);
  const [filter, setFilter] = useState('all');
  const [form, setForm] = useState({ url: '', title: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fetchingRss, setFetchingRss] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    loadArticles(filter);
  }, [filter]);

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

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');

    try {
      await createArticle(form);
      setForm({ url: '', title: '' });
      setMessage('URLを登録しました');
      await loadArticles();
    } catch (requestError) {
      if (requestError.status === 409 && requestError.data?.article) {
        setMessage('このURLはすでに登録済みです');
        await loadArticles();
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
      const summary = await fetchRss();
      const failed = summary.totals.failed;
      const suffix = failed > 0 ? ` 失敗ソース ${failed} 件` : '';
      setMessage(`RSS取得完了: 新規 ${summary.totals.created} 件、重複 ${summary.totals.skipped} 件。${suffix}`.trim());
      await loadArticles();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setFetchingRss(false);
    }
  }

  return (
    <main className="app">
      <header className="app__header">
        <div className="app__header-copy">
          <p>Tech Catchup</p>
          <h1>今日拾った技術を、あとで使える形に。</h1>
        </div>

        <button
          type="button"
          className="app__rss-button"
          onClick={handleFetchRss}
          disabled={fetchingRss}
        >
          {fetchingRss ? <RefreshCcw size={18} className="spin" /> : <Rss size={18} />}
          {fetchingRss ? '取得中' : 'RSS取得'}
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
    if (notionSync.succeeded) return '試したいに保存し、Notionへ同期しました';
    return notionSync.message || 'Notion同期に失敗しましたが、あとで再同期できます';
  }

  if (reaction === 'interested') return '興味あるとして保存しました';
  if (reaction === 'not_interested') return '興味なしとして保存しました';
  if (reaction === 'read_later') return '後で読むに追加しました';
  if (reaction === 'try_later') return '試したいに追加しました';
  return '保存しました';
}
